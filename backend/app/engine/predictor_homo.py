"""
Homogeneous Link Predictor Wrapper cho CK GCN & CK GAT.
Kế thừa trực tiếp kiến trúc GCNEncoder, GATEncoder, LinkDecoder, GNNLinkPredictor từ CK/src/models.py
(thuần PyTorch, chạy siêu nhanh trên CPU và khớp sai số < 1e-5 với notebook CK).
"""

from typing import Any, Dict, Optional, Tuple
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

from .base import BaseLinkPredictor


class GCNConv(nn.Module):
    """Kipf & Welling (ICLR 2017) GCNConv — khớp 100% CK/src/models.py."""

    def __init__(self, in_channels: int, out_channels: int, bias: bool = True):
        super().__init__()
        self.in_channels = in_channels
        self.out_channels = out_channels
        self.lin = nn.Linear(in_channels, out_channels, bias=False)
        if bias:
            self.bias = nn.Parameter(torch.zeros(out_channels))
        else:
            self.register_parameter("bias", None)

    @staticmethod
    def compute_norm(edge_index: torch.Tensor, num_nodes: int, device: torch.device, dtype: torch.dtype):
        loop_nodes = torch.arange(num_nodes, device=device, dtype=edge_index.dtype)
        loop_edge = torch.stack([loop_nodes, loop_nodes], dim=0)
        ei = torch.cat([edge_index, loop_edge], dim=1)

        row, col = ei[0], ei[1]
        deg = torch.zeros(num_nodes, device=device, dtype=dtype)
        deg.index_add_(0, col, torch.ones(col.shape[0], device=device, dtype=dtype))
        deg_inv_sqrt = deg.pow(-0.5)
        deg_inv_sqrt.masked_fill_(deg_inv_sqrt == float("inf"), 0.0)
        norm = deg_inv_sqrt[row] * deg_inv_sqrt[col]
        return ei, norm

    def forward(
        self,
        x: torch.Tensor,
        edge_index: torch.Tensor,
        cached_norm: Optional[Tuple[torch.Tensor, torch.Tensor]] = None,
    ) -> torch.Tensor:
        num_nodes = x.size(0)
        h = self.lin(x)
        ei, norm = cached_norm if cached_norm is not None else self.compute_norm(edge_index, num_nodes, x.device, x.dtype)
        row, col = ei[0], ei[1]
        out = torch.zeros_like(h)
        out.index_add_(0, col, h[row] * norm.unsqueeze(-1))
        if self.bias is not None:
            out = out + self.bias
        return out


class GATConv(nn.Module):
    """Veličković et al. (ICLR 2018) GATConv — khớp 100% CK/src/models.py."""

    def __init__(
        self,
        in_channels: int,
        out_channels: int,
        heads: int = 4,
        concat: bool = True,
        negative_slope: float = 0.2,
        dropout: float = 0.0,
        bias: bool = True,
    ):
        super().__init__()
        self.in_channels = in_channels
        self.out_channels = out_channels
        self.heads = heads
        self.concat = concat
        self.negative_slope = negative_slope
        self.dropout = dropout

        self.lin = nn.Linear(in_channels, heads * out_channels, bias=False)
        self.att_src = nn.Parameter(torch.Tensor(1, heads, out_channels))
        self.att_dst = nn.Parameter(torch.Tensor(1, heads, out_channels))

        out_dim = heads * out_channels if concat else out_channels
        if bias:
            self.bias = nn.Parameter(torch.zeros(out_dim))
        else:
            self.register_parameter("bias", None)

    def forward(self, x: torch.Tensor, edge_index: torch.Tensor, return_attention_weights: bool = False):
        num_nodes = x.size(0)
        H, C = self.heads, self.out_channels

        loop_nodes = torch.arange(num_nodes, device=x.device, dtype=edge_index.dtype)
        loop_edge = torch.stack([loop_nodes, loop_nodes], dim=0)
        ei = torch.cat([edge_index, loop_edge], dim=1)
        row, col = ei[0], ei[1]

        x_proj = self.lin(x).view(num_nodes, H, C)
        alpha_src = (x_proj * self.att_src).sum(dim=-1)
        alpha_dst = (x_proj * self.att_dst).sum(dim=-1)

        e = F.leaky_relu(alpha_src[row] + alpha_dst[col], negative_slope=self.negative_slope)
        e_max = torch.full((num_nodes, H), -1e9, device=x.device, dtype=x.dtype)
        e_max.scatter_reduce_(0, col.unsqueeze(-1).expand(-1, H), e, reduce="amax", include_self=True)
        exp_e = torch.exp(e - e_max[col])

        denom = torch.zeros((num_nodes, H), device=x.device, dtype=x.dtype)
        denom.index_add_(0, col, exp_e)
        alpha = exp_e / (denom[col] + 1e-12)
        alpha_drop = F.dropout(alpha, p=self.dropout, training=self.training)

        msg = x_proj[row] * alpha_drop.unsqueeze(-1)
        out = torch.zeros((num_nodes, H, C), device=x.device, dtype=x.dtype)
        out.index_add_(0, col, msg)

        out = out.view(num_nodes, H * C) if self.concat else out.mean(dim=1)
        if self.bias is not None:
            out = out + self.bias

        if return_attention_weights:
            return out, (ei, alpha)
        return out


