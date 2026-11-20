"""
Heterogeneous Link Predictor Wrapper cho 3 checkpoint v4:
  - hybrid_v4_full  -> best_hybrid_gat_gin_v4_seed42.pt (Tri-Modal: Root-GATv2 || SAGE2 || GINE + Tri-Router)
  - hetero_gat_v4   -> ablation_b_v4_seed42.pt          (2x Root-Anchored GATv2)
  - hetero_sage_v4  -> ablation_a_v4_seed42.pt          (2x HeteroConv SAGEConv)
Toàn bộ định nghĩa khớp 100% state_dict (strict=True) trên CPU/GPU.
"""

from typing import Any, Dict, List, Optional, Tuple
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch_geometric.nn import GATv2Conv, GINConv, GINEConv, HeteroConv, SAGEConv

from .base import BaseLinkPredictor

REL_INIT_PRIOR = {"RELATED_TO", "rev_RELATED_TO", "SHARED_DEVICE", "SHARED_IP"}

V4_DEFAULT_NODE_TYPES = ["customer", "account", "device", "ip", "beneficiary", "bank"]
V4_DEFAULT_IN_DIMS = {
    "customer": 82,
    "account": 6,
    "device": 6,
    "ip": 4,
    "beneficiary": 8,
    "bank": 4,
}
V4_DEFAULT_EDGE_TYPES = [
    ("customer", "OWNS", "account"),
    ("account", "rev_OWNS", "customer"),
    ("customer", "BANKS_WITH", "bank"),
    ("account", "USES_DEVICE", "device"),
    ("device", "rev_USES_DEVICE", "account"),
    ("account", "USES_IP", "ip"),
    ("ip", "rev_USES_IP", "account"),
    ("account", "TRANSACTS", "account"),
    ("account", "rev_TRANSACTS", "account"),
    ("account", "WIRES_TO", "beneficiary"),
    ("beneficiary", "rev_WIRES_TO", "account"),
    ("customer", "RELATED_TO", "customer"),
    ("customer", "rev_RELATED_TO", "customer"),
    ("customer", "SHARED_DEVICE", "customer"),
    ("customer", "SHARED_IP", "customer"),
    ("customer", "SHARED_BENEF", "customer"),
    ("customer", "TRANSACTS_CUST", "customer"),
    ("customer", "rev_TRANSACTS_CUST", "customer"),
]
V4_DEFAULT_EDGE_ATTR_DIMS = {
    ("customer", "BANKS_WITH", "bank"): 1,
    ("account", "USES_DEVICE", "device"): 2,
    ("device", "rev_USES_DEVICE", "account"): 2,
    ("account", "USES_IP", "ip"): 2,
    ("ip", "rev_USES_IP", "account"): 2,
    ("account", "TRANSACTS", "account"): 4,
    ("account", "rev_TRANSACTS", "account"): 4,
    ("account", "WIRES_TO", "beneficiary"): 4,
    ("beneficiary", "rev_WIRES_TO", "account"): 4,
    ("customer", "RELATED_TO", "customer"): 7,
    ("customer", "rev_RELATED_TO", "customer"): 7,
    ("customer", "SHARED_DEVICE", "customer"): 2,
    ("customer", "SHARED_IP", "customer"): 2,
    ("customer", "SHARED_BENEF", "customer"): 2,
    ("customer", "TRANSACTS_CUST", "customer"): 5,
    ("customer", "rev_TRANSACTS_CUST", "customer"): 5,
}


def etype_to_key(etype: Tuple[str, str, str]) -> str:
    return "__".join(etype)


class HeteroProjection(nn.Module):
    def __init__(self, in_dims_dict: Dict[str, int], hidden_dim: int = 64, dropout: float = 0.25):
        super().__init__()
        self.proj = nn.ModuleDict(
            {
                ntype: nn.Sequential(
                    nn.Linear(in_dim, hidden_dim),
                    nn.LayerNorm(hidden_dim),
                    nn.ReLU(),
                    nn.Dropout(dropout),
                )
                for ntype, in_dim in in_dims_dict.items()
            }
        )

    def forward(self, x_dict: Dict[str, torch.Tensor]) -> Dict[str, torch.Tensor]:
        return {nt: self.proj[nt](x) for nt, x in x_dict.items() if nt in self.proj}


