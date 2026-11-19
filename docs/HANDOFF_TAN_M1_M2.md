# ⚙️ KẾ HOẠCH TRIỂN KHAI BACKEND & AI ENGINE — CHO TẤN (Module 1 & Module 2)

Tài liệu này hướng dẫn từng bước để **Tấn** hoàn thiện **Module 1 (AI Engine & Demo Case Builder)** và **Module 2 (FastAPI Backend & Database)** trên repo `ausaml-collusion-dss`, sao cho không làm gãy bất kỳ API Contract nào mà **Việt** đang dùng ở Frontend.

---

## 1. TRẠNG THÁI SKELETON HIỆN TẠI (ĐÃ DỰNG SẴN)

- **Module 2 (FastAPI + SQLite DB) đã chạy được sẵn ở chế độ Contract Mock (`USE_MOCK_ENGINE=true`)**:
  - `backend/app/schemas.py`: Khóa cứng toàn bộ Pydantic v2 models.
  - `backend/app/database.py` & `models_db.py`: Đã hoàn chỉnh 4 bảng ORM (`CaseRecord`, `PredictionRun`, `InvestigatorFeedback`, `AuditLog`) + hàm `seed_initial_data()` tự nạp 5 Demo Cases khi khởi động.
  - `backend/app/routers/*`: Đã nối sẵn DB cho `GET /cases`, `POST /feedback`, `GET /audit`, `GET /export` (thao tác Confirm/Dismiss của Việt lưu thật vào `aml_dss.db` ngay từ ngày đầu!).

---

## 2. CHECKLIST TRIỂN KHAI CHO TẤN (THEO THỨ TỰ ƯU TIÊN)

### Giai đoạn A — Chuẩn hóa Checkpoints & Trích xuất 5 Demo Cases (`Module 1.1`)
- [ ] **Bước 1:** Gom checkpoints và lưu vào thư mục `models/`:
  - Copy từ `CK/outputs/checkpoints/`: `gcn_seed42.pt`, `gat_seed42.pt`.
  - Tải từ Kaggle Run (`v3` và `v4`): `best_hybrid_gat_gin_v3_seed42.pt`, `best_hybrid_gat_gin_v4_seed42.pt`, `ablation_a_v4_seed42.pt`, `ablation_b_v4_seed42.pt`.
  - Xuất kèm `models/frozen_scalers.pt` (`feat_mean`, `feat_std` của tập Train từ `Homo` và `Hetero`).
- [ ] **Bước 2:** Viết script `scripts/build_demo_cases.py` trích xuất 5 file `.pt` nhỏ gọn (`~1–3 MB/file`) từ `processed_graph.pt` + `test_pairs.pt` vào `data/demo_cases/`:
  1. `case_01_smurfing_ring.pt`: Chọn 1 kịch bản Smurfing/Structuring trong `test_pairs.pt` + 2-hop subgraph xung quanh.
  2. `case_02_shared_device_mule.pt`: Chọn cụm các cặp dương có `SHARED_DEVICE / SHARED_IP` trong `test_pairs.pt`.
  3. `case_03_hard_neg_type1_trap.pt`: Tập hợp các cặp `Type 1 (AML-AML khác kịch bản)` mà `CK GCN` đoán nhầm (`score >= 0.3227`) nhưng `Hybrid` lọc đúng (`score < 0.5000`).
  4. `case_04_hard_neg_type4_trap.pt`: Tập hợp các cặp `Type 4 (Shared IP/Device)` để trình diễn giảm FPR xuống `0–2%`.
  5. `case_05_test_benchmark_3420.pt`: Lưu gói `test_pairs.pt` (`3,420` cặp) dùng cho **Full-Graph Regression Test**.

### Giai đoạn B — Hoàn thiện `backend/app/engine/` (`Module 1.2`)
- [ ] **Bước 3 (`validator.py`):** Chuyển logic kiểm tra 6 loại đỉnh, 14 quan hệ, Bounds Check, 0 NaN/Inf và tự động sinh `rev_*` từ `Cell 1.2–1.3` vào `DataValidator.validate_and_normalize()`.
- [ ] **Bước 4 (`homo_adapter.py` & `predictor_homo.py`):**
  - Kế thừa `build_homogeneous_customer_graph` từ `CK/src/data_validator.py` (dùng `frozen_scalers.pt` khi chạy trên case upload mới).
  - Kế thừa `GCNEncoder`, `GATEncoder`, `LinkDecoder`, `GNNLinkPredictor` từ `CK/src/models.py` vào `HomoLinkPredictor(BaseLinkPredictor)`. Hỗ trợ trích xuất `encode_with_attention()` cho `GAT`.
- [ ] **Bước 5 (`hetero_adapter.py` & `predictor_hetero.py`):**
  - Chuyển `augment_hetero_graph_and_features` + `compute_all_pairwise_features` (bản `v3` & `v4` trong `AML_Hybrid_GAT_GIN.ipynb`) vào `HeteroGraphAdapter` (dùng `tr_mean, tr_std` đóng băng trong `frozen_scalers.pt`).
  - Chuyển `HybridGATGIN`, `HeteroGATBlock`, `HeteroGINBlock`, `LinkPredictorHead` vào `HeteroLinkPredictor(BaseLinkPredictor)`.
- [ ] **Bước 6 (`subgraph_sampler.py` & `explainer.py`):**
  - Viết `extract_khop_subgraph(graph_data, target_cust_ids, hop_depth=2)` đảm bảo giữ đúng mapping chỉ số gốc `CUST_xxxxx`.
  - Viết `BridgePathExtractor.extract_top3_paths(hetero_g, u, v)` bằng BFS/Dijkstra có trọng số kênh (`SHARED_DEVICE`, `SHARED_IP`, `TRANSACTS`, `WIRES_TO`) và sinh câu `explanation_vi` + 6 giá trị `radar_features`.

### Giai đoạn C — Bật Real Engine & Chạy 3 Bài Kiểm Thử Nghiệm Thu (`Module 2`)
- [ ] **Bước 7:** Trong `.env`, đổi `USE_MOCK_ENGINE=false`. `ModelRegistry` (`registry.py`) sẽ tự động chuyển từ Mock sang PyTorch Engine thật mà **không thay đổi bất kỳ định dạng JSON nào** trả về cho Việt.
- [ ] **Bước 8:** Hoàn thiện và chạy `pytest backend/tests/` để vượt qua 3 bài test nghiệm thu bắt buộc trong SRS Mục 6:
  1. `test_regression_full_graph.py`: Chạy `inference_mode="full_graph"` trên `test_pairs.pt`, kiểm tra `|ROC_AUC - notebook_ref| < 1e-5` và `|AP - notebook_ref| < 1e-5`.
  2. `test_subgraph_latency.py`: Đo thời gian `POST /api/v1/cases/{case_id}/predict` trên subgraph `<= 500` khách hàng đảm bảo `execution_time_ms <= 3000`.
  3. `test_feedback_audit.py`: Xác nhận `CONFIRM` / `DISMISS` lưu vào DB, cập nhật `feedback_status` ở lần gọi `predict` tiếp theo và xuất được `CSV/JSON`.
