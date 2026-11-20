import React, { useState } from 'react';
import { CompanyManagement } from './CompanyManagement';
import { ProductCatalog } from './ProductCatalog';
import { ExcelImportWizard } from './ExcelImportWizard';

export const V28Phase1Workspace: React.FC = () => {
  const [subTab, setSubTab] = useState<'companies' | 'catalog' | 'excel'>('companies');
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div
        className="dashboard-card"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
          padding: '10px 14px',
        }}
      >
        <div style={{ fontSize: 13 }}>
          <strong>V28 Phase 1 (Database cách ly `expo_v28_dev.db`):</strong> Quản lý Doanh nghiệp, Kho sản phẩm độc lập & Import Excel. Không làm thay đổi dữ liệu V27.5.
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className={`btn ${subTab === 'companies' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setSubTab('companies')}
          >
            🏢 Doanh nghiệp
          </button>
          <button
            type="button"
            className={`btn ${subTab === 'catalog' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setSubTab('catalog')}
          >
            📚 Kho SP Độc lập
          </button>
          <button
            type="button"
            className={`btn ${subTab === 'excel' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setSubTab('excel')}
          >
            📊 Import Excel (.xlsx)
          </button>
        </div>
      </div>

      {subTab === 'companies' && (
        <CompanyManagement
          onSelectCompanyForCatalog={(cid) => {
            setSelectedCompanyId(cid);
            setSubTab('catalog');
          }}
        />
      )}
      {subTab === 'catalog' && <ProductCatalog initialCompanyId={selectedCompanyId} />}
      {subTab === 'excel' && <ExcelImportWizard />}
    </div>
  );
};
