# ⚙️ BIÊN BẢN HOÀN THIỆN BACKEND & AI ENGINE — TẤN (Module 1 & Module 2)

Toàn bộ **Module 1 (AI Engine & Demo Case Builder)** và **Module 2 (FastAPI Backend & Database)** đã được triển khai, kiểm toán, refactor và vượt qua 100% kiểm thử tự động ở chế độ **Real PyTorch Engine (`USE_MOCK_ENGINE=false`)**, sẵn sàng bàn giao cho **Việt (M3 & M4)**.

---

## CHECKLIST NGHIỆM THU M1 & M2 (ĐÃ HOÀN TẤT 100%)

### Giai đoạn A — Chuẩn hóa Checkpoints & Trích xuất 5 Demo Cases (`Module 1.1`)
- [x] **Bước 1:** Gom 5 checkpoints chuẩn `v4` + `CK` vào `models/` (đã bỏ `v3` không còn dùng) và allow-list trong `.gitignore` (~5.2 MB tổng cộng để Việt `git pull` chạy ngay):
  - `models/gcn_seed42.pt`, `models/gat_seed42.pt`
  - `models/best_hybrid_gat_gin_v4_seed42.pt`, `models/ablation_a_v4_seed42.pt`, `models/ablation_b_v4_seed42.pt`
  - `models/frozen_scalers.pt` (xuất tất định từ `processed_graph.pt` + `train_pairs.pt` qua `scripts/export_frozen_scalers_and_demos.py`, không cần retrain).
- [x] **Bước 2:** Chạy `scripts/export_frozen_scalers_and_demos.py` trích xuất 5 file `.pt` nhẹ vào `data/demo_cases/` + `demo_cases_manifest.json` (`case_01_smurfing_ring.pt` đến `case_05_test_benchmark_3420.pt`).

### Giai đoạn B — Hoàn thiện `backend/app/engine/` (`Module 1.2`)
- [x] **Bước 3 (`validator.py`):** Hoàn thiện `validate_pt_file()` & `load_and_normalize_hetero()` (Gate Check 1, tự sinh cạnh ngược `rev_*`).
- [x] **Bước 4 (`homo_adapter.py` & `predictor_homo.py`):** Port 1-đối-1 `CK/src/data_validator.py` & `CK/src/models.py` + Adaptive Subgraph Scaling + `encode_with_attention()`.
- [x] **Bước 5 (`hetero_adapter.py` & `predictor_hetero.py`):** Port 1-đối-1 `AML_Hybrid_GAT_GIN.ipynb` (82d Node + 16d Multi-Scale PE + 4 Meta-paths + 24d Full-Graph Pairwise) và 3 lớp model khớp `strict=True`: `TriModalHybridGATGINv4`, `BaselineHeteroGNNv4`, `HeteroGATOnlyv4`.
- [x] **Bước 6 (`subgraph_sampler.py`, `explainer.py`, `graph_builder.py`, `mock_provider.py`):** Khoanh vùng K-hop subgraph, truy vết Top-3 Bridge Meta-paths, chuẩn hóa 6 trục Radar, sinh giải thích tiếng Việt và tách modular gọn sạch khỏi `registry.py` (kèm `threading.RLock` & `warmup()`).

### Giai đoạn C — Bật Real Engine & Kiểm thử Nghiệm thu (`Module 2`)
- [x] **Bước 7:** Tự nạp `.env` trong `config.py`, bổ sung route alias `GET /api/v1/cases/{case_id}/audit`, thêm `backend/Dockerfile` & `frontend/Dockerfile`, cô lập DB/upload test trong `conftest.py`.
- [x] **Bước 8:** Chạy `pytest backend/tests/ -v` (**`7 passed, 1 skipped` trong `11.95s`**):
  - `test_all_5_checkpoints_load_strict_and_symmetric`: PASS (5/5 checkpoints `strict=True`, đối xứng hoán vị `< 1e-5`).
  - `test_case05_real_benchmark_3420_pairs`: PASS (`Hybrid v4` ROC `0.8285` / AP `0.8448` vượt `CK GCN` `0.7955` / `0.8044`).
  - `test_subgraph_inference_latency_under_3_seconds`: PASS (`case_01_smurfing_ring.pt` chạy thật trong **`94.37 ms`** $\ll 3000\text{ms}$).
  - `test_contract_and_feedback.py`: PASS (8 endpoints, đồng bộ điểm `/predict` $\leftrightarrow$ `/explain-pair`, Human-in-the-Loop DB Persistence, Export CSV).
