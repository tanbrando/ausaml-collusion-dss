"""Gate Check 1 Validator cho file .pt vụ án mới (FR-01.3)."""

from pathlib import Path
from typing import Any, Dict, Tuple
import torch

from ..config import EXPECTED_BASE_RELATIONS, EXPECTED_NODE_DIMS
from ..schemas import GateCheckReport


class DataValidator:
    """Kiểm định tính toàn vẹn schema 6 loại đỉnh, 14 quan hệ, 0 NaN/Inf và tự bổ sung rev_*."""

    @staticmethod
    def validate_pt_file(pt_path: Path) -> Tuple[Dict[str, Any], GateCheckReport]:
        """
        Đọc file .pt và trả về (metadata_summary, GateCheckReport).
        Hỗ trợ cả dict {"node_features", "edge_index", "edge_attr"} hoặc PyG HeteroData.
        """
        errors = []
        warnings = []
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

        node_feats = {}
        edge_index_dict = {}

        if isinstance(raw, dict) and "node_features" in raw:
            node_feats = raw["node_features"]
            edge_index_dict = raw.get("edge_index", {})
        elif hasattr(raw, "node_types") and hasattr(raw, "edge_types"):
            node_feats = {nt: raw[nt].x for nt in raw.node_types if "x" in raw[nt]}
            edge_index_dict = {et: raw[et].edge_index for et in raw.edge_types if "edge_index" in raw[et]}
        else:
            errors.append("Định dạng .pt không khớp AusAML HeteroData hoặc dict {'node_features', 'edge_index'}.")
            return {"num_customers": 0, "total_nodes": 0, "total_edges": 0, "sample_customer_ids": []}, GateCheckReport(
                passed=False, node_dims_valid=False, edge_bounds_valid=False, errors=errors
            )

        node_counts = {}
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
            rev_et = (dst, f"rev_{rel}", src)
            if rev_et not in edge_index_dict:
                reverse_edges_added += 1

        if reverse_edges_added > 0:
            warnings.append(f"Đã phát hiện {reverse_edges_added} quan hệ thiếu cạnh ngược rev_* (sẽ tự động sinh khi nạp).")

        passed = node_dims_valid and edge_bounds_valid and nan_count == 0 and inf_count == 0 and len(errors) == 0
        num_customers = node_counts.get("customer", 0)
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
