# GRAND EXPO V28 — MOBILE EXPERIENCE UPGRADE & OPTIMIZATION REPORT

**Date:** 2026-11-21  
**Repository:** `E:\Lập trình\MatBaoWS\exhibition`  
**Git Branch / HEAD:** `main` @ `1455e5e` (synced with `grand-expo-v28-dev`)  
**Scope:** Floating Joystick 360° + Multi-Touch Camera + Mobile UI/UX Redesign + Adaptive Graphics Quality (`AUTO` / `PERFORMANCE` / `QUALITY`)  
**Compliance:** No commit / push / deploy performed. Zero DB changes. Zero GLB replacements. Zero Desktop or V27.5 regressions.

---

## 1. Phase 0 — Baseline Audit

- **Git State at Start:** `main` @ `1455e5e`, clean tracked tree; preserved untracked local hardening/workspace files (`BE/data/`, `FE_dist_v28.zip`, `GRAND_EXPO_V28_PRODUCTION_HARDENING_REPORT.md`, `.agents/`, `skills-lock.json`).
- **World V28 Core Components Audited:**
  - `FE/src/pages/DynamicExhibitionPage.tsx`
  - `FE/src/scene/v28/DynamicExhibitionScene.tsx`
  - `FE/src/scene/v28/v28CameraController.ts`
  - `FE/src/scene/v28/spatialStreaming.ts`
  - `FE/src/components/v28/DynamicWorldHud.tsx`
  - `FE/src/components/v28/V28NpcConsultantPanel.tsx`
  - `FE/src/hooks/useV28SpatialRealtime.ts`
- **Audio Lazy-Load Baseline:** Verified `V28NpcConsultantPanel.tsx` only calls `v28Api.getBoothAudio(booth.boothId)` when the user opens a booth's NPC consultation panel—zero audio is downloaded on initial World load.
- **Socket.IO Baseline:** Verified `DynamicExhibitionScene.tsx` throttles `onPlayerMove` every `120ms` into `useV28SpatialRealtime.sendMove(...)`.

---

## 2. Mobile Issues Discovered During Audit

1. **Landscape Mobile Ignored:** `DynamicExhibitionPage.tsx` previously checked only `isMobilePortrait` (`innerWidth <= 640 && innerHeight >= innerWidth`), leaving landscape phones (`667×375`, `844×390`) and touch tablets (`768×1024`) on the crowded desktop layout.
2. **Legacy Fixed Corner Joystick & 60fps React Re-render Bottleneck:** `DynamicWorldHud.tsx` used an opt-in fixed bottom-left joystick (`joystickEnabled` defaulted to `false`) that called `setJoyKnob` and `setJoystickVec` in React state on every `pointermove`, triggering full React re-renders of `DynamicExhibitionPage` + `DynamicExhibitionScene` + `DynamicWorldHud` every frame.
3. **No Multi-Touch Separation:** `DynamicExhibitionScene.tsx` treated all single-touch canvas drags as camera rotation (`dragStateRef`), making simultaneous movement + camera look impossible.
4. **Crowded Mobile Top Header & Missing Mobile Menu:** On `320px–430px` screens, the desktop header stacked brand + `<select>` + directory + profile buttons, consuming excessive vertical screen space and lacking quick access to Return-to-Center, Graphics Quality, and Controls Guide.
5. **No Native Mobile Product Bottom Sheet:** Product detail cards lacked swipe-down-to-close, safe-area inset handling, and thumb-friendly Contact/Purchase CTA buttons.
6. **Hardcoded Mobile Graphics Settings:** No user-selectable `AUTO` / `PERFORMANCE` / `QUALITY` adaptive DPR / shadow / streaming profile.

---

## 3. Files Added & Modified

### New Files
- `FE/src/scene/v28/v28MobileControls.ts` — Pure viewport classifier (`classifyV28Viewport`), 360° floating joystick math (`computeFloatingJoystickVector`), multi-touch gesture state machine (`V28MultiTouchGestureController`), and adaptive graphics resolver (`resolveV28GraphicsProfile`).
- `FE/src/components/v28/FloatingJoystickOverlay.tsx` — Zero-React-re-render floating joystick visual overlay (direct DOM transform updates via `useImperativeHandle`).
- `FE/src/components/v28/MobileProductBottomSheet.tsx` — Mobile-first Product Details bottom sheet with swipe-down-to-close, independent scroll, prominent price/image, and CTA footer.
- `FE/src/__tests__/v28MobileExperience.test.ts` — Automated unit/integration tests covering all 7 viewports, 360° joystick math, multi-touch separation, tap-vs-drag conflict prevention, focus/blur safety, and adaptive quality tiers.

