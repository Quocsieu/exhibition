# GRAND EXPO V28 — URL IMPORT PHASE 1: TARGET-BASED WEBSITE CRAWLER

**Ngày hoàn thành:** 2026-11-22  
**Trạng thái Quality Gate 1:** ✅ **PASS (19/19 tests · BE Build PASS · FE Build PASS)**

## 1. Thay đổi đã triển khai
- Tạo mới [v28WebsiteCrawlerService.ts](file:///e:/Lập trình/MatBaoWS/exhibition/BE/src/services/v28WebsiteCrawlerService.ts):
  - Hỗ trợ `targetCount` (số nguyên dương `1–120`, mặc định `15`), ngân sách trang động an toàn (`maxPages <= 130`, `24 MB` tổng byte, `60s` deadline).
  - Hỗ trợ đầy đủ Homepage, Category + phân trang HTML (`?page=N`, `/page/N`, `rel="next"`), Sitemap (`robots.txt` + `sitemap.xml` depth ≤ 2), và Product Detail.
  - Chuẩn hóa URL (bỏ `#hash` và query tracking `utm_*`, `fbclid`, `gclid`, `ref`), chống trùng theo URL / Tên / SKU; dừng ngay khi đạt `targetCount`.
  - Phân biệt rõ 5 trạng thái dừng: `TARGET_REACHED`, `SOURCE_EXHAUSTED`, `RESOURCE_LIMIT`, `ACCESS_BLOCKED`, `NETWORK_ERROR`.
  - Bảo toàn 100% SSRF / DNS Rebinding / Redirect / Timeout / Rate Limit / Byte Limit.
- Cập nhật [v28Routes.ts](file:///e:/Lập trình/MatBaoWS/exhibition/BE/src/routes/v28Routes.ts) (`POST /api/v28/imports/website`), [v28Api.ts](file:///e:/Lập trình/MatBaoWS/exhibition/FE/src/services/v28Api.ts), và [ExhibitionConfigurator.tsx](file:///e:/Lập trình/MatBaoWS/exhibition/FE/src/components/adminV28/ExhibitionConfigurator.tsx) (ô nhập `Số SP cần lấy`).

## 2. Kết quả Quality Gate 1
- `BE/src/__tests__/v28WebsiteCrawlerPhase1.test.ts`: **10/10 PASS** (Homepage 6/6, Homepage 60/60, Category pagination 60/60, Product detail 1/1, 35 SP → target 60 → 35/60 `SOURCE_EXHAUSTED`, 60 SP có 10 trùng → 50 unique, 0 SP → 0/6, early stop đúng 7 trang, `RESOURCE_LIMIT` tách biệt `SOURCE_EXHAUSTED`, SSRF 8/8).
- Regression BE: `v28WebsiteImport.test.ts` (`4/4`), `v28Phase2UrlImportSecurityAndAudio.test.ts` (`2/2`), `v28Phase9SmartImportAndSizing.test.ts` (`3/3`) — **Tổng 19/19 PASS**.
- BE Build (`tsc -p tsconfig.json`) & FE Build (`VITE_NPC_TTS_MODE=hybrid`, `index-fRZZKGdq.js`): **PASS (0 lỗi TS)**.
