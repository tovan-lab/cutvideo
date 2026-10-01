import { fetchWithTimeout, vnIsoDate } from './utils';

export interface UsdRate {
  date: string;
  buyCash: number;
  buyTransfer: number;
  sell: number;
}

export interface UsdRateComparison {
  today: UsdRate;
  previous: UsdRate | null;
  source: string;
}

const VCB_SOURCE = 'https://www.vietcombank.com.vn/vi-VN/KHCN/Cong-cu-Tien-ich/Ty-gia';

async function fetchVcbUsd(date: string): Promise<UsdRate | null> {
  const res = await fetchWithTimeout(`https://www.vietcombank.com.vn/api/exchangerates?date=${date}`, {}, 15000);
  if (!res.ok) return null;
  const data = await res.json();
  const usd = (data?.Data || []).find((d: any) => d.currencyCode === 'USD');
  if (!usd) return null;
  return {
    date,
    buyCash: Number(usd.cash),
    buyTransfer: Number(usd.transfer),
    sell: Number(usd.sell),
  };
}

/** Tỷ giá USD Vietcombank hôm nay và ngày liền trước có dữ liệu (tối đa lùi 4 ngày). */
export async function getVcbUsdComparison(): Promise<UsdRateComparison> {
  const now = new Date();
  const today = await fetchVcbUsd(vnIsoDate(now));
  if (!today) throw new Error('Không đọc được tỷ giá USD từ Vietcombank');

  let previous: UsdRate | null = null;
  for (let back = 1; back <= 4 && !previous; back++) {
    previous = await fetchVcbUsd(vnIsoDate(new Date(now.getTime() - back * 86400000)));
  }
  return { today, previous, source: VCB_SOURCE };
}

export function formatUsdComparison(c: UsdRateComparison): string {
  const fmt = (n: number) => n.toLocaleString('vi-VN');
  const diff = c.previous ? c.today.sell - c.previous.sell : null;
  return [
    `Tỷ giá USD Vietcombank ngày ${c.today.date} (nguồn chính thức: ${c.source}):`,
    `- Mua tiền mặt: ${fmt(c.today.buyCash)} đ; mua chuyển khoản: ${fmt(c.today.buyTransfer)} đ; bán ra: ${fmt(c.today.sell)} đ`,
    c.previous
      ? `- Giá bán ra phiên trước (${c.previous.date}): ${fmt(c.previous.sell)} đ → thay đổi ${diff! > 0 ? '+' : ''}${fmt(diff!)} đ`
      : '- Không tìm được giá phiên trước để so sánh.',
  ].join('\n');
}
