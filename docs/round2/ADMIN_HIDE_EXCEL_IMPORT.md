# GRAND EXPO V28 — ẨN CHỨC NĂNG IMPORT EXCEL TRONG ADMIN

**Ngày thực hiện:** 2026-11-22  
**Phạm vi:** Chỉ ẩn sạch các entry point Import Excel trên giao diện Admin (`/admin`). Không xóa `ExcelImportWizard.tsx`, không sửa Backend API, không thay đổi Production DB, 85 WAV hay các Hotfix P1/P2-01/P2-02; chưa commit/push/deploy.

---

## 1. Vị trí các nút / tab Import Excel trước khi sửa (Audit)

1. **`FE/src/pages/AdminPage.tsx` (L737):** Tab chính mang nhãn `"🚀 V28 Doanh nghiệp, Catalog & Excel"`.
2. **`FE/src/components/adminV28/V28Phase1Workspace.tsx` (L4, L8, L25, L42–48, L68):**
   - Nút sub-tab `"📊 Import Excel (.xlsx)"` và nhánh render `{subTab === 'excel' && <ExcelImportWizard />}`.
   - Dòng mô tả đề cập `"& Import Excel"`.
3. **`FE/src/components/adminV28/ExhibitionConfigurator.tsx` (L1181):** Nút chọn nguồn sản phẩm `{ id: 'excel', label: '📊 Excel (.xlsx)' }` trong form tạo không gian triển lãm.
4. **Ghi nhận thêm:** Không có nút tải Excel mẫu hay Export Excel độc lập trên giao diện Admin (chỉ có nút tải CSV lỗi bên trong `ExcelImportWizard`).

---

## 2. File đã thay đổi & Cách ẩn sạch (Không dùng `display: none`)

| File | Phạm vi dòng | Thay đổi thực hiện |
| :--- | :--- | :--- |
| [AdminPage.tsx](file:///e:/Lập trình/MatBaoWS/exhibition/FE/src/pages/AdminPage.tsx#L732-L738) | L737 | Đổi tên tab thành `"🚀 V28 Doanh nghiệp & Sản phẩm"`. |
| [V28Phase1Workspace.tsx](file:///e:/Lập trình/MatBaoWS/exhibition/FE/src/components/adminV28/V28Phase1Workspace.tsx#L1-L61) | L1–L61 | Loại bỏ hoàn toàn sub-tab `'excel'`, nút `"📊 Import Excel (.xlsx)"`, nhánh render `<ExcelImportWizard />` và import không dùng; cập nhật mô tả chỉ còn `"Quản lý Doanh nghiệp & Kho sản phẩm độc lập"`. |
| [ExhibitionConfigurator.tsx](file:///e:/Lập trình/MatBaoWS/exhibition/FE/src/components/adminV28/ExhibitionConfigurator.tsx#L1179-L1182) | L1179–L1182 | Loại bỏ tùy chọn `{ id: 'excel', label: '📊 Excel (.xlsx)' }` khỏi thanh chọn nguồn sản phẩm, chỉ hiển thị `🔗 URL Website`. |

- **Bảo toàn tuyệt đối:** File [ExcelImportWizard.tsx](file:///e:/Lập trình/MatBaoWS/exhibition/FE/src/components/adminV28/ExcelImportWizard.tsx), toàn bộ Backend API (`BE/src/routes/v28Routes.ts`, `BE/src/services/v28ExcelImportService.ts`), và `FE/src/services/v28Api.ts` đều được **giữ nguyên 100%**.

---

## 3. Kết quả Regression QA

- **FE Production Build (`VITE_NPC_TTS_MODE=hybrid`):** ✅ **PASS** (`FE/dist/assets/index-C-KUb1Rg.js`, `0` lỗi TypeScript; `ExcelImportWizard` không còn được render/bundle vào giao diện Admin).
- **FE Unit Tests:** ✅ **`16/16` files — `94/94` tests PASS** (BE không thay đổi, baseline `67/67` PASS → tổng `161/161` PASS).
- **Xác minh bảo toàn file:** `ExcelImportWizard.tsx` (`True`) và `v28ExcelImportService.ts` (`True`) còn nguyên vẹn.
- **Không ảnh hưởng:** Không chạm vào giao diện 3D, 100 gian hàng / 10 khu vực, Hotfix P1 / P2-01 / P2-02, Web Audio API Hybrid, 85 WAV hay Production DB.

---

## 4. Các chức năng quản lý sản phẩm thủ công còn nguyên vẹn

- **`AdminPage.tsx` (`📦 Kho Sản phẩm` & `🏪 Gian hàng / Slots`):** Thêm/sửa/xóa sản phẩm thủ công bằng form web, quản lý ảnh sản phẩm, gán sản phẩm vào booth/slot.
- **`V28Phase1Workspace.tsx`:**
  - `🏢 Doanh nghiệp` (`CompanyManagement.tsx`)
  - `📚 Kho SP Độc lập` (`ProductCatalog.tsx` — thêm, sửa, xóa, tìm kiếm sản phẩm trực tiếp trên web)
  - `🏗️ Quy hoạch Triển lãm (V28)` (`ExhibitionConfigurator.tsx` — quản lý bố cục & gán slot gian hàng)

---

## 5. Giới hạn chưa kiểm thử

- Chưa thực hiện thao tác đăng nhập `/admin` và ghi thử sản phẩm mới trực tiếp trên server Production (tuân thủ quy tắc an toàn không ghi dữ liệu vào Production DB).
