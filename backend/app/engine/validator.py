"""Gate Check 1 Validator & Normalizer cho file .pt vụ án (FR-01.3)."""

from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import torch

from ..config import EXPECTED_BASE_RELATIONS, EXPECTED_NODE_DIMS
from ..schemas import GateCheckReport

NODE_PREFIXES = {
    "customer": "CUST",
    "account": "ACC",
    "device": "DEV",
    "ip": "IP",
    "beneficiary": "BEN",
    "bank": "BANK",
}


def _extract_raw_components(raw: Any) -> Tuple[Optional[Dict[str, torch.Tensor]], Optional[Dict], Optional[Dict], Dict[str, Any]]:
    """Hỗ trợ 3 định dạng .pt: Demo Bundle dict, raw AusAML dict, hoặc PyG HeteroData."""
    extra: Dict[str, Any] = {}
    target = raw

    if isinstance(raw, dict) and "hetero_data" in raw:
        extra = {k: v for k, v in raw.items() if k != "hetero_data"}
        target = raw["hetero_data"]

    if isinstance(target, dict) and "node_features" in target:
        node_feats = target["node_features"]
        edge_index_dict = target.get("edge_index", {})
        edge_attr_dict = target.get("edge_attr", {})
        return node_feats, edge_index_dict, edge_attr_dict, extra

    if hasattr(target, "node_types") and hasattr(target, "edge_types"):
        node_feats = {nt: target[nt].x for nt in target.node_types if "x" in target[nt]}
        edge_index_dict = {et: target[et].edge_index for et in target.edge_types if "edge_index" in target[et]}
        edge_attr_dict = {
            et: target[et].edge_attr
            for et in target.edge_types
            if "edge_attr" in target[et] and target[et].edge_attr is not None
        }
        return node_feats, edge_index_dict, edge_attr_dict, extra

    return None, None, None, extra


