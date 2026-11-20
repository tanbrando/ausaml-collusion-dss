"""
Script độc lập chạy trên Kaggle (hoặc Local) để:
  1. Xuất `models/frozen_scalers.pt` (Homo 44d + Hetero v4 Node/Edge/24d Pairwise)
     KHÔNG CẦN HUẤN LUYỆN LẠI MÔ HÌNH (~20 giây trên CPU).
  2. Trích xuất 5 Hồ sơ Vụ án mẫu nhẹ (`data/demo_cases/case_01..05.pt`) + `demo_cases_manifest.json`.
  3. Đóng gói sẵn file `/kaggle/working/m1_kaggle_artifacts.zip` (nếu chạy trên Kaggle) để tải 1 lần về repo.

Cách chạy trên Kaggle Notebook (CPU là đủ, không cần bật GPU):
    - Attach dataset `tanbrando/ausaml-preprocessed`
    - Copy toàn bộ nội dung file này vào 1 cell Kaggle và Run!
    - Tải `m1_kaggle_artifacts.zip` từ `/kaggle/working/`, giải nén vào thư mục `ausaml-collusion-dss/`:
        * `frozen_scalers.pt` -> `ausaml-collusion-dss/models/frozen_scalers.pt`
        * `demo_cases/*`      -> `ausaml-collusion-dss/data/demo_cases/`
"""

import json
import math
import os
import time
import zipfile
from pathlib import Path
from typing import Any, Dict, List, Set, Tuple

import numpy as np
import scipy.sparse as sp
import torch


# ==============================================================================
# 1. CẤU HÌNH ĐƯỜNG DẪN (Tự dò Kaggle & Local)
# ==============================================================================
DATA_SEARCH_PATHS = [
    "/kaggle/input/datasets/tanbrando/ausaml-preprocessed/processed_data",
    "/kaggle/input/ausaml-preprocessed/processed_data",
    "/kaggle/input",
    "./data/processed",
    "../data/processed",
]

HETERO_V4_CONFIG = {
    "STRUCT_PE_DIM": 16,
    "METAPATH_MAX_ENTITY_DEG": 50,
    "METAPATH_MAX_BENEF_DEG": 60,
    "TX_CUST_Z_THRESH": 1.0,
    "TX_CUST_TOPK_PER_NODE": 25,
    "DROP_REV_BANKS_WITH": True,
}

NODE_PREFIXES = {
    "customer": "CUST",
    "account": "ACC",
    "device": "DEV",
    "ip": "IP",
    "beneficiary": "BEN",
    "bank": "BANK",
}


def find_data_dir() -> Path:
    for base in DATA_SEARCH_PATHS:
        p = Path(base)
        if not p.exists():
            continue
        if (p / "processed_graph.pt").exists() and (p / "train_pairs.pt").exists():
            return p
        hits = list(p.rglob("processed_graph.pt"))
        if hits:
            return hits[0].parent
    raise FileNotFoundError(
        "Không tìm thấy 'processed_graph.pt' & 'train_pairs.pt'. "
        "Hãy attach dataset AusAML trên Kaggle hoặc đặt file vào data/processed/."
    )


def load_raw_as_dict(pt_path: Path) -> Dict[str, Any]:
    raw = torch.load(pt_path, map_location="cpu", weights_only=False)
    if isinstance(raw, dict) and "node_features" in raw:
        return raw
    if hasattr(raw, "node_types") and hasattr(raw, "edge_types"):
        return {
            "node_features": {nt: raw[nt].x for nt in raw.node_types},
            "edge_index": {et: raw[et].edge_index for et in raw.edge_types},
            "edge_attr": {
                et: raw[et].edge_attr
                for et in raw.edge_types
                if "edge_attr" in raw[et] and raw[et].edge_attr is not None
            },
        }
    raise ValueError("Định dạng processed_graph.pt không hợp lệ.")


