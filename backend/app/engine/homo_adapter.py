"""
Homogeneous Graph Adapter (60d customer features + 4 channels) cho CK GCN / GAT.
Kế thừa chính xác logic từ CK/src/data_validator.py (`build_homogeneous_customer_graph`)
và hỗ trợ frozen_scalers.pt (feat_mean, feat_std) từ tập Train cho suy luận quy nạp.
"""

from typing import Any, Dict, Optional
import torch


def _bipartite_to_customer_edges(edge_idx: torch.Tensor, acc2cust: torch.Tensor) -> torch.Tensor:
    """Chiếu liên kết 2 phía (account -> entity) thành cạnh đồng nhất (customer <-> customer)."""
    if edge_idx.size(1) == 0:
        return torch.empty((2, 0), dtype=torch.long)

    cust = acc2cust[edge_idx[0]]
    valid = cust >= 0
    if not valid.any():
        return torch.empty((2, 0), dtype=torch.long)

    cust = cust[valid]
    ent = edge_idx[1][valid]
    order = torch.argsort(ent)
    cust, ent = cust[order], ent[order]
    _, counts = torch.unique_consecutive(ent, return_counts=True)
    splits = torch.split(cust, counts.tolist())

    pairs = []
    for grp in splits:
        if grp.numel() >= 2:
            grp_u = grp.unique()
            if grp_u.numel() >= 2:
                u = grp_u.repeat_interleave(grp_u.numel())
                v = grp_u.repeat(grp_u.numel())
                mask = u != v
                pairs.append(torch.stack([u[mask], v[mask]], dim=0))
    if not pairs:
        return torch.empty((2, 0), dtype=torch.long)
    return torch.cat(pairs, dim=1).unique(dim=1)


def _compute_structural_pe(edge_index: torch.Tensor, num_nodes: int, dim: int = 16) -> torch.Tensor:
    """Smooth Structural Neighborhood Encoding (16d, 2-hop, seed=0 — khớp 100% CK/src/data_validator.py)."""
    gen = torch.Generator()
    gen.manual_seed(0)
    r = torch.randn((num_nodes, dim), generator=gen, dtype=torch.float32)
    r = r / r.norm(dim=-1, keepdim=True).clamp(min=1e-8)

    loop_nodes = torch.arange(num_nodes, dtype=torch.long)
    ei = torch.cat([edge_index, torch.stack([loop_nodes, loop_nodes], dim=0)], dim=1)
    row, col = ei[0], ei[1]

    deg = torch.zeros(num_nodes, dtype=torch.float32)
    deg.index_add_(0, col, torch.ones(col.shape[0], dtype=torch.float32))
    deg_inv_sqrt = deg.pow(-0.5)
    deg_inv_sqrt.masked_fill_(deg_inv_sqrt == float("inf"), 0.0)
    norm = deg_inv_sqrt[row] * deg_inv_sqrt[col]

    for _ in range(2):
        out = torch.zeros_like(r)
        out.index_add_(0, col, r[row] * norm.unsqueeze(-1))
        r = out / out.norm(dim=-1, keepdim=True).clamp(min=1e-8)
    return r


