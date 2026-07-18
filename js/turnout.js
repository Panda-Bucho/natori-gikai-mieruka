/* 投票率ページ: 人口(対数)×投票率の散布図+べき乗近似線、気象×投票率の軸切替散布図+層別カード、出典表 */

const NATORI_CODE = "04207";

const TN_GROUPS = [
  { id: "tohoku", label: "東北6県(市町村)", filter: () => true },
  { id: "tohoku-cities", label: "東北6県の市のみ", filter: (m) => m.type === "市" },
  { id: "miyagi", label: "宮城県(市町村)", filter: (m) => m.pref === "宮城県" },
  { id: "cities", label: "宮城県の市のみ", filter: (m) => m.pref === "宮城県" && m.type === "市" },
];

const TN_AXES = [
  { id: "precip", label: "当日降水量", unit: "mm", get: (m) => m.weather.precip },
  { id: "tempAvg", label: "当日平均気温", unit: "℃", get: (m) => m.weather.tempAvg },
];

let tnAll = [];
let tnChart = null;
let tnWeatherChart = null;

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const data = await fetchJson("data/turnout.json");
    tnAll = data.municipalities;

    const groupSel = document.getElementById("tn-group");
    groupSel.innerHTML = TN_GROUPS.map((g) => `<option value="${g.id}">${escapeHtml(g.label)}</option>`).join("");
    groupSel.value = "tohoku";
    groupSel.addEventListener("change", () => renderGroup(groupSel.value));
    renderGroup(groupSel.value);

    const axisSel = document.getElementById("tn-axis");
    axisSel.innerHTML = TN_AXES.map((a) => `<option value="${a.id}">${escapeHtml(a.label)}</option>`).join("");
    axisSel.value = "precip";
    axisSel.addEventListener("change", () => renderWeather(axisSel.value));
    renderWeather(axisSel.value);

    initTableSort();
    renderTable();

    const gen = document.getElementById("generated-at");
    if (gen) {
      gen.textContent = "データ基準日: 各自治体の直近の議員一般選挙(2020年11月〜2026年6月執行)";
    }
  } catch (e) {
    document.getElementById("tn-stats").innerHTML = `<p>データの読み込みに失敗しました: ${escapeHtml(e.message)}</p>`;
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

function fmtPct(v) {
  return v == null ? "—" : `${v.toFixed(2)}%`;
}

/* ---------- カード1: 人口×投票率 ---------- */

function renderGroup(groupId) {
  const group = TN_GROUPS.find((g) => g.id === groupId);
  const rows = tnAll.filter((m) => group.filter(m) && m.turnout != null);
  const natori = tnAll.find((m) => m.code === NATORI_CODE);
  const values = rows.map((m) => m.turnout).sort((a, b) => a - b);
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const med = median(values);
  const rank = rows.filter((m) => m.turnout > natori.turnout).length + 1; // 高い方から

  // べき乗回帰: log10空間で最小二乗(regressionLine は common.js)
  const logPts = rows.map((m) => [Math.log10(m.pop), Math.log10(m.turnout)]);
  const pops = rows.map((m) => m.pop);
  const xMin = Math.min(...pops) * 0.8;
  const xMax = Math.max(...pops) * 1.3;
  const fit = regressionLine(logPts, Math.log10(xMin), Math.log10(xMax));
  const coefA = fit ? Math.pow(10, fit.intercept) : null;
  const expected = fit ? coefA * Math.pow(natori.pop, fit.slope) : null;

  renderStats(group, rows, natori, mean, med, rank, expected, fit);
  renderChart(rows, natori, mean, med, fit, xMin, xMax, coefA);
  const info = document.getElementById("tn-group-info");
  if (info) info.textContent = `${rows.length}団体(無投票を除く)`;
}

function renderStats(group, rows, natori, mean, med, rank, expected, fit) {
  const el = document.getElementById("tn-stats");
  const item = (label, value, sub) =>
    `<div class="cc-stat"><span class="cc-stat-label">${label}</span><span class="cc-stat-value">${value}</span>${sub ? `<span class="cc-stat-sub">${sub}</span>` : ""}</div>`;
  el.innerHTML =
    item("名取市の投票率", fmtPct(natori.turnout), `人口${natori.pop.toLocaleString("ja-JP")}人・${escapeHtml(natori.date)}執行`) +
    item(`${escapeHtml(group.label)}の平均値`, fmtPct(mean), `${rows.length}団体の単純平均`) +
    item(`${escapeHtml(group.label)}の中央値`, fmtPct(med), "") +
    item("名取市の順位", `${rank}<small>位 / ${rows.length}団体</small>`, "投票率が高い順") +
    (fit
      ? item("同規模での近似線の値", fmtPct(expected), `名取市の人口での近似線上の値(R²=${fit.r2.toFixed(2)})`)
      : "");
}

function renderChart(rows, natori, mean, med, fit, xMin, xMax, coefA) {
  if (typeof Chart === "undefined") return;
  const ink = "#67766f";
  const gridColor = "#dde5e1";

  const normal = rows.filter((m) => m.code !== NATORI_CODE).map((m) => ({ x: m.pop, y: m.turnout, m }));
  const natoriPt = natori.turnout != null ? [{ x: natori.pop, y: natori.turnout, m: natori }] : [];

  const vals = rows.map((m) => m.turnout);
  const yMin = Math.max(0, Math.min(...vals) * 0.85);
  const yMax = Math.min(100, Math.max(...vals) * 1.15);

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

  const regLabelPlugin = {
    id: "tnRegLabel",
    afterDatasetsDraw(chart) {
      if (!fit) return;
      const ctx = chart.ctx;
      const area = chart.chartArea;
      ctx.font = "11px 'Hiragino Kaku Gothic ProN', Meiryo, sans-serif";
      ctx.fillStyle = "#d85a30";
      const lines = [`y = ${sig3(coefA)}·x^${fit.slope.toFixed(3).replace("-", "−")}`, `R² = ${fit.r2.toFixed(2)}(対数空間)`];
      const w = Math.max(...lines.map((s) => ctx.measureText(s).width));
      const x = Math.min(area.right - w - 6, area.left + (area.right - area.left) * 0.58);
      lines.forEach((s, i) => ctx.fillText(s, x, area.top + 16 + i * 14));
    },
  };

  if (tnChart) tnChart.destroy();
  tnChart = new Chart(document.getElementById("tn-chart"), {
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
              return `${m.name}: ${m.election}(${m.date}) 人口${m.pop.toLocaleString("ja-JP")}人・投票率${fmtPct(m.turnout)}`;
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
          title: { display: true, text: "投票率(%)", color: ink },
          ticks: { color: ink },
          grid: { color: gridColor },
        },
      },
    },
    plugins: [regLabelPlugin],
  });
}