class DataValidator:
    """Kiểm định tính toàn vẹn schema 6 loại đỉnh, 14 quan hệ, 0 NaN/Inf và tự bổ sung rev_*."""

    @staticmethod
    def validate_pt_file(pt_path: Path) -> Tuple[Dict[str, Any], GateCheckReport]:
        """
        Đọc file .pt và trả về (metadata_summary, GateCheckReport).
        Hỗ trợ dict {"node_features", "edge_index", "edge_attr"}, Demo Bundle, hoặc PyG HeteroData.
        """
        errors: List[str] = []
        warnings: List[str] = []
        nan_count = 0
        inf_count = 0
        reverse_edges_added = 0
        node_dims_valid = True
        edge_bounds_valid = True

        try:
            raw = torch.load(pt_path, weights_only=False, map_location="cpu")
        except Exception as exc:
            report = GateCheckReport(
                passed=False,
                node_dims_valid=False,
                edge_bounds_valid=False,
                errors=[f"Không thể đọc file .pt: {exc}"],
            )
            return {"num_customers": 0, "total_nodes": 0, "total_edges": 0, "sample_customer_ids": []}, report

        node_feats, edge_index_dict, edge_attr_dict, extra = _extract_raw_components(raw)
        if node_feats is None or edge_index_dict is None:
            errors.append("Định dạng .pt không khớp AusAML HeteroData hoặc dict {'node_features', 'edge_index'}.")
            return {"num_customers": 0, "total_nodes": 0, "total_edges": 0, "sample_customer_ids": []}, GateCheckReport(
                passed=False, node_dims_valid=False, edge_bounds_valid=False, errors=errors
            )

        node_counts: Dict[str, int] = {}
        for nt, exp_dim in EXPECTED_NODE_DIMS.items():
            if nt not in node_feats:
                node_dims_valid = False
                errors.append(f"Thiếu node_type '{nt}'.")
                continue
            x = node_feats[nt]
            if not isinstance(x, torch.Tensor) or x.ndim != 2 or x.size(1) != exp_dim:
                node_dims_valid = False
                actual = tuple(x.shape) if isinstance(x, torch.Tensor) else type(x).__name__
                errors.append(f"Sai số chiều '{nt}': kỳ vọng (*, {exp_dim}), thực tế {actual}.")
                continue
            n_nan = int(torch.isnan(x).sum().item())
            n_inf = int(torch.isinf(x).sum().item())
            nan_count += n_nan
            inf_count += n_inf
            if n_nan > 0 or n_inf > 0:
                errors.append(f"Phát hiện {n_nan} NaN / {n_inf} Inf trong đỉnh '{nt}'.")
            node_counts[nt] = int(x.size(0))

        total_edges = 0
        for src, rel, dst in EXPECTED_BASE_RELATIONS:
            et = (src, rel, dst)
            if et not in edge_index_dict:
                warnings.append(f"Thiếu quan hệ gốc {et}.")
                continue
            ei = edge_index_dict[et]
            if not isinstance(ei, torch.Tensor) or ei.ndim != 2 or ei.size(0) != 2:
                edge_bounds_valid = False
                errors.append(f"edge_index của {et} không hợp lệ.")
                continue
            total_edges += int(ei.size(1))
            if ei.size(1) > 0 and src in node_counts and dst in node_counts:
                if int(ei[0].min().item()) < 0 or int(ei[0].max().item()) >= node_counts[src]:
                    edge_bounds_valid = False
                    errors.append(f"Chỉ số src của {et} vượt quá số nút '{src}' ({node_counts[src]}).")
                if int(ei[1].min().item()) < 0 or int(ei[1].max().item()) >= node_counts[dst]:
                    edge_bounds_valid = False
                    errors.append(f"Chỉ số dst của {et} vượt quá số nút '{dst}' ({node_counts[dst]}).")
            if edge_attr_dict and et in edge_attr_dict and edge_attr_dict[et] is not None:
                ea = edge_attr_dict[et]
                n_nan = int(torch.isnan(ea).sum().item())
                n_inf = int(torch.isinf(ea).sum().item())
                nan_count += n_nan
                inf_count += n_inf
                if n_nan > 0 or n_inf > 0:
                    errors.append(f"Phát hiện {n_nan} NaN / {n_inf} Inf trong edge_attr của {et}.")
            rev_et = (dst, f"rev_{rel}", src)
            if rev_et not in edge_index_dict:
                reverse_edges_added += 1

        if reverse_edges_added > 0:
            warnings.append(f"Đã phát hiện {reverse_edges_added} quan hệ thiếu cạnh ngược rev_* (sẽ tự động sinh khi nạp).")

        passed = node_dims_valid and edge_bounds_valid and nan_count == 0 and inf_count == 0 and len(errors) == 0
        num_customers = node_counts.get("customer", 0)
        if "sample_customer_ids" in extra and extra["sample_customer_ids"]:
            sample_ids = list(extra["sample_customer_ids"])
        elif "customer_id_map" in extra and extra["customer_id_map"]:
            cmap = extra["customer_id_map"]
            sample_ids = [cmap[i] for i in sorted(cmap.keys())[:5]]
        else:
            sample_ids = [f"CUST_{i:05d}" for i in range(min(5, num_customers))]

        meta = {
            "num_customers": num_customers,
            "total_nodes": sum(node_counts.values()),
            "total_edges": total_edges,
            "sample_customer_ids": sample_ids,
        }
        report = GateCheckReport(
            passed=passed,
            node_dims_valid=node_dims_valid,
            edge_bounds_valid=edge_bounds_valid,
            nan_count=nan_count,
            inf_count=inf_count,
            reverse_edges_added=reverse_edges_added,
            warnings=warnings,
            errors=errors,
        )
        return meta, report

    @staticmethod
    def load_and_normalize_hetero(pt_path: Path) -> Dict[str, Any]:
        """
        Nạp file .pt, chạy kiểm định Gate Check 1, chuẩn hóa sang PyG HeteroData đủ 14 quan hệ
        (tự sinh cạnh ngược rev_* nếu thiếu) và dựng bảng ánh xạ định danh nút.
        """
        from torch_geometric.data import HeteroData

        raw = torch.load(pt_path, weights_only=False, map_location="cpu")
        node_feats, edge_index_dict, edge_attr_dict, extra = _extract_raw_components(raw)
        if node_feats is None or edge_index_dict is None:
            raise ValueError(f"File '{pt_path}' không đúng định dạng AusAML HeteroData hoặc dict.")

        g = HeteroData()
        node_id_maps: Dict[str, Dict[int, str]] = {}
        for nt, exp_dim in EXPECTED_NODE_DIMS.items():
            if nt not in node_feats:
                raise ValueError(f"Thiếu node_type '{nt}' trong '{pt_path}'.")
            x = node_feats[nt].float()
            if x.ndim != 2 or x.size(1) != exp_dim:
                raise ValueError(f"Sai số chiều '{nt}': kỳ vọng (*, {exp_dim}), thực tế {tuple(x.shape)}.")
            if torch.isnan(x).any() or torch.isinf(x).any():
                raise ValueError(f"Phát hiện NaN/Inf trong node_type '{nt}'.")
            g[nt].x = x
            prefix = NODE_PREFIXES[nt]
            n_cnt = int(x.size(0))
            if nt == "customer" and "customer_id_map" in extra and extra["customer_id_map"]:
                node_id_maps[nt] = {int(k): str(v) for k, v in extra["customer_id_map"].items()}
            elif "node_id_maps" in extra and nt in extra["node_id_maps"]:
                node_id_maps[nt] = {int(k): str(v) for k, v in extra["node_id_maps"][nt].items()}
            else:
                node_id_maps[nt] = {i: f"{prefix}_{i:05d}" for i in range(n_cnt)}

        expected_ea_dims = {
            ("customer", "BANKS_WITH", "bank"): 1,
            ("account", "USES_DEVICE", "device"): 2,
            ("account", "USES_IP", "ip"): 2,
            ("account", "TRANSACTS", "account"): 4,
            ("account", "WIRES_TO", "beneficiary"): 4,
            ("customer", "RELATED_TO", "customer"): 7,
        }

        edge_attr_dict = edge_attr_dict or {}
        for src, rel, dst in EXPECTED_BASE_RELATIONS:
            et = (src, rel, dst)
            rev_et = (dst, f"rev_{rel}", src)

            if et in edge_index_dict and edge_index_dict[et] is not None:
                ei = edge_index_dict[et].long()
            else:
                ei = torch.empty((2, 0), dtype=torch.long)

            g[et].edge_index = ei
            ea = edge_attr_dict.get(et)
            if et in expected_ea_dims:
                if ea is not None:
                    ea = ea.float()
                else:
                    ea = torch.zeros((ei.size(1), expected_ea_dims[et]), dtype=torch.float32)
                g[et].edge_attr = ea

            if rev_et in edge_index_dict and edge_index_dict[rev_et] is not None:
                rev_ei = edge_index_dict[rev_et].long()
            else:
                rev_ei = ei.flip(0).contiguous()
            g[rev_et].edge_index = rev_ei

            if et in expected_ea_dims:
                rev_ea = edge_attr_dict.get(rev_et)
                if rev_ea is not None:
                    rev_ea = rev_ea.float()
                elif rev_ei.size(1) == ei.size(1) and ea is not None:
                    rev_ea = ea.clone()
                else:
                    rev_ea = torch.zeros((rev_ei.size(1), expected_ea_dims[et]), dtype=torch.float32)
                g[rev_et].edge_attr = rev_ea

        customer_id_map = node_id_maps["customer"]
        id_to_cust_idx = {cid: idx for idx, cid in customer_id_map.items()}
        sample_ids = list(extra.get("sample_customer_ids") or [customer_id_map[i] for i in range(min(8, len(customer_id_map)))])

        return {
            "hetero_data": g,
            "customer_id_map": customer_id_map,
            "id_to_cust_idx": id_to_cust_idx,
            "node_id_maps": node_id_maps,
            "sample_customer_ids": sample_ids,
            "eval_pairs": extra.get("eval_pairs"),
            "case_meta": extra.get("case_meta", {}),
        }
