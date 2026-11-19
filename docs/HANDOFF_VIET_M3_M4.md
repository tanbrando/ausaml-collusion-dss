# 📋 TÀI LIỆU BÀN GIAO CÔNG VIỆC FRONTEND — CHO VIỆT (Module 3 & Module 4)

Chào **Việt**, đây là tài liệu bàn giao toàn bộ phần **Frontend (Next.js + TypeScript + Cytoscape.js + Recharts)** cho dự án **`ausaml-collusion-dss`**.  
Toàn bộ hệ thống đã được khóa cứng theo Contract tại [API_AND_DATA_CONTRACT.md](API_AND_DATA_CONTRACT.md) và Backend Mock Server đã chạy sẵn toàn bộ 8 API Endpoints để bạn **làm UI song song ngay lập tức mà không cần đợi Tấn xong PyTorch Engine**.

---

## 1. CÁCH CHẠY MÔI TRƯỜNG LOCAL TRONG 1 PHÚT

### Bước 1: Bật Backend Mock Server của Tấn (cửa sổ Terminal 1)
> Mặc định biến `USE_MOCK_ENGINE=true` đã bật, KHÔNG cần cài PyTorch Geometric hay tải file dữ liệu nặng `214 MB`.

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
- Kiểm tra API sống: mở [http://localhost:8000/docs](http://localhost:8000/docs) (Swagger UI) — thử chạy `GET /api/v1/cases` và `POST /api/v1/cases/case_01_smurfing_ring/predict`.

### Bước 2: Chạy Frontend Next.js (cửa sổ Terminal 2)
```bash
cd frontend
npm install
npm run dev
```
- Mở trình duyệt tại [http://localhost:3000](http://localhost:3000).

---

## 2. NHỮNG FILE ĐÃ TẠO SẴN CHO VIỆT (KHÔNG CẦN CODE TỪ ĐẦU)

1. `frontend/src/types/contract.ts`: Toàn bộ **TypeScript Interfaces & Enums** khớp 1-đối-1 với Pydantic của Backend (`ModelInfo`, `CaseSummary`, `PredictRequest`, `PredictResponse`, `EvidencePath`, `ExplainPairResponse`, `FeedbackRequest`...), kèm bảng màu/hình dạng chuẩn `NODE_VISUAL_STYLES` cho 6 loại đỉnh.
2. `frontend/src/lib/api.ts`: Đã viết sẵn **8 hàm gọi API chuẩn TypeScript** (`fetchModels`, `fetchCases`, `uploadCase`, `runPrediction`, `explainPair`, `submitFeedback`, `fetchAuditLogs`, `fetchBenchmarks`, `getExportUrl`).
3. Khung 4 trang & 4 components có sẵn `TODO (Việt - M3/M4)` chi tiết từng phần.

---

## 3. DANH SÁCH ĐẦU VIỆC CHI TIẾT CHO VIỆT

### 🎨 PHẦN A — MODULE 3: DSS INTERACTIVE GRAPH WORKSPACE (`/workspace`) — *Trọng tâm UI*

1. **`frontend/src/components/controls/InferenceSidebar.tsx` (Cột Trái ~25%)**:
   - Dropdown chọn **Vụ án (`case_id`)** từ `fetchCases()`.
   - Dropdown chọn **Mô hình (`model_id`)** từ `fetchModels()`.
     - **Yêu cầu bắt buộc:** Khi người dùng đổi `model_id`, thanh trượt `Threshold` phải tự động nhảy về `model.default_threshold` ($\tau_{\text{val}}$: ví dụ `0.5000` với `Hybrid v3`, `0.3227` với `CK GCN`)!
   - Thanh trượt `Threshold` (`0.05 -> 0.95`), ô chọn `Top-K` (`5..50`), ô chọn `Hop Depth` (`2` hoặc `3`).
   - 6 Checkboxes bật/tắt hiển thị các loại đỉnh (`customer`, `account`, `device`, `ip`, `beneficiary`, `bank`).
   - Nút **`Chạy Suy Luận (Run Prediction)`** gọi `runPrediction(...)`.

2. **`frontend/src/components/graph/CytoscapeCanvas.tsx` (Cột Giữa Trên)**:
   - Nhận `graphPayload` (`nodes`, `edges`) từ `PredictResponse` và render bằng `Cytoscape.js` (`layout: cose` hoặc `fcose`).
   - Áp dụng style từ `NODE_VISUAL_STYLES` trong `contract.ts`:
     - Cạnh `OBSERVED_EDGE`: **nét liền**.
     - Cạnh `PREDICTED_LINK`: **nét đứt** (Đỏ nếu `HIGH`, Cam nếu `MEDIUM`), ẩn cạnh nếu `score < currentThreshold` (lọc realtime trên client khi kéo slider) hoặc `feedback_status === "DISMISSED"`.
     - Cạnh `CONFIRMED_LINK`: **nét liền đỏ đậm** kèm dấu `✓`.
   - **Tương tác Highlight Bridge Path:** Khi user click vào 1 cạnh `PREDICTED_LINK` trên đồ thị (hoặc click 1 dòng trong `RankingTable` hoặc chọn 1 `EvidencePath` trong `EvidenceDrawer`), highlight toàn bộ `path.nodes` và các cạnh nối giữa chúng, làm mờ các nút còn lại.

3. **`frontend/src/components/tables/RankingTable.tsx` (Cột Giữa Dưới)**:
   - Hiển thị danh sách `predictions` xếp theo `score` giảm dần.
   - Cột: *Cặp Khách hàng (`source ↔ target`)*, *Xác suất (`%`)*, *Mức Rủi ro (`HIGH`/`MEDIUM`/`LOW` badge)*, *So sánh nhanh (`CK GCN` vs `Hybrid`)*, *Trạng thái (`PENDING`/`CONFIRMED`/`DISMISSED`)*.
   - Click vào 1 hàng $\rightarrow$ tự động chọn cặp đó để mở `EvidenceDrawer` và focus trên `CytoscapeCanvas`.

4. **`frontend/src/components/explain/EvidenceDrawer.tsx` (Cột Phải ~30%)**:
   - Gọi `explainPair(caseId, source, target, modelId)` (hoặc lấy trực tiếp từ `selectedPrediction`).
   - **Thẻ 1 — Đối chứng Đa mô hình:** Hiển thị 3 thanh tiến trình / badges so sánh xác suất của `CK GCN`, `CK GAT` và `Hybrid GATv2+GINE` trên chính cặp này (làm nổi bật sự khác biệt ở các ca bẫy `Type 1` / `Type 4`).
   - **Thẻ 2 — Top-3 Đường đi Bắc cầu (`evidence_paths`):** Vẽ dạng chuỗi bước nhảy (`CUST_u → ACC_1 → DEV_X → ACC_2 → CUST_v`) kèm `attention_score`. Bấm vào mỗi đường đi sẽ highlight trực tiếp trên đồ thị `CytoscapeCanvas`.
   - **Thẻ 3 — Radar Chart (`Recharts`):** Vẽ 6 trục `radar_features` (*Shared Devices*, *Shared IPs*, *Direct TX*, *Weighted AA*, *Multi-hop PPR*, *Risk Sim*) + hộp nhận định tiếng Việt (`explanation_vi`).
   - **Thẻ 4 — Human-in-the-Loop:** 2 nút **`[✓ Xác nhận Đồng phạm (CONFIRM)]`** và **`[✕ Bác bỏ (DISMISS)]`** + ô nhập ghi chú ngắn $\rightarrow$ gọi `submitFeedback()`, cập nhật ngay `feedback_status` trên bảng và đồ thị!

---

### 📊 PHẦN B — MODULE 4: COMMAND CENTER, BENCHMARK ARENA & AUDIT LOG

5. **`frontend/src/app/page.tsx` — Case Command Center (`/`)**:
   - 4 KPI Cards tổng quan hệ thống (`50,000 Customers`, `6 Node Types`, `14 Relations`, `6 Registered GNN Checkpoints`).
   - Grid hiển thị **5 Hồ sơ Vụ án mẫu** từ `fetchCases()` với nút **"Mở Phòng Điều Tra"** chuyển hướng sang `/workspace?case_id=...`.
   - Khu vực kéo thả **Upload File `.pt` Vụ án mới** gọi `uploadCase(title, desc, file)` và hiển thị bảng kết quả kiểm định **`Gate Check 1`** (`node_dims_valid`, `edge_bounds_valid`, `nan_count`, `inf_count`).

6. **`frontend/src/app/benchmark/page.tsx` — Model Benchmark & Ablation Arena (`/benchmark`)**:
   - Gọi `fetchBenchmarks()`.
   - Vẽ biểu đồ cột nhóm (`Recharts`) đối chiếu `ROC-AUC`, `AP`, `F1`, `Hits@10` của 6 mô hình (`CK GCN`, `CK GAT`, `Hybrid v3`, `Hybrid v4`, `HeteroGAT-Only`, `HeteroSAGE`) và biểu đồ `Scenario 1 (AML-AML)` vs `Scenario 4 (Shared IP/Dev)`.
   - Bảng **Hard Negative Showcase**: Liệt kê các cặp mẫu tiêu biểu thuộc `Type 1` & `Type 4` chứng minh `GCN` thuần báo nhầm nhưng `Hybrid` lọc đúng.

7. **`frontend/src/app/audit/page.tsx` — Nhật ký Điều tra & Xuất Báo cáo (`/audit`)**:
   - Gọi `fetchAuditLogs()` hiển thị danh sách toàn bộ phản hồi `CONFIRM` / `DISMISS` đã lưu trong DB, lọc theo `case_id` và `action`.
   - 2 nút tải xuống báo cáo thật: **`Xuất CSV`** và **`Xuất JSON`** dùng `getExportUrl(caseId, format)` + nút **`In Báo cáo (Print Dossier)`**.

---

## 4. QUY ƯỚC GIT WORKFLOW GIỮA VIỆT VÀ TẤN

- **Nhánh làm việc:**
  - `main`: Luôn chạy được (không push code lỗi build).
  - Việt code trên nhánh: `feat/frontend-m3-workspace` và `feat/frontend-m4-pages`.
  - Tấn code trên nhánh: `feat/backend-m1-engine` và `feat/backend-m2-api`.
- **Quy tắc bất biến:** Nếu Việt cần thêm 1 trường mới trong API response, báo Tấn cập nhật chung vào `backend/app/schemas.py` + `frontend/src/types/contract.ts` + `docs/API_AND_DATA_CONTRACT.md` trước khi merge.
- **Checklist Nghiệm thu cho Việt (Definition of Done):**
  - [ ] `npm run build` trong `frontend/` không có bất kỳ lỗi TypeScript nào.
  - [ ] Đổi Model trong Sidebar tự động cập nhật thanh trượt về `default_threshold`.
  - [ ] Click vào 1 cặp nghi vấn highlight được đường đi bắc cầu trên Cytoscape.
  - [ ] Bấm `CONFIRM` / `DISMISS`, tải lại trang (`F5`) trạng thái vẫn giữ nguyên từ SQLite DB và xuất hiện ở `/audit`.