/* ---------- カード2: 気象×投票率 ---------- */

function renderWeather(axisId) {
  const axis = TN_AXES.find((a) => a.id === axisId);
  const rows = tnAll.filter((m) => m.turnout != null && m.weather);
  const natori = tnAll.find((m) => m.code === NATORI_CODE);

  const pts = rows.map((m) => [axis.get(m), m.turnout]);
  const xs = pts.map((p) => p[0]);
  const xMin = Math.min(...xs) - (Math.max(...xs) - Math.min(...xs)) * 0.08;
  const xMax = Math.max(...xs) + (Math.max(...xs) - Math.min(...xs)) * 0.08;
  const fit = regressionLine(pts, xMin, xMax);

  const rainRows = rows.filter((m) => m.weather.precip > 0);
  const noRainRows = rows.filter((m) => m.weather.precip === 0);
  const avg = (arr) => arr.reduce((s, v) => s + v, 0) / arr.length;

  renderWeatherStats(axis, rows, natori, fit, rainRows, noRainRows, avg);
  renderWeatherChart(axis, rows, natori, fit, xMin, xMax);
}

function renderWeatherStats(axis, rows, natori, fit, rainRows, noRainRows, avg) {
  const el = document.getElementById("tn-weather-stats");
  const item = (label, value, sub) =>
    `<div class="cc-stat"><span class="cc-stat-label">${label}</span><span class="cc-stat-value">${value}</span>${sub ? `<span class="cc-stat-sub">${sub}</span>` : ""}</div>`;
  const natoriVal = natori.weather ? axis.get(natori) : null;
  el.innerHTML =
    item(`名取市の${escapeHtml(axis.label)}`, natoriVal != null ? `${natoriVal}${axis.unit}` : "—", `投票率${fmtPct(natori.turnout)}`) +
    item("回帰の当てはまり(R²)", fit ? fit.r2.toFixed(3) : "—", `${escapeHtml(axis.label)}と投票率の線形回帰(n=${rows.length})`) +
    item("降水あり(当日)の平均投票率", rainRows.length ? fmtPct(avg(rainRows.map((m) => m.turnout))) : "—", `${rainRows.length}団体`) +
    item("降水なし(当日)の平均投票率", noRainRows.length ? fmtPct(avg(noRainRows.map((m) => m.turnout))) : "—", `${noRainRows.length}団体`);
}

