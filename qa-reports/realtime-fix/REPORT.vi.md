# BÁO CÁO SỬA LỖI ĐỒNG BỘ REALTIME ADMIN → VISITOR & XÁC MINH PRODUCTION
**Dự án**: Virtual Expo Plaza 3D  
**Ngày thực hiện**: 12/11/2026  
**Kỹ sư triển khai**: Senior Full-stack & WebSocket QA Specialist (Antigravity)  
**Trạng thái**: **FIX PASS TRÊN LOCAL (100%)** · **PRODUCTION: NOT TESTED (CHƯA DEPLOY)**

---

## A. NGUYÊN NHÂN GỐC RỄ (ROOT CAUSE)

Trước khi sửa đổi:
1. **Thiếu cơ chế phát sự kiện từ REST Controller**: Khi Quản trị viên thao tác các nghiệp vụ cập nhật (sửa gian hàng, đổi giá, gán/bỏ slot sản phẩm), Backend xử lý ghi vào SQLite thành công qua `ExpoService` nhưng `ExpoController` không có tham chiếu tới Socket.IO server (`io`), do đó hoàn toàn không phát bất kỳ sự kiện WebSocket nào đến các máy khách đang kết nối.
2. **Cơ chế đồng bộ chỉ chạy nội bộ một trình duyệt**: Frontend Visitor trước đây chỉ lắng nghe `BroadcastChannel` và `StorageEvent` của trình duyệt. Cơ chế này chỉ có tác dụng nếu Admin và Visitor mở trên **cùng một trình duyệt trên cùng một máy tính** (chia sẻ localStorage). Bất kỳ Visitor nào truy cập từ thiết bị khác, trình duyệt khác, hoặc qua mạng LAN/Internet đều không thể nhận được tín hiệu cập nhật nếu không bấm F5 tải lại trang.
3. **Thiếu sự kiện Reconnect Self-Healing**: Khi thiết bị di động hoặc máy tính mất mạng tạm thời rồi kết nối lại, client không kích hoạt tải lại dữ liệu mới nhất.

---

## B. DANH SÁCH FILE THAY ĐỔI & LÝ DO

| File | Thay đổi chính | Lý do kỹ thuật |
|:---|:---|:---|
| `BE/src/schemas/expoSchemas.ts` | Bổ sung interface `ExpoDataUpdatedPayload` và sự kiện `'expo:data-updated'` vào `ServerToClientEvents` | Định nghĩa chuẩn kiểu dữ liệu sự kiện thông báo thay đổi trên Socket.IO |
| `FE/src/types/expo.ts` | Khai báo đồng bộ `ExpoDataUpdatedPayload` và sự kiện `'expo:data-updated'` | Đảm bảo TypeScript type safety trên Frontend khi lắng nghe socket |
| `BE/src/controllers/expoController.ts` | Bổ sung callback `DataMutationCallback` trong constructor; gọi `this.onMutation?.(...)` sau mọi thao tác ghi/sửa/xóa thành công | Kích hoạt thông báo realtime ngay sau khi xác nhận database cập nhật |
| `BE/src/server.ts` | Gán `app.set('io', io)` và kết nối `onMutation` với `io.emit('expo:data-updated', payload)` | Tận dụng hạ tầng Socket.IO hiện có để broadcast sự kiện đến mọi Visitor |
| `FE/src/hooks/useRealtime.ts` | Lắng nghe `'expo:data-updated'` và kích hoạt tải bù khi `connect` (reconnect self-healing) | Tiếp nhận sự kiện trên mọi thiết bị và tự phục hồi sau khi mất kết nối |
| `FE/src/pages/ExhibitionPage.tsx` | Kết nối `onDataUpdated` với `refreshExpoDataSilently(true)` qua bộ lọc chống dồn dập (debounce 120ms) | Tự động làm mới dữ liệu 3D mà không reload trang, không giật camera, không remount Canvas |
| `BE/src/__tests__/expoBackendAndRealtime.test.ts` | Thêm bài kiểm thử tự động kiểm tra broadcast `expo:data-updated` khi Admin cập nhật gian hàng & slot | Kiểm thử tự động ngăn ngừa regression trong tương lai |

> [!IMPORTANT]
> **Tuân thủ an toàn tuyệt đối**: Không thay đổi bất kỳ mô hình 3D, kiến trúc cảnh quan, camera, controls di chuyển, thuật toán A*, database schema hay giao diện người dùng nào ngoài phạm vi realtime.

