"""
Heterogeneous Graph Adapter (82d Node + Multi-Scale PE + 4 Meta-paths + 24d Full-Graph Pairwise)
cho Hybrid Tri-Modal v4, HeteroSAGE v4 và HeteroGAT-Only v4.
Port chính xác 100% từ AML_Hybrid_GAT_GIN.ipynb (Cell 1.7 & Cell 1.8) với frozen_scalers.pt.
"""

import math
from typing import Any, Dict, List, Optional, Tuple
import numpy as np
import scipy.sparse as sp
import torch

from ..config import HETERO_V4_CONFIG
from ..schemas import PairwiseSummary


def _zscore_with_stats(
    t: torch.Tensor,
    mean: Optional[torch.Tensor] = None,
    std: Optional[torch.Tensor] = None,
) -> Tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
    t = torch.nan_to_num(t.float(), nan=0.0, posinf=0.0, neginf=0.0)
    if mean is None or std is None:
        if t.size(0) == 0:
            mean = torch.zeros((1, t.size(1)), dtype=torch.float32)
            std = torch.ones((1, t.size(1)), dtype=torch.float32)
            return t, mean, std
        mean = t.mean(dim=0, keepdim=True)
        std = t.std(dim=0, keepdim=True).clamp(min=1e-6)
        if t.size(0) == 1:
            std = torch.ones_like(mean)
    else:
        mean = mean.float()
        std = std.float().clamp(min=1e-6)
    return (t - mean) / std, mean, std


