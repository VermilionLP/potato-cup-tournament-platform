import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// Battle.net region/subregion -> server label, mirroring the API mapping.
const REGION_LABELS = { 1: '美服', 2: '欧服', 3: '亚服', 5: '国服', 6: '东南亚', 98: '—' };
const SUBREGION_LABELS = { '1/2': '拉美', '2/2': '俄服', '3/2': '台服' };

export function regionLabelFromUrl(input) {
  if (!input || typeof input !== 'string') return '';
  const m = input.match(/(\d+)\/(\d+)\/\d+/);
  if (!m) return '';
  const r = parseInt(m[1], 10);
  const s = parseInt(m[2], 10);
  return SUBREGION_LABELS[`${r}/${s}`] || REGION_LABELS[r] || '';
}

export function accountRegionLabel(entry) {
  if (!entry) return '';
  if (entry.regionLabel) return entry.regionLabel;
  return regionLabelFromUrl(entry.url || entry.toon_handle || entry.account_key || '');
}

// Stable account key (region/subregion/toon) from a bnet_ids entry or url.
export function accountKey(entry) {
  if (!entry) return '';
  const s = String(
    typeof entry === 'string' ? entry : entry.url || entry.toon_handle || entry.account_key || '',
  ).toLowerCase();
  const m = s.match(/profile\/(\d+)\/(\d+)\/(\d+)/);
  if (m) return `${m[1]}/${m[2]}/${m[3]}`;
  const k = s.match(/^(\d+)\/(\d+)\/(\d+)$/);
  if (k) return `${k[1]}/${k[2]}/${k[3]}`;
  const h = s.match(/^(\d+)-[^-]+-(\d+)-(\d+)$/);
  if (h) return `${h[1]}/${h[2]}/${h[3]}`;
  return '';
}

