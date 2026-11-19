# 📜 HỢP ĐỒNG DỮ LIỆU & REST API (API AND DATA CONTRACT)
**Dự án:** `ausaml-collusion-dss` (AML Accomplice Link Prediction DSS)  
**Phiên bản Contract:** `v1.0` (**Single Source of Truth**: `backend/app/schemas.py` ↔ `frontend/src/types/contract.ts`)  
**Nguyên tắc vàng:** **KHÔNG** tự ý đổi tên trường JSON, kiểu dữ liệu, hoặc tên Enum nếu chưa cập nhật đồng thời `schemas.py`, `contract.ts` và tài liệu này.

---

## 1. CHUẨN HÓA ENUMS & HẰNG SỐ DÙNG CHUNG

| Enum / Hằng số | Giá trị hợp lệ | Ý nghĩa & Quy tắc hiển thị |
| :--- | :--- | :--- |
| **`NodeType`** | `"customer"`, `"account"`, `"device"`, `"ip"`, `"beneficiary"`, `"bank"` | 6 loại đỉnh của đồ thị dị thể AusAML |
| **`EdgeCategory`** | `"OBSERVED_EDGE"`, `"PREDICTED_LINK"`, `"CONFIRMED_LINK"` | `OBSERVED_EDGE`: nét liền; `PREDICTED_LINK`: nét đứt AI gợi ý; `CONFIRMED_LINK`: nét liền đậm đã xác nhận |
| **`RiskLevel`** | `"HIGH"`, `"MEDIUM"`, `"LOW"` | Tính động theo $\tau_{\text{val}}$: `HIGH >= max(0.75, tau + 0.20)`, `MEDIUM >= tau`, `LOW < tau` |
| **`FeedbackAction`** | `"CONFIRM"`, `"DISMISS"` | Hành động Human-in-the-Loop của điều tra viên |
| **`FeedbackStatus`** | `"PENDING"`, `"CONFIRMED"`, `"DISMISSED"` | Trạng thái của cặp `(source, target)` trong Database |
| **`InferenceMode`** | `"subgraph"`, `"full_graph"` | `subgraph` (K-hop điều tra nhanh), `full_graph` (chạy Regression trên toàn tập Test) |

### Quy tắc Chiều & Schema Đồ thị Đầu vào (`Gate Check 1`)
- `customer`: `10` chiều gốc (`float32`, 0 NaN/Inf)
- `account`: `6` chiều (`float32`)
- `device`: `6` chiều (`float32`)
- `ip`: `4` chiều (`float32`)
- `beneficiary`: `8` chiều (`float32`)
- `bank`: `4` chiều (`float32`)
- **7 quan hệ gốc + 7 quan hệ `rev_*`** (tổng 14 quan hệ có hướng).

---

## 2. ĐẶC TẢ CHI TIẾT 8 REST API ENDPOINTS (`/api/v1`)

### Endpoint 1: `GET /api/v1/models`
Lấy danh sách mô hình từ `models/model_registry.json`.
- **Response (`200 OK`) — `ModelListResponse`:**
```json
{
  "default_model_id": "hybrid_v3_best",
  "models": [
    {
      "model_id": "hybrid_v3_best",
      "display_name": "Hybrid GATv2 + GINE (v3 — Khuyên dùng)",
      "model_family": "HETERO_HYBRID",
      "architecture_summary": "Parallel Gated GATv2 + GINE...",
      "params": 389388,
      "default_threshold": 0.5000,
      "supports_attention": true,
      "is_recommended": true,
      "metrics_overall": {
        "roc_auc": "0.8311 ± 0.0007",
        "ap": "0.8447 ± 0.0014",
        "f1": "0.7403 ± 0.0044",
        "hits_at_10": "0.6828 ± 0.0003",
        "roc_auc_mean": 0.8311,
        "ap_mean": 0.8447,
        "f1_mean": 0.7403,
        "hits_at_10_mean": 0.6828
      }
    }
  ]
}
```

---

### Endpoint 2: `GET /api/v1/cases`
Lấy danh sách các hồ sơ vụ án (gồm 5 Built-in Demo Cases được seed sẵn trong DB + các vụ án user upload).
- **Response (`200 OK`) — `CaseListResponse`:**
```json
{
  "cases": [
    {
      "case_id": "case_01_smurfing_ring",
      "title": "Vụ án #1: Mạng lưới chia nhỏ giao dịch (Smurfing / Structuring)",
      "description": "Cụm 18 khách hàng nghi vấn chia nhỏ giao dịch qua 4 tài khoản trung gian...",
      "source_type": "BUILTIN_DEMO",
      "num_customers": 18,
      "total_nodes": 146,
      "total_edges": 412,
      "validation_passed": true,
      "sample_customer_ids": ["CUST_10492", "CUST_48210", "CUST_00912"],
      "created_at": "2026-11-19T12:00:00Z"
    }
  ]
}
```

