# 🛡️ AusAML Collusion DSS (`ausaml-collusion-dss`)

> **GNN-Powered Decision Support System for Covert AML Accomplice & Collusion Link Prediction on AusAML Heterogeneous Graphs**

Hệ thống Hỗ trợ Ra quyết định (DSS) giúp điều tra viên phát hiện liên kết đồng phạm ẩn giữa các khách hàng (`customer`), đối chứng đa mô hình (**CK GCN**, **CK GAT**, **Hybrid GATv2+GINE**), truy vết **Top-3 Bridge Meta-paths** qua các kênh ngầm (`SHARED_DEVICE`, `SHARED_IP`, `TRANSACTS`, `WIRES_TO`) và ghi nhận phản hồi điều tra viên (**Human-in-the-Loop**).

---

## 🏗️ Kiến trúc Tổng thể & Phân chia Công việc

| Thành phần | Thư mục | Phụ trách | Trạng thái |
| :--- | :--- | :---: | :--- |
| **Tài liệu & Contract** | `docs/` | Chung (Tấn & Việt) | ✅ Đã khóa Contract & Handoff |
| **M1 — AI Engine & Demo Cases** | `models/`, `data/`, `backend/app/engine/` | **Tấn** | 🛠️ Skeleton + Mock Mode sẵn sàng |
| **M2 — FastAPI Backend & DB** | `backend/app/`, `backend/tests/` | **Tấn** | ✅ API Contract + SQLite ORM sẵn sàng |
| **M3 — Graph Workspace UI** | `frontend/src/app/workspace/`, `components/` | **Việt** | 🛠️ Skeleton + Typed API Client sẵn sàng |
| **M4 — Command Center, Benchmark & QA** | `frontend/src/app/(page|benchmark|audit)/` | **Việt** | 🛠️ Skeleton + Typed API Client sẵn sàng |

---

## 🚀 Khởi chạy Nhanh (Dành cho cả Backend Mock & Dev)

### 1. Chạy Backend FastAPI (Swagger UI tại `http://localhost:8000/docs`)
```bash
cd backend
pip install -r requirements.txt
# Chế độ mặc định USE_MOCK_ENGINE=true giúp Việt phát triển UI ngay không cần GPU/PyG
uvicorn app.main:app --reload --port 8000
```

### 2. Chạy Frontend Next.js (Tại `http://localhost:3000`)
```bash
cd frontend
npm install
npm run dev
```

---

## 📚 Tài liệu Quan trọng (Đọc trước khi Code)
1. [docs/WEB_SRS_AND_INSTRUCTION.md](docs/WEB_SRS_AND_INSTRUCTION.md) — Đặc tả Yêu cầu Hệ thống (SRS v2.0).
2. [docs/API_AND_DATA_CONTRACT.md](docs/API_AND_DATA_CONTRACT.md) — Hợp đồng Dữ liệu & REST API (Khóa cứng giữa Tấn và Việt).
3. [docs/HANDOFF_TAN_M1_M2.md](docs/HANDOFF_TAN_M1_M2.md) — Hướng dẫn chi tiết triển khai M1 & M2 cho **Tấn**.
4. [docs/HANDOFF_VIET_M3_M4.md](docs/HANDOFF_VIET_M3_M4.md) — Hướng dẫn chi tiết triển khai M3 & M4 cho **Việt**.
