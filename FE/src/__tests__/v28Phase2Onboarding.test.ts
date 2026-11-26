import { describe, expect, it } from 'vitest';
import {
  computeWrappedYawDelta,
  createInitialOnboardingState,
  deriveGuideCharacterSignal,
  reduceOnboardingState,
  safeReadOnboardingStorage,
  safeWriteOnboardingStorage,
  shouldSuppressOnboardingOverlay,
  V28_ONBOARDING_STORAGE_KEY,
  type StorageLike,
} from '../services/v28OnboardingStateMachine';

class MemoryStorage implements StorageLike {
  public map = new Map<string, string>();
  public writeCount = 0;
  public getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  public setItem(key: string, value: string): void {
    this.writeCount++;
    this.map.set(key, value);
  }
}

class ThrowingStorage implements StorageLike {
  public getItem(): string | null {
    throw new Error('SecurityError: storage disabled');
  }
  public setItem(): void {
    throw new Error('SecurityError: storage disabled');
  }
}

describe('V28 Phase 2 — Interactive Onboarding State Machine & Persistence', () => {
  it('starts on welcome for first visit, advances only on real movement (>=1.5m), camera rotation (>=0.25 rad with wrap-around), and map/booth interaction, without writing localStorage every frame', () => {
    const store = new MemoryStorage();

    // 1. First visit -> welcome
    let state = createInitialOnboardingState(store);
    expect(state.status).toBe('in_progress');
    expect(state.step).toBe('welcome');
    expect(deriveGuideCharacterSignal(state).suggestedAnim).toBe('wave');

    // 2. Start from arbitrary non-origin coordinates (no hardcoded spawn dependency)
    let r = reduceOnboardingState(state, { type: 'START', currentPos: { x: 42.5, z: -18.2 } });
    state = r.next;
    expect(state.step).toBe('move');
    expect(r.shouldPersist).toBe(true);
    safeWriteOnboardingStorage({ status: state.status, step: state.step }, store);
    expect(store.writeCount).toBe(1);

    // Small movement (< 1.5m) must NOT complete step and must NOT write localStorage
    r = reduceOnboardingState(state, { type: 'OBSERVE_MOVE', currentPos: { x: 43.2, z: -18.2 }, currentYaw: 3.1 });
    state = r.next;
    expect(state.step).toBe('move');
    expect(r.shouldPersist).toBe(false);
    expect(store.writeCount).toBe(1);

    // Real movement (>= 1.5m) -> advances to rotate
    r = reduceOnboardingState(state, { type: 'OBSERVE_MOVE', currentPos: { x: 44.1, z: -18.2 }, currentYaw: 3.1 });
    state = r.next;
    expect(state.step).toBe('rotate');
    expect(r.shouldPersist).toBe(true);
    safeWriteOnboardingStorage({ status: state.status, step: state.step }, store);
    expect(store.writeCount).toBe(2);

    // 3. Camera yaw wrap-around test: origin = +3.10 rad, move across +PI to -3.12 rad (delta ≈ 0.06 rad < 0.25 -> must NOT advance)
    expect(computeWrappedYawDelta(-3.12, 3.10)).toBeLessThan(0.1);
    r = reduceOnboardingState(state, { type: 'OBSERVE_ROTATE', currentYaw: -3.12 });
    state = r.next;
    expect(state.step).toBe('rotate');
    expect(r.shouldPersist).toBe(false);

    // Rotate further across wrap-around to -2.85 rad (delta ≈ 0.33 rad >= 0.25 -> advances to explore_booth)
    r = reduceOnboardingState(state, { type: 'OBSERVE_ROTATE', currentYaw: -2.85 });
    state = r.next;
    expect(state.step).toBe('explore_booth');
    expect(r.shouldPersist).toBe(true);
    expect(deriveGuideCharacterSignal(state).suggestedAnim).toBe('point_map');
    safeWriteOnboardingStorage({ status: state.status, step: state.step }, store);

    // 4. Reload while in_progress resumes at explore_booth cleanly
    const reloaded = createInitialOnboardingState(store);
    expect(reloaded.status).toBe('in_progress');
    expect(reloaded.step).toBe('explore_booth');

    // 5. Map/directory open or booth focus -> complete step
    r = reduceOnboardingState(reloaded, { type: 'OBSERVE_EXPLORE_INTERACTION' });
    state = r.next;
    expect(state.step).toBe('complete');
    expect(r.shouldPersist).toBe(true);

    // Finish -> completed & persisted across reload
    r = reduceOnboardingState(state, { type: 'COMPLETE' });
    state = r.next;
    expect(state.status).toBe('completed');
    safeWriteOnboardingStorage({ status: state.status, step: state.step }, store);
    expect(createInitialOnboardingState(store).status).toBe('completed');
  });

  it('supports skip, replay, graceful fallback when localStorage is unavailable, and modal/focus suppression', () => {
    const store = new MemoryStorage();
    let state = createInitialOnboardingState(store);

    // Skip persists and hides overlay
    let r = reduceOnboardingState(state, { type: 'SKIP' });
    state = r.next;
    expect(state.status).toBe('skipped');
    safeWriteOnboardingStorage({ status: state.status, step: state.step }, store);
    expect(JSON.parse(store.getItem(V28_ONBOARDING_STORAGE_KEY)!).status).toBe('skipped');
    expect(createInitialOnboardingState(store).status).toBe('skipped');

    // Replay resets to welcome + in_progress
    r = reduceOnboardingState(state, { type: 'REPLAY' });
    state = r.next;
    expect(state.status).toBe('in_progress');
    expect(state.step).toBe('welcome');

    // Unavailable localStorage never throws
    const broken = new ThrowingStorage();
    expect(safeReadOnboardingStorage(broken)).toBeNull();
    expect(safeWriteOnboardingStorage({ status: 'in_progress', step: 'welcome' }, broken)).toBe(false);
    expect(createInitialOnboardingState(broken).step).toBe('welcome');

    // Modal / focus suppression rules
    expect(
      shouldSuppressOnboardingOverlay({
        status: 'in_progress',
        step: 'move',
        directoryOpen: false,
        mobileMenuOpen: false,
        rewardModalOpen: false,
        desktopGuideModalOpen: false,
        npcChatOpen: false,
        isBoothFocusActive: false,
      })
    ).toBe(false);
    expect(
      shouldSuppressOnboardingOverlay({
        status: 'in_progress',
        step: 'move',
        directoryOpen: true,
        mobileMenuOpen: false,
        rewardModalOpen: false,
        desktopGuideModalOpen: false,
        npcChatOpen: false,
        isBoothFocusActive: false,
      })
    ).toBe(true);
    expect(
      shouldSuppressOnboardingOverlay({
        status: 'in_progress',
        step: 'move',
        directoryOpen: false,
        mobileMenuOpen: false,
        rewardModalOpen: false,
        desktopGuideModalOpen: false,
        npcChatOpen: false,
        isBoothFocusActive: true,
      })
    ).toBe(true);
  });

  it('Phase 2: starts idle when autoStart is false (no auto-popup on World entry), and opens cleanly via manual REPLAY', () => {
    const store = new MemoryStorage();
    const initial = createInitialOnboardingState(store, { autoStart: false });
    expect(initial.status).toBe('idle');
    expect(
      shouldSuppressOnboardingOverlay({
        status: initial.status,
        step: initial.step,
        directoryOpen: false,
        mobileMenuOpen: false,
        rewardModalOpen: false,
        desktopGuideModalOpen: false,
        npcChatOpen: false,
        isBoothFocusActive: false,
      })
    ).toBe(true);

    // Manual trigger via ⋯ → Xem lại hướng dẫn or clicking 3D Welcome NPC
    const replayed = reduceOnboardingState(initial, { type: 'REPLAY' }).next;
    expect(replayed.status).toBe('in_progress');
    expect(replayed.step).toBe('welcome');
    expect(
      shouldSuppressOnboardingOverlay({
        status: replayed.status,
        step: replayed.step,
        directoryOpen: false,
        mobileMenuOpen: false,
        rewardModalOpen: false,
        desktopGuideModalOpen: false,
        npcChatOpen: false,
        isBoothFocusActive: false,
      })
    ).toBe(false);
  });
});
