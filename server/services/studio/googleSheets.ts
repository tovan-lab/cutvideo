import { createSign } from 'crypto';
import * as fs from 'fs';
import { fetchWithTimeout } from './utils';

/**
 * Ghi/đọc Google Sheet bằng service account (không cần thư viện googleapis).
 *
 * Cấu hình trong .env:
 *   STUDIO_SHEET_ID                 ID của Sheet (đoạn giữa /d/ và /edit)
 *   STUDIO_SHEET_TAB                tên tab, mặc định "content_pipeline"
 *   GOOGLE_SERVICE_ACCOUNT_FILE     đường dẫn file JSON key của service account
 *   hoặc GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_PRIVATE_KEY
 * Sheet phải được chia sẻ quyền Editor cho email của service account.
 */

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

// Giới hạn của Google Sheets cho một ô.
const CELL_LIMIT = 50000;

let cachedToken: { token: string; expiresAt: number } | null = null;

function loadServiceAccount(): ServiceAccount | null {
  const file = process.env.GOOGLE_SERVICE_ACCOUNT_FILE;
  if (file) {
    const json = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { client_email: json.client_email, private_key: json.private_key };
  }
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY;
  if (email && key) return { client_email: email, private_key: key.replace(/\\n/g, '\n') };
  return null;
}

export function sheetsStatus(): { configured: boolean; reason?: string } {
  if (!process.env.STUDIO_SHEET_ID) return { configured: false, reason: 'Thiếu STUDIO_SHEET_ID' };
  try {
    if (!loadServiceAccount()) return { configured: false, reason: 'Thiếu thông tin service account' };
  } catch (err: any) {
    return { configured: false, reason: `Không đọc được file service account: ${err.message}` };
  }
  return { configured: true };
}

const base64url = (input: string | Buffer) => Buffer.from(input).toString('base64url');

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60000) return cachedToken.token;
  const sa = loadServiceAccount();
  if (!sa) throw new Error('Chưa cấu hình service account Google');

  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/spreadsheets',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })
  );
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  const assertion = `${header}.${claims}.${signer.sign(sa.private_key, 'base64url')}`;

  const res = await fetchWithTimeout('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Google OAuth lỗi: ${data.error_description || data.error || res.status}`);
  cachedToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cachedToken.token;
}

function sheetUrl(range: string, suffix = ''): string {
  const id = process.env.STUDIO_SHEET_ID;
  return `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(range)}${suffix}`;
}

function tabName(): string {
  return process.env.STUDIO_SHEET_TAB || 'content_pipeline';
}

async function sheetsRequest(url: string, init: RequestInit = {}): Promise<any> {
  const token = await getAccessToken();
  const res = await fetchWithTimeout(url, {
    ...init,
    headers: { ...(init.headers || {}), Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Google Sheets lỗi ${res.status}: ${data?.error?.message || ''}`.trim());
  return data;
}

/** "Research Data" → "research_data", để tiêu đề cột viết kiểu nào cũng khớp. */
export function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

/**
 * Đọc toàn bộ bảng. `headers` giữ nguyên chữ trong Sheet; `keys` và khóa của mỗi dòng
 * là tên cột đã chuẩn hóa.
 */
export async function readRows(): Promise<{ headers: string[]; keys: string[]; rows: Record<string, string>[] }> {
  const data = await sheetsRequest(sheetUrl(`${tabName()}!A1:Z`));
  const [headers = [], ...values]: string[][] = data.values || [];
  const keys = headers.map(normalizeHeader);
  const rows = values.map((row) => Object.fromEntries(keys.map((k, i) => [k, row[i] ?? ''])));
  return { headers, keys, rows };
}

/** Thêm một dòng, sắp giá trị theo đúng thứ tự tiêu đề cột hiện có trong Sheet. */
export async function appendRow(headers: string[], record: Record<string, string>): Promise<void> {
  if (!headers.length) throw new Error(`Tab "${tabName()}" chưa có dòng tiêu đề cột`);
  const row = headers.map((h) => (record[normalizeHeader(h)] ?? '').slice(0, CELL_LIMIT));
  await sheetsRequest(sheetUrl(`${tabName()}!A1`, ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS'), {
    method: 'POST',
    body: JSON.stringify({ values: [row] }),
  });
}