---

## C. CƠ CHẾ ĐỒNG BỘ REALTIME MỚI

```mermaid
sequenceDiagram
    autonumber
    actor Admin as Admin (Thiết bị 1)
    participant BE as Express REST API
    participant DB as SQLite (expo.db)
    participant Socket as Socket.IO Server
    actor VisitorA as Visitor A (Thiết bị 2)
    actor VisitorB as Visitor B (Thiết bị 3 / Mobile)

    Admin->>BE: PUT /api/booths/:id hoặc PUT /api/slots (Bearer Token)
    BE->>BE: Xác thực quyền & Validate Schema (Zod)
    BE->>DB: Ghi dữ liệu vào SQLite
    DB-->>BE: Xác nhận ghi thành công
    BE->>Socket: io.emit('expo:data-updated', { entityType, id, timestamp })
    BE-->>Admin: Trả về HTTP 200 OK
    par Broadcast tức thời đến mọi Visitor
        Socket-->>VisitorA: Sự kiện 'expo:data-updated'
        Socket-->>VisitorB: Sự kiện 'expo:data-updated'
    end
    Note over VisitorA,VisitorB: Debounce 120ms (tránh fetch trùng khi admin cập nhật liên tục)
    par Tải dữ liệu ngầm không reload
        VisitorA->>BE: GET /api/booths, /api/products, /api/slots
        VisitorB->>BE: GET /api/booths, /api/products, /api/slots
    end
    BE-->>VisitorA: Dữ liệu mới nhất
    BE-->>VisitorB: Dữ liệu mới nhất
    Note over VisitorA,VisitorB: React cập nhật State -> 3D Scene tự đổi tên/giá/vật phẩm<br/>Camera & vị trí nhân vật giữ nguyên vẹn 100%
```

---

## D. KẾT QUẢ KIỂM THỬ LOCAL (LOCAL AUTOMATED E2E TESTS)

Thực hiện kiểm thử tự động bằng Playwright trên môi trường thực gồm 3 Browser Contexts hoàn toàn độc lập (Admin, Visitor A, Visitor B):

| Mã Test | Nội dung kiểm thử | Kết quả kỳ vọng | Kết quả thực tế | Trạng thái |
|:---|:---|:---|:---|:---:|
| **RT-01** | Đổi tên gian hàng | Cả 2 Visitor độc lập tự nhận tên mới không cần reload | Visitor A và B hiển thị tên mới sau 600ms | **PASS** |
| **RT-02** | Đổi giá sản phẩm | Visitor thấy giá tiền mới tức thì | Giá mới (9,876,543 ₫) cập nhật tức thì | **PASS** |
| **RT-03** | Modal đang mở | Visitor đang xem gian hàng, giá và mô tả cập nhật không văng modal | Dữ liệu cập nhật mượt mà khi đang mở Showcase | **PASS** |
| **RT-05** | Gán sản phẩm vào Slot | Visitor thấy sản phẩm xuất hiện tại đúng vị trí slot | Slot 02 hiển thị đúng sản phẩm vừa gán | **PASS** |
| **RT-07** | Bỏ sản phẩm khỏi Slot | Visitor không còn thấy sản phẩm tại slot bị dọn | Slot 02 trở về trạng thái trống | **PASS** |
| **RT-09** | Cách ly Gian hàng | Thay đổi Booth Aether không làm sai lệch Nordic Living | Dữ liệu của Nordic Living được bảo toàn nguyên vẹn | **PASS** |
| **RT-10** | Cách ly Slot | Thao tác Slot 02 không làm ảnh hưởng Slot 01 và 03 | Slot 01 và 03 giữ nguyên sản phẩm | **PASS** |
| **RT-12** | Mất kết nối & Tự phục hồi | Ngắt mạng Visitor B, Admin cập nhật, kết nối lại tự đồng bộ | Visitor B tự lấy dữ liệu mới khi online lại | **PASS** |
| **RT-13** | Cập nhật liên tục | Admin đổi nhanh 4 lần liên tiếp, debounce chống nghẽn | Trạng thái cuối cùng hiển thị chính xác | **PASS** |
| **RT-14** | Không có sự kiện giả | Request ghi bị từ chối (401/400) không kích hoạt cập nhật sai | Không phát sinh cập nhật ảo khi không có token | **PASS** |
| **RT-15** | Multiplayer Regression | Hai Visitor vẫn thấy nhau và di chuyển bình thường | Kết nối socket của người chơi duy trì liên tục | **PASS** |
| **RT-16** | Camera Regression | Góc nhìn camera không bị reset khi dữ liệu đổi | Camera giữ nguyên góc nhìn và tọa độ | **PASS** |
| **RT-17** | Scene Regression | Canvas 3D không bị flash, remount hay reload | Canvas duy trì liên tục trong suốt quá trình | **PASS** |
| **RT-18** | Console Log | Không có lỗi JavaScript fatal hoặc WebSocket error | Console hoàn toàn sạch (0 errors) | **PASS** |

