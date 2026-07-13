/* 議員定数ページ: 人口1000人あたり議員数の散布図(両対数)+べき乗近似線+グループ統計 */

const NATORI_CODE = "04207";
const TOHOKU_PREFS = new Set(["青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県"]);

const CC_GROUPS = [
  { id: "miyagi", label: "宮城県(市町村)", filter: (m) => m.pref === "宮城県" },
  { id: "tohoku", label: "東北6県(市町村)", filter: (m) => TOHOKU_PREFS.has(m.pref) },
  { id: "zenkoku", label: "全国", filter: () => true },
  { id: "cities", label: "全国の市のみ", filter: (m) => m.type === "市" },
  { id: "bracket", label: "人口段階が同じ市", filter: null }, // DOMContentLoaded内で確定
];

let ccAll = [];
let ccChart = null;

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const data = await fetchJson("data/council.json");
    ccAll = data.municipalities.map((m) => ({ ...m, per1000: (m.seats / m.pop) * 1000 }));
    const bracketLabels = data.bracketLabels || {};

    const natori = ccAll.find((m) => m.code === NATORI_CODE);
    const bracketGroup = CC_GROUPS.find((g) => g.id === "bracket");
    bracketGroup.filter = (m) => m.type === "市" && m.bracket === natori.bracket;
    bracketGroup.label = `人口段階が同じ市(${bracketLabels[natori.bracket] || natori.bracket})`;

    const sel = document.getElementById("cc-group");
    sel.innerHTML = CC_GROUPS.map((g) => `<option value="${g.id}">${escapeHtml(g.label)}</option>`).join("");
    sel.value = "bracket"; // 既定は最も比較妥当性の高い同規模グループ
    sel.addEventListener("change", () => renderGroup(sel.value));
    renderGroup(sel.value);
    const gen = document.getElementById("generated-at");
    if (gen) {
      gen.textContent = "データ基準日: 人口 2025/10/01(国勢調査速報値)・定数 市区 2025/12/31・町村 2025/07/01";
    }
  } catch (e) {
    document.getElementById("cc-stats").innerHTML = `<p>データの読み込みに失敗しました: ${escapeHtml(e.message)}</p>`;
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

function renderGroup(groupId) {
  const group = CC_GROUPS.find((g) => g.id === groupId);
  const rows = ccAll.filter(group.filter);
  const natori = ccAll.find((m) => m.code === NATORI_CODE);
  const values = rows.map((m) => m.per1000).sort((a, b) => a - b);
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const med = median(values);
  const rank = rows.filter((m) => m.per1000 > natori.per1000).length + 1; // 多い方から

  // べき乗回帰: log10空間で最小二乗(regressionLine は common.js)
  const logPts = rows.map((m) => [Math.log10(m.pop), Math.log10(m.per1000)]);
  const pops = rows.map((m) => m.pop);
  const xMin = Math.min(...pops) * 0.8;
  const xMax = Math.max(...pops) * 1.3;
  const fit = regressionLine(logPts, Math.log10(xMin), Math.log10(xMax));
  const coefA = fit ? Math.pow(10, fit.intercept) : null;
  const expected = fit ? coefA * Math.pow(natori.pop, fit.slope) : null;

  renderStats(group, rows, natori, mean, med, rank, expected, fit);
  renderChart(rows, natori, mean, med, fit, xMin, xMax, coefA);
  const info = document.getElementById("cc-group-info");
  if (info) info.textContent = `${rows.length}団体`;
}

function renderStats(group, rows, natori, mean, med, rank, expected, fit) {
  const el = document.getElementById("cc-stats");
  const item = (label, value, sub) =>
    `<div class="cc-stat"><span class="cc-stat-label">${label}</span><span class="cc-stat-value">${value}</span>${sub ? `<span class="cc-stat-sub">${sub}</span>` : ""}</div>`;
  el.innerHTML =
    item("名取市", `${natori.per1000.toFixed(3)}<small>人/千人</small>`, `定数${natori.seats}・人口${natori.pop.toLocaleString("ja-JP")}人`) +
    item(`${escapeHtml(group.label)}の平均値`, `${mean.toFixed(3)}<small>人/千人</small>`, `${rows.length}団体の単純平均`) +
    item(`${escapeHtml(group.label)}の中央値`, `${med.toFixed(3)}<small>人/千人</small>`, "") +
    item("名取市の順位", `${rank}<small>位 / ${rows.length}団体</small>`, "1000人あたり議員数が多い順") +
    (expected
      ? item("同規模での近似線の値", `${expected.toFixed(3)}<small>人/千人</small>`, `名取市の人口での近似線上の値(R²=${fit.r2.toFixed(2)})`)
      : "");
}

function renderChart(rows, natori, mean, med, fit, xMin, xMax, coefA) {
  if (typeof Chart === "undefined") return;
  const ink = "#67766f";
  const gridColor = "#dde5e1";
  const labeled = pickLabeled(rows, natori);

  const normal = rows
    .filter((m) => m.code !== NATORI_CODE)
    .map((m) => ({ x: m.pop, y: m.per1000, m, label: labeled.has(m.code) }));
  const natoriPt = [{ x: natori.pop, y: natori.per1000, m: natori, label: true }];

  const perVals = rows.map((m) => m.per1000);
  const yMin = Math.min(...perVals) * 0.7;
  const yMax = Math.max(...perVals) * 1.5;

  const lineData = fit
    ? [
        { x: xMin, y: coefA * Math.pow(xMin, fit.slope) },
        { x: xMax, y: coefA * Math.pow(xMax, fit.slope) },
      ]
    : [];
  const hline = (v) => [
    { x: xMin, y: v },
    { x: xMax, y: v },
  ];

  // 点の右横に自治体名を表示(label:true の点のみ。重なりは上下にずらす)
  const ccLabelPlugin = {
    id: "ccLabels",
    afterDatasetsDraw(chart) {
      const ctx = chart.ctx;
      ctx.font = "11px 'Hiragino Kaku Gothic ProN', Meiryo, sans-serif";
      const pts = [];
      chart.data.datasets.forEach((ds, di) => {
        if (!ds.ccPoints) return;
        chart.getDatasetMeta(di).data.forEach((pt, i) => {
          const d = ds.data[i];
          if (d && d.label) pts.push({ x: pt.x, y: pt.y, name: d.m.name, natori: d.m.code === NATORI_CODE });
        });
      });
      pts.sort((a, b) => a.x - b.x || a.y - b.y);
      const placed = [];
      for (const p of pts) {
        const w = ctx.measureText(p.name).width;
        let dy = 4;
        for (const cand of [4, -10, 16, -22, 28]) {
          const box = { x1: p.x + 7, x2: p.x + 9 + w, y1: p.y + cand - 11, y2: p.y + cand + 2 };
          const hit = placed.some((b) => box.x1 < b.x2 && box.x2 > b.x1 && box.y1 < b.y2 && box.y2 > b.y1);
          dy = cand;
          if (!hit) break;
        }
        placed.push({ x1: p.x + 7, x2: p.x + 9 + w, y1: p.y + dy - 11, y2: p.y + dy + 2 });
        ctx.fillStyle = p.natori ? "#b23c14" : "#22302c";
        ctx.fillText(p.name, p.x + 7, p.y + dy);
      }
    },
  };

  // 近似線の脇に数式とR²(対数軸上では直線)
  const regLabelPlugin = {
    id: "ccRegLabel",
    afterDatasetsDraw(chart) {
      if (!fit) return;
      const ctx = chart.ctx;
      const area = chart.chartArea;
      ctx.font = "11px 'Hiragino Kaku Gothic ProN', Meiryo, sans-serif";
      ctx.fillStyle = "#d85a30";
      const lines = [`y = ${sig3(coefA)}·x^${fit.slope.toFixed(2).replace("-", "−")}`, `R² = ${fit.r2.toFixed(2)}(対数空間)`];
      const w = Math.max(...lines.map((s) => ctx.measureText(s).width));
      const x = Math.min(area.right - w - 6, area.left + (area.right - area.left) * 0.66);
      lines.forEach((s, i) => ctx.fillText(s, x, area.top + 16 + i * 14));
    },
  };

  if (ccChart) ccChart.destroy();
  ccChart = new Chart(document.getElementById("cc-chart"), {
    type: "scatter",
    data: {
      datasets: [
        { data: natoriPt, ccPoints: true, backgroundColor: "#d85a30", pointRadius: 7, pointStyle: "circle" },
        { data: normal, ccPoints: true, backgroundColor: "rgba(26, 115, 91, 0.55)", pointRadius: 4, pointStyle: "circle" },
        { type: "line", data: lineData, borderColor: "rgba(216, 90, 48, 0.8)", borderWidth: 1.5, borderDash: [6, 4], pointRadius: 0, pointHitRadius: 0, pointHoverRadius: 0 },
        { type: "line", data: hline(mean), borderColor: "rgba(58, 110, 165, 0.8)", borderWidth: 1.2, borderDash: [2, 3], pointRadius: 0, pointHitRadius: 0, pointHoverRadius: 0 },
        { type: "line", data: hline(med), borderColor: "rgba(122, 84, 158, 0.8)", borderWidth: 1.2, borderDash: [8, 4], pointRadius: 0, pointHitRadius: 0, pointHoverRadius: 0 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { right: 80 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (c) => {
              const m = c.raw.m;
              if (!m) return "";
              return `${m.name}(${m.pref}): 人口${m.pop.toLocaleString("ja-JP")}人・定数${m.seats}・${m.per1000.toFixed(2)}人/千人`;
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
          type: "logarithmic",
          min: yMin,
          max: yMax,
          title: { display: true, text: "人口1000人あたり議員数(対数目盛)", color: ink },
          ticks: { color: ink, callback: (v) => (String(v).length <= 4 ? String(v) : null) },
          grid: { color: gridColor },
        },
      },
    },
    plugins: [ccLabelPlugin, regLabelPlugin],
  });
}

/* ラベルを付ける自治体: グループ≤40は全点、それ以上は名取市+参照点のみ */
function pickLabeled(rows, natori) {
  const set = new Set([natori.code]);
  if (rows.length <= 40) {
    rows.forEach((m) => set.add(m.code));
    return set;
  }
  const sendai = rows.find((m) => m.code === "04100");
  if (sendai) set.add(sendai.code);
  const by = (fn) => rows.reduce((a, b) => (fn(a) >= fn(b) ? a : b));
  set.add(by((m) => m.pop).code); // 人口最大
  set.add(by((m) => -m.pop).code); // 人口最小
  set.add(by((m) => m.per1000).code); // 1000人あたり最多
  set.add(by((m) => -m.per1000).code); // 1000人あたり最少
  return set;
}
