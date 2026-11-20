"""
K-Hop Subgraph Extractor & Candidate Pair Generator (FR-02).
Khoanh vùng lân cận dị thể K=1..3 hops quanh target_customer_ids, giữ nguyên mapping CUST_xxxxx,
và sinh cặp ứng viên chưa có cạnh RELATED_TO trong bán kính <= 4 hops.
"""

from collections import deque
from typing import Any, Dict, List, Optional, Set, Tuple
import numpy as np
import scipy.sparse as sp
import torch
from torch_geometric.data import HeteroData


def _build_customer_behavioral_adj(hetero_g: HeteroData) -> Tuple[sp.csr_matrix, Set[Tuple[int, int]]]:
    """Dựng ma trận kề hành vi giữa các customer (từ OWNS+DEVICE/IP/TRANSACTS/WIRES + RELATED_TO) và tập cạnh RELATED_TO."""
    n_cust = int(hetero_g["customer"].num_nodes)
    n_acc = int(hetero_g["account"].num_nodes)
    owns = hetero_g[("customer", "OWNS", "account")].edge_index
    acc2cust = torch.full((n_acc,), -1, dtype=torch.long)
    if owns.size(1) > 0:
        acc2cust[owns[1]] = owns[0]

    rows: List[np.ndarray] = []
    cols: List[np.ndarray] = []

    def _add_edges(u_arr: np.ndarray, v_arr: np.ndarray):
        if len(u_arr) > 0:
            m = u_arr != v_arr
            if np.any(m):
                rows.append(u_arr[m])
                cols.append(v_arr[m])

    # RELATED_TO (cả 2 chiều)
    rel_set: Set[Tuple[int, int]] = set()
    rel_ei = hetero_g[("customer", "RELATED_TO", "customer")].edge_index
    if rel_ei.size(1) > 0:
        ru = rel_ei[0].cpu().numpy()
        rv = rel_ei[1].cpu().numpy()
        _add_edges(ru, rv)
        _add_edges(rv, ru)
        for a, b in zip(ru, rv):
            if a != b:
                rel_set.add((int(min(a, b)), int(max(a, b))))

    # Direct account TRANSACTS -> customer-customer
    tx_ei = hetero_g[("account", "TRANSACTS", "account")].edge_index
    if tx_ei.size(1) > 0:
        cu = acc2cust[tx_ei[0]].cpu().numpy()
        cv = acc2cust[tx_ei[1]].cpu().numpy()
        m = (cu >= 0) & (cv >= 0) & (cu != cv)
        if np.any(m):
            _add_edges(cu[m], cv[m])
            _add_edges(cv[m], cu[m])

    # Shared entities (device, ip, beneficiary) with degree cap
    for et, max_deg in [
        (("account", "USES_DEVICE", "device"), 50),
        (("account", "USES_IP", "ip"), 50),
        (("account", "WIRES_TO", "beneficiary"), 60),
    ]:
        ei = hetero_g[et].edge_index
        if ei.size(1) == 0:
            continue
        c = acc2cust[ei[0]].cpu().numpy()
        e = ei[1].cpu().numpy()
        m = c >= 0
        if not np.any(m):
            continue
        c, e = c[m], e[m]
        ent_to_custs: Dict[int, Set[int]] = {}
        for ci, ei_id in zip(c, e):
            ent_to_custs.setdefault(int(ei_id), set()).add(int(ci))
        u_l, v_l = [], []
        for grp in ent_to_custs.values():
            if 2 <= len(grp) <= max_deg:
                g_list = sorted(grp)
                for i in range(len(g_list)):
                    for j in range(i + 1, len(g_list)):
                        u_l.append(g_list[i])
                        v_l.append(g_list[j])
                        u_l.append(g_list[j])
                        v_l.append(g_list[i])
        if u_l:
            _add_edges(np.array(u_l, dtype=np.int64), np.array(v_l, dtype=np.int64))

    if rows:
        r_all = np.concatenate(rows)
        c_all = np.concatenate(cols)
        mat = sp.csr_matrix((np.ones(len(r_all), dtype=np.float32), (r_all, c_all)), shape=(n_cust, n_cust))
        mat = ((mat + mat.T) > 0).astype(np.float32)
        mat.setdiag(0)
        mat.eliminate_zeros()
    else:
        mat = sp.csr_matrix((n_cust, n_cust), dtype=np.float32)

    return mat, rel_set