class HeteroEdgeProjection(nn.Module):
    def __init__(self, edge_attr_dims: Dict[Tuple[str, str, str], int], edge_dim: int = 16):
        super().__init__()
        self.key_to_etype = {etype_to_key(et): et for et in edge_attr_dims}
        self.proj = nn.ModuleDict(
            {
                etype_to_key(et): nn.Sequential(
                    nn.Linear(in_dim, edge_dim),
                    nn.LayerNorm(edge_dim),
                    nn.ReLU(),
                )
                for et, in_dim in edge_attr_dims.items()
            }
        )

    def forward(self, edge_attr_dict: Optional[Dict]) -> Dict:
        if not edge_attr_dict:
            return {}
        return {
            et: self.proj[k](edge_attr_dict[et])
            for k, et in self.key_to_etype.items()
            if et in edge_attr_dict and edge_attr_dict[et] is not None and edge_attr_dict[et].size(0) > 0
        }


class LinkPredictorHeadV4(nn.Module):
    """Structure-Gated LinkPredictorHead khớp 100% các checkpoint v4 (BatchNorm1d(96), 24d pairwise)."""

    def __init__(
        self,
        hidden_dim: int = 64,
        pair_feat_dim: int = 24,
        pair_hidden_dim: int = 48,
        use_pairwise: bool = True,
        dropout: float = 0.25,
        chunk_size: int = 32768,
        use_batchnorm: bool = True,
    ):
        super().__init__()
        self.chunk_size = chunk_size
        self.use_pairwise = bool(use_pairwise and pair_feat_dim > 0)

        if self.use_pairwise:
            self.pair_mlp = nn.Sequential(
                nn.Linear(pair_feat_dim, pair_hidden_dim),
                nn.LayerNorm(pair_hidden_dim),
                nn.GELU(),
                nn.Dropout(dropout),
            )
            self.gate_mul = nn.Linear(pair_hidden_dim, hidden_dim)
            self.gate_add = nn.Linear(pair_hidden_dim, hidden_dim)
            add_compressed_dim = 32
            self.add_proj = nn.Sequential(
                nn.Linear(hidden_dim, add_compressed_dim),
                nn.LayerNorm(add_compressed_dim),
                nn.GELU(),
            )
            self.struct_prior = nn.Linear(pair_hidden_dim, 1)
            in_mlp_dim = 2 * hidden_dim + add_compressed_dim + 1 + pair_hidden_dim
            mlp_hid = max(hidden_dim, 96)
        else:
            self.pair_mlp = None
            self.gate_mul = None
            self.gate_add = None
            self.add_proj = None
            self.struct_prior = None
            in_mlp_dim = 3 * hidden_dim + 1
            mlp_hid = hidden_dim

        norm_layer: nn.Module = nn.BatchNorm1d(mlp_hid) if use_batchnorm else nn.LayerNorm(mlp_hid)
        self.mlp = nn.Sequential(
            nn.Linear(in_mlp_dim, mlp_hid),
            norm_layer,
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(mlp_hid, hidden_dim // 2),
            nn.GELU(),
            nn.Linear(hidden_dim // 2, 1),
        )

    def _score_chunk(self, h_cust: torch.Tensor, u_idx: torch.Tensor, v_idx: torch.Tensor, pf_chunk=None):
        h_u = h_cust[u_idx]
        h_v = h_cust[v_idx]
        cos = F.cosine_similarity(h_u, h_v, dim=-1, eps=1e-8).unsqueeze(-1)
        h_mul = h_u * h_v
        h_diff = torch.abs(h_u - h_v)
        h_add = h_u + h_v

        if self.use_pairwise:
            s_uv = self.pair_mlp(pf_chunk)
            g_mul = torch.sigmoid(self.gate_mul(s_uv))
            g_add = torch.sigmoid(self.gate_add(s_uv))
            z_mul = h_mul * (0.5 + g_mul)
            z_add = self.add_proj(h_add * (0.25 + g_add))
            feat = torch.cat([z_mul, h_diff, z_add, cos, s_uv], dim=-1)
            return (self.mlp(feat) + self.struct_prior(s_uv)).squeeze(-1)

        feat = torch.cat([h_mul, h_diff, h_add, cos], dim=-1)
        return self.mlp(feat).squeeze(-1)

    def forward(self, h_cust: torch.Tensor, edge_label_index: torch.Tensor, pair_feats=None, chunk_size=None):
        csize = chunk_size or self.chunk_size
        u_all, v_all = edge_label_index[0], edge_label_index[1]
        num_pairs = u_all.size(0)
        if csize is None or num_pairs <= csize:
            return self._score_chunk(h_cust, u_all, v_all, pair_feats)

        logits_chunks = []
        for start in range(0, num_pairs, csize):
            end = min(start + csize, num_pairs)
            pf_c = pair_feats[start:end] if pair_feats is not None else None
            logits_chunks.append(self._score_chunk(h_cust, u_all[start:end], v_all[start:end], pf_c))
        return torch.cat(logits_chunks, dim=0)


def _run_relation_weighted_hetero(
    active_edge_types,
    convs,
    rel_logits,
    has_edge_attr,
    target_node_types,
    x_dict,
    edge_index_dict,
    edge_attr_dict,
    norms,
    dropout_layer,
    act_fn,
    root_lins=None,
    collect_attention: bool = False,
):
    msgs_by_dst = {nt: [] for nt in target_node_types}
    logits_by_dst = {nt: [] for nt in target_node_types}
    collected_attn: Dict[Tuple[str, str, str], Tuple[torch.Tensor, torch.Tensor]] = {}

    for et in active_edge_types:
        ei = edge_index_dict.get(et)
        if ei is None or ei.size(1) == 0:
            continue
        src, _, dst = et
        k = etype_to_key(et)
        conv = convs[k]
        use_ea = has_edge_attr.get(k, False) and edge_attr_dict and et in edge_attr_dict
        if collect_attention and isinstance(conv, GATv2Conv) and src == "customer" and dst == "customer":
            if use_ea:
                m, (aei, alpha) = conv((x_dict[src], x_dict[dst]), ei, edge_attr=edge_attr_dict[et], return_attention_weights=True)
            else:
                m, (aei, alpha) = conv((x_dict[src], x_dict[dst]), ei, return_attention_weights=True)
            collected_attn[et] = (aei, alpha)
        else:
            if use_ea:
                m = conv((x_dict[src], x_dict[dst]), ei, edge_attr=edge_attr_dict[et])
            else:
                m = conv((x_dict[src], x_dict[dst]), ei)
        msgs_by_dst[dst].append(m)
        logits_by_dst[dst].append(rel_logits[k])

    h_out = {}
    for nt in target_node_types:
        prev_emb = x_dict[nt]
        if msgs_by_dst[nt]:
            weights = torch.softmax(torch.stack(logits_by_dst[nt]), dim=0)
            agg = (torch.stack(msgs_by_dst[nt], dim=0) * weights.view(-1, 1, 1)).sum(dim=0)
            if root_lins is not None and nt in root_lins:
                agg = agg + root_lins[nt](prev_emb)
            updated = dropout_layer(act_fn(agg))
            h_out[nt] = norms[nt](updated + prev_emb)
        else:
            h_out[nt] = prev_emb
    return (h_out, collected_attn) if collect_attention else h_out


class HeteroGATBlock(nn.Module):
    def __init__(
        self,
        node_types,
        edge_types,
        edge_attr_dims,
        hidden_dim: int = 64,
        heads: int = 4,
        edge_dim: int = 16,
        dropout: float = 0.25,
        target_node_types=None,
    ):
        super().__init__()
        out_per_head = hidden_dim // heads
        self.target_node_types = list(target_node_types) if target_node_types is not None else list(node_types)
        target_set = set(self.target_node_types)
        self.active_edge_types = [et for et in edge_types if et[2] in target_set]

        self.convs = nn.ModuleDict()
        self.rel_logits = nn.ParameterDict()
        self.has_edge_attr: Dict[str, bool] = {}
        for et in self.active_edge_types:
            k = etype_to_key(et)
            use_ea = et in edge_attr_dims
            self.has_edge_attr[k] = use_ea
            self.convs[k] = GATv2Conv(
                in_channels=(hidden_dim, hidden_dim),
                out_channels=out_per_head,
                heads=heads,
                concat=True,
                add_self_loops=False,
                dropout=dropout,
                edge_dim=edge_dim if use_ea else None,
            )
            init_w = 0.3 if et[1] in REL_INIT_PRIOR else 0.0
            self.rel_logits[k] = nn.Parameter(torch.tensor(init_w, dtype=torch.float32))

        self.root_lins = nn.ModuleDict({nt: nn.Linear(hidden_dim, hidden_dim, bias=False) for nt in self.target_node_types})
        self.norms = nn.ModuleDict({nt: nn.LayerNorm(hidden_dim) for nt in self.target_node_types})
        self.dropout = nn.Dropout(dropout)

    def forward(self, x_dict, edge_index_dict, edge_attr_dict=None, collect_attention: bool = False):
        return _run_relation_weighted_hetero(
            self.active_edge_types,
            self.convs,
            self.rel_logits,
            self.has_edge_attr,
            self.target_node_types,
            x_dict,
            edge_index_dict,
            edge_attr_dict,
            self.norms,
            self.dropout,
            F.elu,
            root_lins=self.root_lins,
            collect_attention=collect_attention,
        )


class HeteroSAGEBlock(nn.Module):
    """Nhánh sage2_block trong Hybrid Tri-Modal v4 (SAGEConv + relation-wise Softmax + LayerNorm)."""

    def __init__(self, node_types, edge_types, hidden_dim: int = 64, dropout: float = 0.25, target_node_types=None):
        super().__init__()
        self.target_node_types = list(target_node_types) if target_node_types is not None else list(node_types)
        target_set = set(self.target_node_types)
        self.active_edge_types = [et for et in edge_types if et[2] in target_set]

        self.convs = nn.ModuleDict()
        self.rel_logits = nn.ParameterDict()
        self.has_edge_attr: Dict[str, bool] = {}
        for et in self.active_edge_types:
            k = etype_to_key(et)
            self.has_edge_attr[k] = False
            self.convs[k] = SAGEConv((hidden_dim, hidden_dim), hidden_dim, aggr="mean")
            init_w = 0.3 if et[1] in REL_INIT_PRIOR else 0.0
            self.rel_logits[k] = nn.Parameter(torch.tensor(init_w, dtype=torch.float32))

        self.norms = nn.ModuleDict({nt: nn.LayerNorm(hidden_dim) for nt in self.target_node_types})
        self.dropout = nn.Dropout(dropout)

    def forward(self, x_dict, edge_index_dict, edge_attr_dict=None):
        return _run_relation_weighted_hetero(
            self.active_edge_types,
            self.convs,
            self.rel_logits,
            self.has_edge_attr,
            self.target_node_types,
            x_dict,
            edge_index_dict,
            None,
            self.norms,
            self.dropout,
            F.relu,
        )


def _make_gin_mlp(dim: int, dropout: float = 0.25) -> nn.Sequential:
    return nn.Sequential(
        nn.Linear(dim, dim),
        nn.LayerNorm(dim),
        nn.ReLU(),
        nn.Dropout(dropout),
        nn.Linear(dim, dim),
    )


class HeteroGINBlock(nn.Module):
    def __init__(
        self,
        node_types,
        edge_types,
        hidden_dim: int = 64,
        dropout: float = 0.25,
        use_gine: bool = True,
        edge_attr_dims=None,
        edge_dim: int = 16,
        target_node_types=None,
    ):
        super().__init__()
        edge_attr_dims = edge_attr_dims or {}
        self.target_node_types = list(target_node_types) if target_node_types is not None else list(node_types)
        target_set = set(self.target_node_types)
        self.active_edge_types = [et for et in edge_types if et[2] in target_set]

        self.convs = nn.ModuleDict()
        self.rel_logits = nn.ParameterDict()
        self.has_edge_attr: Dict[str, bool] = {}
        for et in self.active_edge_types:
            k = etype_to_key(et)
            mlp = _make_gin_mlp(hidden_dim, dropout=dropout)
            use_ea = bool(use_gine and et in edge_attr_dims)
            self.has_edge_attr[k] = use_ea
            if use_ea:
                self.convs[k] = GINEConv(mlp, train_eps=True, edge_dim=edge_dim)
            else:
                self.convs[k] = GINConv(mlp, train_eps=True)
            init_w = 0.3 if et[1] in REL_INIT_PRIOR else 0.0
            self.rel_logits[k] = nn.Parameter(torch.tensor(init_w, dtype=torch.float32))

        self.norms = nn.ModuleDict({nt: nn.LayerNorm(hidden_dim) for nt in self.target_node_types})
        self.dropout = nn.Dropout(dropout)

    def forward(self, x_dict, edge_index_dict, edge_attr_dict=None):
        return _run_relation_weighted_hetero(
            self.active_edge_types,
            self.convs,
            self.rel_logits,
            self.has_edge_attr,
            self.target_node_types,
            x_dict,
            edge_index_dict,
            edge_attr_dict,
            self.norms,
            self.dropout,
            F.relu,
        )


class TriModalHybridGATGINv4(nn.Module):
    """Kiến trúc khớp 100% checkpoint `best_hybrid_gat_gin_v4_seed42.pt` (Tri-Modal GATv2 || SAGE || GINE)."""

    def __init__(
        self,
        in_dims_dict,
        node_types,
        edge_types,
        edge_attr_dims,
        hidden_dim: int = 64,
        heads: int = 4,
        edge_dim: int = 16,
        num_gin_layers: int = 1,
        use_gine: bool = True,
        pair_feat_dim: int = 24,
        pair_hidden_dim: int = 48,
        use_pairwise: bool = True,
        dropout: float = 0.25,
        chunk_size: int = 32768,
        **kwargs,
    ):
        super().__init__()
        self.input_proj = HeteroProjection(in_dims_dict, hidden_dim, dropout=dropout)
        self.edge_proj = HeteroEdgeProjection(edge_attr_dims, edge_dim=edge_dim)
        self.gat_block = HeteroGATBlock(node_types, edge_types, edge_attr_dims, hidden_dim, heads, edge_dim, dropout)
        self.gat2_block = HeteroGATBlock(
            node_types, edge_types, edge_attr_dims, hidden_dim, heads, edge_dim, dropout, target_node_types=("customer",)
        )
        self.sage2_block = HeteroSAGEBlock(node_types, edge_types, hidden_dim, dropout, target_node_types=("customer",))
        self.gin_blocks = nn.ModuleList(
            [
                HeteroGINBlock(
                    node_types,
                    edge_types,
                    hidden_dim,
                    dropout,
                    use_gine,
                    edge_attr_dims,
                    edge_dim,
                    target_node_types=("customer",),
                )
                for _ in range(num_gin_layers)
            ]
        )
        self.tri_router = nn.Linear(4 * hidden_dim, 3)
        self.jk_proj = nn.Sequential(
            nn.Linear(3 * hidden_dim, hidden_dim),
            nn.LayerNorm(hidden_dim),
            nn.GELU(),
            nn.Dropout(dropout),
        )
        self.cust_skip = nn.Linear(in_dims_dict["customer"], hidden_dim)
        self.out_norm = nn.LayerNorm(hidden_dim)
        self.predictor = LinkPredictorHeadV4(
            hidden_dim, pair_feat_dim, pair_hidden_dim, use_pairwise, dropout, chunk_size, use_batchnorm=True
        )

    def encode_customers(self, x_dict, edge_index_dict, edge_attr_dict=None, collect_attention: bool = False):
        h0 = self.input_proj(x_dict)
        e_proj = self.edge_proj(edge_attr_dict) if edge_attr_dict else {}
        h1 = self.gat_block(h0, edge_index_dict, e_proj)

        if collect_attention:
            h2_gat_dict, attn_dict = self.gat2_block(h1, edge_index_dict, e_proj, collect_attention=True)
            h2_gat_c = h2_gat_dict["customer"]
        else:
            attn_dict = {}
            h2_gat_c = self.gat2_block(h1, edge_index_dict, e_proj)["customer"]

        h2_sage_c = self.sage2_block(h1, edge_index_dict)["customer"]

        h_curr = h1
        for gin_layer in self.gin_blocks:
            gin_out = gin_layer(h_curr, edge_index_dict, e_proj)
            h_curr = {**h_curr, **gin_out}
        h2_gin_c = h_curr["customer"]

        router_w = F.softmax(
            self.tri_router(torch.cat([h2_gat_c, h2_sage_c, h2_gin_c, h1["customer"]], dim=-1)),
            dim=-1,
        )
        h2_cust = router_w[:, 0:1] * h2_gat_c + router_w[:, 1:2] * h2_sage_c + router_w[:, 2:3] * h2_gin_c
        h_jk = torch.cat([h0["customer"], h1["customer"], h2_cust], dim=-1)
        out = self.out_norm(self.jk_proj(h_jk) + self.cust_skip(x_dict["customer"]))
        return (out, attn_dict) if collect_attention else out


class BaselineHeteroGNNv4(nn.Module):
    """Kiến trúc khớp 100% checkpoint `ablation_a_v4_seed42.pt` (2L HeteroSAGE)."""

    def __init__(
        self,
        in_dims_dict,
        node_types,
        edge_types,
        hidden_dim: int = 64,
        num_layers: int = 2,
        pair_feat_dim: int = 24,
        pair_hidden_dim: int = 48,
        use_pairwise: bool = True,
        dropout: float = 0.25,
        chunk_size: int = 32768,
    ):
        super().__init__()
        self.num_layers = num_layers
        self.input_proj = HeteroProjection(in_dims_dict, hidden_dim, dropout=dropout)
        self.convs = nn.ModuleList(
            [
                HeteroConv(
                    {et: SAGEConv((hidden_dim, hidden_dim), hidden_dim, aggr="mean") for et in edge_types},
                    aggr="mean",
                )
                for _ in range(num_layers)
            ]
        )
        self.norms = nn.ModuleList([nn.ModuleDict({nt: nn.LayerNorm(hidden_dim) for nt in node_types}) for _ in range(num_layers)])
        self.cust_skip = nn.Linear(in_dims_dict["customer"], hidden_dim)
        self.dropout = nn.Dropout(dropout)
        self.predictor = LinkPredictorHeadV4(
            hidden_dim, pair_feat_dim, pair_hidden_dim, use_pairwise, dropout, chunk_size, use_batchnorm=True
        )

    def encode_customers(self, x_dict, edge_index_dict, edge_attr_dict=None, collect_attention: bool = False):
        h = self.input_proj(x_dict)
        non_empty_ei = {et: ei for et, ei in edge_index_dict.items() if ei is not None and ei.size(1) > 0}
        for layer_idx in range(self.num_layers):
            h_conv = self.convs[layer_idx](h, non_empty_ei) if non_empty_ei else {}
            h_next = {}
            for nt, prev_emb in h.items():
                if nt in h_conv:
                    upd = self.dropout(F.relu(h_conv[nt]))
                    h_next[nt] = self.norms[layer_idx][nt](upd + prev_emb)
                else:
                    h_next[nt] = prev_emb
            h = h_next
        out = h["customer"] + self.cust_skip(x_dict["customer"])
        return (out, {}) if collect_attention else out


class HeteroGATOnlyv4(nn.Module):
    """Kiến trúc khớp 100% checkpoint `ablation_b_v4_seed42.pt` (2x Root-Anchored GATv2)."""

    def __init__(
        self,
        in_dims_dict,
        node_types,
        edge_types,
        edge_attr_dims,
        hidden_dim: int = 64,
        heads: int = 4,
        edge_dim: int = 16,
        pair_feat_dim: int = 24,
        pair_hidden_dim: int = 48,
        use_pairwise: bool = True,
        dropout: float = 0.25,
        chunk_size: int = 32768,
    ):
        super().__init__()
        self.input_proj = HeteroProjection(in_dims_dict, hidden_dim, dropout=dropout)
        self.edge_proj = HeteroEdgeProjection(edge_attr_dims, edge_dim=edge_dim)
        self.gat1 = HeteroGATBlock(node_types, edge_types, edge_attr_dims, hidden_dim, heads, edge_dim, dropout)
        self.gat2 = HeteroGATBlock(
            node_types, edge_types, edge_attr_dims, hidden_dim, heads, edge_dim, dropout, target_node_types=("customer",)
        )
        self.jk_proj = nn.Sequential(
            nn.Linear(3 * hidden_dim, hidden_dim),
            nn.LayerNorm(hidden_dim),
            nn.GELU(),
            nn.Dropout(dropout),
        )
        self.cust_skip = nn.Linear(in_dims_dict["customer"], hidden_dim)
        self.predictor = LinkPredictorHeadV4(
            hidden_dim, pair_feat_dim, pair_hidden_dim, use_pairwise, dropout, chunk_size, use_batchnorm=True
        )

    def encode_customers(self, x_dict, edge_index_dict, edge_attr_dict=None, collect_attention: bool = False):
        h0 = self.input_proj(x_dict)
        e_proj = self.edge_proj(edge_attr_dict) if edge_attr_dict else {}
        h1 = self.gat1(h0, edge_index_dict, e_proj)
        if collect_attention:
            h2_dict, attn_dict = self.gat2(h1, edge_index_dict, e_proj, collect_attention=True)
            h2_c = h2_dict["customer"]
        else:
            attn_dict = {}
            h2_c = self.gat2(h1, edge_index_dict, e_proj)["customer"]
        out = self.jk_proj(torch.cat([h0["customer"], h1["customer"], h2_c], dim=-1)) + self.cust_skip(x_dict["customer"])
        return (out, attn_dict) if collect_attention else out


def _flatten_attention_dict(attn_dict: Dict) -> Optional[Dict[Tuple[int, int], float]]:
    if not attn_dict:
        return None
    flat: Dict[Tuple[int, int], float] = {}
    for _et, (ei, alpha) in attn_dict.items():
        w_arr = alpha.mean(dim=-1).cpu().numpy() if alpha.ndim == 2 else alpha.cpu().numpy()
        u_arr = ei[0].cpu().numpy()
        v_arr = ei[1].cpu().numpy()
        for u_i, v_i, w in zip(u_arr, v_arr, w_arr):
            if u_i != v_i:
                key = (int(min(u_i, v_i)), int(max(u_i, v_i)))
                if key not in flat or float(w) > flat[key]:
                    flat[key] = float(w)
    return flat


class HeteroLinkPredictor(BaseLinkPredictor):
    """Wrapper chuẩn BaseLinkPredictor cho các mô hình dị thể v4."""

    def __init__(self, model_id: str, model_family: str, default_threshold: float):
        self.model_id = model_id
        self.model_family = model_family
        self.default_threshold = default_threshold
        self.model: Optional[nn.Module] = None
        self.device: str = "cpu"
        self._embed_cache: Dict[str, Tuple[torch.Tensor, Optional[Dict[Tuple[int, int], float]]]] = {}

    def load_checkpoint(self, checkpoint_path: str, device: str = "cpu") -> None:
        self.device = device
        ckpt = torch.load(checkpoint_path, map_location=device, weights_only=False)
        sd = ckpt["model_state_dict"]
        mcfg = ckpt.get("model_config", {})

        if "tri_router.weight" in sd:
            self.model = TriModalHybridGATGINv4(**mcfg).to(device)
        elif mcfg.get("cls") == "SAGE" or "convs.0.convs.<customer___OWNS___account>.lin_l.weight" in sd:
            self.model = BaselineHeteroGNNv4(
                V4_DEFAULT_IN_DIMS, V4_DEFAULT_NODE_TYPES, V4_DEFAULT_EDGE_TYPES
            ).to(device)
        elif mcfg.get("cls") == "GAT" or "gat1.root_lins.customer.weight" in sd:
            self.model = HeteroGATOnlyv4(
                V4_DEFAULT_IN_DIMS, V4_DEFAULT_NODE_TYPES, V4_DEFAULT_EDGE_TYPES, V4_DEFAULT_EDGE_ATTR_DIMS
            ).to(device)
        else:
            raise ValueError(f"Không nhận diện được kiến trúc checkpoint '{checkpoint_path}'.")

        self.model.load_state_dict(sd, strict=True)
        self.model.eval()
        self._embed_cache.clear()

    @torch.no_grad()
    def predict_pairs(self, graph_bundle: Any, candidate_pairs: torch.Tensor) -> Dict[str, Any]:
        if self.model is None:
            raise RuntimeError(f"Checkpoint cho '{self.model_id}' chưa được nạp.")

        if candidate_pairs.size(1) == 0:
            return {"probabilities": np.empty((0,), dtype=np.float32), "attention_map": None, "pairwise_signals": None}

        hetero_g = graph_bundle["hetero_g"]
        pair_feats = graph_bundle["pair_feats"].to(self.device)
        cache_key = graph_bundle.get("cache_key")

        if cache_key and cache_key in self._embed_cache:
            h_cust, attn_map = self._embed_cache[cache_key]
        else:
            x_dict = {nt: hetero_g[nt].x.to(self.device) for nt in hetero_g.node_types}
            ei_dict = {et: hetero_g[et].edge_index.to(self.device) for et in hetero_g.edge_types}
            ea_dict = {
                et: hetero_g[et].edge_attr.to(self.device)
                for et in hetero_g.edge_types
                if "edge_attr" in hetero_g[et] and hetero_g[et].edge_attr is not None and hetero_g[et].edge_attr.size(0) > 0
            }
            want_attn = bool(graph_bundle.get("extract_attention", True)) and self.model_family in ("HETERO_HYBRID", "HETERO_GAT")
            if want_attn:
                h_cust, attn_raw = self.model.encode_customers(x_dict, ei_dict, ea_dict, collect_attention=True)
                attn_map = _flatten_attention_dict(attn_raw)
            else:
                h_cust = self.model.encode_customers(x_dict, ei_dict, ea_dict, collect_attention=False)
                attn_map = None

            if cache_key:
                if len(self._embed_cache) >= 16:
                    self._embed_cache.clear()
                self._embed_cache[cache_key] = (h_cust, attn_map)

        pairs_dev = candidate_pairs.long().to(self.device)
        logits = self.model.predictor(h_cust, pairs_dev, pair_feats=pair_feats)
        probs = torch.sigmoid(logits).cpu().numpy().astype(np.float32)

        return {
            "probabilities": probs,
            "attention_map": attn_map,
            "pairwise_signals": pair_feats.cpu().numpy(),
        }