class GCNEncoder(nn.Module):
    def __init__(self, in_channels: int, hidden_channels: int = 64, out_channels: int = 64, dropout: float = 0.2):
        super().__init__()
        self.conv1 = GCNConv(in_channels, hidden_channels)
        self.bn1 = nn.BatchNorm1d(hidden_channels)
        self.conv2 = GCNConv(hidden_channels, out_channels)
        self.bn2 = nn.BatchNorm1d(out_channels)
        self.skip = nn.Linear(in_channels, out_channels)
        self.dropout = dropout

    def forward(self, x: torch.Tensor, edge_index: torch.Tensor) -> torch.Tensor:
        norm_pack = GCNConv.compute_norm(edge_index, x.size(0), x.device, x.dtype)
        h = self.conv1(x, edge_index, cached_norm=norm_pack)
        h = self.bn1(h)
        h = F.relu(h)
        h = F.dropout(h, p=self.dropout, training=self.training)
        h = self.conv2(h, edge_index, cached_norm=norm_pack)
        h = self.bn2(h)
        return h + self.skip(x)


class GATEncoder(nn.Module):
    def __init__(
        self,
        in_channels: int,
        hidden_channels: int = 16,
        out_channels: int = 64,
        heads: int = 4,
        dropout: float = 0.2,
    ):
        super().__init__()
        self.conv1 = GATConv(in_channels, hidden_channels, heads=heads, concat=True, dropout=dropout)
        self.bn1 = nn.BatchNorm1d(hidden_channels * heads)
        self.conv2 = GATConv(hidden_channels * heads, out_channels, heads=heads, concat=False, dropout=dropout)
        self.bn2 = nn.BatchNorm1d(out_channels)
        self.skip = nn.Linear(in_channels, out_channels)
        self.dropout = dropout

    def forward(self, x: torch.Tensor, edge_index: torch.Tensor) -> torch.Tensor:
        h = self.conv1(x, edge_index)
        h = self.bn1(h)
        h = F.elu(h)
        h = F.dropout(h, p=self.dropout, training=self.training)
        h = self.conv2(h, edge_index)
        h = self.bn2(h)
        return h + self.skip(x)

    @torch.no_grad()
    def encode_with_attention(self, x: torch.Tensor, edge_index: torch.Tensor):
        self.eval()
        h, attn1 = self.conv1(x, edge_index, return_attention_weights=True)
        h = self.bn1(h)
        h = F.elu(h)
        h2, attn2 = self.conv2(h, edge_index, return_attention_weights=True)
        h2 = self.bn2(h2)
        z = h2 + self.skip(x)
        return z, attn1, attn2