---

### Endpoint 3: `POST /api/v1/cases/upload`
Tải lên file đồ thị vụ án mới (`.pt` `HeteroData` hoặc dict Tensor) qua `multipart/form-data`.
- **Form Data:** `title: str`, `description: Optional[str]`, `file: UploadFile` (`.pt`)
- **Response (`200 OK`) — `CaseUploadResponse`:**
```json
{
  "case": { "...CaseSummary..." },
  "gate_check": {
    "passed": true,
    "node_dims_valid": true,
    "edge_bounds_valid": true,
    "nan_count": 0,
    "inf_count": 0,
    "reverse_edges_added": 0,
    "warnings": [],
    "errors": []
  }
}
```
*(Nếu `validation_passed == false`, trả về HTTP `422 Unprocessable Content` hoặc `gate_check.passed = false` kèm danh sách `errors` cụ thể).*

---

### Endpoint 4: `POST /api/v1/cases/{case_id}/predict`
Chạy suy luận GNN trên subgraph (hoặc `full_graph`) và trả về bảng xếp hạng + `CytoscapeGraphPayload`.
- **Request Body — `PredictRequest`:**
```json
{
  "model_id": "hybrid_v3_best",
  "target_customer_ids": ["CUST_10492", "CUST_48210", "CUST_00912"],
  "inference_mode": "subgraph",
  "hop_depth": 2,
  "probability_threshold": null,
  "top_k": 20,
  "include_node_types": ["customer", "account", "device", "ip", "beneficiary", "bank"]
}
```
*(Quy tắc: Nếu `probability_threshold` là `null`, Backend tự động gán `applied_threshold = model.default_threshold`. Nếu `target_customer_ids` rỗng `[]`, Backend tự động chọn danh sách khách hàng trọng tâm của vụ án).*

- **Response Body (`200 OK`) — `PredictResponse`:**
```json
{
  "run_id": "RUN_20261119_001",
  "case_id": "case_01_smurfing_ring",
  "model_used": {
    "model_id": "hybrid_v3_best",
    "display_name": "Hybrid GATv2 + GINE (v3 — Khuyên dùng)",
    "model_family": "HETERO_HYBRID",
    "default_threshold": 0.5000,
    "applied_threshold": 0.5000
  },
  "execution_time_ms": 142.8,
  "subgraph_stats": {
    "total_nodes": 146,
    "total_edges": 412,
    "candidate_pairs_evaluated": 153,
    "high_risk_pairs": 4,
    "medium_risk_pairs": 5
  },
  "predictions": [
    {
      "pair_id": "CUST_10492__CUST_48210",
      "source": "CUST_10492",
      "target": "CUST_48210",
      "score": 0.9421,
      "risk_level": "HIGH",
      "feedback_status": "PENDING",
      "model_comparison": {
        "ck_gcn_seed42": 0.7810,
        "ck_gat_seed42": 0.8125,
        "hybrid_v3_best": 0.9421
      },
      "pairwise_summary": {
        "shared_devices": 2,
        "shared_ips": 1,
        "direct_tx_count": 3,
        "weighted_aa": 0.84,
        "ppr_multi_hop_cos": 0.31,
        "node_risk_sim": 0.88
      },
      "evidence_paths": [
        {
          "path_id": "PATH_1",
          "path_type": "SHARED_DEVICE",
          "nodes": ["CUST_10492", "ACC_0881", "DEV_0992", "ACC_0304", "CUST_48210"],
          "relations": ["OWNS", "USES_DEVICE", "rev_USES_DEVICE", "rev_OWNS"],
          "attention_score": 0.89,
          "description": "Hai khách hàng dùng chung thiết bị DEV_0992 qua 2 tài khoản trung gian (tín hiệu GATv2 = 0.89)."
        }
      ],
      "explanation_vi": "Cảnh báo CAO (94.2%): Hai khách hàng chưa khai báo quan hệ KYC nhưng dùng chung 2 thiết bị và có 3 giao dịch bắc cầu."
    }
  ],
  "graph_payload": {
    "nodes": [
      {
        "data": {
          "id": "CUST_10492",
          "label": "CUST_10492",
          "node_type": "customer",
          "risk_score": 0.91,
          "is_target": true
        }
      }
    ],
    "edges": [
      {
        "data": {
          "id": "obs_1",
          "source": "CUST_10492",
          "target": "ACC_0881",
          "relation": "OWNS",
          "edge_category": "OBSERVED_EDGE",
          "score": null,
          "risk_level": null,
          "pair_id": null,
          "feedback_status": null
        }
      },
      {
        "data": {
          "id": "pred_CUST_10492__CUST_48210",
          "source": "CUST_10492",
          "target": "CUST_48210",
          "relation": "PREDICTED_ACCOMPLICE",
          "edge_category": "PREDICTED_LINK",
          "score": 0.9421,
          "risk_level": "HIGH",
          "pair_id": "CUST_10492__CUST_48210",
          "feedback_status": "PENDING"
        }
      }
    ]
  }
}
```