### Modified Files
- `FE/src/scene/v28/DynamicExhibitionScene.tsx` — Wired `V28MultiTouchGestureController`, zero-re-render `joystickVectorRef`, `touchAction: 'none'` scoped strictly to the 3D `<canvas>`, adaptive `<Canvas dpr shadows gl.antialias>` & `<directionalLight castShadow shadow-mapSize>`, and enhanced `__V28_DEBUG__` telemetry (`frameTimeMs`, `jsHeapMB`, `graphicsQuality`, `dpr`).
- `FE/src/pages/DynamicExhibitionPage.tsx` — Replaced portrait-only check with full `classifyV28Viewport`, switched joystick to `joystickVecRef` (zero per-frame re-renders), mounted `<FloatingJoystickOverlay />`, added `graphicsQuality` state (`localStorage` persisted, default `auto`), and added `handleReturnToCenter`.
- `FE/src/components/v28/DynamicWorldHud.tsx` — Implemented mobile-first minimal top bar, collapsible mobile menu drawer, compact booth focus bar, compact bottom-right thumb-zone camera bar, and `<MobileProductBottomSheet />`, while keeping Desktop (`!isMobileViewport`) 100% unchanged.

---

## 4. Floating Joystick 360° & Orientation-Aware Split Controls

- **Portrait (`height >= width` — Vertical 50/50 Split):**
  - **Top 50% (`clientY < height / 2`):** Free swipe to rotate camera (NEVER creates a joystick).
  - **Bottom 50% (`clientY >= height / 2`):** Floating Joystick 360° spawns dynamically at the touch origin once drag reaches `10px`.
- **Landscape (`width > height` — Horizontal 50/50 Split):**
  - **Left 50% (`clientX < width / 2`):** Floating Joystick 360° spawns dynamically at the touch origin.
  - **Right 50% (`clientX >= width / 2`):** Free swipe to rotate camera (NEVER creates a joystick).
- **Auto-Switch & Safe Rotation Reset:** `orientationchange` and orientation-flipping `resize` events immediately call `controller.resetAll()` to cancel any in-flight gesture and zero velocity (never stuck mid-rotation), then automatically use the new orientation's split rule.
- **No Visible Split Line:** No divider is drawn on screen; a subtle, auto-dismissing first-visit pill adapts to portrait/landscape (`🕹️ Kéo nửa dưới để di chuyển · 🎥 Vuốt nửa trên xoay góc nhìn` in portrait; `🕹️ Kéo nửa trái để di chuyển · 🎥 Vuốt nửa phải xoay góc nhìn` in landscape) and hides after `5.5s` or on first touch.
- **360° Smooth Vector & Diagonal Normalization:** `computeFloatingJoystickVector` applies a `14%` dead zone, clamps the thumb knob to `52px`, and normalizes diagonal speed (`hypot(moveX, moveY) <= 1.0`).
- **Zero Per-Frame React Re-renders:** Pointer moves mutate `joystickVectorRef.current` directly and update `FloatingJoystickOverlay` via imperative DOM `translate3d(...)` transforms.

---

## 5. Multi-Touch Camera & Pointer Isolation

- **Simultaneous Two-Finger Play:** One finger moves via Floating Joystick (`joystickPointerId`) while the other finger simultaneously rotates camera (`cameraPointerId`) in both Portrait and Landscape.
- **Strict `pointerId` Ownership Across 50% Midline:** Once a pointer starts in its assigned zone, it keeps its role until `pointerup` / `pointercancel` / `lostpointercapture` even if dragged across the 50% midline.
- **Independent Release Isolation:** Releasing the movement finger immediately stops character movement (`{ x: 0, y: 0 }`) while the camera finger keeps orbiting; releasing the camera finger ends orbit without interrupting an active joystick.
- **Desktop Mouse Parity:** `pointerType === 'mouse'` uses the exact existing single-pointer camera orbit flow anywhere on the canvas and never triggers the floating joystick.

