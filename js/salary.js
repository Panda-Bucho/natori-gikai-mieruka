/* 議員報酬ページ: 人口(対数)×報酬月額(線形)の散布図+べき乗近似線+グループ・報酬種別切替 */

const NATORI_CODE = "04207";
const TOHOKU_PREFS = new Set(["青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県"]);

const SL_GROUPS = [
  { id: "miyagi", label: "宮城県(市町村)", filter: (m) => m.pref === "宮城県" },
  { id: "tohoku", label: "東北6県(市町村)", filter: (m) => TOHOKU_PREFS.has(m.pref) },
  { id: "zenkoku", label: "全国", filter: () => true },
  { id: "cities", label: "全国の市のみ", filter: (m) => m.type === "市" },
  { id: "bracket", label: "人口段階が同じ市", filter: null }, // DOMContentLoaded内で確定
];

const SL_TYPES = [
  { id: "giin", label: "議員" },
  { id: "fuku", label: "副議長" },
  { id: "gicho", label: "議長" },
];

let slAll = [];
let slChart = null;

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const data = await fetchJson("data/salary.json");
    slAll = data.municipalities;
    const bracketLabels = data.bracketLabels || {};

    const natori = slAll.find((m) => m.code === NATORI_CODE);
    const bracketGroup = SL_GROUPS.find((g) => g.id === "bracket");
    bracketGroup.filter = (m) => m.type === "市" && m.bracket === natori.bracket;
    bracketGroup.label = `人口段階が同じ市(${bracketLabels[natori.bracket] || natori.bracket})`;

    const groupSel = document.getElementById("sl-group");
    groupSel.innerHTML = SL_GROUPS.map((g) => `<option value="${g.id}">${escapeHtml(g.label)}</option>`).join("");
    groupSel.value = "bracket";

    const typeSel = document.getElementById("sl-type");
    typeSel.innerHTML = SL_TYPES.map((t) => `<option value="${t.id}">${escapeHtml(t.label)}</option>`).join("");
    typeSel.value = "giin";

    const rerender = () => renderGroup(groupSel.value, typeSel.value);
    groupSel.addEventListener("change", rerender);
    typeSel.addEventListener("change", rerender);
    rerender();

    const gen = document.getElementById("generated-at");
    if (gen) {
      gen.textContent = "データ基準日: 人口 2025/10/01(国勢調査速報値)・報酬 市区 2025/12/31・町村 2025/07/01";
    }
  } catch (e) {
    document.getElementById("sl-stats").innerHTML = `<p>データの読み込みに失敗しました: ${escapeHtml(e.message)}</p>`;
  }
});

function median(sorted) {
  const n = sorted.length;
  return n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
}

function fmtPop(v) {
  if (v >= 1e8) return `${v / 1e8}億`;
  if (v >= 1e4) return `${v / 1e4}万`;
  if (v >= 1e3) return `${v / 1e3}千`;
  return String(v);
}

function fmtYen(v) {
  return v == null ? "—" : `${Math.round(v).toLocaleString("ja-JP")}円`;
}

function renderGroup(groupId, typeId) {
  const group = SL_GROUPS.find((g) => g.id === groupId);
  const type = SL_TYPES.find((t) => t.id === typeId);
  const rows = slAll.filter((m) => group.filter(m) && m[type.id] != null);
  const natori = slAll.find((m) => m.code === NATORI_CODE);
  const values = rows.map((m) => m[type.id]).sort((a, b) => a - b);
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const med = median(values);
  const rank = rows.filter((m) => m[type.id] > natori[type.id]).length + 1; // 高い方から

  // べき乗回帰: log10空間で最小二乗(regressionLine は common.js)
  const logPts = rows.map((m) => [Math.log10(m.pop), Math.log10(m[type.id])]);
  const pops = rows.map((m) => m.pop);
  const xMin = Math.min(...pops) * 0.8;
  const xMax = Math.max(...pops) * 1.3;
  const fit = regressionLine(logPts, Math.log10(xMin), Math.log10(xMax));
  const coefA = fit ? Math.pow(10, fit.intercept) : null;
  const expected = fit ? coefA * Math.pow(natori.pop, fit.slope) : null;

  renderStats(group, type, rows, natori, mean, med, rank, expected, fit);
  renderChart(rows, natori, type, mean, med, fit, xMin, xMax, coefA);
  const info = document.getElementById("sl-group-info");
  if (info) info.textContent = `${rows.length}団体`;
}