class LinkDecoder(nn.Module):
    def __init__(self, in_channels: int = 64, hidden_channels: int = 64, dropout: float = 0.2):
        super().__init__()
        pair_dim = in_channels * 3 + 1
        self.mlp = nn.Sequential(
            nn.Linear(pair_dim, hidden_channels),
            nn.BatchNorm1d(hidden_channels),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(hidden_channels, hidden_channels // 2),
            nn.ReLU(),
            nn.Linear(hidden_channels // 2, 1),
        )

    def forward(self, z: torch.Tensor, edge_label_index: torch.Tensor) -> torch.Tensor:
        z_u = z[edge_label_index[0]]
        z_v = z[edge_label_index[1]]
        hadamard = z_u * z_v
        diff = torch.abs(z_u - z_v)
        summ = z_u + z_v
        cos = F.cosine_similarity(z_u, z_v, dim=-1, eps=1e-8).unsqueeze(-1)
        pair_feat = torch.cat([hadamard, diff, summ, cos], dim=-1)
        return self.mlp(pair_feat).squeeze(-1)


class GNNLinkPredictor(nn.Module):
    def __init__(
        self,
        model_type: str,
        in_channels: int,
        hidden_channels: int = 64,
        out_channels: int = 64,
        heads: int = 4,
        dropout: float = 0.2,
    ):
        super().__init__()
        self.model_type = model_type.upper()
        if self.model_type == "GCN":
            self.encoder = GCNEncoder(in_channels, hidden_channels, out_channels, dropout)
        elif self.model_type == "GAT":
            gat_hidden = max(8, hidden_channels // heads)
            self.encoder = GATEncoder(in_channels, gat_hidden, out_channels, heads, dropout)
        else:
            raise ValueError(f"model_type không hợp lệ: {model_type}")
        self.decoder = LinkDecoder(out_channels, hidden_channels, dropout)

    def encode(self, x: torch.Tensor, edge_index: torch.Tensor) -> torch.Tensor:
        return self.encoder(x, edge_index)

    def decode(self, z: torch.Tensor, edge_label_index: torch.Tensor) -> torch.Tensor:
        return self.decoder(z, edge_label_index)


class HomoLinkPredictor(BaseLinkPredictor):
    """Wrapper chuẩn BaseLinkPredictor cho ck_gcn_seed42 và ck_gat_seed42."""

    def __init__(self, model_id: str, model_family: str, default_threshold: float):
        self.model_id = model_id
        self.model_family = model_family
        self.default_threshold = default_threshold
        self.model: Optional[GNNLinkPredictor] = None
        self.device: str = "cpu"
        self._embed_cache: Dict[str, Tuple[torch.Tensor, Optional[Dict[Tuple[int, int], float]]]] = {}

    def load_checkpoint(self, checkpoint_path: str, device: str = "cpu") -> None:
        self.device = device
        ckpt = torch.load(checkpoint_path, map_location=device, weights_only=False)
        cfg = ckpt["config"]
        self.model = GNNLinkPredictor(
            model_type=cfg["model_type"],
            in_channels=cfg["in_channels"],
            hidden_channels=cfg.get("hidden_channels", 64),
            out_channels=cfg.get("out_channels", 64),
            heads=cfg.get("heads", 4),
            dropout=cfg.get("dropout", 0.2),
        ).to(device)
        self.model.load_state_dict(ckpt["model_state_dict"], strict=True)
        self.model.eval()
        self._embed_cache.clear()

    @torch.no_grad()
    def predict_pairs(self, graph_bundle: Any, candidate_pairs: torch.Tensor) -> Dict[str, Any]:
        if self.model is None:
            raise RuntimeError(f"Checkpoint cho '{self.model_id}' chưa được nạp.")

        if candidate_pairs.size(1) == 0:
            return {"probabilities": np.empty((0,), dtype=np.float32), "attention_map": None, "pairwise_signals": None}

        x = graph_bundle["x"].to(self.device)
        ei = graph_bundle["edge_index"].to(self.device)
        cache_key = graph_bundle.get("cache_key")

        if cache_key and cache_key in self._embed_cache:
            z, attn_map = self._embed_cache[cache_key]
        else:
            attn_map: Optional[Dict[Tuple[int, int], float]] = None
            if self.model.model_type == "GAT" and graph_bundle.get("extract_attention", True):
                z, _attn1, (ei2, alpha2) = self.model.encoder.encode_with_attention(x, ei)
                mean_alpha = alpha2.mean(dim=-1).cpu().numpy()
                u_arr = ei2[0].cpu().numpy()
                v_arr = ei2[1].cpu().numpy()
                attn_map = {}
                for u_i, v_i, w in zip(u_arr, v_arr, mean_alpha):
                    if u_i != v_i:
                        key = (int(min(u_i, v_i)), int(max(u_i, v_i)))
                        if key not in attn_map or w > attn_map[key]:
                            attn_map[key] = float(w)
            else:
                z = self.model.encode(x, ei)

            if cache_key:
                if len(self._embed_cache) >= 16:
                    self._embed_cache.clear()
                self._embed_cache[cache_key] = (z, attn_map)

        pairs_dev = candidate_pairs.long().to(self.device)
        logits = self.model.decode(z, pairs_dev)
        probs = torch.sigmoid(logits).cpu().numpy().astype(np.float32)

        return {
            "probabilities": probs,
            "attention_map": attn_map,
            "pairwise_signals": None,
        }
