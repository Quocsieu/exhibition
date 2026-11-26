import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const FE_SRC = path.resolve(THIS_DIR, '..');

function readFeSource(relPath: string): string {
  return fs.readFileSync(path.join(FE_SRC, relPath), 'utf8');
}

describe('UI-B — Admin Layout Refinement, Pencil Zone Rename & Published Immutability Guards', () => {
  it('1. Eliminates direct live Published slot mutations (v28Api.assignSlot / clearSlot) across all V28 Admin components', () => {
    const configurator = readFeSource('components/adminV28/ExhibitionConfigurator.tsx');
    const inspector = readFeSource('components/adminV28/BoothInspectorPanel.tsx');
    const catalog = readFeSource('components/adminV28/ProductCatalog.tsx');

    expect(configurator).not.toContain('v28Api.assignSlot(');
    expect(configurator).not.toContain('v28Api.clearSlot(');
    expect(inspector).not.toContain('v28Api.assignSlot(');
    expect(inspector).not.toContain('v28Api.clearSlot(');
    expect(catalog).not.toContain('v28Api.assignSlot(');
    expect(catalog).toContain('v28Api.ensureWorkingDraft(');
    expect(catalog).toContain('v28Api.assignDraftSlot(');
  });

  it('2. Prefers Working Draft on reload, supports pencil inline zone rename with Enter/Escape & Save/Cancel, and reuses BoothInspectorPanel in Step 3', () => {
    const configurator = readFeSource('components/adminV28/ExhibitionConfigurator.tsx');
    const inspector = readFeSource('components/adminV28/BoothInspectorPanel.tsx');

    // Phase 4 Single-Exhibition: loads active live exhibition directly on initial load / F5
    expect(configurator).toContain('first.activeVersionId || first.versions[0]?.id');
    expect(configurator).toContain('v28Api.ensureWorkingDraft(');

    // Pencil inline zone rename in both Step 3 and Overview
    expect(configurator).toContain('v28-zone-edit-btn-');
    expect(configurator).toContain('v28-zone-rename-input-');
    expect(configurator).toContain('v28-zone-save-btn-');
    expect(configurator).toContain('v28-zone-cancel-btn-');
    expect(configurator).toContain("e.key === 'Enter'");
    expect(configurator).toContain("e.key === 'Escape'");

    // 3-state Booth cards (Full / Partial / Empty)
    expect(configurator).toContain('v28-booth-card--full');
    expect(configurator).toContain('v28-booth-card--partial');
    expect(configurator).toContain('v28-booth-card--empty');

    // Unified BoothInspectorPanel with Advanced Details & 6-slot editing
    expect(configurator).toContain('v28-step3-empty-inspector');
    expect(inspector).toContain('v28-inspector-slot-');
    expect(inspector).toContain('v28-inspector-advanced-details');
  });

  it('3. Synchronizes EmptyBoothManager with viewed version and preserves confirmation modal before permanent removal', () => {
    const adminPage = readFeSource('pages/AdminV28Page.tsx');
    const emptyMgr = readFeSource('components/adminV28/EmptyBoothManager.tsx');

    expect(adminPage).toContain('viewedVersionMeta?.versionId || activeWorld?.versionId');
    expect(emptyMgr).toContain('v28-empty-remove-confirm-modal');
    expect(emptyMgr).toContain('v28-confirm-permanent-remove-btn');
  });
});
