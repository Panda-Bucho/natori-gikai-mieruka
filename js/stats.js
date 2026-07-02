/* 月別集計ページ: 議員×月テーブル + 棒グラフ */

const MONTHS_SHOWN = 12;
let chart = null;

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const { members, posts } = await loadData();
    const base = posts.generatedAt ? new Date(posts.generatedAt) : new Date();
    const monthKeys = recentMonthKeys(MONTHS_SHOWN, base);

    // RSS集計対象(フィード登録あり)の議員のみ
    const tracked = members.members
      .filter((m) => (m.feeds || []).length > 0)
      .map((m) => ({
        member: m,
        counts: countByMonth((posts.members[m.id] || {}).posts),
      }));

    renderMatrix(tracked, monthKeys);
    setupChart(tracked, monthKeys);
    renderGeneratedAt(posts);
  } catch (e) {
    document.getElementById("matrix-wrap").innerHTML =
      `<p>データの読み込みに失敗しました: ${escapeHtml(e.message)}</p>`;
  }
});

function monthLabel(key) {
  const [y, m] = key.split("-");
  return `${y}年${Number(m)}月`;
}

function shortMonthLabel(key) {
  const [y, m] = key.split("-");
  return `${y.slice(2)}/${m}`;
}

/* 議員×月のテーブル(ヒートマップ風) */
function renderMatrix(tracked, monthKeys) {
  const wrap = document.getElementById("matrix-wrap");
  if (!tracked.length) {
    wrap.innerHTML = "<p>RSS集計対象の議員がいません。</p>";
    return;
  }
  const max = Math.max(
    1,
    ...tracked.flatMap((t) => monthKeys.map((k) => t.counts[k] || 0))
  );

  const head = `<tr><th class="sticky-col">議員</th>${monthKeys
    .map((k) => `<th title="${monthLabel(k)}">${shortMonthLabel(k)}</th>`)
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

/* 棒グラフ: 全議員合計 / 議員個別を切替 */
function setupChart(tracked, monthKeys) {
  const select = document.getElementById("chart-target");
  select.innerHTML =
    '<option value="__all__">全議員合計</option>' +
    tracked
      .map((t) => `<option value="${escapeHtml(t.member.id)}">${escapeHtml(t.member.name)}</option>`)
      .join("");
  select.addEventListener("change", () => drawChart(tracked, monthKeys, select.value));
  drawChart(tracked, monthKeys, "__all__");
}

function drawChart(tracked, monthKeys, target) {
  const data = monthKeys.map((k) => {
    if (target === "__all__") {
      return tracked.reduce((s, t) => s + (t.counts[k] || 0), 0);
    }
    const t = tracked.find((x) => x.member.id === target);
    return t ? t.counts[k] || 0 : 0;
  });
  const label =
    target === "__all__"
      ? "全議員合計"
      : tracked.find((x) => x.member.id === target)?.member.name || "";

  const ctx = document.getElementById("month-chart");
  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: monthKeys.map(monthLabel),
      datasets: [
        {
          label: `${label} の月別発信回数`,
          data,
          backgroundColor: "rgba(26, 115, 91, 0.75)",
          borderRadius: 3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true, ticks: { precision: 0 } },
      },
      plugins: {
        legend: { display: true },
      },
    },
  });
}