def _slice_hetero_subgraph(
    hetero_g: HeteroData,
    node_id_maps: Dict[str, Dict[int, str]],
    keep_nodes: Dict[str, List[int]],
) -> Tuple[HeteroData, Dict[str, Dict[int, str]], Dict[int, int]]:
    """Tạo HeteroData con từ tập chỉ số đỉnh giữ lại trên 6 loại nút và trả về bảng ánh xạ ID mới."""
    sub_g = HeteroData()
    old_to_new: Dict[str, Dict[int, int]] = {}
    new_id_maps: Dict[str, Dict[int, str]] = {}

    for nt in hetero_g.node_types:
        kept = sorted(set(keep_nodes.get(nt, [])))
        if len(kept) == 0 and hetero_g[nt].num_nodes > 0:
            # Giữ tối thiểu 1 nút gốc để tensor không rỗng khi chiếu Linear
            kept = [0]
        idx_t = torch.tensor(kept, dtype=torch.long)
        sub_g[nt].x = hetero_g[nt].x[idx_t].clone()
        old_to_new[nt] = {old_i: new_i for new_i, old_i in enumerate(kept)}
        orig_map = node_id_maps.get(nt, {})
        new_id_maps[nt] = {new_i: orig_map.get(old_i, f"{nt.upper()}_{old_i:05d}") for new_i, old_i in enumerate(kept)}

    for et in hetero_g.edge_types:
        src_t, rel, dst_t = et
        ei = hetero_g[et].edge_index
        ea = hetero_g[et].edge_attr if "edge_attr" in hetero_g[et] and hetero_g[et].edge_attr is not None else None
        if ei.size(1) == 0:
            sub_g[et].edge_index = torch.empty((2, 0), dtype=torch.long)
            if ea is not None:
                sub_g[et].edge_attr = torch.empty((0, ea.size(1)), dtype=ea.dtype)
            continue

        src_map = old_to_new[src_t]
        dst_map = old_to_new[dst_t]
        s_np = ei[0].cpu().numpy()
        d_np = ei[1].cpu().numpy()
        new_s, new_d, kept_e_idx = [], [], []
        for e_i, (u_o, v_o) in enumerate(zip(s_np, d_np)):
            nu = src_map.get(int(u_o))
            if nu is None:
                continue
            nv = dst_map.get(int(v_o))
            if nv is None:
                continue
            new_s.append(nu)
            new_d.append(nv)
            kept_e_idx.append(e_i)

        if new_s:
            sub_g[et].edge_index = torch.tensor([new_s, new_d], dtype=torch.long)
            if ea is not None:
                sub_g[et].edge_attr = ea[torch.tensor(kept_e_idx, dtype=torch.long)].clone()
        else:
            sub_g[et].edge_index = torch.empty((2, 0), dtype=torch.long)
            if ea is not None:
                sub_g[et].edge_attr = torch.empty((0, ea.size(1)), dtype=ea.dtype)

    return sub_g, new_id_maps, old_to_new["customer"]


