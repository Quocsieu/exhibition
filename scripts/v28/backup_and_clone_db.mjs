/**
 * Consistent SQLite Backup & V28 Dev Database Cloner
 * Opens the original V27.5 SQLite DB in read-only mode, creates a consistent
 * snapshot via SQLite `VACUUM INTO`, records SHA-256 checksums & row counts,
 * and populates BE/data/expo_v28_dev.db without modifying BE/data/expo.db.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const srcPath = path.resolve(process.argv[2] || 'BE/data/expo.db');
const backupDir = path.resolve('BE/data/backups');
const v28Path = path.resolve(process.argv[3] || 'BE/data/expo_v28_dev.db');

if (!fs.existsSync(srcPath)) {
  console.error('Source database not found:', srcPath);
  process.exit(1);
}

fs.mkdirSync(backupDir, { recursive: true });
const ts = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = path.join(backupDir, `expo_pre_v28_${ts}.db`);

const sha256 = (filePath) =>
  crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');

const srcHashBefore = sha256(srcPath);
const db = new DatabaseSync(srcPath, { readOnly: true });

const counts = {
  booths: Number(db.prepare('SELECT COUNT(*) as c FROM booths').get().c),
  products: Number(db.prepare('SELECT COUNT(*) as c FROM products').get().c),
  booth_slot_assignments: Number(
    db.prepare('SELECT COUNT(*) as c FROM booth_slot_assignments').get().c
  ),
  user_version: Number(db.prepare('PRAGMA user_version').get().user_version),
  journal_mode: String(db.prepare('PRAGMA journal_mode').get().journal_mode),
};

const esc = (p) => p.replace(/'/g, "''");
db.exec(`VACUUM INTO '${esc(backupPath)}'`);
if (fs.existsSync(v28Path)) {
  fs.unlinkSync(v28Path);
}
db.exec(`VACUUM INTO '${esc(v28Path)}'`);
db.close();

const srcHashAfter = sha256(srcPath);
const report = {
  originalPath: srcPath,
  originalSha256Before: srcHashBefore,
  originalSha256After: srcHashAfter,
  originalUnchanged: srcHashBefore === srcHashAfter,
  counts,
  backupPath,
  backupSha256: sha256(backupPath),
  v28DevPath: v28Path,
  v28DevSha256: sha256(v28Path),
};
console.log(JSON.stringify(report, null, 2));