class HomoGraphAdapter:
    """Chuyển HeteroData (6 loại đỉnh, 14 quan hệ) sang đồ thị đồng nhất 60d cho CK GCN & CK GAT."""

    def __init__(self, frozen_scalers: Optional[Dict[str, Any]] = None):
        if frozen_scalers and "homo" in frozen_scalers:
            self.homo_scalers = frozen_scalers["homo"]
        else:
            self.homo_scalers = frozen_scalers or {}

    @staticmethod
    def compute_raw_44d_features(raw_hetero_data: Any) -> Dict[str, Any]:
        """Trích xuất vector 44d thô (trước Z-score) và acc2cust — dùng chung cho Adapter & Export Scaler."""
        g = raw_hetero_data
        x_cust = g["customer"].x.float()
        num_customers = x_cust.size(0)

        x_acc = g["account"].x.float()
        num_accounts = x_acc.size(0)
        owns = g[("customer", "OWNS", "account")].edge_index
        acc2cust = torch.full((num_accounts,), -1, dtype=torch.long)
        if owns.size(1) > 0:
            acc2cust[owns[1]] = owns[0]

        # 1. Account stats (mean, max, log1p(cnt)) -> 13d
        acc_sum = torch.zeros((num_customers, x_acc.size(1)), dtype=torch.float32)
        acc_cnt = torch.zeros((num_customers, 1), dtype=torch.float32)
        acc_max = torch.full((num_customers, x_acc.size(1)), -1e9, dtype=torch.float32)
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

        # 2. Device + USES_DEVICE edge_attr -> 9d
        ad = g[("account", "USES_DEVICE", "device")].edge_index
        dev_dim = g["device"].x.size(1) + 2
        dev_sum = torch.zeros((num_customers, dev_dim), dtype=torch.float32)
        dev_cnt = torch.zeros((num_customers, 1), dtype=torch.float32)
        if ad.size(1) > 0:
            c_ad = acc2cust[ad[0]]
            valid_ad = c_ad >= 0
            if valid_ad.any():
                ea_ad = g[("account", "USES_DEVICE", "device")].edge_attr[valid_ad].float()
                feat_ad = torch.cat([g["device"].x[ad[1][valid_ad]].float(), ea_ad], dim=1)
                dev_sum.index_add_(0, c_ad[valid_ad], feat_ad)
                dev_cnt.index_add_(0, c_ad[valid_ad], torch.ones((int(valid_ad.sum().item()), 1), dtype=torch.float32))
        dev_mean = dev_sum / dev_cnt.clamp(min=1.0)

        # 3. IP + USES_IP edge_attr -> 7d
        ai = g[("account", "USES_IP", "ip")].edge_index
        ip_dim = g["ip"].x.size(1) + 2
        ip_sum = torch.zeros((num_customers, ip_dim), dtype=torch.float32)
        ip_cnt = torch.zeros((num_customers, 1), dtype=torch.float32)
        if ai.size(1) > 0:
            c_ai = acc2cust[ai[0]]
            valid_ai = c_ai >= 0
            if valid_ai.any():
                ea_ai = g[("account", "USES_IP", "ip")].edge_attr[valid_ai].float()
                feat_ai = torch.cat([g["ip"].x[ai[1][valid_ai]].float(), ea_ai], dim=1)
                ip_sum.index_add_(0, c_ai[valid_ai], feat_ai)
                ip_cnt.index_add_(0, c_ai[valid_ai], torch.ones((int(valid_ai.sum().item()), 1), dtype=torch.float32))
        ip_mean = ip_sum / ip_cnt.clamp(min=1.0)

        # 4. TRANSACTS -> 5d
        tx = g[("account", "TRANSACTS", "account")].edge_index
        ea_tx = g[("account", "TRANSACTS", "account")].edge_attr.float()
        tx_dim = ea_tx.size(1) if ea_tx.ndim == 2 else 4
        tx_sum = torch.zeros((num_customers, tx_dim), dtype=torch.float32)
        tx_cnt = torch.zeros((num_customers, 1), dtype=torch.float32)
        c_tx_u = torch.empty((0,), dtype=torch.long)
        c_tx_v = torch.empty((0,), dtype=torch.long)
        if tx.size(1) > 0:
            c_tx_u = acc2cust[tx[0]]
            c_tx_v = acc2cust[tx[1]]
            valid_tx = c_tx_u >= 0
            if valid_tx.any():
                tx_sum.index_add_(0, c_tx_u[valid_tx], ea_tx[valid_tx])
                tx_cnt.index_add_(0, c_tx_u[valid_tx], torch.ones((int(valid_tx.sum().item()), 1), dtype=torch.float32))
        tx_mean = tx_sum / tx_cnt.clamp(min=1.0)

        x_raw = torch.cat(
            [
                x_cust,
                acc_mean,
                acc_max,
                torch.log1p(acc_cnt),
                dev_mean,
                torch.log1p(dev_cnt),
                ip_mean,
                torch.log1p(ip_cnt),
                tx_mean,
                torch.log1p(tx_cnt),
            ],
            dim=1,
        )
        x_raw = torch.nan_to_num(x_raw, nan=0.0, posinf=0.0, neginf=0.0)
        return {
            "x_raw": x_raw,
            "acc2cust": acc2cust,
            "ad": ad,
            "ai": ai,
            "c_tx_u": c_tx_u,
            "c_tx_v": c_tx_v,
            "ea_tx": ea_tx,
        }

    def transform(
        self,
        raw_hetero_data: Any,
        include_covert_channels: bool = True,
        tx_amount_z_threshold: float = 1.2,
        use_frozen_scaler: Optional[bool] = None,
        scaler_mode: str = "auto",
    ) -> Dict[str, Any]:
        """
        Chuyển HeteroData sang đồ thị đồng nhất {'x': [N, 60], 'edge_index': [2, E], 'edge_channel': [E]}.
        scaler_mode:
          - 'auto'  : Dùng frozen_scalers cho full-graph (>= 40,000) hoặc đồ thị quá nhỏ (< 16);
                      dùng local subgraph z-score + clamp(-8, 8) cho induced subgraph (16..39,999)
                      để chống Subgraph Covariate Shift làm sập BatchNorm của CK GCN.
          - 'frozen': Bắt buộc dùng frozen_scalers (nếu có).
          - 'local' : Bắt buộc dùng local z-score.
        """
        g = raw_hetero_data
        num_customers = g["customer"].x.size(0)
        raw_pack = self.compute_raw_44d_features(g)
        x_raw = raw_pack["x_raw"]
        acc2cust = raw_pack["acc2cust"]
        ad = raw_pack["ad"]
        ai = raw_pack["ai"]
        c_tx_u = raw_pack["c_tx_u"]
        c_tx_v = raw_pack["c_tx_v"]
        ea_tx = raw_pack["ea_tx"]

        has_frozen = "feat_mean" in self.homo_scalers and "feat_std" in self.homo_scalers
        if use_frozen_scaler is True:
            apply_frozen = has_frozen
        elif use_frozen_scaler is False:
            apply_frozen = False
        elif scaler_mode == "frozen":
            apply_frozen = has_frozen
        elif scaler_mode == "local":
            apply_frozen = False
        else:  # "auto"
            apply_frozen = has_frozen and (num_customers >= 40000 or num_customers < 16)

        if apply_frozen:
            feat_mean = self.homo_scalers["feat_mean"].float()
            feat_std = self.homo_scalers["feat_std"].float().clamp(min=1e-6)
            x_norm = (x_raw - feat_mean) / feat_std
        else:
            feat_mean = x_raw.mean(dim=0, keepdim=True)
            feat_std = x_raw.std(dim=0, keepdim=True).clamp(min=1e-6)
            if num_customers <= 1:
                feat_std = torch.ones_like(feat_mean)
            x_norm = ((x_raw - feat_mean) / feat_std).clamp(-8.0, 8.0)

        e_rel_fwd = g[("customer", "RELATED_TO", "customer")].edge_index
        e_rel_rev = g[("customer", "rev_RELATED_TO", "customer")].edge_index
        e_rel = torch.cat([e_rel_fwd, e_rel_rev], dim=1)
        if e_rel.size(1) > 0:
            e_rel = e_rel.unique(dim=1)

        if include_covert_channels:
            e_dev = _bipartite_to_customer_edges(ad, acc2cust)
            e_ip = _bipartite_to_customer_edges(ai, acc2cust)

            if c_tx_u.numel() > 0:
                mask_tx = (
                    (c_tx_u >= 0)
                    & (c_tx_v >= 0)
                    & (c_tx_u != c_tx_v)
                    & ((ea_tx[:, 0] > tx_amount_z_threshold) | (ea_tx[:, 1] > 0.0))
                )
                u_tx, v_tx = c_tx_u[mask_tx], c_tx_v[mask_tx]
                if u_tx.numel() > 0:
                    e_tx = torch.stack([torch.cat([u_tx, v_tx]), torch.cat([v_tx, u_tx])], dim=0).unique(dim=1)
                else:
                    e_tx = torch.empty((2, 0), dtype=torch.long)
            else:
                e_tx = torch.empty((2, 0), dtype=torch.long)

            edge_list = [e_rel, e_dev, e_ip, e_tx]
            chan_list = [
                torch.full((e_rel.size(1),), 0, dtype=torch.long),
                torch.full((e_dev.size(1),), 1, dtype=torch.long),
                torch.full((e_ip.size(1),), 2, dtype=torch.long),
                torch.full((e_tx.size(1),), 3, dtype=torch.long),
            ]
            all_edges = torch.cat(edge_list, dim=1)
            all_chans = torch.cat(chan_list, dim=0)

            if all_edges.size(1) > 0:
                priority = torch.tensor([1, 0, 2, 3], dtype=torch.long)[all_chans]
                order = torch.argsort(priority)
                all_edges = all_edges[:, order]
                all_chans = all_chans[order]

                edge_hash = all_edges[0] * num_customers + all_edges[1]
                sorted_hash, sort_idx = torch.sort(edge_hash, stable=True)
                first_mask = torch.ones_like(sorted_hash, dtype=torch.bool)
                first_mask[1:] = sorted_hash[1:] != sorted_hash[:-1]
                keep_idx = sort_idx[first_mask]

                edge_index = all_edges[:, keep_idx]
                edge_channel = all_chans[keep_idx]
            else:
                edge_index = torch.empty((2, 0), dtype=torch.long)
                edge_channel = torch.empty((0,), dtype=torch.long)

            channel_breakdown = {
                "RELATED_TO": int(e_rel.size(1)),
                "SHARED_DEVICE": int(e_dev.size(1)),
                "SHARED_IP": int(e_ip.size(1)),
                "TRANSACTS_HIGH": int(e_tx.size(1)),
            }
        else:
            edge_index = e_rel
            edge_channel = torch.zeros(e_rel.size(1), dtype=torch.long)
            channel_breakdown = {
                "RELATED_TO": int(e_rel.size(1)),
                "SHARED_DEVICE": 0,
                "SHARED_IP": 0,
                "TRANSACTS_HIGH": 0,
            }

        struct_pe = _compute_structural_pe(edge_index, num_customers, dim=16)
        x = torch.cat([x_norm, struct_pe], dim=1)

        return {
            "x": x,
            "edge_index": edge_index,
            "edge_channel": edge_channel,
            "rel_edge_index": e_rel,
            "channel_breakdown": channel_breakdown,
            "num_nodes": num_customers,
            "num_features": int(x.size(1)),
        }