class SubgraphSampler:
    """Khoanh vùng K-hop subgraph (K=1..3) và sinh cặp ứng viên (<= 4 hops, chưa có RELATED_TO)."""

    def extract_khop_and_candidates(
        self,
        hetero_g: HeteroData,
        node_id_maps: Dict[str, Dict[int, str]],
        target_customer_ids: List[str],
        hop_depth: int = 2,
        max_candidates: int = 1200,
        max_customers_in_subgraph: int = 500,
    ) -> Tuple[HeteroData, torch.Tensor, Dict[str, Any]]:
        """
        Trả về (sub_hetero_g, candidate_pairs [2, N_cand], mapping_bundle).
        Nếu đồ thị vụ án đã gọn (<= max_customers_in_subgraph), giữ nguyên toàn bộ đồ thị vụ án
        để không làm mất ngữ cảnh đường đi bắc cầu.
        """
        cust_id_map = node_id_maps["customer"]
        id_to_idx = {cid: idx for idx, cid in cust_id_map.items()}
        n_cust = int(hetero_g["customer"].num_nodes)

        target_indices: List[int] = [id_to_idx[cid] for cid in target_customer_ids if cid in id_to_idx]
        if not target_indices:
            target_indices = list(range(min(25, n_cust)))

        beh_adj, rel_set = _build_customer_behavioral_adj(hetero_g)

        # Nếu đồ thị lớn (VD: 50,000 khách hàng), cắt K-hop subgraph xung quanh target_indices
        if n_cust > max_customers_in_subgraph:
            visited_cust: Set[int] = set(target_indices)
            frontier: Set[int] = set(target_indices)
            for _ in range(max(1, min(hop_depth, 3))):
                next_f: Set[int] = set()
                for c_idx in frontier:
                    nbrs = beh_adj.indices[beh_adj.indptr[c_idx] : beh_adj.indptr[c_idx + 1]]
                    for nb in nbrs:
                        nb_i = int(nb)
                        if nb_i not in visited_cust:
                            visited_cust.add(nb_i)
                            next_f.add(nb_i)
                            if len(visited_cust) >= max_customers_in_subgraph:
                                break
                    if len(visited_cust) >= max_customers_in_subgraph:
                        break
                frontier = next_f
                if not frontier or len(visited_cust) >= max_customers_in_subgraph:
                    break

            keep_nodes: Dict[str, Set[int]] = {
                "customer": visited_cust,
                "account": set(),
                "device": set(),
                "ip": set(),
                "beneficiary": set(),
                "bank": set(),
            }
            owns = hetero_g[("customer", "OWNS", "account")].edge_index
            for c_i, a_i in zip(owns[0].tolist(), owns[1].tolist()):
                if c_i in visited_cust:
                    keep_nodes["account"].add(a_i)
            bw = hetero_g[("customer", "BANKS_WITH", "bank")].edge_index
            for c_i, b_i in zip(bw[0].tolist(), bw[1].tolist()):
                if c_i in visited_cust:
                    keep_nodes["bank"].add(b_i)
            for et, dst_t in [
                (("account", "USES_DEVICE", "device"), "device"),
                (("account", "USES_IP", "ip"), "ip"),
                (("account", "WIRES_TO", "beneficiary"), "beneficiary"),
            ]:
                ei = hetero_g[et].edge_index
                for a_i, e_i in zip(ei[0].tolist(), ei[1].tolist()):
                    if a_i in keep_nodes["account"]:
                        keep_nodes[dst_t].add(e_i)

            sub_g, sub_id_maps, old_to_new_cust = _slice_hetero_subgraph(
                hetero_g, node_id_maps, {k: list(v) for k, v in keep_nodes.items()}
            )
            sub_targets = [old_to_new_cust[i] for i in target_indices if i in old_to_new_cust]
            sub_beh_adj, sub_rel_set = _build_customer_behavioral_adj(sub_g)
        else:
            sub_g = hetero_g
            sub_id_maps = node_id_maps
            sub_targets = target_indices
            sub_beh_adj = beh_adj
            sub_rel_set = rel_set

        # Sinh cặp ứng viên chưa có RELATED_TO (ưu tiên cặp giữa targets + lân cận <= 4 hops)
        cand_set: Set[Tuple[int, int]] = set()
        # 1) Luôn bao gồm tất cả cặp giữa các target_customer_ids (kể cả rời rạc để kiểm chứng bẫy Type 1)
        if len(sub_targets) <= 50:
            for i in range(len(sub_targets)):
                for j in range(i + 1, len(sub_targets)):
                    a, b = min(sub_targets[i], sub_targets[j]), max(sub_targets[i], sub_targets[j])
                    if (a, b) not in sub_rel_set:
                        cand_set.add((a, b))

        # 2) Mở rộng BFS <= 4 hops từ mỗi target trên đồ thị hành vi
        max_bfs_hops = min(4, max(2, hop_depth + 1))
        for src in sub_targets:
            dist = {src: 0}
            q = deque([src])
            while q:
                cur = q.popleft()
                d_cur = dist[cur]
                if d_cur >= max_bfs_hops:
                    continue
                nbrs = sub_beh_adj.indices[sub_beh_adj.indptr[cur] : sub_beh_adj.indptr[cur + 1]]
                for nb in nbrs:
                    nb_i = int(nb)
                    if nb_i not in dist:
                        dist[nb_i] = d_cur + 1
                        q.append(nb_i)
                        a, b = min(src, nb_i), max(src, nb_i)
                        if a != b and (a, b) not in sub_rel_set:
                            cand_set.add((a, b))
                            if len(cand_set) >= max_candidates:
                                break
                if len(cand_set) >= max_candidates:
                    break
            if len(cand_set) >= max_candidates:
                break

        # Fallback: nếu đồ thị quá thưa chưa có cặp ứng viên, lấy các cặp giữa các nút đầu tiên
        n_sub_cust = int(sub_g["customer"].num_nodes)
        if not cand_set and n_sub_cust >= 2:
            lim = min(n_sub_cust, 25)
            for i in range(lim):
                for j in range(i + 1, lim):
                    if (i, j) not in sub_rel_set:
                        cand_set.add((i, j))
                        if len(cand_set) >= min(max_candidates, 100):
                            break
                if len(cand_set) >= min(max_candidates, 100):
                    break

        sorted_cands = sorted(cand_set)[:max_candidates]
        if sorted_cands:
            cand_tensor = torch.tensor(sorted_cands, dtype=torch.long).t().contiguous()
        else:
            cand_tensor = torch.empty((2, 0), dtype=torch.long)

        mapping_info = {
            "node_id_maps": sub_id_maps,
            "customer_id_map": sub_id_maps["customer"],
            "id_to_cust_idx": {cid: idx for idx, cid in sub_id_maps["customer"].items()},
            "target_local_indices": sub_targets,
            "target_customer_ids": [sub_id_maps["customer"][i] for i in sub_targets],
        }
        return sub_g, cand_tensor, mapping_info