---

## E. XÁC MINH TRÊN MÔI TRƯỜNG PRODUCTION (VERCEL + RENDER)

Theo đúng quy tắc của Master Prompt:
- **Frontend Production**: Cấu hình rewrite trong `vercel.json` trỏ về Backend Render.
- **Backend Production**: Cấu hình tại `.env.production` là `https://exhibition-xl20.onrender.com`.
- **Trạng thái kết nối hiện tại**: Endpoint `https://exhibition-xl20.onrender.com/api/health` bị timeout khi gọi kiểm tra (do dịch vụ Render gói Free tự động đóng băng container sau 15 phút không có traffic).
- **Trạng thái Commit Production**: Bản sửa lỗi realtime này vừa được hoàn thành và kiểm thử trên Local, **CHƯA ĐƯỢC COMMIT VÀ CHƯA PUSH LÊN GITHUB HOẶC DEPLOY LÊN CLOUD**.

> [!WARNING]
> **ĐÁNH GIÁ PRODUCTION**: **NOT TESTED — PRODUCTION WRITE TEST NOT AUTHORIZED**  
> Tuân thủ chỉ thị: *"Không được tuyên bố Production đã được kiểm thử bản sửa mới nếu Production vẫn chạy phiên bản cũ. Không tự động deploy nếu chưa được người dùng cho phép."*

### Hướng dẫn triển khai lên Production khi người dùng yêu cầu:
1. Kiểm tra Git diff và commit mã nguồn sửa đổi realtime.
2. Push lên nhánh `main` của repository GitHub: `git push origin main`.
3. Vercel sẽ tự động trigger build Frontend mới (`npm run build -w FE`).
4. Truy cập Dashboard Render và bấm **Manual Deploy** (hoặc đợi Render auto-deploy qua webhook GitHub) để Backend biên dịch phiên bản có Socket broadcast mới.
5. Sau khi Render chuyển sang trạng thái **Live**, mở hai thiết bị độc lập truy cập domain Vercel và chạy xác minh đồng bộ realtime.

---

## F. KẾT QUẢ AUTOMATED REGRESSION TESTS

1. **Vitest Unit & Integration Tests**:
   - `BE/src/__tests__/expoBackendAndRealtime.test.ts`: **9/9 tests PASSED** (bao gồm test broadcast `expo:data-updated`)
   - `FE/src/__tests__/movementAndPathfinding.test.ts`: **22/22 tests PASSED**
   - **Tổng cộng: 31/31 tests PASSED (100%)**
2. **TypeScript Compilation Check**:
   - `npm run typecheck -w BE`: 0 lỗi (`tsc --noEmit -p tsconfig.json`)
   - `npm run typecheck -w FE`: 0 lỗi (`tsc --noEmit`)
3. **Production Build**:
   - `npm run build`: Cả Frontend và Backend biên dịch thành công trong 12.27s không có cảnh báo nghiêm trọng.

---

## G. BẰNG CHỨNG HÌNH ẢNH TRỰC QUAN

````carousel
![Admin chuẩn bị thao tác cập nhật](/C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/rt_admin_ready.png)
<!-- slide -->
![Visitor A trạng thái ban đầu](/C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/rt_visitorA_initial.png)
<!-- slide -->
![Visitor B trạng thái ban đầu](/C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/rt_visitorB_initial.png)
<!-- slide -->
![Visitor A tự đổi tên gian hàng realtime](/C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/rt_01_visitorA_booth_updated.png)
<!-- slide -->
![Visitor B tự đổi tên gian hàng realtime](/C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/rt_01_visitorB_booth_updated.png)
<!-- slide -->
![Visitor A xem Showcase nhận cập nhật trực tiếp](/C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/rt_03_visitorA_modal_sync.png)
<!-- slide -->
![Visitor B tự phục hồi dữ liệu sau khi kết nối lại](/C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/rt_12_visitorB_reconnected.png)
````
