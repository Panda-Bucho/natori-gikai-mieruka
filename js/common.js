/* 共通: データ読込・日付ユーティリティ・媒体定義 */

const PLATFORMS = {
  website: {
    label: "公式サイト",
    icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 12h18M12 3c-2.5 2.5-3.8 5.6-3.8 9s1.3 6.5 3.8 9c2.5-2.5 3.8-5.6 3.8-9S14.5 5.5 12 3z" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  },
  blog: {
    label: "ブログ",
    icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>',
  },
  x: {
    label: "X (旧Twitter)",
    icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
  },
  youtube: {
    label: "YouTube",
    icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.5 3.55 12 3.55 12 3.55s-7.5 0-9.38.5A3.02 3.02 0 0 0 .5 6.19C0 8.07 0 12 0 12s0 3.93.5 5.81a3.02 3.02 0 0 0 2.12 2.14c1.88.5 9.38.5 9.38.5s7.5 0 9.38-.5a3.02 3.02 0 0 0 2.12-2.14C24 15.93 24 12 24 12s0-3.93-.5-5.81zM9.55 15.57V8.43L15.82 12l-6.27 3.57z"/></svg>',
  },
  facebook: {
    label: "Facebook",
    icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>',
  },
  instagram: {
    label: "Instagram",
    icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98C.014 8.333 0 8.741 0 12s.014 3.668.072 4.948c.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.325 6.162 6.162 0 0 0 0-12.325zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg>',
  },
  tiktok: {
    label: "TikTok",
    icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>',
  },
};

/* 一覧のアイコン表示順 */
const PLATFORM_ORDER = ["website", "blog", "x", "youtube", "facebook", "instagram", "tiktok"];

async function fetchJson(path) {
  const res = await fetch(path, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

/* members.json は必須、posts.json は未生成でも動くようにする */
async function loadData() {
  const members = await fetchJson("data/members.json");
  let posts = { generatedAt: null, members: {}, errors: [] };
  try {
    posts = await fetchJson("data/posts.json");
  } catch (e) {
    console.warn("posts.json を読み込めませんでした(未生成の可能性)", e);
  }
  return { members, posts };
}

function parseDate(s) {
  // "YYYY-MM-DD" → Date(ローカルタイム0時)。表示・差分計算用
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function daysAgo(dateStr) {
  const d = parseDate(dateStr);
  if (!d) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today - d) / 86400000);
}

function formatDateJa(dateStr) {
  const d = parseDate(dateStr);
  if (!d) return "";
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

/* 鮮度に応じたCSSクラス */
function freshnessClass(dateStr) {
  const days = daysAgo(dateStr);
  if (days === null) return "fresh-none";
  if (days <= 7) return "fresh-7";
  if (days <= 30) return "fresh-30";
  if (days <= 90) return "fresh-90";
  return "fresh-old";
}

/* 市議会議員の任期(選挙は4年周期。前回投票: 2024-01-21) */
const TERM_START = "2024-02";
const ELECTION_MONTHS = { "2020-01": "市議選", "2024-01": "市議選", "2028-01": "市議選" };

/* 任期満了(任期開始2024-02-01+4年) */
const TERM_END_DATE = "2028-01-31";

/* dateStr までの残りを「約N年Mか月」で返す(過ぎていれば null) */
function humanizeUntil(dateStr) {
  const days = -daysAgo(dateStr);
  if (days == null || days < 0) return null;
  const months = Math.round(days / 30.44);
  if (months < 1) return `あと約${days}日`;
  if (months < 12) return `あと約${months}か月`;
  const y = Math.floor(months / 12);
  const m = months % 12;
  return m ? `あと約${y}年${m}か月` : `あと約${y}年`;
}

/* "YYYY-MM" 形式の月キー */
function monthKey(year, month) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/* startKey〜endKey("YYYY-MM")の月キー配列(両端含む、古い順) */
function monthKeysBetween(startKey, endKey) {
  const [sy, sm] = startKey.split("-").map(Number);
  const [ey, em] = endKey.split("-").map(Number);
  const keys = [];
  for (let y = sy, m = sm; y < ey || (y === ey && m <= em); m === 12 ? (y++, m = 1) : m++) {
    keys.push(monthKey(y, m));
  }
  return keys;
}

/* 先月の月キー */
function prevMonthKey(base) {
  const d = base || new Date();
  const y = d.getMonth() === 0 ? d.getFullYear() - 1 : d.getFullYear();
  const m = d.getMonth() === 0 ? 12 : d.getMonth();
  return monthKey(y, m);
}

/* 直近nか月の月キー配列(古い順、当月含む) */
function recentMonthKeys(n, base) {
  const d = base || new Date();
  const keys = [];
  for (let i = n - 1; i >= 0; i--) {
    const dt = new Date(d.getFullYear(), d.getMonth() - i, 1);
    keys.push(monthKey(dt.getFullYear(), dt.getMonth() + 1));
  }
  return keys;
}

/* 議員ごとの月別発信回数 {monthKey: count} */
function countByMonth(posts) {
  const counts = {};
  for (const p of posts || []) {
    const key = p.date.slice(0, 7);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

/* 得票数を「整数部 + 小さな小数部」のHTMLで返す(端数は丸めず保持) */
function formatVotesHtml(v) {
  if (v == null) return "—";
  const s = v.toLocaleString("ja-JP", { maximumFractionDigits: 3 });
  const dot = s.indexOf(".");
  return dot < 0 ? s : `${s.slice(0, dot)}<span class="frac">${s.slice(dot)}</span>`;
}

/* 得票率を「整数部 + 小さな小数部 + %」のHTMLで返す */
function formatShareHtml(v) {
  if (v == null) return "—";
  const s = v.toFixed(2);
  const dot = s.indexOf(".");
  return `${s.slice(0, dot)}<span class="frac">${s.slice(dot)}</span>%`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

/* フッターにデータ取得日時を表示 */
function renderGeneratedAt(posts) {
  const el = document.getElementById("generated-at");
  if (!el) return;
  if (posts.generatedAt) {
    const d = new Date(posts.generatedAt);
    el.textContent = `データ最終取得: ${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } else {
    el.textContent = "データ未取得(自動更新の初回実行前です)";
  }
}
