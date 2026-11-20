import React, { useEffect, useState } from 'react';
import {
  v28Api,
  type ExcelPreviewResponse,
  type ExcelRowValidationItem,
  type ImportJobReport,
  type V28Company,
} from '../../services/v28Api';

const MAX_BYTES = 5 * 1024 * 1024;

const ImportPreviewTable: React.FC<{ rows: ExcelRowValidationItem[] }> = ({ rows }) => {
  const statusLabel = (s: ExcelRowValidationItem['status']) => {
    switch (s) {
      case 'valid':
        return { text: 'Hợp lệ', color: '#34d399' };
      case 'duplicate_in_db':
        return { text: 'Trùng trong DB', color: '#fbbf24' };
      case 'duplicate_in_file':
        return { text: 'Trùng trong file', color: '#fb923c' };
      case 'error':
        return { text: 'Lỗi', color: '#f87171' };
    }
  };

  return (
    <div style={{ maxHeight: 340, overflow: 'auto', border: '1px solid rgba(148,163,184,0.25)', borderRadius: 8 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: 'rgba(15,23,42,0.7)', textAlign: 'left' }}>
            <th style={{ padding: 8 }}>Dòng</th>
            <th style={{ padding: 8 }}>Trạng thái</th>
            <th style={{ padding: 8 }}>SKU</th>
            <th style={{ padding: 8 }}>Tên sản phẩm</th>
            <th style={{ padding: 8 }}>Giá</th>
            <th style={{ padding: 8 }}>Ghi chú / Lỗi</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 120).map((r) => {
            const st = statusLabel(r.status);
            return (
              <tr key={r.rowNumber} style={{ borderTop: '1px solid rgba(148,163,184,0.15)' }}>
                <td style={{ padding: 8 }}>{r.rowNumber}</td>
                <td style={{ padding: 8, color: st.color, fontWeight: 600 }}>{st.text}</td>
                <td style={{ padding: 8 }}>{r.data?.sku || r.raw?.sku || '—'}</td>
                <td style={{ padding: 8 }}>{r.data?.name || r.raw?.name || '—'}</td>
                <td style={{ padding: 8 }}>{r.data ? `${r.data.price} ${r.data.currency}` : r.raw?.price || '—'}</td>
                <td style={{ padding: 8, opacity: 0.9 }}>{r.errors.join('; ') || 'OK'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length > 120 && (
        <div style={{ padding: 8, fontSize: 12, opacity: 0.8 }}>
          Đang hiển thị 120/{rows.length} dòng đầu tiên. Toàn bộ {rows.length} dòng sẽ được xử lý khi xác nhận Commit.
        </div>
      )}
    </div>
  );
};

const ImportReportView: React.FC<{ report: ImportJobReport; onReset: () => void }> = ({
  report,
  onReset,
}) => {
  const handleDownloadCsv = async () => {
    const token = localStorage.getItem('expo_admin_token');
    const res = await fetch(v28Api.getErrorCsvUrl(report.jobId), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `import-errors-${report.jobId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h4 style={{ margin: 0, color: '#34d399' }}>
        ✅ Hoàn tất Import Excel (Mã phiên: {report.jobId})
      </h4>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
        <div className="dashboard-card" style={{ padding: 10 }}>
          <div>Tổng dòng</div>
          <strong>{report.totalRows}</strong>
        </div>
        <div className="dashboard-card" style={{ padding: 10 }}>
          <div>Tạo mới</div>
          <strong style={{ color: '#34d399' }}>{report.createdCount}</strong>
        </div>
        <div className="dashboard-card" style={{ padding: 10 }}>
          <div>Cập nhật</div>
          <strong style={{ color: '#38bdf8' }}>{report.updatedCount}</strong>
        </div>
        <div className="dashboard-card" style={{ padding: 10 }}>
          <div>Bỏ qua</div>
          <strong style={{ color: '#fbbf24' }}>{report.skippedCount}</strong>
        </div>
        <div className="dashboard-card" style={{ padding: 10 }}>
          <div>Thất bại</div>
          <strong style={{ color: '#f87171' }}>{report.failedCount}</strong>
        </div>
        <div className="dashboard-card" style={{ padding: 10 }}>
          <div>Thời gian</div>
          <strong>{report.durationMs} ms</strong>
        </div>
      </div>

      {report.errors.length > 0 && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <strong>Chi tiết lỗi / bỏ qua ({report.errors.length})</strong>
            <button type="button" className="btn btn-secondary" onClick={() => void handleDownloadCsv()}>
              ⬇️ Tải CSV lỗi
            </button>
          </div>
          <ul style={{ maxHeight: 180, overflow: 'auto', fontSize: 12, margin: 0, paddingLeft: 18 }}>
            {report.errors.map((e, idx) => (
              <li key={idx}>
                Dòng {e.rowNumber} {e.sku ? `(SKU: ${e.sku})` : ''}: {e.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <button type="button" className="btn btn-primary" onClick={onReset}>
          Import tệp khác
        </button>
      </div>
    </div>
  );
};

export const ExcelImportWizard: React.FC = () => {
  const [companies, setCompanies] = useState<V28Company[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [duplicateStrategy, setDuplicateStrategy] = useState<'skip' | 'update' | 'create'>('skip');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ExcelPreviewResponse | null>(null);
  const [report, setReport] = useState<ImportJobReport | null>(null);

  useEffect(() => {
    v28Api
      .listCompanies({ status: 'active' })
      .then((res) => {
        setCompanies(res.companies);
        if (res.companies[0]) setCompanyId(res.companies[0].id);
      })
      .catch((err) => setError((err as Error).message));
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Never auto-import on file select!
    setError(null);
    setPreview(null);
    setReport(null);
    const file = e.target.files?.[0] || null;
    if (file && file.size > MAX_BYTES) {
      setError('Tệp vượt quá giới hạn 5 MB.');
      setSelectedFile(null);
      return;
    }
    setSelectedFile(file);
  };

  const handleRunPreview = async () => {
    if (!companyId || !selectedFile) return;
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const arrayBuf = await selectedFile.arrayBuffer();
      const bytes = new Uint8Array(arrayBuf);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const fileBase64 = btoa(binary);
      const res = await v28Api.previewExcel({
        companyId,
        filename: selectedFile.name,
        fileBase64,
      });
      setPreview(res);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleCommit = async () => {
    if (!preview) return;
    setLoading(true);
    setError(null);
    try {
      const res = await v28Api.commitExcel({
        previewToken: preview.previewToken,
        duplicateStrategy,
      });
      setReport(res.report);
      setPreview(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="dashboard-card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <h3 style={{ margin: '0 0 4px' }}>Nhập sản phẩm từ Excel (.xlsx)</h3>
        <p style={{ margin: 0, fontSize: 13, opacity: 0.8 }}>
          Giới hạn tối đa 5 MB và 1.000 dòng/lần. Các cột chuẩn: <code>name, sku, price, currency, description, image_url, source_url</code>. Hệ thống luôn kiểm tra & xem trước (Preview) trước khi ghi dữ liệu.
        </p>
      </div>

      {error && <div style={{ color: '#f87171', fontWeight: 600 }}>{error}</div>}

      {!report && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <select
            value={companyId}
            onChange={(e) => {
              setCompanyId(e.target.value);
              setPreview(null);
            }}
          >
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input type="file" accept=".xlsx" onChange={handleFileChange} />
          <button
            type="button"
            className="btn btn-primary"
            disabled={loading || !selectedFile || !companyId}
            onClick={() => void handleRunPreview()}
          >
            {loading ? 'Đang kiểm tra...' : '1. Kiểm tra & Xem trước (Preview)'}
          </button>
        </div>
      )}

      {preview && !report && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 13 }}>
            <span>Tổng dòng: <strong>{preview.summary.totalRows}</strong></span>
            <span style={{ color: '#34d399' }}>Hợp lệ: <strong>{preview.summary.validCount}</strong></span>
            <span style={{ color: '#fbbf24' }}>Trùng DB: <strong>{preview.summary.duplicateInDbCount}</strong></span>
            <span style={{ color: '#fb923c' }}>Trùng trong file: <strong>{preview.summary.duplicateInFileCount}</strong></span>
            <span style={{ color: '#f87171' }}>Lỗi: <strong>{preview.summary.errorCount}</strong></span>
          </div>

          <ImportPreviewTable rows={preview.rows} />

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>Xử lý dòng trùng SKU trong DB:</span>
              <select
                value={duplicateStrategy}
                onChange={(e) => setDuplicateStrategy(e.target.value as 'skip' | 'update' | 'create')}
              >
                <option value="skip">Bỏ qua (Skip duplicate)</option>
                <option value="update">Cập nhật sản phẩm cũ (Update existing)</option>
                <option value="create">Tạo mới (từ chối nếu trùng unique SKU)</option>
              </select>
            </label>
            <button
              type="button"
              className="btn btn-primary"
              disabled={loading}
              onClick={() => void handleCommit()}
            >
              {loading ? 'Đang ghi dữ liệu...' : '2. Xác nhận ghi vào Database (Commit)'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={loading}
              onClick={() => setPreview(null)}
            >
              Hủy xem trước
            </button>
          </div>
        </div>
      )}

      {report && (
        <ImportReportView
          report={report}
          onReset={() => {
            setReport(null);
            setPreview(null);
            setSelectedFile(null);
          }}
        />
      )}
    </section>
  );
};
