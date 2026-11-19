import React, { Suspense, useEffect, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

function createCanvas(w: number, h: number): HTMLCanvasElement {
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  return { width: w, height: h, getContext: () => null } as unknown as HTMLCanvasElement;
}

class AmenityErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    // Graceful silent fallback if a plaza amenity GLB fails to load
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

const PlazaGlbAsset: React.FC<{
  url: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
}> = React.memo(({ url, position = [0, 0, 0], rotation = [0, 0, 0] }) => {
  const { scene } = useGLTF(url);
  const cloned = useMemo(() => {
    const c = scene.clone(true);
    c.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        obj.castShadow = false;
        obj.receiveShadow = true;
      }
    });
    return c;
  }, [scene]);

  return <primitive object={cloned} position={position} rotation={rotation} dispose={null} />;
});

function createWelcomeSignTexture(): THREE.CanvasTexture {
  const canvas = createCanvas(1024, 224);
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 1024, 224);
    ctx.strokeStyle = '#d6be96';
    ctx.lineWidth = 6;
    ctx.strokeRect(10, 10, 1004, 204);

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 62px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('WELCOME · INFORMATION', 512, 86);

    ctx.fillStyle = '#d6be96';
    ctx.font = '600 30px "Segoe UI", Arial, sans-serif';
    ctx.fillText('GRAND EXPO WORLD · QUẦY TIẾP ĐÓN & HƯỚNG DẪN', 512, 160);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createDirectoryMapTexture(): THREE.CanvasTexture {
  const canvas = createCanvas(768, 960);
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 768, 960);
    ctx.strokeStyle = '#d6be96';
    ctx.lineWidth = 8;
    ctx.strokeRect(16, 16, 736, 928);

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 38px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SƠ ĐỒ TRIỂN LÃM', 384, 72);
    ctx.fillStyle = '#38bdf8';
    ctx.font = '600 22px "Segoe UI", Arial, sans-serif';
    ctx.fillText('GRAND EXPO WORLD · U-SHAPED PLAZA', 384, 112);

    // Mini U-shape schematic map box
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(64, 148, 640, 440);
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 3;
    ctx.strokeRect(64, 148, 640, 440);

    // Central Avenue stripe + directional visitor flow arrows
    ctx.fillStyle = 'rgba(214, 190, 150, 0.24)';
    ctx.fillRect(304, 240, 160, 336);
    ctx.fillStyle = '#d6be96';
    ctx.font = 'bold 19px "Segoe UI", Arial, sans-serif';
    ctx.fillText('↑ LỐI ĐI THAM QUAN ↑', 384, 340);
    ctx.font = '600 17px "Segoe UI", Arial, sans-serif';
    ctx.fillText('ĐẠI LỘ TRUNG TÂM 10.2M', 384, 420);

    // Check-In Zone (North Center)
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(318, 162, 132, 34);
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 16px "Segoe UI", Arial, sans-serif';
    ctx.fillText('CHECK-IN', 384, 185);

    // 6 Booth markers accurately matching U-shape layout
    const drawBooth = (x: number, y: number, w: number, h: number, color: string, label: string) => {
      ctx.fillStyle = color;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 17px "Segoe UI", Arial, sans-serif';
      ctx.fillText(label, x + w / 2, y + h / 2 + 6);
    };

    drawBooth(162, 178, 132, 54, '#e7dcc8', '01 · RING');
    drawBooth(474, 178, 132, 54, '#f4c2cc', '02 · FLOW');
    drawBooth(88, 286, 128, 72, '#93c5fd', '03 · PORTAL');
    drawBooth(88, 390, 128, 72, '#5eead4', '05 · ARCH');
    drawBooth(552, 286, 128, 72, '#fdba74', '04 · WAVE');
    drawBooth(552, 390, 128, 72, '#c4b5fd', '06 · FRAME');

    // Plaza Amenities at South flanks
    drawBooth(88, 502, 118, 56, '#d97706', 'CAFÉ');
    drawBooth(214, 514, 84, 44, '#f8fafc', 'WELCOME');
    drawBooth(470, 514, 84, 44, '#38bdf8', 'BẠN Ở ĐÂY');
    drawBooth(562, 502, 118, 56, '#94a3b8', 'REST');

    // Legend list
    ctx.textAlign = 'left';
    const items = [
      '01 · Signature Ring (Cánh Bắc - Trái)',
      '02 · Organic Flow (Cánh Bắc - Phải)',
      '03 · Grand Portal (Cánh Tây - Xa)',
      '04 · Wave Pavilion (Cánh Đông - Xa)',
      '05 · Gallery Arch (Cánh Tây - Gần)',
      '06 · Dynamic Frame (Cánh Đông - Gần)',
    ];
    ctx.font = '500 24px "Segoe UI", Arial, sans-serif';
    items.forEach((line, idx) => {
      ctx.fillStyle = '#e2e8f0';
      ctx.fillText(line, 72, 646 + idx * 46);
    });
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createCheckInBackdropTexture(): THREE.CanvasTexture {
  const canvas = createCanvas(1024, 640);
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, 1024, 640);
    grad.addColorStop(0, '#0f172a');
    grad.addColorStop(0.5, '#1e293b');
    grad.addColorStop(1, '#0f172a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1024, 640);

    // Geometric champagne luxury architectural lines
    ctx.strokeStyle = 'rgba(214, 190, 150, 0.35)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(512, 320, 210, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
    ctx.beginPath();
    ctx.arc(512, 320, 250, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = '#d6be96';
    ctx.lineWidth = 6;
    ctx.strokeRect(24, 24, 976, 592);

    ctx.fillStyle = '#d6be96';
    ctx.font = '600 28px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('OFFICIAL PHOTO & CHECK-IN ZONE', 512, 188);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 82px "Segoe UI", Arial, sans-serif';
    ctx.fillText('GRAND EXPO', 512, 300);

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 54px "Segoe UI", Arial, sans-serif';
    ctx.fillText('W O R L D', 512, 378);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '500 26px "Segoe UI", Arial, sans-serif';
    ctx.fillText('VIRTUAL EXHIBITION PLAZA · 6 SHOWROOM PAVILIONS', 512, 476);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createDigitalSignageTexture(side: 'left' | 'right'): THREE.CanvasTexture {
  const canvas = createCanvas(512, 1024);
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, 0, 1024);
    grad.addColorStop(0, '#0f172a');
    grad.addColorStop(1, '#1e293b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 1024);

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 8;
    ctx.strokeRect(18, 18, 476, 988);

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 30px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('GRAND EXPO WORLD', 256, 102);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 44px "Segoe UI", Arial, sans-serif';
    ctx.fillText(side === 'left' ? 'HƯỚNG DẪN' : 'TIỆN ÍCH', 256, 188);
    ctx.fillText(side === 'left' ? 'THAM QUAN' : 'QUẢNG TRƯỜNG', 256, 242);

    ctx.fillStyle = '#d6be96';
    ctx.fillRect(96, 286, 320, 4);

    ctx.textAlign = 'left';
    const bullets =
      side === 'left'
        ? [
            '• Chạm sàn hoặc dùng WASD',
            '  để di chuyển tự do',
            '• Bấm vào từng gian hàng',
            '  để xem cận cảnh showroom',
            '• Chạm sản phẩm trên bục',
            '  để xem thông tin & giá',
            '• Bấm tư vấn viên 3D để',
            '  nghe giới thiệu trực tiếp',
          ]
        : [
            '• Khu Welcome & Sơ đồ',
            '  tại cổng vào phía Nam',
            '• Góc Café thư giãn',
            '  tại cánh Tây Nam',
            '• Khu Nghỉ Chân Lounge',
            '  tại cánh Đông Nam',
            '• Điểm Check-in chính',
            '  tại cuối đại lộ phía Bắc',
          ];
    ctx.font = '500 28px "Segoe UI", Arial, sans-serif';
    bullets.forEach((line, idx) => {
      ctx.fillStyle = line.startsWith('•') ? '#f8fafc' : '#94a3b8';
      ctx.fillText(line, 56, 366 + idx * 66);
    });
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createCafeSignTexture(): THREE.CanvasTexture {
  const canvas = createCanvas(768, 160);
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#18181b';
    ctx.fillRect(0, 0, 768, 160);
    ctx.strokeStyle = '#d6be96';
    ctx.lineWidth = 6;
    ctx.strokeRect(8, 8, 752, 144);
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 52px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('EXPO CAFÉ LOUNGE', 384, 78);
    ctx.fillStyle = '#d6be96';
    ctx.font = '600 24px "Segoe UI", Arial, sans-serif';
    ctx.fillText('COFFEE · TEA · REFRESHMENT CORNER', 384, 126);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export const GrandExpoPlazaAmenities: React.FC = React.memo(() => {
  const baseUrl =
    (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.BASE_URL || '/';

  // Supports instant V27.3 rollback via ?booths=v27_3 while defaulting V27 to V27.4
  const isV273Rollback = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    return params.get('booths')?.trim().toLowerCase() === 'v27_3';
  }, []);

  const welcomeTex = useMemo(() => createWelcomeSignTexture(), []);
  const directoryTex = useMemo(() => createDirectoryMapTexture(), []);
  const checkInTex = useMemo(() => createCheckInBackdropTexture(), []);
  const signageLeftTex = useMemo(() => createDigitalSignageTexture('left'), []);
  const signageRightTex = useMemo(() => createDigitalSignageTexture('right'), []);
  const cafeTex = useMemo(() => createCafeSignTexture(), []);

  useEffect(() => {
    return () => {
      welcomeTex.dispose();
      directoryTex.dispose();
      checkInTex.dispose();
      signageLeftTex.dispose();
      signageRightTex.dispose();
      cafeTex.dispose();
    };
  }, [welcomeTex, directoryTex, checkInTex, signageLeftTex, signageRightTex, cafeTex]);

  const plazaDir = isV273Rollback ? 'v27_3' : 'v27_4';
  const verSuffix = isV273Rollback ? 'v27_3' : 'v27_4';

  return (
    <group name={`GrandExpoPlazaAmenities_${verSuffix}`}>
      {/* 1. WELCOME / INFORMATION ZONE (South-West of Central Avenue, clear of spawn & avenue) */}
      <group position={[-9.6, 0, 16.4]} rotation={[0, 0.26, 0]}>
        <AmenityErrorBoundary>
          <Suspense fallback={null}>
            <PlazaGlbAsset url={`${baseUrl}models/plaza/${plazaDir}/welcome_desk_${verSuffix}.glb`} />
          </Suspense>
        </AmenityErrorBoundary>
        {/* Dual-sided WELCOME / INFORMATION header graphics */}
        <mesh position={[0, isV273Rollback ? 2.88 : 2.92, isV273Rollback ? -0.30 : -0.185]}>
          <planeGeometry args={isV273Rollback ? [2.96, 0.48] : [3.28, 0.38]} />
          <meshBasicMaterial map={welcomeTex} toneMapped={false} />
        </mesh>
        <mesh
          position={[0, isV273Rollback ? 2.88 : 2.92, isV273Rollback ? -0.60 : -0.575]}
          rotation={[0, Math.PI, 0]}
        >
          <planeGeometry args={isV273Rollback ? [2.96, 0.48] : [3.28, 0.38]} />
          <meshBasicMaterial map={welcomeTex} toneMapped={false} />
        </mesh>
      </group>

      {/* 2. EXHIBITION DIRECTORY MONUMENT (South-East of Central Avenue — large legible U-shape map) */}
      <group position={[9.6, 0, 16.4]} rotation={[0, -0.26, 0]}>
        <AmenityErrorBoundary>
          <Suspense fallback={null}>
            <PlazaGlbAsset
              url={
                isV273Rollback
                  ? `${baseUrl}models/plaza/v27_3/digital_totem_v27_3.glb`
                  : `${baseUrl}models/plaza/v27_4/directory_monument_v27_4.glb`
              }
            />
          </Suspense>
        </AmenityErrorBoundary>
        <mesh position={[0, isV273Rollback ? 1.46 : 1.38, isV273Rollback ? 0.12 : 0.125]}>
          <planeGeometry args={isV273Rollback ? [0.88, 1.96] : [1.64, 2.26]} />
          <meshBasicMaterial map={directoryTex} toneMapped={false} />
        </mesh>
        <mesh
          position={[0, isV273Rollback ? 1.46 : 1.38, isV273Rollback ? -0.12 : -0.125]}
          rotation={[0, Math.PI, 0]}
        >
          <planeGeometry args={isV273Rollback ? [0.88, 1.96] : [1.64, 2.26]} />
          <meshBasicMaterial map={directoryTex} toneMapped={false} />
        </mesh>
      </group>

      {/* 3. DECORATIVE MINI CAFÉ CORNER (South-West Plaza Alcove — timber pergola & café seating) */}
      <group position={[-19.2, 0, 15.2]} rotation={[0, 0.0, 0]}>
        <AmenityErrorBoundary>
          <Suspense fallback={null}>
            <PlazaGlbAsset url={`${baseUrl}models/plaza/${plazaDir}/mini_cafe_corner_${verSuffix}.glb`} />
          </Suspense>
        </AmenityErrorBoundary>
        <mesh position={[0, isV273Rollback ? 2.72 : 2.98, isV273Rollback ? -1.58 : -0.41]}>
          <planeGeometry args={isV273Rollback ? [3.04, 0.38] : [3.80, 0.34]} />
          <meshBasicMaterial map={cafeTex} toneMapped={false} />
        </mesh>
      </group>

      {/* 4. REST AREA LOUNGE (South-East Plaza Alcove — timber pergola ribs, cushioned benches & greenery) */}
      <group position={[19.0, 0, 15.2]}>
        <AmenityErrorBoundary>
          <Suspense fallback={null}>
            <PlazaGlbAsset url={`${baseUrl}models/plaza/${plazaDir}/rest_lounge_${verSuffix}.glb`} />
          </Suspense>
        </AmenityErrorBoundary>
      </group>

      {/* 5. CHECK-IN PHOTO BACKDROP STAGE (North-End Plaza Focal Feature!) */}
      <group position={[0, 0, -20.5]}>
        <AmenityErrorBoundary>
          <Suspense fallback={null}>
            <PlazaGlbAsset url={`${baseUrl}models/plaza/${plazaDir}/checkin_stage_${verSuffix}.glb`} />
          </Suspense>
        </AmenityErrorBoundary>
        <mesh position={[0, isV273Rollback ? 1.72 : 1.92, isV273Rollback ? -0.58 : -0.485]}>
          <planeGeometry args={isV273Rollback ? [4.56, 2.84] : [4.86, 3.04]} />
          <meshBasicMaterial map={checkInTex} toneMapped={false} />
        </mesh>
      </group>

      {/* 6. TWIN DIGITAL SIGNAGE TOTEMS (Flanking Central Medallion outside 10.2m Avenue) */}
      {([
        { side: 'left' as const, x: -7.2, rotY: 0.38, tex: signageLeftTex },
        { side: 'right' as const, x: 7.2, rotY: -0.38, tex: signageRightTex },
      ] as const).map((t) => (
        <group key={`signage-${t.side}`} position={[t.x, 0, -0.3]} rotation={[0, t.rotY, 0]}>
          <AmenityErrorBoundary>
            <Suspense fallback={null}>
              <PlazaGlbAsset url={`${baseUrl}models/plaza/${plazaDir}/digital_totem_${verSuffix}.glb`} />
            </Suspense>
          </AmenityErrorBoundary>
          <mesh position={[0, isV273Rollback ? 1.46 : 1.24, isV273Rollback ? 0.12 : 0.115]}>
            <planeGeometry args={isV273Rollback ? [0.88, 1.96] : [0.86, 1.96]} />
            <meshBasicMaterial map={t.tex} toneMapped={false} />
          </mesh>
          <mesh
            position={[0, isV273Rollback ? 1.46 : 1.24, isV273Rollback ? -0.12 : -0.115]}
            rotation={[0, Math.PI, 0]}
          >
            <planeGeometry args={isV273Rollback ? [0.88, 1.96] : [0.86, 1.96]} />
            <meshBasicMaterial map={t.tex} toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
});

GrandExpoPlazaAmenities.displayName = 'GrandExpoPlazaAmenities';