def _compute_multiscale_pe(edge_index: torch.Tensor, num_nodes: int, dim: int = 16) -> torch.Tensor:
    """Multi-Scale Smooth Structural PE (1, 2, 4, 6 hops, seed=0 — khớp 100% Cell 1.7 v4)."""
    gen = torch.Generator()
    gen.manual_seed(0)
    scales = [1, 2, 4, 6]
    sub_dim = max(dim // len(scales), 1)
    r = torch.randn((num_nodes, sub_dim), generator=gen, dtype=torch.float32)
    r = r / r.norm(dim=-1, keepdim=True).clamp(min=1e-8)

    loop_nodes = torch.arange(num_nodes, dtype=torch.long)
    ei = torch.cat([edge_index, torch.stack([loop_nodes, loop_nodes], dim=0)], dim=1)
    row, col = ei[0], ei[1]

    deg = torch.zeros(num_nodes, dtype=torch.float32)
    deg.index_add_(0, col, torch.ones(col.shape[0], dtype=torch.float32))
    deg_inv_sqrt = deg.pow(-0.5)
    deg_inv_sqrt.masked_fill_(deg_inv_sqrt == float("inf"), 0.0)
    norm = deg_inv_sqrt[row] * deg_inv_sqrt[col]

    scale_outs = []
    for hop in range(1, max(scales) + 1):
        out = torch.zeros_like(r)
        out.index_add_(0, col, r[row] * norm.unsqueeze(-1))
        r = out / out.norm(dim=-1, keepdim=True).clamp(min=1e-8)
        if hop in scales:
            scale_outs.append(r)

    pe = torch.cat(scale_outs, dim=1)
    if pe.size(1) > dim:
        pe = pe[:, :dim]
    elif pe.size(1) < dim:
        pe = torch.cat([pe, torch.zeros((num_nodes, dim - pe.size(1)), dtype=torch.float32)], dim=1)
    return pe


def _bipartite_to_customer_metapath(
    edge_index: torch.Tensor,
    acc2cust: torch.Tensor,
    num_cust: int,
    max_entity_deg: int = 50,
) -> Tuple[torch.Tensor, torch.Tensor]:
    if edge_index.size(1) == 0:
        return torch.empty((2, 0), dtype=torch.long), torch.empty((0, 2), dtype=torch.float32)

    c_raw = acc2cust[edge_index[0]]
    valid = c_raw >= 0
    c_raw = c_raw[valid]
    ent_raw = edge_index[1][valid]
    if c_raw.numel() == 0:
        return torch.empty((2, 0), dtype=torch.long), torch.empty((0, 2), dtype=torch.float32)

    num_ent = int(ent_raw.max().item()) + 1
    pair_hash = c_raw * num_ent + ent_raw
    uniq_ce = torch.unique(pair_hash)
    c_u = uniq_ce // num_ent
    ent_u = uniq_ce % num_ent

    order = torch.argsort(ent_u)
    c_u, ent_u = c_u[order], ent_u[order]
    _, counts = torch.unique_consecutive(ent_u, return_counts=True)
    splits = torch.split(c_u, counts.tolist())

    u_list, v_list, w_list = [], [], []
    for grp in splits:
        d = grp.numel()
        if 2 <= d <= max_entity_deg:
            u = grp.repeat_interleave(d)
            v = grp.repeat(d)
            mask = u != v
            if mask.any():
                u_m = u[mask]
                v_m = v[mask]
                u_list.append(u_m)
                v_list.append(v_m)
                w_list.append(torch.full((u_m.numel(),), 1.0 / math.log1p(d), dtype=torch.float32))

    if not u_list:
        return torch.empty((2, 0), dtype=torch.long), torch.empty((0, 2), dtype=torch.float32)

    u_all = torch.cat(u_list)
    v_all = torch.cat(v_list)
    w_all = torch.cat(w_list)

    eh = u_all * num_cust + v_all
    uniq_eh, inv = torch.unique(eh, return_inverse=True)
    cnt = torch.zeros(uniq_eh.size(0), dtype=torch.float32)
    aa_sum = torch.zeros(uniq_eh.size(0), dtype=torch.float32)
    cnt.index_add_(0, inv, torch.ones_like(w_all))
    aa_sum.index_add_(0, inv, w_all)

    ei_out = torch.stack([uniq_eh // num_cust, uniq_eh % num_cust], dim=0)
    ea_out = torch.stack([torch.log1p(cnt), aa_sum], dim=1)
    return ei_out, ea_out


def _build_transacts_customer_metapath(
    tx_edge_index: torch.Tensor,
    tx_edge_attr: torch.Tensor,
    acc2cust: torch.Tensor,
    num_cust: int,
    z_thresh: float = 1.0,
    top_k_per_node: int = 25,
) -> Tuple[torch.Tensor, torch.Tensor]:
    ea_dim = tx_edge_attr.size(1) if tx_edge_attr.ndim == 2 else 4
    if tx_edge_index.size(1) == 0:
        return torch.empty((2, 0), dtype=torch.long), torch.empty((0, ea_dim + 1), dtype=torch.float32)

    c_u = acc2cust[tx_edge_index[0]]
    c_v = acc2cust[tx_edge_index[1]]
    ea_raw = tx_edge_attr.float()
    mask = (c_u >= 0) & (c_v >= 0) & (c_u != c_v) & ((ea_raw[:, 0] > z_thresh) | (ea_raw[:, 1] > 0.0))
    if not mask.any():
        return torch.empty((2, 0), dtype=torch.long), torch.empty((0, ea_dim + 1), dtype=torch.float32)

    cu_m = c_u[mask]
    cv_m = c_v[mask]
    ea_m = ea_raw[mask]

    eh = cu_m * num_cust + cv_m
    uniq_eh, inv = torch.unique(eh, return_inverse=True)
    n_uniq = uniq_eh.size(0)
    ea_sum = torch.zeros((n_uniq, ea_dim), dtype=torch.float32)
    cnt = torch.zeros((n_uniq, 1), dtype=torch.float32)
    ea_sum.index_add_(0, inv, ea_m)
    cnt.index_add_(0, inv, torch.ones((ea_m.size(0), 1), dtype=torch.float32))

    ea_mean = ea_sum / cnt.clamp(min=1.0)
    ea_out = torch.cat([ea_mean, torch.log1p(cnt)], dim=1)
    ei_out = torch.stack([uniq_eh // num_cust, uniq_eh % num_cust], dim=0)

    if top_k_per_node is not None and top_k_per_node > 0 and ei_out.size(1) > 0:
        src = ei_out[0]
        score = ea_mean[:, 0] + (ea_mean[:, 1] if ea_mean.size(1) > 1 else 0.0) + 0.5 * torch.log1p(cnt.squeeze(1))
        perm1 = torch.argsort(score, descending=True)
        src_p, ei_p, ea_p = src[perm1], ei_out[:, perm1], ea_out[perm1]
        perm2 = torch.argsort(src_p, stable=True)
        src_s, ei_s, ea_s = src_p[perm2], ei_p[:, perm2], ea_p[perm2]
        _, counts = torch.unique_consecutive(src_s, return_counts=True)
        grp_starts = torch.cumsum(counts, dim=0) - counts
        rank_in_grp = torch.arange(src_s.size(0)) - torch.repeat_interleave(grp_starts, counts)
        keep_mask = rank_in_grp < top_k_per_node
        ei_out = ei_s[:, keep_mask]
        ea_out = ea_s[keep_mask]

    return ei_out, ea_out


def _build_sym_csr(edge_index: Optional[torch.Tensor], num_nodes: int) -> sp.csr_matrix:
    if edge_index is None or edge_index.size(1) == 0:
        return sp.csr_matrix((num_nodes, num_nodes), dtype=np.float32)
    u = edge_index[0].cpu().numpy()
    v = edge_index[1].cpu().numpy()
    mask = u != v
    u, v = u[mask], v[mask]
    if len(u) == 0:
        return sp.csr_matrix((num_nodes, num_nodes), dtype=np.float32)
    mat = sp.csr_matrix((np.ones(len(u), dtype=np.float32), (u, v)), shape=(num_nodes, num_nodes))
    mat = ((mat + mat.T) > 0).astype(np.float32)
    mat.setdiag(0)
    mat.eliminate_zeros()
    return mat


def _build_count_sym_csr(edge_index: Optional[torch.Tensor], num_nodes: int) -> sp.csr_matrix:
    """Đếm số cạnh thực tế giữa 2 khách hàng (cho PairwiseSummary dễ diễn giải)."""
    if edge_index is None or edge_index.size(1) == 0:
        return sp.csr_matrix((num_nodes, num_nodes), dtype=np.float32)
    u = edge_index[0].cpu().numpy()
    v = edge_index[1].cpu().numpy()
    mask = u != v
    u, v = u[mask], v[mask]
    if len(u) == 0:
        return sp.csr_matrix((num_nodes, num_nodes), dtype=np.float32)
    mat = sp.csr_matrix((np.ones(len(u), dtype=np.float32), (u, v)), shape=(num_nodes, num_nodes))
    mat = (mat + mat.T).tocsr()
    mat.setdiag(0)
    mat.eliminate_zeros()
    return mat


def _topk_csr(mat: sp.csr_matrix, k: int = 256) -> sp.csr_matrix:
    mat = mat.tocsr()
    n_rows, n_cols = mat.shape
    indptr, indices, data = mat.indptr, mat.indices, mat.data
    new_indptr = np.empty(n_rows + 1, dtype=np.int64)
    new_indptr[0] = 0
    new_indices, new_data = [], []
    for i in range(n_rows):
        s, e = indptr[i], indptr[i + 1]
        cnt = e - s
        if cnt <= k:
            if cnt > 0:
                new_indices.append(indices[s:e])
                new_data.append(data[s:e])
            new_indptr[i + 1] = new_indptr[i] + cnt
        else:
            row_d = data[s:e]
            top_local = np.argpartition(row_d, -k)[-k:]
            new_indices.append(indices[s + top_local])
            new_data.append(row_d[top_local])
            new_indptr[i + 1] = new_indptr[i] + k
    out = sp.csr_matrix(
        (
            np.concatenate(new_data).astype(np.float32) if new_data else np.empty(0, dtype=np.float32),
            np.concatenate(new_indices) if new_indices else np.empty(0, dtype=np.int64),
            new_indptr,
        ),
        shape=(n_rows, n_cols),
    )
    out.sort_indices()
    return out


def _row_norm_csr(mat: sp.csr_matrix) -> sp.csr_matrix:
    norms = np.sqrt(mat.multiply(mat).sum(axis=1)).A1
    norms[norms < 1e-12] = 1.0
    out = (sp.diags(1.0 / norms) @ mat).tocsr()
    out.sort_indices()
    return out


class HeteroGraphAdapter:
    """Adapter đồ thị dị thể v4: 82d Customer Node + 4 Meta-paths + 24d Full-Graph Pairwise."""

    def __init__(self, frozen_scalers: Optional[Dict[str, Any]] = None, config: Optional[Dict[str, Any]] = None):
        if frozen_scalers and "hetero_v4" in frozen_scalers:
            self.scalers = frozen_scalers["hetero_v4"]
        else:
            self.scalers = frozen_scalers or {}
        self.config = {**HETERO_V4_CONFIG, **(config or {})}

    def augment_graph(
        self,
        raw_hetero_data: Any,
        use_frozen_scaler: Optional[bool] = None,
        scaler_mode: str = "auto",
        return_fitted_scalers: bool = False,
    ) -> Tuple[Any, torch.Tensor, Optional[Dict[str, Any]]]:
        """
        Tạo customer.x [N, 82] (66d tổng hợp + 16d Multi-Scale PE), 4 Meta-paths,
        cắt rev_BANKS_WITH, trả về (hetero_g, full_tx_cust_ei, fitted_scalers_or_None).
        scaler_mode='auto' dùng frozen_scalers cho full-graph (>= 40,000) hoặc đồ thị quá nhỏ (< 16),
        và local z-score cho induced subgraph (16..39,999) để chống Subgraph Covariate Shift.
        """
        g = raw_hetero_data.clone()
        num_cust = g["customer"].num_nodes
        if use_frozen_scaler is True:
            apply_frozen = True
        elif use_frozen_scaler is False:
            apply_frozen = False
        elif scaler_mode == "frozen":
            apply_frozen = True
        elif scaler_mode == "local":
            apply_frozen = False
        else:  # "auto"
            apply_frozen = num_cust >= 40000 or num_cust < 16

        node_scalers_in = self.scalers.get("node_scalers", {}) if apply_frozen else {}
        edge_scalers_in = self.scalers.get("edge_scalers", {}) if apply_frozen else {}
        fitted_node_scalers: Dict[str, Dict[str, torch.Tensor]] = {}
        fitted_edge_scalers: Dict[Tuple[str, str, str], Dict[str, torch.Tensor]] = {}

        owns = g[("customer", "OWNS", "account")].edge_index
        num_acc = g["account"].num_nodes
        acc2cust = torch.full((num_acc,), -1, dtype=torch.long)
        if owns.size(1) > 0:
            acc2cust[owns[1]] = owns[0]

        # 1. Tổng hợp 66d đặc trưng đa thực thể cho customer (trước 16d Multi-Scale PE)
        x_cust_raw = g["customer"].x.float()
        x_acc = g["account"].x.float()
        acc_sum = torch.zeros((num_cust, x_acc.size(1)), dtype=torch.float32)
        acc_cnt = torch.zeros((num_cust, 1), dtype=torch.float32)
        acc_max = torch.full((num_cust, x_acc.size(1)), -1e9, dtype=torch.float32)
        if owns.size(1) > 0:
            acc_sum.index_add_(0, owns[0], x_acc[owns[1]])
            acc_cnt.index_add_(0, owns[0], torch.ones((owns.size(1), 1), dtype=torch.float32))
            acc_max.scatter_reduce_(
                0,
                owns[0].unsqueeze(1).expand(-1, x_acc.size(1)),
                x_acc[owns[1]],
                reduce="amax",
                include_self=True,
            )
        acc_mean = acc_sum / acc_cnt.clamp(min=1.0)
        acc_max = torch.where(acc_max < -1e8, torch.zeros_like(acc_max), acc_max)

        # Device stats
        ad = g[("account", "USES_DEVICE", "device")].edge_index
        dev_dim = g["device"].x.size(1) + 2
        dev_sum = torch.zeros((num_cust, dev_dim), dtype=torch.float32)
        dev_cnt = torch.zeros((num_cust, 1), dtype=torch.float32)
        if ad.size(1) > 0:
            c_ad = acc2cust[ad[0]]
            m_ad = c_ad >= 0
            if m_ad.any():
                feat_ad = torch.cat(
                    [g["device"].x[ad[1][m_ad]].float(), g[("account", "USES_DEVICE", "device")].edge_attr[m_ad].float()],
                    dim=1,
                )
                dev_sum.index_add_(0, c_ad[m_ad], feat_ad)
                dev_cnt.index_add_(0, c_ad[m_ad], torch.ones((int(m_ad.sum().item()), 1), dtype=torch.float32))
        dev_mean = dev_sum / dev_cnt.clamp(min=1.0)

        # IP stats
        ai = g[("account", "USES_IP", "ip")].edge_index
        ip_dim = g["ip"].x.size(1) + 2
        ip_sum = torch.zeros((num_cust, ip_dim), dtype=torch.float32)
        ip_cnt = torch.zeros((num_cust, 1), dtype=torch.float32)
        if ai.size(1) > 0:
            c_ai = acc2cust[ai[0]]
            m_ai = c_ai >= 0
            if m_ai.any():
                feat_ai = torch.cat(
                    [g["ip"].x[ai[1][m_ai]].float(), g[("account", "USES_IP", "ip")].edge_attr[m_ai].float()],
                    dim=1,
                )
                ip_sum.index_add_(0, c_ai[m_ai], feat_ai)
                ip_cnt.index_add_(0, c_ai[m_ai], torch.ones((int(m_ai.sum().item()), 1), dtype=torch.float32))
        ip_mean = ip_sum / ip_cnt.clamp(min=1.0)

        # Transacts Outgoing (TX) + Incoming (RX) stats
        tx = g[("account", "TRANSACTS", "account")].edge_index
        ea_tx = g[("account", "TRANSACTS", "account")].edge_attr.float()
        tx_dim = ea_tx.size(1) if ea_tx.ndim == 2 else 4
        tx_sum = torch.zeros((num_cust, tx_dim), dtype=torch.float32)
        tx_cnt = torch.zeros((num_cust, 1), dtype=torch.float32)
        rx_sum = torch.zeros((num_cust, tx_dim), dtype=torch.float32)
        rx_cnt = torch.zeros((num_cust, 1), dtype=torch.float32)
        c_tx_u = torch.empty((0,), dtype=torch.long)
        c_tx_v = torch.empty((0,), dtype=torch.long)
        if tx.size(1) > 0:
            c_tx_u = acc2cust[tx[0]]
            c_tx_v = acc2cust[tx[1]]
            m_tx = c_tx_u >= 0
            if m_tx.any():
                tx_sum.index_add_(0, c_tx_u[m_tx], ea_tx[m_tx])
                tx_cnt.index_add_(0, c_tx_u[m_tx], torch.ones((int(m_tx.sum().item()), 1), dtype=torch.float32))
            m_rx = c_tx_v >= 0
            if m_rx.any():
                rx_sum.index_add_(0, c_tx_v[m_rx], ea_tx[m_rx])
                rx_cnt.index_add_(0, c_tx_v[m_rx], torch.ones((int(m_rx.sum().item()), 1), dtype=torch.float32))
        tx_mean = tx_sum / tx_cnt.clamp(min=1.0)
        rx_mean = rx_sum / rx_cnt.clamp(min=1.0)

        # Bank stats
        bw = g[("customer", "BANKS_WITH", "bank")].edge_index
        x_bank = g["bank"].x.float()
        bank_sum = torch.zeros((num_cust, x_bank.size(1)), dtype=torch.float32)
        bank_cnt = torch.zeros((num_cust, 1), dtype=torch.float32)
        if bw.size(1) > 0:
            bank_sum.index_add_(0, bw[0], x_bank[bw[1]])
            bank_cnt.index_add_(0, bw[0], torch.ones((bw.size(1), 1), dtype=torch.float32))
        bank_mean = bank_sum / bank_cnt.clamp(min=1.0)

        # Beneficiary / WIRES_TO stats
        wb = g[("account", "WIRES_TO", "beneficiary")].edge_index
        wb_dim = g["beneficiary"].x.size(1) + 4
        wb_sum = torch.zeros((num_cust, wb_dim), dtype=torch.float32)
        wb_cnt = torch.zeros((num_cust, 1), dtype=torch.float32)
        if wb.size(1) > 0:
            c_wb = acc2cust[wb[0]]
            m_wb = c_wb >= 0
            if m_wb.any():
                feat_wb = torch.cat(
                    [
                        g["beneficiary"].x[wb[1][m_wb]].float(),
                        g[("account", "WIRES_TO", "beneficiary")].edge_attr[m_wb].float(),
                    ],
                    dim=1,
                )
                wb_sum.index_add_(0, c_wb[m_wb], feat_wb)
                wb_cnt.index_add_(0, c_wb[m_wb], torch.ones((int(m_wb.sum().item()), 1), dtype=torch.float32))
        wb_mean = wb_sum / wb_cnt.clamp(min=1.0)

        x_cust_agg = torch.cat(
            [
                x_cust_raw,
                acc_mean,
                acc_max,
                torch.log1p(acc_cnt),
                dev_mean,
                torch.log1p(dev_cnt),
                ip_mean,
                torch.log1p(ip_cnt),
                tx_mean,
                torch.log1p(tx_cnt),
                rx_mean,
                torch.log1p(rx_cnt),
                bank_mean,
                wb_mean,
                torch.log1p(wb_cnt),
            ],
            dim=1,
        )
        sc_cust = node_scalers_in.get("customer", {})
        x_cust_norm, c_m, c_s = _zscore_with_stats(x_cust_agg, sc_cust.get("mean"), sc_cust.get("std"))
        fitted_node_scalers["customer"] = {"mean": c_m, "std": c_s}

        # 2. 4 kênh Meta-path Shortcuts + full_tx_cust_ei (100% TRANSACTS)
        ei_dev, ea_dev = _bipartite_to_customer_metapath(ad, acc2cust, num_cust, self.config["METAPATH_MAX_ENTITY_DEG"])
        ei_ip, ea_ip = _bipartite_to_customer_metapath(ai, acc2cust, num_cust, self.config["METAPATH_MAX_ENTITY_DEG"])
        ei_ben, ea_ben = _bipartite_to_customer_metapath(wb, acc2cust, num_cust, self.config["METAPATH_MAX_BENEF_DEG"])
        ei_txc, ea_txc = _build_transacts_customer_metapath(
            tx,
            ea_tx,
            acc2cust,
            num_cust,
            self.config["TX_CUST_Z_THRESH"],
            self.config.get("TX_CUST_TOPK_PER_NODE", 25),
        )

        if c_tx_u.numel() > 0:
            m_full_tx = (c_tx_u >= 0) & (c_tx_v >= 0) & (c_tx_u != c_tx_v)
            if m_full_tx.any():
                eh_full_tx = torch.unique(c_tx_u[m_full_tx] * num_cust + c_tx_v[m_full_tx])
                full_tx_cust_ei = torch.stack([eh_full_tx // num_cust, eh_full_tx % num_cust], dim=0)
            else:
                full_tx_cust_ei = torch.empty((2, 0), dtype=torch.long)
        else:
            full_tx_cust_ei = torch.empty((2, 0), dtype=torch.long)

        for et, ei_mp, ea_mp in [
            (("customer", "SHARED_DEVICE", "customer"), ei_dev, ea_dev),
            (("customer", "SHARED_IP", "customer"), ei_ip, ea_ip),
            (("customer", "SHARED_BENEF", "customer"), ei_ben, ea_ben),
            (("customer", "TRANSACTS_CUST", "customer"), ei_txc, ea_txc),
        ]:
            g[et].edge_index = ei_mp
            if ei_mp.size(1) > 0:
                sc_e = edge_scalers_in.get(et, {})
                ea_norm, em, es = _zscore_with_stats(ea_mp, sc_e.get("mean"), sc_e.get("std"))
                g[et].edge_attr = ea_norm
                fitted_edge_scalers[et] = {"mean": em, "std": es}
            else:
                g[et].edge_attr = ea_mp

        rev_txc = ("customer", "rev_TRANSACTS_CUST", "customer")
        g[rev_txc].edge_index = ei_txc.flip(0).contiguous()
        g[rev_txc].edge_attr = g[("customer", "TRANSACTS_CUST", "customer")].edge_attr.clone()
        if ("customer", "TRANSACTS_CUST", "customer") in fitted_edge_scalers:
            fitted_edge_scalers[rev_txc] = fitted_edge_scalers[("customer", "TRANSACTS_CUST", "customer")]

        # 3. 16d Multi-Scale PE (1, 2, 4, 6 hops)
        ei_rel = g[("customer", "RELATED_TO", "customer")].edge_index
        ei_rev_rel = g[("customer", "rev_RELATED_TO", "customer")].edge_index
        cust_full_ei = torch.cat(
            [ei_rel, ei_rev_rel, ei_dev, ei_ip, ei_ben, full_tx_cust_ei, full_tx_cust_ei.flip(0)],
            dim=1,
        )
        if cust_full_ei.size(1) > 0:
            cust_full_ei = cust_full_ei.unique(dim=1)
        struct_pe = _compute_multiscale_pe(cust_full_ei, num_cust, dim=self.config["STRUCT_PE_DIM"])
        g["customer"].x = torch.cat([x_cust_norm, struct_pe], dim=1)

        # Z-score cho 5 loại nút còn lại & các edge_attr gốc
        for nt in g.node_types:
            if nt != "customer":
                sc_n = node_scalers_in.get(nt, {})
                xn, nm, ns = _zscore_with_stats(g[nt].x, sc_n.get("mean"), sc_n.get("std"))
                g[nt].x = xn
                fitted_node_scalers[nt] = {"mean": nm, "std": ns}

        mp_rels = {"SHARED_DEVICE", "SHARED_IP", "SHARED_BENEF", "TRANSACTS_CUST", "rev_TRANSACTS_CUST"}
        for et in g.edge_types:
            if et[1] not in mp_rels and "edge_attr" in g[et] and g[et].edge_attr is not None and g[et].edge_attr.size(0) > 0:
                sc_e = edge_scalers_in.get(et, {})
                ean, em, es = _zscore_with_stats(g[et].edge_attr, sc_e.get("mean"), sc_e.get("std"))
                g[et].edge_attr = ean
                fitted_edge_scalers[et] = {"mean": em, "std": es}

        # 4. Cắt chiều truyền ngược rev_BANKS_WITH
        if self.config.get("DROP_REV_BANKS_WITH", True) and ("bank", "rev_BANKS_WITH", "customer") in g.edge_types:
            del g[("bank", "rev_BANKS_WITH", "customer")]

        fitted = {"node_scalers": fitted_node_scalers, "edge_scalers": fitted_edge_scalers} if return_fitted_scalers else None
        return g, full_tx_cust_ei, fitted

    def compute_pairwise_features(
        self,
        hetero_g: Any,
        candidate_pairs: torch.Tensor,
        full_tx_cust_ei: Optional[torch.Tensor] = None,
        raw_hetero_data: Optional[Any] = None,
        use_frozen_scaler: Optional[bool] = None,
        scaler_mode: str = "auto",
    ) -> Tuple[torch.Tensor, np.ndarray, List[PairwiseSummary]]:
        """
        Trích xuất 24 đặc trưng cấu trúc cặp nút (v4 Full-Graph CPU + Multi-Hop 1..6),
        chuẩn hóa bằng pairwise_mean / pairwise_std đóng băng từ tập Train,
        đồng thời trả về danh sách PairwiseSummary dễ diễn giải cho UI.
        """
        n_pairs = int(candidate_pairs.size(1))
        if n_pairs == 0:
            return torch.empty((0, 24), dtype=torch.float32), np.empty((0, 24), dtype=np.float32), []

        n_cust = hetero_g["customer"].num_nodes
        A_rel = _build_sym_csr(hetero_g[("customer", "RELATED_TO", "customer")].edge_index, n_cust)
        A_dev = _build_sym_csr(hetero_g[("customer", "SHARED_DEVICE", "customer")].edge_index, n_cust)
        A_ip = _build_sym_csr(hetero_g[("customer", "SHARED_IP", "customer")].edge_index, n_cust)
        A_ben = _build_sym_csr(hetero_g[("customer", "SHARED_BENEF", "customer")].edge_index, n_cust)
        A_tx_high = _build_sym_csr(hetero_g[("customer", "TRANSACTS_CUST", "customer")].edge_index, n_cust)
        A_tx_all = _build_sym_csr(full_tx_cust_ei, n_cust) if full_tx_cust_ei is not None else A_tx_high

        A_all = ((A_rel + A_dev + A_ip + A_ben + A_tx_all) > 0).astype(np.float32)
        A_all.setdiag(0)
        A_all.eliminate_zeros()

        A_w = (3.0 * A_rel + 3.0 * A_dev + 2.5 * A_ip + 2.0 * A_ben + 1.0 * A_tx_high + 0.5 * A_tx_all).astype(np.float32)
        A_w.setdiag(0)
        A_w.eliminate_zeros()

        deg_all = np.asarray(A_all.sum(axis=1)).ravel()
        inv_log_deg = np.zeros_like(deg_all, dtype=np.float32)
        nz_deg = deg_all > 0
        inv_log_deg[nz_deg] = 1.0 / np.log1p(deg_all[nz_deg] + 0.1)
        A_aa = A_all.multiply(inv_log_deg).tocsr()

        deg_w = np.asarray(A_w.sum(axis=1)).ravel()
        inv_log_wdeg = np.zeros_like(deg_w, dtype=np.float32)
        nz_w = deg_w > 0
        inv_log_wdeg[nz_w] = 1.0 / np.log1p(deg_w[nz_w] + 0.1)
        A_w_aa = A_w.multiply(inv_log_wdeg).tocsr()

        inv_wdeg = np.zeros_like(deg_w, dtype=np.float32)
        inv_wdeg[nz_w] = 1.0 / deg_w[nz_w]
        P_w = sp.diags(inv_wdeg) @ A_w

        u = np.array(candidate_pairs[0].cpu().numpy(), dtype=np.int64, copy=True)
        v = np.array(candidate_pairs[1].cpu().numpy(), dtype=np.int64, copy=True)
        uniq_nodes = np.unique(np.concatenate([u, v]))
        node_to_row = np.full(n_cust, -1, dtype=np.int64)
        node_to_row[uniq_nodes] = np.arange(len(uniq_nodes))

        R1 = _topk_csr(P_w[uniq_nodes, :], k=256)
        R2 = _topk_csr(R1 @ P_w, k=256)
        R3 = _topk_csr(R2 @ P_w, k=256)
        R4 = _topk_csr(R3 @ P_w, k=256)
        R5 = _topk_csr(R4 @ P_w, k=256)
        R6 = _topk_csr(R5 @ P_w, k=256)

        R1_norm = _row_norm_csr(R1)
        R2_norm = _row_norm_csr(R2)
        R46_norm = _row_norm_csr(0.50 * R4 + 0.30 * R5 + 0.20 * R6)

        dir_rel = np.asarray(A_rel[u, v]).ravel()
        dir_dev = np.asarray(A_dev[u, v]).ravel()
        dir_ip = np.asarray(A_ip[u, v]).ravel()
        dir_ben = np.asarray(A_ben[u, v]).ravel()
        dir_tx_h = np.asarray(A_tx_high[u, v]).ravel()
        dir_tx_all = np.asarray(A_tx_all[u, v]).ravel()

        cn_rel = np.log1p(np.asarray(A_rel[u].multiply(A_rel[v]).sum(axis=1)).ravel())
        cn_dev = np.log1p(np.asarray(A_dev[u].multiply(A_dev[v]).sum(axis=1)).ravel())
        cn_ip = np.log1p(np.asarray(A_ip[u].multiply(A_ip[v]).sum(axis=1)).ravel())
        cn_ben = np.log1p(np.asarray(A_ben[u].multiply(A_ben[v]).sum(axis=1)).ravel())
        cn_tx_h = np.log1p(np.asarray(A_tx_high[u].multiply(A_tx_high[v]).sum(axis=1)).ravel())
        cn_tx_all = np.log1p(np.asarray(A_tx_all[u].multiply(A_tx_all[v]).sum(axis=1)).ravel())

        cn_all = np.asarray(A_all[u].multiply(A_all[v]).sum(axis=1)).ravel()
        aa_all = np.log1p(np.asarray(A_all[u].multiply(A_aa[v]).sum(axis=1)).ravel())
        weighted_aa = np.log1p(np.asarray(A_w[u].multiply(A_w_aa[v]).sum(axis=1)).ravel())
        union_all = deg_all[u] + deg_all[v] - cn_all
        jacc_all = np.where(union_all > 0, cn_all / np.maximum(union_all, 1e-8), 0.0)
        deg_prod = np.log1p(deg_all[u]) * np.log1p(deg_all[v])

        cross_dev_ip = (
            np.asarray(A_dev[u].multiply(A_ip[v]).sum(axis=1)).ravel()
            + np.asarray(A_ip[u].multiply(A_dev[v]).sum(axis=1)).ravel()
        )
        path2_dev_ip = np.log1p(cross_dev_ip)

        cross_rel_tx = (
            np.asarray(A_rel[u].multiply(A_tx_all[v]).sum(axis=1)).ravel()
            + np.asarray(A_tx_all[u].multiply(A_rel[v]).sum(axis=1)).ravel()
        )
        path2_cross_rel_tx = np.log1p(cross_rel_tx)

        ru, rv = node_to_row[u], node_to_row[v]
        ppr1_cos = np.asarray(R1_norm[ru].multiply(R1_norm[rv]).sum(axis=1)).ravel()
        ppr2_cos = np.asarray(R2_norm[ru].multiply(R2_norm[rv]).sum(axis=1)).ravel()
        ppr46_cos = np.asarray(R46_norm[ru].multiply(R46_norm[rv]).sum(axis=1)).ravel()

        weighted_cn_score = np.log1p(
            3.0 * dir_rel + 3.0 * dir_dev + 2.5 * dir_ip + 2.0 * dir_ben + 1.0 * dir_tx_h + 0.5 * dir_tx_all
            + 1.5 * (cn_rel + cn_dev + cn_ip + cn_ben) + 0.5 * cn_tx_h + 0.25 * cn_tx_all
        )
        max_channel_sim = np.maximum.reduce(
            [
                dir_rel, dir_dev, dir_ip, dir_ben, dir_tx_h, dir_tx_all,
                np.tanh(cn_rel), np.tanh(cn_dev), np.tanh(cn_ip), ppr1_cos, ppr2_cos,
            ]
        )
        is_struct_disconnected = (
            ((dir_rel + dir_dev + dir_ip + dir_ben + dir_tx_all + cn_all + cross_dev_ip + cross_rel_tx) == 0)
            & (ppr2_cos < 1e-4)
            & (ppr46_cos < 1e-4)
        ).astype(np.float32)

        raw_feats = np.stack(
            [
                dir_rel, dir_dev, dir_ip, dir_ben, dir_tx_h, dir_tx_all,
                cn_rel, cn_dev, cn_ip, cn_ben, cn_tx_h, cn_tx_all,
                aa_all, weighted_aa, jacc_all, deg_prod,
                path2_dev_ip, path2_cross_rel_tx,
                ppr1_cos, ppr2_cos, ppr46_cos,
                weighted_cn_score, max_channel_sim, is_struct_disconnected,
            ],
            axis=1,
        ).astype(np.float32)
        raw_feats = np.nan_to_num(raw_feats, nan=0.0, posinf=0.0, neginf=0.0)

        has_frozen_pw = "pairwise_mean" in self.scalers and "pairwise_std" in self.scalers
        if use_frozen_scaler is True:
            apply_frozen_pw = has_frozen_pw
        elif use_frozen_scaler is False:
            apply_frozen_pw = False
        elif scaler_mode == "frozen":
            apply_frozen_pw = has_frozen_pw
        elif scaler_mode == "local":
            apply_frozen_pw = False
        else:  # "auto"
            apply_frozen_pw = has_frozen_pw and (n_cust >= 40000 or n_pairs < 32)

        if apply_frozen_pw:
            tr_mean = np.asarray(self.scalers["pairwise_mean"], dtype=np.float32)
            tr_std = np.clip(np.asarray(self.scalers["pairwise_std"], dtype=np.float32), 1e-6, None)
            norm_tensor = torch.from_numpy((raw_feats - tr_mean) / tr_std).float()
        else:
            tr_mean = raw_feats.mean(axis=0, keepdims=True)
            tr_std = np.clip(raw_feats.std(axis=0, keepdims=True), 1e-6, None)
            norm_tensor = torch.from_numpy((raw_feats - tr_mean) / tr_std).float().clamp(-8.0, 8.0)

        # Tính giá trị đếm thực tế cho PairwiseSummary (hiển thị đẹp trên UI)
        shared_dev_cnt = np.rint(dir_dev).astype(np.int64)
        shared_ip_cnt = np.rint(dir_ip).astype(np.int64)
        direct_tx_cnt = np.rint(dir_tx_all).astype(np.int64)
        if raw_hetero_data is not None:
            shared_dev_cnt, shared_ip_cnt, direct_tx_cnt = self._count_exact_shared_entities(raw_hetero_data, u, v)

        # Tính độ tương đồng rủi ro nút từ cột 0 (risk_score)
        ref_x = raw_hetero_data["customer"].x if raw_hetero_data is not None else hetero_g["customer"].x
        risk_col = ref_x[:, 0].float().cpu().numpy()
        risk_diff = np.abs(risk_col[u] - risk_col[v])
        node_risk_sim = np.exp(-0.5 * risk_diff)

        summaries: List[PairwiseSummary] = []
        for i in range(n_pairs):
            ppr_val = float(max(ppr1_cos[i], ppr2_cos[i], ppr46_cos[i]))
            summaries.append(
                PairwiseSummary(
                    shared_devices=int(shared_dev_cnt[i]),
                    shared_ips=int(shared_ip_cnt[i]),
                    direct_tx_count=int(direct_tx_cnt[i]),
                    weighted_aa=round(float(weighted_aa[i]), 4),
                    ppr_multi_hop_cos=round(ppr_val, 4),
                    node_risk_sim=round(float(node_risk_sim[i]), 4),
                )
            )
        return norm_tensor, raw_feats, summaries

    @staticmethod
    def _count_exact_shared_entities(raw_g: Any, u: np.ndarray, v: np.ndarray) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        """Đếm chính xác số thiết bị chung, IP chung, và số lượt chuyển khoản trực tiếp giữa từng cặp (u, v)."""
        num_cust = raw_g["customer"].num_nodes
        num_acc = raw_g["account"].num_nodes
        owns = raw_g[("customer", "OWNS", "account")].edge_index
        acc2cust = torch.full((num_acc,), -1, dtype=torch.long)
        if owns.size(1) > 0:
            acc2cust[owns[1]] = owns[0]

        def _shared_count(rel_tuple, num_ent: int) -> np.ndarray:
            ei = raw_g[rel_tuple].edge_index
            if ei.size(1) == 0 or num_ent == 0:
                return np.zeros(len(u), dtype=np.int64)
            c = acc2cust[ei[0]].cpu().numpy()
            e = ei[1].cpu().numpy()
            m = c >= 0
            if not m.any():
                return np.zeros(len(u), dtype=np.int64)
            mat = sp.csr_matrix((np.ones(int(m.sum()), dtype=np.float32), (c[m], e[m])), shape=(num_cust, num_ent))
            mat.data[:] = 1.0
            return np.asarray(mat[u].multiply(mat[v]).sum(axis=1)).ravel().astype(np.int64)

        dev_cnt = _shared_count(("account", "USES_DEVICE", "device"), raw_g["device"].num_nodes)
        ip_cnt = _shared_count(("account", "USES_IP", "ip"), raw_g["ip"].num_nodes)

        tx = raw_g[("account", "TRANSACTS", "account")].edge_index
        if tx.size(1) > 0:
            cu = acc2cust[tx[0]]
            cv = acc2cust[tx[1]]
            m = (cu >= 0) & (cv >= 0) & (cu != cv)
            if m.any():
                tx_mat = _build_count_sym_csr(torch.stack([cu[m], cv[m]], dim=0), num_cust)
                tx_cnt = np.asarray(tx_mat[u, v]).ravel().astype(np.int64)
            else:
                tx_cnt = np.zeros(len(u), dtype=np.int64)
        else:
            tx_cnt = np.zeros(len(u), dtype=np.int64)
        return dev_cnt, ip_cnt, tx_cnt
