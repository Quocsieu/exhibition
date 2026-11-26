import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  computeWelcomeGuidePlacement,
  mapOnboardingSignalToClip,
  shouldRenderWelcomeGuide,
  WELCOME_GUIDE_GLB_URL,
} from '../scene/v28/WelcomeGuideNpc3D';
import { NPC_GLB_URL } from '../services/npcPresentationService';
import { deriveGuideCharacterSignal } from '../services/v28OnboardingStateMachine';

describe('V28 Phase 3 — Independent 3D Welcome Guide Character', () => {
  it('uses a dedicated GLB asset distinct from SalesAssistantNpc and exists on disk', () => {
    expect(WELCOME_GUIDE_GLB_URL).toContain('vietnamese_female_assistant.glb');
    expect(WELCOME_GUIDE_GLB_URL).not.toBe(NPC_GLB_URL);
    const glbPath = path.resolve(process.cwd(), 'FE/public/models/npc/vietnamese_female_assistant.glb');
    expect(fs.existsSync(glbPath)).toBe(true);
    expect(fs.statSync(glbPath).size).toBeGreaterThan(100_000);
  });

  it('places the guide at Welcome Plaza clear of the central walking lane and culls when focused or far away', () => {
    const placement = computeWelcomeGuidePlacement({
      spawnPoint: { x: 0, z: 137.93, rotationY: Math.PI },
      centralAvenueBounds: { minX: -7, maxX: 7, minZ: -120, maxZ: 140 },
    });
    expect(Math.abs(placement.x)).toBeGreaterThanOrEqual(2.5);
    expect(placement.z).toBeLessThan(137.93);
    expect(placement.y).toBe(0);

    // Visible near spawn in explore/overview
    expect(
      shouldRenderWelcomeGuide({
        cameraMode: 'explore',
        playerX: 0,
        playerZ: 137.93,
        guideX: placement.x,
        guideZ: placement.z,
      })
    ).toBe(true);

    // Hidden in focus mode
    expect(
      shouldRenderWelcomeGuide({
        cameraMode: 'focus',
        playerX: 0,
        playerZ: 137.93,
        guideX: placement.x,
        guideZ: placement.z,
      })
    ).toBe(false);

    // Hidden when visitor walks >38m away (saves draw calls on mobile)
    expect(
      shouldRenderWelcomeGuide({
        cameraMode: 'explore',
        playerX: 0,
        playerZ: 60,
        guideX: placement.x,
        guideZ: placement.z,
      })
    ).toBe(false);
  });

  it('maps all 5 onboarding steps 1-to-1 to WelcomeGuideNpc3D animations', () => {
    const base = {
      status: 'in_progress' as const,
      moveOrigin: null,
      rotateOriginYaw: null,
      moveDistanceMeters: 0,
      rotateDeltaRad: 0,
    };
    expect(mapOnboardingSignalToClip(deriveGuideCharacterSignal({ ...base, step: 'welcome' }))).toBe('WAVE');
    expect(mapOnboardingSignalToClip(deriveGuideCharacterSignal({ ...base, step: 'move' }))).toBe('PRESENT');
    expect(mapOnboardingSignalToClip(deriveGuideCharacterSignal({ ...base, step: 'rotate' }))).toBe('PRESENT');
    expect(mapOnboardingSignalToClip(deriveGuideCharacterSignal({ ...base, step: 'explore_booth' }))).toBe('TALKING');
    expect(mapOnboardingSignalToClip(deriveGuideCharacterSignal({ ...base, step: 'complete' }))).toBe('WAVE');
    expect(mapOnboardingSignalToClip(deriveGuideCharacterSignal({ ...base, status: 'completed', step: 'complete' }))).toBe('IDLE');
  });

  it('verifies OnboardingOverlay voice guide lifecycle guards (opt-in default OFF, AbortController, yields to booth NPC, zero AudioContext creation)', () => {
    const src = fs.readFileSync(
      path.resolve(process.cwd(), 'FE/src/components/v28/OnboardingOverlay.tsx'),
      'utf8'
    );
    // Default OFF (no autoplay)
    expect(src).toContain('useState<boolean>(false)');
    // AbortController cancels in-flight Piper synthesis on step change / skip / NPC conflict / unmount
    expect(src).toContain('new AbortController()');
    expect(src).toContain('ac.abort()');
    // Yields immediately when booth NPC consultation is active
    expect(src).toContain('if (isNpcConsultActive || !visible || state.status !== \'in_progress\' || !voiceEnabled)');
    // Revokes object URLs and pauses audio on cleanup; never constructs a new AudioContext
    expect(src).toContain('URL.revokeObjectURL');
    expect(src).toContain('audioRef.current.pause()');
    expect(src).not.toContain('new AudioContext');
    expect(src).not.toContain('webkitAudioContext');
    // Badge label fixed cleanly to "Hướng dẫn viên"
    const guideSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'FE/src/scene/v28/WelcomeGuideNpc3D.tsx'),
      'utf8'
    );
    expect(guideSrc).toContain("const badgeLabel = 'Hướng dẫn viên';");
  });
});
