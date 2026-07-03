/* トップページ: 議員一覧テーブル */

let tableRows = []; // ソート用に保持
let sortState = { key: "default", asc: true };

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const { members, posts } = await loadData();
    buildRows(members, posts);
    renderTable();
    renderSummary(members, posts);
    renderGeneratedAt(posts);
    setupSorting();
  } catch (e) {
    document.getElementById("member-table-body").innerHTML =
      `<tr><td colspan="5">データの読み込みに失敗しました: ${escapeHtml(e.message)}</td></tr>`;
  }
});

function buildRows(members, posts) {
  const prevMonth = prevMonthKey();
  tableRows = members.members.map((m, idx) => {
    const postData = posts.members[m.id] || { lastPostDate: null, posts: [] };
    const hasFeeds = (m.feeds || []).length > 0;

    // RSS由来と手動確認の最終発信日のうち新しい方を採用
    let lastDate = postData.lastPostDate;
    let lastSource = lastDate ? "rss" : null;
    let manualChecked = null;
    for (const mc of m.manual || []) {
      if (mc.lastPostDate && (!lastDate || mc.lastPostDate > lastDate)) {
        lastDate = mc.lastPostDate;
        lastSource = "manual";
        manualChecked = mc.checkedDate;
      }
    }

    const mediaCount = PLATFORM_ORDER.filter((p) => m.links[p]).length;
    const prevMonthCount = hasFeeds
      ? (countByMonth(postData.posts)[prevMonth] || 0)
      : null;

    return {
      member: m,
      index: idx,
      mediaCount,
      hasFeeds,
      lastDate,
      lastSource,
      manualChecked,
      prevMonthCount,
    };
  });
}

function mediaIconsHtml(m) {
  const icons = PLATFORM_ORDER.filter((p) => m.links[p]).map((p) => {
    const def = PLATFORMS[p];
    return `<a class="media-icon" href="${escapeHtml(m.links[p])}" target="_blank" rel="noopener noreferrer" title="${def.label}" aria-label="${escapeHtml(m.name)}の${def.label}">${def.icon}</a>`;
  });
  return icons.length ? icons.join("") : '<span class="no-media">—</span>';
}

function lastDateHtml(row) {
  if (!row.lastDate) {
    if (row.mediaCount === 0) {
      return '<span class="fresh-none">発信媒体なし</span>';
    }
    return '<span class="fresh-none">未確認</span>';
  }
  const cls = freshnessClass(row.lastDate);
  let html = `<span class="date-chip ${cls}">${formatDateJa(row.lastDate)}</span>`;
  if (row.lastSource === "manual") {
    const checked = row.manualChecked ? `(確認日 ${formatDateJa(row.manualChecked)})` : "";
    html += ` <span class="manual-badge" title="RSSで自動取得できない媒体のため手動で確認した日付です${checked}">※手動${checked ? escapeHtml(checked) : ""}</span>`;
  }
  return html;
}

function countHtml(row) {
  if (row.prevMonthCount === null) {
    return '<span class="no-media" title="RSS取得可能な媒体が未登録のため自動集計できません">—</span>';
  }
  return `<span class="count">${row.prevMonthCount}<span class="count-unit"> 回</span></span>`;
}

function renderTable() {
  const tbody = document.getElementById("member-table-body");
  tbody.innerHTML = tableRows
    .map((row) => {
      const m = row.member;
      const nameHtml = m.officialPage
        ? `<a class="name-link" href="${escapeHtml(m.officialPage)}" target="_blank" rel="noopener noreferrer" title="名取市議会 公式プロフィールを開く">${escapeHtml(m.name)}</a>`
        : escapeHtml(m.name);
      return `<tr>
        <td class="cell-name"><span class="name">${nameHtml}</span><span class="kana">${escapeHtml(m.kana || "")}</span></td>
        <td class="cell-faction">${escapeHtml(m.faction)}</td>
        <td class="cell-media">${mediaIconsHtml(m)}</td>
        <td class="cell-last">${lastDateHtml(row)}</td>
        <td class="cell-count">${countHtml(row)}</td>
      </tr>`;
    })
    .join("");
}

function renderSummary(members, posts) {
  const total = members.members.length;
  const withMedia = tableRows.filter((r) => r.mediaCount > 0).length;
  const withFeeds = tableRows.filter((r) => r.hasFeeds).length;
  document.getElementById("summary").textContent =
    `議員 ${total} 名のうち、Web発信媒体が確認できたのは ${withMedia} 名、うち自動集計(RSS)対象は ${withFeeds} 名です。`;
}

/* 列見出しクリックでソート */
function setupSorting() {
  document.querySelectorAll("th[data-sort]").forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.dataset.sort;
      if (sortState.key === key) {
        sortState.asc = !sortState.asc;
      } else {
        sortState = { key, asc: key === "name" || key === "faction" };
      }
      sortRows();
      renderTable();
      document.querySelectorAll("th[data-sort]").forEach((h) => h.removeAttribute("data-dir"));
      th.setAttribute("data-dir", sortState.asc ? "asc" : "desc");
    });
  });
}

function sortRows() {
  const { key, asc } = sortState;
  const dir = asc ? 1 : -1;
  const cmp = {
    name: (a, b) => (a.member.kana || a.member.name).localeCompare(b.member.kana || b.member.name, "ja"),
    faction: (a, b) =>
      a.member.faction.localeCompare(b.member.faction, "ja") || a.index - b.index,
    media: (a, b) => a.mediaCount - b.mediaCount || a.index - b.index,
    last: (a, b) => (a.lastDate || "").localeCompare(b.lastDate || "") || a.index - b.index,
    count: (a, b) => (a.prevMonthCount ?? -1) - (b.prevMonthCount ?? -1) || a.index - b.index,
  }[key];
  if (cmp) tableRows.sort((a, b) => dir * cmp(a, b));
}