---

## 6. Gesture Conflict Handling

- **Tap vs. Drag Threshold (`10px`):** Quick taps under `10px` do NOT activate the joystick and do NOT suppress R3F click handlers—so tapping a Booth, Product, or NPC works reliably.
- **Post-Drag Click Suppression (`260ms`):** Once a gesture is recognized as a joystick drag or camera orbit, `suppressClickUntilRef` blocks accidental floor click-to-move or modal opens on pointer release.
- **UI Isolation:** All interactive overlays (Mobile Menu, Directory Drawer, Product Bottom Sheet, Bottom Camera Bar) call `onPointerDown={(e) => e.stopPropagation()}` so touching/scrolling UI never leaks to the 3D canvas.
- **Scroll Scope:** `touch-action: none` is applied **only** to the WebGL `<canvas>`, never locking vertical scroll inside modals, drawers, or bottom sheets (`overscroll-behavior: contain`, `-webkit-overflow-scrolling: touch`).

---

## 7. Responsive UI Changes (Phase 3)

- **All 7 Required Viewports Classified:** `320×568`, `375×667`, `390×844`, `430×932`, `667×375`, `844×390`, `768×1024`.
- **Slim Mobile Top Bar:** Single compact row (`3D` logo + Exhibition Name + online count + `🗺️` Directory + `☰` Menu) with `44×44px` touch targets and `env(safe-area-inset-*)` support.
- **Collapsible Mobile Menu Drawer:** Provides Booth Directory, Return to Center (`🧭 Về trung tâm`), Graphics Quality selector (`Tự động` / `Mượt` / `Đẹp`), expandable Controls Guide (`🎮 Hướng dẫn điều khiển`), Visitor Profile editor, and Admin shortcut.
- **Compact Booth Focus Bar:** Single row (`← Thoát` + booth title + `🌐` optional website + `👩‍💼 Tư vấn`) with `44×44px` touch targets so the focused 3D booth stays unobstructed.
- **Thumb-Zone Bottom-Right Dock:** Compact camera mode toggle (`🌐 Toàn cảnh` / `🚶 Tham quan`) + `＋` / `－` zoom controls, hidden automatically when menus/drawers/focus are active.

---

## 8. Product Bottom Sheet (`MobileProductBottomSheet.tsx`)

- Compact height (`max-height: 72dvh`, auto-sized for short content), rounded top corners (`20px`), `env(safe-area-inset-bottom)` padding.
- Swipe-down-to-close via drag handle or body drag **only when `scrollTop <= 2`** (zero conflict with scrolling long product descriptions).
- Clear product image (`object-fit: contain`), prominent name & price, SKU badge, readable description, `44×44px` close button (`✕`), and primary thumb-friendly **🛒 Liên hệ / Mua hàng ↗** / **💬 Hỏi tư vấn viên** CTA footer.
- Preserves booth camera focus behind the sheet.

---

## 9. Mobile Graphics Optimization (Phase 4)

| Mode | Mobile DPR | Mobile Shadows | Shadow Map | Antialias | Streaming Tier |
|---|---|---|---|---|---|
| `AUTO` (Mid/High Mobile) | `[1, 1.25]` | `true` | `512×512` | `true` | `DEFAULT_MOBILE_STREAMING` (max 8 near) |
| `AUTO` (Low-End ≤4 cores / ≤4GB RAM) | `[1, 1.15]` | `false` | `512×512` | `true` | `PERFORMANCE_MOBILE_STREAMING` (max 6 near) |
| `PERFORMANCE` | `[1, 1]` | `false` | `512×512` | `false` | `PERFORMANCE_MOBILE_STREAMING` (max 6 near) |
| `QUALITY` | `[1, 1.5]` | `true` | `1024×1024` | `true` | `DEFAULT_MOBILE_STREAMING` (max 8 near) |
| `AUTO` (Desktop — Unchanged) | `[1, 2]` | `true` | `1024×1024` | `true` | `DEFAULT_DESKTOP_STREAMING` (max 14 near) |

- **Zero GLB Replacement:** All 6 V27.4 GLB archetypes, `env` models, plaza features, and World V28 layout remain 100% intact.
- **Zero Per-Frame React Render Overhead During Joystick:** Eliminated React `setState` on `pointermove` (previously up to 60–120 React tree re-renders/sec during movement → now **0 React re-renders/sec**).

