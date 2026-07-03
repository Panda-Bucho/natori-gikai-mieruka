/* 月別集計ページ: 期間切替(直近12か月/今期/直近4年) + 議員×月テーブル + 棒グラフ */

let chart = null;
let tracked = [];
let baseDate = new Date();
const state = { period: "m12", target: "__all__" };

/* 選挙月に縦破線+ラベルを描くChart.jsプラグイン */
let chartMonthKeys = [];
const electionMarkerPlugin = {
  id: "electionMarker",
  afterDraw(c) {
    const xScale = c.scales.x;
    if (!xScale) return;
    chartMonthKeys.forEach((key, i) => {
      const label = ELECTION_MONTHS[key];
      if (!label) return;
      const x = xScale.getPixelForValue(i);
      const { top, bottom } = c.chartArea;
      const ctx = c.ctx;
      ctx.save();
      ctx.strokeStyle = "rgba(176, 74, 58, 0.9)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(176, 74, 58, 1)";
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(label, x, top - 4);
      ctx.restore();
    });
  },
};

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const { members, posts } = await loadData();
    baseDate = posts.generatedAt ? new Date(posts.generatedAt) : new Date();

    // RSS集計対象(フィード登録あり)の議員のみ
    tracked = members.members
      .filter((m) => (m.feeds || []).length > 0)
      .map((m) => ({
        member: m,
        counts: countByMonth((posts.members[m.id] || {}).posts),
      }));

    setupControls();
    render();
    renderGeneratedAt(posts);
  } catch (e) {
    document.getElementById("matrix-wrap").innerHTML =
      `<p>データの読み込みに失敗しました: ${escapeHtml(e.message)}</p>`;
  }
});

function currentMonthKeys() {
  const nowKey = monthKey(baseDate.getFullYear(), baseDate.getMonth() + 1);
  if (state.period === "term") return monthKeysBetween(TERM_START, nowKey);
  if (state.period === "y4") return recentMonthKeys(48, baseDate);
  return recentMonthKeys(12, baseDate);
}

function setupControls() {
  const periodSel = document.getElementById("period-select");
  periodSel.addEventListener("change", () => {
    state.period = periodSel.value;
    render();
  });

  const targetSel = document.getElementById("chart-target");
  targetSel.innerHTML =
    '<option value="__all__">全議員合計</option>' +
    tracked
      .map((t) => `<option value="${escapeHtml(t.member.id)}">${escapeHtml(t.member.name)}</option>`)
      .join("");
  targetSel.addEventListener("change", () => {
    state.target = targetSel.value;
    drawChart();
  });
}

function render() {
  renderMatrix();
  drawChart();
}

function monthLabel(key) {
  const [y, m] = key.split("-");
  return `${y}年${Number(m)}月`;
}

function shortMonthLabel(key) {
  const [y, m] = key.split("-");
  return `${y.slice(2)}/${m}`;
}

/* 議員×月のテーブル(ヒートマップ風) */
function renderMatrix() {
  const wrap = document.getElementById("matrix-wrap");
  const monthKeys = currentMonthKeys();
  if (!tracked.length) {
    wrap.innerHTML = "<p>RSS集計対象の議員がいません。</p>";
    return;
  }
  const max = Math.max(
    1,
    ...tracked.flatMap((t) => monthKeys.map((k) => t.counts[k] || 0))
  );

  const head = `<tr><th class="sticky-col">議員</th>${monthKeys
    .map((k) => {
      const el = ELECTION_MONTHS[k];
      return `<th${el ? ' class="election-col"' : ""} title="${monthLabel(k)}${el ? " " + el : ""}">${shortMonthLabel(k)}</th>`;
    })
    .join("")}<th>合計</th></tr>`;

  const rows = tracked.map((t) => {
    let total = 0;
    const cells = monthKeys
      .map((k) => {
        const c = t.counts[k] || 0;
        total += c;
        const alpha = c === 0 ? 0 : 0.15 + 0.85 * (c / max);
        return `<td class="heat" style="background: rgba(26, 115, 91, ${alpha.toFixed(2)});${c / max > 0.55 ? " color:#fff;" : ""}">${c || ""}</td>`;
      })
      .join("");
    return `<tr><th class="sticky-col row-name">${escapeHtml(t.member.name)}</th>${cells}<td class="total">${total}</td></tr>`;
  });

  // 月ごとの合計行
  const totalCells = monthKeys
    .map((k) => `<td class="total">${tracked.reduce((s, t) => s + (t.counts[k] || 0), 0)}</td>`)
    .join("");
  const grandTotal = tracked.reduce(
    (s, t) => s + monthKeys.reduce((s2, k) => s2 + (t.counts[k] || 0), 0),
    0
  );
  const totalRow = `<tr class="total-row"><th class="sticky-col row-name">合計</th>${totalCells}<td class="total">${grandTotal}</td></tr>`;

  wrap.innerHTML = `<table class="matrix"><thead>${head}</thead><tbody>${rows.join("")}${totalRow}</tbody></table>`;
}

/* 棒グラフ: 全議員合計 / 議員個別 */
function drawChart() {
  const monthKeys = currentMonthKeys();
  chartMonthKeys = monthKeys;
  const data = monthKeys.map((k) => {
    if (state.target === "__all__") {
      return tracked.reduce((s, t) => s + (t.counts[k] || 0), 0);
    }
    const t = tracked.find((x) => x.member.id === state.target);
    return t ? t.counts[k] || 0 : 0;
  });
  const label =
    state.target === "__all__"
      ? "全議員合計"
      : tracked.find((x) => x.member.id === state.target)?.member.name || "";
  const longRange = monthKeys.length > 24;

  const ctx = document.getElementById("month-chart");
  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: monthKeys.map(longRange ? shortMonthLabel : monthLabel),
      datasets: [
        {
          label: `${label} の月別発信回数`,
          data,
          backgroundColor: "rgba(26, 115, 91, 0.75)",
          borderRadius: longRange ? 1 : 3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 16 } },
      scales: {
        y: { beginAtZero: true, ticks: { precision: 0 } },
        x: { ticks: { autoSkip: true, maxRotation: longRange ? 60 : 0 } },
      },
      plugins: {
        legend: { display: true },
      },
    },
    plugins: [electionMarkerPlugin],
  });
}