---

### Endpoint 5: `POST /api/v1/cases/{case_id}/explain-pair`
Lấy hồ sơ giải thích chuyên sâu cho đúng 1 cặp `(source, target)` khi điều tra viên click trên đồ thị hoặc bảng xếp hạng.
- **Request Body — `ExplainPairRequest`:** `{ "source": "CUST_10492", "target": "CUST_48210", "model_id": "hybrid_v3_best" }`
- **Response (`200 OK`) — `ExplainPairResponse`:**
  Chứa `pair_id`, `source`, `target`, `score`, `risk_level`, `feedback_status`, `model_comparison`, `pairwise_summary`, `radar_features` (mảng 6 cặp `{ axis, value_normalized }` chuẩn hóa `[0, 1]` cho biểu đồ Radar Recharts), `evidence_paths` (Top-3) và `explanation_vi`.

---

### Endpoint 6: `POST /api/v1/cases/{case_id}/feedback` & `GET /api/v1/cases/{case_id}/audit`
- **`POST /api/v1/cases/{case_id}/feedback` (`FeedbackRequest`):**
  ```json
  {
    "pair_id": "CUST_10492__CUST_48210",
    "source": "CUST_10492",
    "target": "CUST_48210",
    "model_id": "hybrid_v3_best",
    "predicted_score": 0.9421,
    "action": "CONFIRM",
    "note": "Xác nhận chung thiết bị DEV_0992 và chuyển khoản vòng tròn.",
    "reviewer_name": "Investigator_Viet"
  }
  ```
- **Response (`200 OK`):** Trả về `FeedbackRecord` vừa lưu vào bảng `investigator_feedbacks` kèm `updated_at`.
- **`GET /api/v1/audit` (hoặc `/api/v1/cases/{case_id}/audit`):** Trả về danh sách `feedbacks` và `audit_logs` để hiển thị trên Màn hình 4 (`/audit`).

---

### Endpoint 7: `GET /api/v1/cases/{case_id}/export?format=csv|json`
Xuất báo cáo hồ sơ điều tra (CSV downloadable attachment hoặc JSON tổng hợp).

---

### Endpoint 8: `GET /api/v1/benchmarks/summary`
Trả về toàn bộ bảng đối chiếu `CK GCN`, `CK GAT`, `Hybrid v1–v4`, `HeteroSAGE`, `HeteroGAT-Only` trên `Overall` và `Scenario 1..5`, kèm danh sách **Hard Negative Showcase (`Type 1` & `Type 4`)** phục vụ Màn hình 3 (`/benchmark`).

---

## 3. QUY ƯỚC HIGHLIGHT TRÊN ĐỒ THỊ (`Cytoscape.js` Contract)

1. **Màu sắc & Hình dạng 6 loại đỉnh:**
   - `customer`: Circle (`#2563eb` Xanh dương; nếu có cạnh `HIGH` gắn với nó hoặc `is_target=true` viền Đỏ `#dc2626`)
   - `account`: Round-rectangle (`#10b981` Xanh ngọc)
   - `device`: Diamond (`#7c3aed` Tím)
   - `ip`: Hexagon (`#f97316` Cam)
   - `beneficiary`: Triangle (`#eab308` Vàng)
   - `bank`: Star (`#64748b` Xám đá)
2. **Trạng thái Cạnh:**
   - `OBSERVED_EDGE`: `line-style: solid`, màu xám nhạt (`#94a3b8`), độ dày `1.5px`.
   - `PREDICTED_LINK`: `line-style: dashed`, màu `#dc2626` (nếu `HIGH`) hoặc `#f59e0b` (nếu `MEDIUM`), độ dày `2.5px`, label hiển thị `${(score * 100).toFixed(1)}%`.
   - `CONFIRMED_LINK` (sau khi `CONFIRM`): `line-style: solid`, màu `#b91c1c`, độ dày `3.5px`, label `✓ ${(score * 100).toFixed(1)}%`.
   - Nếu `feedback_status === "DISMISSED"`: ẩn cạnh khỏi canvas mặc định (trừ khi bật nút *"Hiện lại cặp đã bác bỏ"*).
3. **Highlight Bridge Path:** Khi user chọn 1 `EvidencePath` trong `EvidenceDrawer`, UI tìm tất cả node IDs trong `path.nodes` và các cạnh nối liền kề giữa các node liên tiếp `[nodes[i], nodes[i+1]]` để gán class `.highlighted` (tăng độ sáng & mờ các phần tử còn lại `.dimmed`).
