/* トップページ: 議員一覧テーブル(氏名・会派・発信媒体) */

let tableRows = []; // ソート用に保持
let sortState = { key: "default", asc: true };

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const members = await fetchJson("data/members.json");
    buildRows(members);
    renderTable();
    renderSummary(members);
    setupSorting();
  } catch (e) {
    document.getElementById("member-table-body").innerHTML =
      `<tr><td colspan="3">データの読み込みに失敗しました: ${escapeHtml(e.message)}</td></tr>`;
  }
});

function buildRows(members) {
  tableRows = members.members.map((m, idx) => ({
    member: m,
    index: idx,
    mediaCount: PLATFORM_ORDER.filter((p) => m.links[p]).length,
  }));
}

function mediaIconsHtml(m) {
  const icons = PLATFORM_ORDER.filter((p) => m.links[p]).map((p) => {
    const def = PLATFORMS[p];
    return `<a class="media-icon" href="${escapeHtml(m.links[p])}" target="_blank" rel="noopener noreferrer" title="${def.label}" aria-label="${escapeHtml(m.name)}の${def.label}">${def.icon}</a>`;
  });
  return icons.length ? icons.join("") : '<span class="no-media">—</span>';
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
      </tr>`;
    })
    .join("");
}

function renderSummary(members) {
  const total = members.members.length;
  const withMedia = tableRows.filter((r) => r.mediaCount > 0).length;
  document.getElementById("summary").textContent =
    `議員 ${total} 名のうち、Web発信媒体が確認できたのは ${withMedia} 名です。`;
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
  }[key];
  if (cmp) tableRows.sort((a, b) => dir * cmp(a, b));
}