function renderWeatherChart(axis, rows, natori, fit, xMin, xMax) {
  if (typeof Chart === "undefined") return;
  const ink = "#67766f";
  const gridColor = "#dde5e1";

  const normal = rows.filter((m) => m.code !== NATORI_CODE).map((m) => ({ x: axis.get(m), y: m.turnout, m }));
  const natoriPt = natori.weather ? [{ x: axis.get(natori), y: natori.turnout, m: natori }] : [];

  const yVals = rows.map((m) => m.turnout);
  const yMin = Math.max(0, Math.min(...yVals) * 0.85);
  const yMax = Math.min(100, Math.max(...yVals) * 1.15);

  const regLabelPlugin = {
    id: "tnWeatherRegLabel",
    afterDatasetsDraw(chart) {
      if (!fit) return;
      const ctx = chart.ctx;
      const area = chart.chartArea;
      ctx.font = "11px 'Hiragino Kaku Gothic ProN', Meiryo, sans-serif";
      ctx.fillStyle = "#d85a30";
      const lines = [`y = ${sig3(fit.intercept)} + ${sig3(fit.slope)}·x`, `R² = ${fit.r2.toFixed(3)}`];
      const w = Math.max(...lines.map((s) => ctx.measureText(s).width));
      const x = Math.min(area.right - w - 6, area.left + (area.right - area.left) * 0.58);
      lines.forEach((s, i) => ctx.fillText(s, x, area.top + 16 + i * 14));
    },
  };

  if (tnWeatherChart) tnWeatherChart.destroy();
  tnWeatherChart = new Chart(document.getElementById("tn-weather-chart"), {
    type: "scatter",
    data: {
      datasets: [
        { data: natoriPt, backgroundColor: "#d85a30", pointRadius: 7, pointStyle: "circle" },
        { data: normal, backgroundColor: "rgba(26, 115, 91, 0.55)", pointRadius: 4, pointStyle: "circle" },
        { type: "line", data: fit ? fit.points : [], borderColor: "rgba(216, 90, 48, 0.8)", borderWidth: 1.5, borderDash: [6, 4], pointRadius: 0, pointHitRadius: 0, pointHoverRadius: 0 },
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
              return `${m.name}: ${axis.label}${axis.get(m)}${axis.unit}・投票率${fmtPct(m.turnout)}(${m.date})`;
            },
          },
        },
      },
      scales: {
        x: {
          min: xMin,
          max: xMax,
          title: { display: true, text: `${axis.label}(${axis.unit})`, color: ink },
          ticks: { color: ink },
          grid: { color: gridColor },
        },
        y: {
          min: yMin,
          max: yMax,
          title: { display: true, text: "投票率(%)", color: ink },
          ticks: { color: ink },
          grid: { color: gridColor },
        },
      },
    },
    plugins: [regLabelPlugin],
  });
}

/* ---------- カード3: 出典表 ---------- */

let tnSortState = { key: "pref", asc: true };

function renderTable() {
  sortTableRows();
  const tbody = document.getElementById("tn-table-body");
  tbody.innerHTML = tnAll
    .map((m) => {
      const w = m.weather;
      return `<tr>
        <td class="cell-pref">${escapeHtml(m.pref)}</td>
        <td>${escapeHtml(m.name)}</td>
        <td>${escapeHtml(m.date)}</td>
        <td class="cell-num">${m.uncontested ? "無投票" : fmtPct(m.turnout)}</td>
        <td class="cell-num">${w ? `${w.precip}mm` : "—"}</td>
        <td class="cell-num">${w ? `${w.tempAvg}℃` : "—"}</td>
        <td><a href="${escapeHtml(m.source)}" target="_blank" rel="noopener noreferrer">出典</a></td>
      </tr>`;
    })
    .join("");
}

/* 見出しクリックのリスナー登録は1回だけ(renderTable内で登録するとクリックごとに多重登録され、指数関数的に遅くなる) */
function initTableSort() {
  document.querySelectorAll("#tn-table th[data-sort]").forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.dataset.sort;
      if (tnSortState.key === key) {
        tnSortState.asc = !tnSortState.asc;
      } else {
        tnSortState = { key, asc: ["pref", "name", "date"].includes(key) };
      }
      renderTable();
      document.querySelectorAll("#tn-table th[data-sort]").forEach((h) => h.removeAttribute("data-dir"));
      th.setAttribute("data-dir", tnSortState.asc ? "asc" : "desc");
    });
  });
  // 初期状態の既定ソート(県・昇順)をインジケーター表示
  const prefTh = document.querySelector('#tn-table th[data-sort="pref"]');
  if (prefTh) prefTh.setAttribute("data-dir", "asc");
}

function sortTableRows() {
  const { key, asc } = tnSortState;
  const dir = asc ? 1 : -1;
  const val = (m) => {
    if (key === "precip") return m.weather ? m.weather.precip : -1;
    if (key === "tempAvg") return m.weather ? m.weather.tempAvg : -999;
    if (key === "turnout") return m.turnout ?? -1;
    if (key === "pref") return m.code; // JISコード順で県ごとにグループ化
    if (key === "name") return m.name;
    return m[key];
  };
  tnAll.sort((a, b) => {
    const va = val(a), vb = val(b);
    if (typeof va === "string") return dir * va.localeCompare(vb, "ja");
    return dir * (va - vb);
  });
}
