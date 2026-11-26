import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CompanyManagement } from '../components/adminV28/CompanyManagement';

const FE_SRC = path.resolve(__dirname, '..');

describe('V28 Frontend Single-Company Admin UI & Preview-Before-Save Contracts', () => {
  it('removes multi-company list, + Doanh nghiệp mới, and Kích hoạt / Vô hiệu hóa toggles from normal Admin UI', () => {
    const companyMgmtSrc = fs.readFileSync(
      path.join(FE_SRC, 'components/adminV28/CompanyManagement.tsx'),
      'utf8'
    );
    const adminPageSrc = fs.readFileSync(path.join(FE_SRC, 'pages/AdminV28Page.tsx'), 'utf8');
    const productCatalogSrc = fs.readFileSync(
      path.join(FE_SRC, 'components/adminV28/ProductCatalog.tsx'),
      'utf8'
    );
    const configuratorSrc = fs.readFileSync(
      path.join(FE_SRC, 'components/adminV28/ExhibitionConfigurator.tsx'),
      'utf8'
    );
    const boothInspectorSrc = fs.readFileSync(
      path.join(FE_SRC, 'components/adminV28/BoothInspectorPanel.tsx'),
      'utf8'
    );

    // Phase B: No multi-company list, "+ Doanh nghiệp mới", or activate/deactivate company buttons
    expect(companyMgmtSrc).not.toContain('Danh sách Doanh nghiệp');
    expect(companyMgmtSrc).not.toContain('+ Doanh nghiệp mới');
    expect(companyMgmtSrc).not.toContain('handleToggleStatus');
    expect(companyMgmtSrc).not.toContain('Kích hoạt lại');
    expect(companyMgmtSrc).toContain('getOwnerCompany');
    expect(companyMgmtSrc).toContain('selectOwnerCompany');
    expect(companyMgmtSrc).toContain('replaceOwnerCompany');
    expect(companyMgmtSrc).toContain('v28-company-edit-btn');
    expect(companyMgmtSrc).toContain('v28-company-replace-btn');
    expect(companyMgmtSrc).toContain('v28-company-replace-form');

    // AdminV28Page embeds Single-Company page directly without legacy historical list accordion
    expect(adminPageSrc).not.toContain('Hồ sơ lịch sử');

    const previewPanelSrc = fs.readFileSync(
      path.join(FE_SRC, 'components/adminV28/WebsiteProductPreviewPanel.tsx'),
      'utf8'
    );

    // ProductCatalog, BoothInspectorPanel & ExhibitionConfigurator use getOwnerCompany & Preview-first discovery (never saveToCatalog: true, never autoDetectCompany: true)
    expect(productCatalogSrc).not.toContain('listCompanies(');
    expect(productCatalogSrc).toContain('autoDetectCompany: false');
    expect(productCatalogSrc).not.toContain('saveToCatalog: true');
    expect(boothInspectorSrc).toContain('autoDetectCompany: false');
    expect(boothInspectorSrc).not.toContain('saveToCatalog: true');

    expect(configuratorSrc).not.toContain('listCompanies(');
    expect(configuratorSrc).toContain('autoDetectCompany: false');
    expect(configuratorSrc).not.toContain('autoDetectCompany: true');
    expect(configuratorSrc).toContain('WebsiteProductPreviewPanel');
    expect(previewPanelSrc).toContain('v28-website-import-preview');
  });

  it('renders CompanyManagement initial loading state cleanly without crashing in SSR', () => {
    const html = renderToStaticMarkup(React.createElement(CompanyManagement));
    expect(html).toContain('Đang tải hồ sơ doanh nghiệp');
  });
});