---

## 10. Audio Lazy-Load Findings

- `V28NpcConsultantPanel.tsx` fetches `v28Api.getBoothAudio(booth.boothId)` **strictly on demand** when the visitor opens the NPC panel.
- No audio assets or Piper WASM models are downloaded on initial World load.
- Autoplay blocks on mobile browsers (`NotAllowedError`) are caught cleanly, pausing state and prompting `▶ Tiếp tục` without crashing.
- Backend audio cache (`audioCacheService.ts`) is untouched—cached WAV clips are reused across all visitors with zero duplicate TTS generation.

---

## 11–13 & 15. Performance Metrics & Browser Screenshots Status

- **Real Device Status:** `REAL DEVICE TEST NOT DONE`
- **Live Browser Emulation Status:** `BLOCKED` in this host environment because Chrome DevTools MCP (`DevToolsActivePort`) is unavailable on the host machine; therefore live emulated FPS, JS heap, draw-call captures across 6/20/100/200 booths, and portrait/landscape browser screenshots could not be captured automatically in this session.
- **Telemetry Ready for Live Capture:** `window.__V28_DEBUG__` now exposes live `fps`, `frameTimeMs`, `jsHeapMB`, `graphicsQuality`, `graphicsTier`, `dpr`, `drawCalls`, `triangles`, `geometries`, `textures`, and `lodCounts` so real-device and DevTools profiling can be read directly on any loaded World.

---

## 14. Automated Test & Build Results (Phase 7)

| Check | Result | Details |
|---|---|---|
| `npx vitest run FE/src/__tests__` | **PASS (7/7 files · 66/66 tests)** | Includes 8 `v28MobileExperience.test.ts` portrait/landscape split tests + 20 V28 tests + 38 V27.5 tests |
| `npm --prefix FE run build` (`tsc --noEmit && vite build`) | **PASS** | Zero TypeScript errors, clean production bundle |
| `npm --prefix BE run typecheck` | **PASS** | Zero backend regressions |

---

## 16. Desktop Regression Check

- `classifyV28Viewport(1440, 900, false)` returns `isMobileViewport: false` → `DynamicWorldHud` renders the exact original Desktop header, booth quick-chips, camera dock, and product card.
- `V28MultiTouchGestureController` routes `pointerType === 'mouse'` straight to single-pointer camera orbit (zero floating joystick interference).
- `resolveV28GraphicsProfile('auto', false)` returns exact baseline `dpr: [1, 2]`, `shadows: true`, `shadowMapSize: 1024`, `DEFAULT_DESKTOP_STREAMING`.

---

## 17. V27.5 Compatibility Check

- Zero files in `ExhibitionPage.tsx`, `ExhibitionScene.tsx`, `AdminPage.tsx`, or V27.5 routes (`/v27`, `/v27/admin`) were modified.
- All 38 tests in `FE/src/__tests__/movementAndPathfinding.test.ts` pass cleanly.

---

## 18. Known Limitations

1. `REAL DEVICE TEST NOT DONE` — physical iOS Safari and Android Chrome gesture/FPS testing should be verified on a real handset after user approval.
2. Live browser emulation screenshots and 6/20/100/200-booth FPS/RAM captures could not be recorded automatically due to unavailable Chrome DevTools MCP on this host.
3. Changing `antialias` in `<Canvas gl={{ antialias }}>` only takes effect on WebGL context creation; DPR, shadows, shadow-map size, and spatial streaming thresholds update immediately at runtime when switching `AUTO` / `PERFORMANCE` / `QUALITY`.

---

## 19. Git Diff / Status Summary (Not Committed / Not Pushed)

```text
 M FE/src/components/v28/DynamicWorldHud.tsx
 M FE/src/pages/DynamicExhibitionPage.tsx
 M FE/src/scene/v28/DynamicExhibitionScene.tsx
?? FE/src/__tests__/v28MobileExperience.test.ts
?? FE/src/components/v28/FloatingJoystickOverlay.tsx
?? FE/src/components/v28/MobileProductBottomSheet.tsx
?? FE/src/scene/v28/v28MobileControls.ts
?? GRAND_EXPO_V28_MOBILE_OPTIMIZATION_REPORT.md
```