function renderStats(group, type, rows, natori, mean, med, rank, expected, fit) {
  const el = document.getElementById("sl-stats");
  const item = (label, value, sub) =>
    `<div class="cc-stat"><span class="cc-stat-label">${label}</span><span class="cc-stat-value">${value}</span>${sub ? `<span class="cc-stat-sub">${sub}</span>` : ""}</div>`;
  el.innerHTML =
    item(`名取市の${escapeHtml(type.label)}報酬`, fmtYen(natori[type.id]), `人口${natori.pop.toLocaleString("ja-JP")}人`) +
    item(`${escapeHtml(group.label)}の平均値`, fmtYen(mean), `${rows.length}団体の単純平均`) +
    item(`${escapeHtml(group.label)}の中央値`, fmtYen(med), "") +
    item("名取市の順位", `${rank}<small>位 / ${rows.length}団体</small>`, "報酬が高い順") +
    (fit
      ? item("同規模での近似線の値", fmtYen(expected), `名取市の人口での近似線上の値(R²=${fit.r2.toFixed(2)})`)
      : "");
}

function renderChart(rows, natori, type, mean, med, fit, xMin, xMax, coefA) {
  if (typeof Chart === "undefined") return;
  const ink = "#67766f";
  const gridColor = "#dde5e1";

  const normal = rows.filter((m) => m.code !== NATORI_CODE).map((m) => ({ x: m.pop, y: m[type.id], m }));
  const natoriPt = natori[type.id] != null ? [{ x: natori.pop, y: natori[type.id], m: natori }] : [];

  const vals = rows.map((m) => m[type.id]);
  const yMin = Math.min(...vals) * 0.9;
  const yMax = Math.max(...vals) * 1.1;

  // べき乗曲線(横軸対数×縦軸線形では直線にならない)を対数等間隔60点でサンプリング
  const lineData = fit
    ? Array.from({ length: 61 }, (_, i) => {
        const x = Math.pow(10, Math.log10(xMin) + (i / 60) * (Math.log10(xMax) - Math.log10(xMin)));
        return { x, y: coefA * Math.pow(x, fit.slope) };
      })
    : [];
  const hline = (v) => [
    { x: xMin, y: v },
    { x: xMax, y: v },
  ];

  // 近似線の脇に数式とR²(対数空間での当てはまり)
  const regLabelPlugin = {
    id: "slRegLabel",
    afterDatasetsDraw(chart) {
      if (!fit) return;
      const ctx = chart.ctx;
      const area = chart.chartArea;
      ctx.font = "11px 'Hiragino Kaku Gothic ProN', Meiryo, sans-serif";
      ctx.fillStyle = "#d85a30";
      const lines = [`y = ${sig3(coefA)}·x^${fit.slope.toFixed(2).replace("-", "−")}`, `R² = ${fit.r2.toFixed(2)}(対数空間)`];
      const w = Math.max(...lines.map((s) => ctx.measureText(s).width));
      const x = Math.min(area.right - w - 6, area.left + (area.right - area.left) * 0.58);
      lines.forEach((s, i) => ctx.fillText(s, x, area.top + 16 + i * 14));
    },
  };

  if (slChart) slChart.destroy();
  slChart = new Chart(document.getElementById("sl-chart"), {
    type: "scatter",
    data: {
      datasets: [
        { data: natoriPt, backgroundColor: "#d85a30", pointRadius: 7, pointStyle: "circle" },
        { data: normal, backgroundColor: "rgba(26, 115, 91, 0.55)", pointRadius: 4, pointStyle: "circle" },
        { type: "line", data: lineData, borderColor: "rgba(216, 90, 48, 0.8)", borderWidth: 1.5, borderDash: [6, 4], pointRadius: 0, pointHitRadius: 0, pointHoverRadius: 0 },
        { type: "line", data: hline(mean), borderColor: "rgba(58, 110, 165, 0.8)", borderWidth: 1.2, borderDash: [2, 3], pointRadius: 0, pointHitRadius: 0, pointHoverRadius: 0 },
        { type: "line", data: hline(med), borderColor: "rgba(122, 84, 158, 0.8)", borderWidth: 1.2, borderDash: [8, 4], pointRadius: 0, pointHitRadius: 0, pointHoverRadius: 0 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { right: 20 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (c) => {
              const m = c.raw.m;
              if (!m) return "";
              return `${m.name}(${m.pref}): 人口${m.pop.toLocaleString("ja-JP")}人・${type.label}報酬${fmtYen(m[type.id])}`;
            },
          },
        },
      },
      scales: {
        x: {
          type: "logarithmic",
          min: xMin,
          max: xMax,
          title: { display: true, text: "人口(対数目盛)", color: ink },
          ticks: {
            color: ink,
            callback: (v) => {
              const l = Math.log10(v);
              return Number.isInteger(l) || Number.isInteger(l - Math.log10(2)) || Number.isInteger(l - Math.log10(5)) ? fmtPop(v) : null;
            },
          },
          grid: { color: gridColor },
        },
        y: {
          min: yMin,
          max: yMax,
          title: { display: true, text: `${type.label}報酬月額(円)`, color: ink },
          ticks: { color: ink, callback: (v) => `${(v / 10000).toFixed(0)}万` },
          grid: { color: gridColor },
        },
      },
    },
    plugins: [regLabelPlugin],
  });
}