# ==============================================================================
# 2. TÍNH TOÁN FROZEN SCALERS (HOMO 44D + HETERO V4 66D/EDGE/24D PAIRWISE)
# ==============================================================================
def _zscore_stats(t: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
    t = torch.nan_to_num(t.float(), nan=0.0, posinf=0.0, neginf=0.0)
    mean = t.mean(dim=0, keepdim=True)
    std = t.std(dim=0, keepdim=True).clamp(min=1e-6)
    return (t - mean) / std, mean, std


def _bipartite_to_customer_metapath(
    edge_index: torch.Tensor, acc2cust: torch.Tensor, num_cust: int, max_entity_deg: int
) -> Tuple[torch.Tensor, torch.Tensor]:
    c_raw = acc2cust[edge_index[0]]
    valid = c_raw >= 0
    c_raw, ent_raw = c_raw[valid], edge_index[1][valid]
    if c_raw.numel() == 0:
        return torch.empty((2, 0), dtype=torch.long), torch.empty((0, 2), dtype=torch.float32)

    num_ent = int(ent_raw.max().item()) + 1
    uniq_ce = torch.unique(c_raw * num_ent + ent_raw)
    c_u, ent_u = uniq_ce // num_ent, uniq_ce % num_ent

    order = torch.argsort(ent_u)
    c_u, ent_u = c_u[order], ent_u[order]
    _, counts = torch.unique_consecutive(ent_u, return_counts=True)
    splits = torch.split(c_u, counts.tolist())

    u_l, v_l, w_l = [], [], []
    for grp in splits:
        d = grp.numel()
        if 2 <= d <= max_entity_deg:
            u = grp.repeat_interleave(d)
            v = grp.repeat(d)
            m = u != v
            if m.any():
                u_l.append(u[m])
                v_l.append(v[m])
                w_l.append(torch.full((int(m.sum().item()),), 1.0 / math.log1p(d), dtype=torch.float32))
    if not u_l:
        return torch.empty((2, 0), dtype=torch.long), torch.empty((0, 2), dtype=torch.float32)

    u_all, v_all, w_all = torch.cat(u_l), torch.cat(v_l), torch.cat(w_l)
    uniq_eh, inv = torch.unique(u_all * num_cust + v_all, return_inverse=True)
    cnt = torch.zeros(uniq_eh.size(0), dtype=torch.float32)
    aa_sum = torch.zeros(uniq_eh.size(0), dtype=torch.float32)
    cnt.index_add_(0, inv, torch.ones_like(w_all))
    aa_sum.index_add_(0, inv, w_all)
    return torch.stack([uniq_eh // num_cust, uniq_eh % num_cust], dim=0), torch.stack([torch.log1p(cnt), aa_sum], dim=1)


def _build_transacts_customer_metapath(
    tx_ei: torch.Tensor, tx_ea: torch.Tensor, acc2cust: torch.Tensor, num_cust: int, z_thresh: float, top_k: int
) -> Tuple[torch.Tensor, torch.Tensor]:
    c_u, c_v = acc2cust[tx_ei[0]], acc2cust[tx_ei[1]]
    ea_raw = tx_ea.float()
    mask = (c_u >= 0) & (c_v >= 0) & (c_u != c_v) & ((ea_raw[:, 0] > z_thresh) | (ea_raw[:, 1] > 0.0))
    if not mask.any():
        return torch.empty((2, 0), dtype=torch.long), torch.empty((0, ea_raw.size(1) + 1), dtype=torch.float32)

    cu_m, cv_m, ea_m = c_u[mask], c_v[mask], ea_raw[mask]
    uniq_eh, inv = torch.unique(cu_m * num_cust + cv_m, return_inverse=True)
    n_u = uniq_eh.size(0)
    ea_sum = torch.zeros((n_u, ea_raw.size(1)), dtype=torch.float32)
    cnt = torch.zeros((n_u, 1), dtype=torch.float32)
    ea_sum.index_add_(0, inv, ea_m)
    cnt.index_add_(0, inv, torch.ones((ea_m.size(0), 1), dtype=torch.float32))

    ea_mean = ea_sum / cnt.clamp(min=1.0)
    ea_out = torch.cat([ea_mean, torch.log1p(cnt)], dim=1)
    ei_out = torch.stack([uniq_eh // num_cust, uniq_eh % num_cust], dim=0)

    src = ei_out[0]
    score = ea_mean[:, 0] + ea_mean[:, 1] + 0.5 * torch.log1p(cnt.squeeze(1))
    perm1 = torch.argsort(score, descending=True)
    src_p, ei_p, ea_p = src[perm1], ei_out[:, perm1], ea_out[perm1]
    perm2 = torch.argsort(src_p, stable=True)
    src_s, ei_s, ea_s = src_p[perm2], ei_p[:, perm2], ea_p[perm2]
    _, counts = torch.unique_consecutive(src_s, return_counts=True)
    grp_starts = torch.cumsum(counts, dim=0) - counts
    rank = torch.arange(src_s.size(0)) - torch.repeat_interleave(grp_starts, counts)
    keep = rank < top_k
    return ei_s[:, keep], ea_s[keep]


def _build_sym_csr(ei: torch.Tensor, n: int) -> sp.csr_matrix:
    if ei is None or ei.size(1) == 0:
        return sp.csr_matrix((n, n), dtype=np.float32)
    u, v = ei[0].cpu().numpy(), ei[1].cpu().numpy()
    m = u != v
    u, v = u[m], v[m]
    mat = sp.csr_matrix((np.ones(len(u), dtype=np.float32), (u, v)), shape=(n, n))
    mat = ((mat + mat.T) > 0).astype(np.float32)
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
            top_l = np.argpartition(row_d, -k)[-k:]
            new_indices.append(indices[s + top_l])
            new_data.append(row_d[top_l])
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


def compute_frozen_scalers(raw_graph: Dict[str, Any], train_pairs: Dict[str, torch.Tensor]) -> Tuple[Dict[str, Any], Dict[str, torch.Tensor]]:
    t0 = time.time()
    nf = raw_graph["node_features"]
    ei = raw_graph["edge_index"]
    ea = raw_graph["edge_attr"]

    x_cust = nf["customer"].float()
    num_cust = x_cust.size(0)
    x_acc = nf["account"].float()
    owns = ei[("customer", "OWNS", "account")]
    acc2cust = torch.full((x_acc.size(0),), -1, dtype=torch.long)
    acc2cust[owns[1]] = owns[0]

    # Account stats
    acc_sum = torch.zeros((num_cust, x_acc.size(1)), dtype=torch.float32)
    acc_cnt = torch.zeros((num_cust, 1), dtype=torch.float32)
    acc_sum.index_add_(0, owns[0], x_acc[owns[1]])
    acc_cnt.index_add_(0, owns[0], torch.ones((owns.size(1), 1), dtype=torch.float32))
    acc_mean = acc_sum / acc_cnt.clamp(min=1.0)
    acc_max = torch.full((num_cust, x_acc.size(1)), -1e9, dtype=torch.float32)
    acc_max.scatter_reduce_(0, owns[0].unsqueeze(1).expand(-1, x_acc.size(1)), x_acc[owns[1]], reduce="amax", include_self=True)
    acc_max = torch.where(acc_max < -1e8, torch.zeros_like(acc_max), acc_max)

    # Device stats
    ad = ei[("account", "USES_DEVICE", "device")]
    c_ad = acc2cust[ad[0]]
    m_ad = c_ad >= 0
    feat_ad = torch.cat([nf["device"][ad[1][m_ad]].float(), ea[("account", "USES_DEVICE", "device")][m_ad].float()], dim=1)
    dev_sum = torch.zeros((num_cust, feat_ad.size(1)), dtype=torch.float32)
    dev_cnt = torch.zeros((num_cust, 1), dtype=torch.float32)
    dev_sum.index_add_(0, c_ad[m_ad], feat_ad)
    dev_cnt.index_add_(0, c_ad[m_ad], torch.ones((int(m_ad.sum().item()), 1), dtype=torch.float32))
    dev_mean = dev_sum / dev_cnt.clamp(min=1.0)

    # IP stats
    ai = ei[("account", "USES_IP", "ip")]
    c_ai = acc2cust[ai[0]]
    m_ai = c_ai >= 0
    feat_ai = torch.cat([nf["ip"][ai[1][m_ai]].float(), ea[("account", "USES_IP", "ip")][m_ai].float()], dim=1)
    ip_sum = torch.zeros((num_cust, feat_ai.size(1)), dtype=torch.float32)
    ip_cnt = torch.zeros((num_cust, 1), dtype=torch.float32)
    ip_sum.index_add_(0, c_ai[m_ai], feat_ai)
    ip_cnt.index_add_(0, c_ai[m_ai], torch.ones((int(m_ai.sum().item()), 1), dtype=torch.float32))
    ip_mean = ip_sum / ip_cnt.clamp(min=1.0)

    # TX + RX stats
    tx = ei[("account", "TRANSACTS", "account")]
    ea_tx = ea[("account", "TRANSACTS", "account")].float()
    c_tx_u, c_tx_v = acc2cust[tx[0]], acc2cust[tx[1]]
    m_tx, m_rx = c_tx_u >= 0, c_tx_v >= 0
    tx_sum = torch.zeros((num_cust, ea_tx.size(1)), dtype=torch.float32)
    tx_cnt = torch.zeros((num_cust, 1), dtype=torch.float32)
    tx_sum.index_add_(0, c_tx_u[m_tx], ea_tx[m_tx])
    tx_cnt.index_add_(0, c_tx_u[m_tx], torch.ones((int(m_tx.sum().item()), 1), dtype=torch.float32))
    tx_mean = tx_sum / tx_cnt.clamp(min=1.0)

    rx_sum = torch.zeros((num_cust, ea_tx.size(1)), dtype=torch.float32)
    rx_cnt = torch.zeros((num_cust, 1), dtype=torch.float32)
    rx_sum.index_add_(0, c_tx_v[m_rx], ea_tx[m_rx])
    rx_cnt.index_add_(0, c_tx_v[m_rx], torch.ones((int(m_rx.sum().item()), 1), dtype=torch.float32))
    rx_mean = rx_sum / rx_cnt.clamp(min=1.0)

    # Bank stats
    bw = ei[("customer", "BANKS_WITH", "bank")]
    x_bank = nf["bank"].float()
    bank_sum = torch.zeros((num_cust, x_bank.size(1)), dtype=torch.float32)
    bank_cnt = torch.zeros((num_cust, 1), dtype=torch.float32)
    bank_sum.index_add_(0, bw[0], x_bank[bw[1]])
    bank_cnt.index_add_(0, bw[0], torch.ones((bw.size(1), 1), dtype=torch.float32))
    bank_mean = bank_sum / bank_cnt.clamp(min=1.0)

    # Beneficiary / WIRES_TO stats
    wb = ei[("account", "WIRES_TO", "beneficiary")]
    c_wb = acc2cust[wb[0]]
    m_wb = c_wb >= 0
    feat_wb = torch.cat([nf["beneficiary"][wb[1][m_wb]].float(), ea[("account", "WIRES_TO", "beneficiary")][m_wb].float()], dim=1)
    wb_sum = torch.zeros((num_cust, feat_wb.size(1)), dtype=torch.float32)
    wb_cnt = torch.zeros((num_cust, 1), dtype=torch.float32)
    wb_sum.index_add_(0, c_wb[m_wb], feat_wb)
    wb_cnt.index_add_(0, c_wb[m_wb], torch.ones((int(m_wb.sum().item()), 1), dtype=torch.float32))
    wb_mean = wb_sum / wb_cnt.clamp(min=1.0)

    # --- A. Homo 44d scaler (CK/src/data_validator.py) ---
    x_homo_raw = torch.cat(
        [
            x_cust, acc_mean, acc_max, torch.log1p(acc_cnt),
            dev_mean, torch.log1p(dev_cnt), ip_mean, torch.log1p(ip_cnt),
            tx_mean, torch.log1p(tx_cnt),
        ],
        dim=1,
    )
    _, homo_mean, homo_std = _zscore_stats(x_homo_raw)

    # --- B. Hetero v4 Node & Edge scalers (Cell 1.7) ---
    x_hetero_agg = torch.cat(
        [
            x_cust, acc_mean, acc_max, torch.log1p(acc_cnt),
            dev_mean, torch.log1p(dev_cnt), ip_mean, torch.log1p(ip_cnt),
            tx_mean, torch.log1p(tx_cnt), rx_mean, torch.log1p(rx_cnt),
            bank_mean, wb_mean, torch.log1p(wb_cnt),
        ],
        dim=1,
    )
    _, cust_mean, cust_std = _zscore_stats(x_hetero_agg)
    node_scalers = {"customer": {"mean": cust_mean, "std": cust_std}}
    for nt in ("account", "device", "ip", "beneficiary", "bank"):
        _, nm, ns = _zscore_stats(nf[nt])
        node_scalers[nt] = {"mean": nm, "std": ns}

    ei_dev, ea_dev = _bipartite_to_customer_metapath(ad, acc2cust, num_cust, HETERO_V4_CONFIG["METAPATH_MAX_ENTITY_DEG"])
    ei_ip, ea_ip = _bipartite_to_customer_metapath(ai, acc2cust, num_cust, HETERO_V4_CONFIG["METAPATH_MAX_ENTITY_DEG"])
    ei_ben, ea_ben = _bipartite_to_customer_metapath(wb, acc2cust, num_cust, HETERO_V4_CONFIG["METAPATH_MAX_BENEF_DEG"])
    ei_txc, ea_txc = _build_transacts_customer_metapath(
        tx, ea_tx, acc2cust, num_cust, HETERO_V4_CONFIG["TX_CUST_Z_THRESH"], HETERO_V4_CONFIG["TX_CUST_TOPK_PER_NODE"]
    )
    m_full_tx = (c_tx_u >= 0) & (c_tx_v >= 0) & (c_tx_u != c_tx_v)
    eh_full_tx = torch.unique(c_tx_u[m_full_tx] * num_cust + c_tx_v[m_full_tx])
    full_tx_cust_ei = torch.stack([eh_full_tx // num_cust, eh_full_tx % num_cust], dim=0)

    edge_scalers = {}
    for et, ea_mp in [
        (("customer", "SHARED_DEVICE", "customer"), ea_dev),
        (("customer", "SHARED_IP", "customer"), ea_ip),
        (("customer", "SHARED_BENEF", "customer"), ea_ben),
        (("customer", "TRANSACTS_CUST", "customer"), ea_txc),
    ]:
        if ea_mp.size(0) > 0:
            _, em, es = _zscore_stats(ea_mp)
            edge_scalers[et] = {"mean": em, "std": es}
    if ("customer", "TRANSACTS_CUST", "customer") in edge_scalers:
        edge_scalers[("customer", "rev_TRANSACTS_CUST", "customer")] = edge_scalers[("customer", "TRANSACTS_CUST", "customer")]

    for et, ea_t in ea.items():
        if ea_t is not None and ea_t.size(0) > 0:
            _, em, es = _zscore_stats(ea_t)
            edge_scalers[et] = {"mean": em, "std": es}

    # --- C. Hetero v4 Pairwise 24d scaler CHỈ TỪ train_pairs (Cell 1.8) ---
    A_rel = _build_sym_csr(ei[("customer", "RELATED_TO", "customer")], num_cust)
    A_dev = _build_sym_csr(ei_dev, num_cust)
    A_ip = _build_sym_csr(ei_ip, num_cust)
    A_ben = _build_sym_csr(ei_ben, num_cust)
    A_tx_high = _build_sym_csr(ei_txc, num_cust)
    A_tx_all = _build_sym_csr(full_tx_cust_ei, num_cust)

    A_all = ((A_rel + A_dev + A_ip + A_ben + A_tx_all) > 0).astype(np.float32)
    A_all.setdiag(0); A_all.eliminate_zeros()
    A_w = (3.0 * A_rel + 3.0 * A_dev + 2.5 * A_ip + 2.0 * A_ben + 1.0 * A_tx_high + 0.5 * A_tx_all).astype(np.float32)
    A_w.setdiag(0); A_w.eliminate_zeros()

    deg_all = np.asarray(A_all.sum(axis=1)).ravel()
    inv_log_deg = np.zeros_like(deg_all, dtype=np.float32)
    inv_log_deg[deg_all > 0] = 1.0 / np.log1p(deg_all[deg_all > 0] + 0.1)
    A_aa = A_all.multiply(inv_log_deg).tocsr()

    deg_w = np.asarray(A_w.sum(axis=1)).ravel()
    inv_log_wdeg = np.zeros_like(deg_w, dtype=np.float32)
    inv_log_wdeg[deg_w > 0] = 1.0 / np.log1p(deg_w[deg_w > 0] + 0.1)
    A_w_aa = A_w.multiply(inv_log_wdeg).tocsr()

    inv_wdeg = np.zeros_like(deg_w, dtype=np.float32)
    inv_wdeg[deg_w > 0] = 1.0 / deg_w[deg_w > 0]
    P_w = sp.diags(inv_wdeg) @ A_w

    idx = train_pairs["edge_label_index"]
    u = np.array(idx[0].cpu().numpy(), dtype=np.int64, copy=True)
    v = np.array(idx[1].cpu().numpy(), dtype=np.int64, copy=True)
    uniq_nodes = np.unique(np.concatenate([u, v]))
    node_to_row = np.full(num_cust, -1, dtype=np.int64)
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
    cross_rel_tx = (
        np.asarray(A_rel[u].multiply(A_tx_all[v]).sum(axis=1)).ravel()
        + np.asarray(A_tx_all[u].multiply(A_rel[v]).sum(axis=1)).ravel()
    )
    ru, rv = node_to_row[u], node_to_row[v]
    ppr1_cos = np.asarray(R1_norm[ru].multiply(R1_norm[rv]).sum(axis=1)).ravel()
    ppr2_cos = np.asarray(R2_norm[ru].multiply(R2_norm[rv]).sum(axis=1)).ravel()
    ppr46_cos = np.asarray(R46_norm[ru].multiply(R46_norm[rv]).sum(axis=1)).ravel()

    weighted_cn_score = np.log1p(
        3.0 * dir_rel + 3.0 * dir_dev + 2.5 * dir_ip + 2.0 * dir_ben + 1.0 * dir_tx_h + 0.5 * dir_tx_all
        + 1.5 * (cn_rel + cn_dev + cn_ip + cn_ben) + 0.5 * cn_tx_h + 0.25 * cn_tx_all
    )
    max_channel_sim = np.maximum.reduce(
        [dir_rel, dir_dev, dir_ip, dir_ben, dir_tx_h, dir_tx_all, np.tanh(cn_rel), np.tanh(cn_dev), np.tanh(cn_ip), ppr1_cos, ppr2_cos]
    )
    is_struct_disconnected = (
        ((dir_rel + dir_dev + dir_ip + dir_ben + dir_tx_all + cn_all + cross_dev_ip + cross_rel_tx) == 0)
        & (ppr2_cos < 1e-4) & (ppr46_cos < 1e-4)
    ).astype(np.float32)

    tr_raw = np.stack(
        [
            dir_rel, dir_dev, dir_ip, dir_ben, dir_tx_h, dir_tx_all,
            cn_rel, cn_dev, cn_ip, cn_ben, cn_tx_h, cn_tx_all,
            aa_all, weighted_aa, jacc_all, deg_prod,
            np.log1p(cross_dev_ip), np.log1p(cross_rel_tx),
            ppr1_cos, ppr2_cos, ppr46_cos,
            weighted_cn_score, max_channel_sim, is_struct_disconnected,
        ],
        axis=1,
    ).astype(np.float32)
    tr_raw = np.nan_to_num(tr_raw, nan=0.0, posinf=0.0, neginf=0.0)
    tr_mean = tr_raw.mean(axis=0, keepdims=True)
    tr_std = np.clip(tr_raw.std(axis=0, keepdims=True), 1e-6, None)

    scalers = {
        "version": "1.0-v4",
        "homo": {"feat_mean": homo_mean, "feat_std": homo_std},
        "hetero_v4": {
            "node_scalers": node_scalers,
            "edge_scalers": edge_scalers,
            "pairwise_mean": tr_mean,
            "pairwise_std": tr_std,
        },
    }
    metapaths = {"ei_dev": ei_dev, "ei_ip": ei_ip, "ei_txc": ei_txc, "full_tx_cust_ei": full_tx_cust_ei}
    print(f"✅ Tính xong frozen_scalers.pt trong {time.time() - t0:.2f}s (Homo 44d + Hetero v4 66d/24d).")
    return scalers, metapaths


# ==============================================================================
# 3. TRÍCH XUẤT 5 DEMO CASES NHẸ (~1–3 MB/FILE) TỪ PROCESSED_GRAPH + TEST_PAIRS
# ==============================================================================
def extract_case_bundle(
    raw_graph: Dict[str, Any],
    seed_customers: List[int],
    eval_pairs_global: Dict[str, torch.Tensor],
    case_id: str,
    expand_1hop: bool = True,
    max_customers: int = 120,
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    nf = raw_graph["node_features"]
    ei = raw_graph["edge_index"]
    ea = raw_graph["edge_attr"]

    owns = ei[("customer", "OWNS", "account")]
    acc2cust = torch.full((nf["account"].size(0),), -1, dtype=torch.long)
    acc2cust[owns[1]] = owns[0]

    kept_cust: Set[int] = set(int(c) for c in seed_customers)
    if expand_1hop and len(kept_cust) < max_customers:
        # Mở rộng 1 hop qua RELATED_TO & TRANSACTS để giữ ngữ cảnh cấu trúc
        rel = ei[("customer", "RELATED_TO", "customer")]
        for u_i, v_i in zip(rel[0].tolist(), rel[1].tolist()):
            if u_i in kept_cust or v_i in kept_cust:
                kept_cust.add(u_i); kept_cust.add(v_i)
                if len(kept_cust) >= max_customers:
                    break
        if len(kept_cust) < max_customers:
            tx = ei[("account", "TRANSACTS", "account")]
            cu = acc2cust[tx[0]].tolist()
            cv = acc2cust[tx[1]].tolist()
            for u_i, v_i in zip(cu, cv):
                if u_i >= 0 and v_i >= 0 and (u_i in kept_cust or v_i in kept_cust):
                    kept_cust.add(u_i); kept_cust.add(v_i)
                    if len(kept_cust) >= max_customers:
                        break

    keep: Dict[str, Set[int]] = {
        "customer": kept_cust,
        "account": set(),
        "device": set(),
        "ip": set(),
        "beneficiary": set(),
        "bank": set(range(nf["bank"].size(0))),
    }
    for c_i, a_i in zip(owns[0].tolist(), owns[1].tolist()):
        if c_i in kept_cust:
            keep["account"].add(a_i)
    for et, dst_t in [
        (("account", "USES_DEVICE", "device"), "device"),
        (("account", "USES_IP", "ip"), "ip"),
        (("account", "WIRES_TO", "beneficiary"), "beneficiary"),
    ]:
        e_t = ei[et]
        for a_i, d_i in zip(e_t[0].tolist(), e_t[1].tolist()):
            if a_i in keep["account"]:
                keep[dst_t].add(d_i)

    sub_nf = {}
    old_to_new: Dict[str, Dict[int, int]] = {}
    node_id_maps: Dict[str, Dict[int, str]] = {}
    for nt in ("customer", "account", "device", "ip", "beneficiary", "bank"):
        kept_list = sorted(keep[nt]) or [0]
        idx_t = torch.tensor(kept_list, dtype=torch.long)
        sub_nf[nt] = nf[nt][idx_t].float().clone()
        old_to_new[nt] = {o: n for n, o in enumerate(kept_list)}
        pref = NODE_PREFIXES[nt]
        node_id_maps[nt] = {n: f"{pref}_{o:05d}" for n, o in enumerate(kept_list)}

    sub_ei, sub_ea = {}, {}
    total_edges = 0
    for et, e_t in ei.items():
        s_t, _r, d_t = et
        sm, dm = old_to_new[s_t], old_to_new[d_t]
        ns, nd, k_idx = [], [], []
        for idx_e, (uo, vo) in enumerate(zip(e_t[0].tolist(), e_t[1].tolist())):
            nu = sm.get(uo)
            if nu is None:
                continue
            nv = dm.get(vo)
            if nv is None:
                continue
            ns.append(nu); nd.append(nv); k_idx.append(idx_e)
        sub_ei[et] = torch.tensor([ns, nd], dtype=torch.long) if ns else torch.empty((2, 0), dtype=torch.long)
        if not et[1].startswith("rev_"):
            total_edges += len(ns)
        if et in ea and ea[et] is not None:
            sub_ea[et] = ea[et][torch.tensor(k_idx, dtype=torch.long)].float().clone() if k_idx else torch.empty((0, ea[et].size(1)), dtype=torch.float32)

    # Map eval_pairs sang chỉ số cục bộ của case
    cm = old_to_new["customer"]
    ep_u, ep_v, ep_y, ep_t = [], [], [], []
    g_eli = eval_pairs_global["edge_label_index"]
    g_y = eval_pairs_global["edge_label"]
    g_et = eval_pairs_global["edge_type"]
    for i in range(g_eli.size(1)):
        uo, vo = int(g_eli[0, i].item()), int(g_eli[1, i].item())
        if uo in cm and vo in cm:
            ep_u.append(cm[uo]); ep_v.append(cm[vo])
            ep_y.append(int(g_y[i].item())); ep_t.append(int(g_et[i].item()))

    eval_local = {
        "edge_label_index": torch.tensor([ep_u, ep_v], dtype=torch.long) if ep_u else torch.empty((2, 0), dtype=torch.long),
        "edge_label": torch.tensor(ep_y, dtype=torch.long),
        "edge_type": torch.tensor(ep_t, dtype=torch.long),
    }

    sample_ids = [f"CUST_{int(c):05d}" for c in seed_customers[:8]]
    bundle = {
        "hetero_data": {"node_features": sub_nf, "edge_index": sub_ei, "edge_attr": sub_ea},
        "customer_id_map": node_id_maps["customer"],
        "node_id_maps": node_id_maps,
        "sample_customer_ids": sample_ids,
        "eval_pairs": eval_local,
        "case_meta": {"case_id": case_id},
    }
    manifest_entry = {
        "case_id": case_id,
        "graph_file_path": f"data/demo_cases/{case_id}.pt",
        "num_customers": int(sub_nf["customer"].size(0)),
        "total_nodes": int(sum(t.size(0) for t in sub_nf.values())),
        "total_edges": int(total_edges),
        "sample_customer_ids": sample_ids,
    }
    return bundle, manifest_entry


def build_all_demo_cases(
    raw_graph: Dict[str, Any], test_pairs: Dict[str, torch.Tensor], metapaths: Dict[str, torch.Tensor], out_dir: Path
) -> List[Dict[str, Any]]:
    out_dir.mkdir(parents=True, exist_ok=True)
    eli = test_pairs["edge_label_index"]
    y = test_pairs["edge_label"]
    et = test_pairs["edge_type"]
    num_cust = raw_graph["node_features"]["customer"].size(0)

    def _pair_set(edge_t: torch.Tensor) -> Set[Tuple[int, int]]:
        if edge_t.size(1) == 0:
            return set()
        return {(int(min(a, b)), int(max(a, b))) for a, b in zip(edge_t[0].tolist(), edge_t[1].tolist())}

    dev_pairs = _pair_set(metapaths["ei_dev"])
    ip_pairs = _pair_set(metapaths["ei_ip"])
    tx_pairs = _pair_set(metapaths["full_tx_cust_ei"])

    # Case 1: Smurfing Ring — cụm các cặp dương có giao dịch trực tiếp/bắc cầu
    pos_idx = torch.where(y == 1)[0].tolist()
    c1_seeds: List[int] = []
    for i in pos_idx:
        u, v = int(eli[0, i].item()), int(eli[1, i].item())
        if (min(u, v), max(u, v)) in tx_pairs:
            c1_seeds.extend([u, v])
            if len(set(c1_seeds)) >= 18:
                break
    if len(set(c1_seeds)) < 10:
        for i in pos_idx[:12]:
            c1_seeds.extend([int(eli[0, i].item()), int(eli[1, i].item())])
    c1_seeds = list(dict.fromkeys(c1_seeds))

    # Case 2: Shared Device & IP Mule — cặp dương có SHARED_DEVICE hoặc SHARED_IP
    c2_seeds: List[int] = []
    for i in pos_idx:
        u, v = int(eli[0, i].item()), int(eli[1, i].item())
        pk = (min(u, v), max(u, v))
        if pk in dev_pairs or pk in ip_pairs:
            c2_seeds.extend([u, v])
            if len(set(c2_seeds)) >= 20:
                break
    if len(set(c2_seeds)) < 10:
        for i in pos_idx[12:24]:
            c2_seeds.extend([int(eli[0, i].item()), int(eli[1, i].item())])
    c2_seeds = list(dict.fromkeys(c2_seeds))

    # Case 3: Hard Negative Type 1 Trap (AML-AML khác vụ án) + vài cặp dương đối chứng
    t1_idx = torch.where(et == 1)[0].tolist()
    c3_seeds: List[int] = []
    for i in t1_idx[:10]:
        c3_seeds.extend([int(eli[0, i].item()), int(eli[1, i].item())])
    for i in pos_idx[:3]:
        c3_seeds.extend([int(eli[0, i].item()), int(eli[1, i].item())])
    c3_seeds = list(dict.fromkeys(c3_seeds))

    # Case 4: Hard Negative Type 4 Trap (Shared IP/Device khách hàng sạch)
    t4_idx = torch.where(et == 4)[0].tolist()
    c4_seeds: List[int] = []
    for i in t4_idx[:10]:
        c4_seeds.extend([int(eli[0, i].item()), int(eli[1, i].item())])
    c4_seeds = list(dict.fromkeys(c4_seeds))

    # Case 5: Subgraph bao trọn toàn bộ khách hàng xuất hiện trong test_pairs (3,420 cặp)
    all_test_custs = sorted(set(eli[0].tolist()) | set(eli[1].tolist()))

    manifest_cases = []
    specs = [
        ("case_01_smurfing_ring", c1_seeds, True, 90),
        ("case_02_shared_device_mule", c2_seeds, True, 100),
        ("case_03_hard_neg_type1_trap", c3_seeds, True, 80),
        ("case_04_hard_neg_type4_trap", c4_seeds, True, 80),
        ("case_05_test_benchmark_3420", all_test_custs, False, len(all_test_custs)),
    ]
    for cid, seeds, expand, max_c in specs:
        bundle, entry = extract_case_bundle(raw_graph, seeds, test_pairs, cid, expand_1hop=expand, max_customers=max_c)
        dest = out_dir / f"{cid}.pt"
        torch.save(bundle, dest)
        size_mb = dest.stat().st_size / (1024 * 1024)
        print(
            f"   📦 {cid}.pt | cust={entry['num_customers']:,} | nodes={entry['total_nodes']:,} "
            f"| edges={entry['total_edges']:,} | eval_pairs={bundle['eval_pairs']['edge_label'].numel():,} | {size_mb:.2f} MB"
        )
        manifest_cases.append(entry)

    manifest_path = out_dir / "demo_cases_manifest.json"
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump({"cases": manifest_cases}, f, indent=2, ensure_ascii=False)
    print(f"✅ Đã lưu {manifest_path}")
    return manifest_cases


def main():
    data_dir = find_data_dir()
    print(f"📂 Dữ liệu nguồn: {data_dir}")

    is_kaggle = Path("/kaggle/working").exists()
    out_root = Path("/kaggle/working/m1_artifacts") if is_kaggle else Path(__file__).resolve().parents[1]
    models_out = out_root / "models"
    demos_out = out_root / "data" / "demo_cases"
    models_out.mkdir(parents=True, exist_ok=True)
    demos_out.mkdir(parents=True, exist_ok=True)

    raw_graph = load_raw_as_dict(data_dir / "processed_graph.pt")
    train_pairs = torch.load(data_dir / "train_pairs.pt", map_location="cpu", weights_only=False)
    test_pairs = torch.load(data_dir / "test_pairs.pt", map_location="cpu", weights_only=False)

    scalers, metapaths = compute_frozen_scalers(raw_graph, train_pairs)
    scaler_path = models_out / "frozen_scalers.pt"
    torch.save(scalers, scaler_path)
    print(f"💾 Đã xuất: {scaler_path} ({scaler_path.stat().st_size / 1024:.1f} KB)")

    build_all_demo_cases(raw_graph, test_pairs, metapaths, demos_out)

    if is_kaggle:
        zip_path = Path("/kaggle/working/m1_kaggle_artifacts.zip")
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.write(scaler_path, arcname="models/frozen_scalers.pt")
            for f_item in sorted(demos_out.glob("*")):
                zf.write(f_item, arcname=f"data/demo_cases/{f_item.name}")
        print(f"\n🎉 ĐÃ ĐÓNG GÓI SẴN: {zip_path} ({zip_path.stat().st_size / (1024 * 1024):.2f} MB)")
        print("👉 Tải file này về và giải nén thẳng vào thư mục 'ausaml-collusion-dss/'!")


if __name__ == "__main__":
    main()
