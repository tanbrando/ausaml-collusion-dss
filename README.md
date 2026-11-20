# 🛡️ AusAML Collusion DSS (`ausaml-collusion-dss`)

> **GNN-Powered Decision Support System for Covert AML Accomplice & Collusion Link Prediction on AusAML Heterogeneous Graphs**

Hệ thống Hỗ trợ Ra quyết định (DSS) giúp điều tra viên phát hiện liên kết đồng phạm ẩn giữa các khách hàng (`customer`), đối chứng đa mô hình (**CK GCN**, **CK GAT**, **Hybrid Tri-Modal GATv2+GINE+SAGE v4**, **HeteroGAT-Only v4**, **HeteroSAGE v4**), truy vết **Top-3 Bridge Meta-paths** qua các kênh ngầm (`SHARED_DEVICE`, `SHARED_IP`, `TRANSACTS`, `WIRES_TO`) và ghi nhận phản hồi điều tra viên (**Human-in-the-Loop**).

---

## 🏗️ Kiến trúc Tổng thể & Tiến độ Triển khai

| Thành phần | Thư mục | Phụ trách | Trạng thái |
| :--- | :--- | :---: | :--- |
| **Tài liệu & Contract** | `docs/` | Chung (Tấn & Việt) | ✅ Đã khóa Contract & Handoff |
| **M1 — AI Engine & Demo Cases** | `models/`, `data/demo_cases/`, `backend/app/engine/` | **Tấn** | ✅ Hoàn thành (Real PyTorch Engine + 5 Checkpoints + 5 Demo Cases) |
| **M2 — FastAPI Backend & DB** | `backend/app/`, `backend/tests/` | **Tấn** | ✅ Hoàn thành (8 REST Endpoints + SQLite ORM + 7/7 Tests Pass) |
| **M3 — Graph Workspace UI** | `frontend/src/app/workspace/`, `components/` | **Việt** | 🛠️ Sẵn sàng ghép trực tiếp Real Backend |
| **M4 — Command Center, Benchmark & QA** | `frontend/src/app/(page\|benchmark\|audit)/` | **Việt** | 🛠️ Sẵn sàng ghép trực tiếp Real Backend |

---

## 🚀 Khởi chạy Nhanh (1 Lệnh — Đã kèm sẵn Checkpoints & 5 Demo Cases)

### Cách 1: Chạy trực tiếp trên Local (Khuyên dùng)
1. **Tạo file `.env` từ mẫu:**
   ```bash
   cp .env.example .env
   # Đặt USE_MOCK_ENGINE=false để chạy Real PyTorch Engine (hoặc true nếu muốn chạy Mock nhanh)
   ```
2. **Chạy Backend FastAPI (Swagger UI tại `http://localhost:8000/docs`):**
   ```bash
   cd backend
   python -m venv .venv
   # Windows: .venv\Scripts\activate  |  Linux/Mac: source .venv/bin/activate
   pip install -r requirements.txt
   uvicorn app.main:app --reload --port 8000
   ```
3. **Chạy Frontend Next.js (Tại `http://localhost:3000`):**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

### Cách 2: Chạy đồng bộ bằng Docker Compose
```bash
docker-compose up --build
```

### Chạy Bộ Kiểm thử Tự động (Backend M1 + M2)
```bash
cd backend
PYTHONPATH=. pytest tests -v
```

---

## 📚 Tài liệu Quan trọng
1. [docs/WEB_SRS_AND_INSTRUCTION.md](docs/WEB_SRS_AND_INSTRUCTION.md) — Đặc tả Yêu cầu Hệ thống (SRS v2.0).
2. [docs/API_AND_DATA_CONTRACT.md](docs/API_AND_DATA_CONTRACT.md) — Hợp đồng Dữ liệu & REST API (Khóa cứng giữa Tấn và Việt).
3. [docs/HANDOFF_TAN_M1_M2.md](docs/HANDOFF_TAN_M1_M2.md) — Biên bản hoàn thiện M1 & M2 (**Tấn**).
4. [docs/HANDOFF_VIET_M3_M4.md](docs/HANDOFF_VIET_M3_M4.md) — Hướng dẫn bàn giao & triển khai M3 & M4 cho **Việt**.
