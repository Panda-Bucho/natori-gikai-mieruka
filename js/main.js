/* トップページ: 議員一覧テーブル(氏名・会派・年齢・期数・常任委員会・発信媒体) */

let tableRows = []; // ソート用に保持
let sortState = { key: "seat", asc: true }; // 既定は議席番号順(公式の中立な並び)

/* 常任委員会(総務消防/建設経済/民生教育)。財務は全員所属のため一覧では省略 */
const STANDING_COMMITTEES = ["総務消防常任委員会", "建設経済常任委員会", "民生教育常任委員会"];

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const members = await fetchJson("data/members.json");
    buildRows(members);
    sortRows();
    renderTable();
    renderSummary(members);
    renderCountdown();
    setupSorting();
  } catch (e) {
    document.getElementById("member-table-body").innerHTML =
      `<tr><td colspan="9">データの読み込みに失敗しました: ${escapeHtml(e.message)}</td></tr>`;
  }
});

function calcAge(birthDate) {
  const b = parseDate(birthDate);
  if (!b) return null;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) {
    age--;
  }
  return age;
}

function standingCommittee(m) {
  return (m.committees || []).find((c) => STANDING_COMMITTEES.includes(c)) || null;
}

function buildRows(members) {
  tableRows = members.members.map((m, idx) => ({
    member: m,
    index: idx,
    age: calcAge(m.birthDate),
    committee: standingCommittee(m),
    mediaCount: PLATFORM_ORDER.filter((p) => m.links[p]).length,
    votes: m.lastElection ? m.lastElection.votes : null,
    share: m.lastElection ? m.lastElection.share : null,
  }));
}

function mediaIconsHtml(m) {
  const icons = PLATFORM_ORDER.filter((p) => m.links[p]).map((p) => {
    const def = PLATFORMS[p];
    return `<a class="media-icon" href="${escapeHtml(m.links[p])}" target="_blank" rel="noopener noreferrer" title="${def.label}" aria-label="${escapeHtml(m.name)}の${def.label}">${def.icon}</a>`;
  });
  return icons.length ? icons.join("") : '<span class="no-media">—</span>';
}

/* 行クリックで開く詳細行 */
function detailHtml(row) {
  const m = row.member;
  const media = PLATFORM_ORDER.filter((p) => m.links[p])
    .map((p) => `<a href="${escapeHtml(m.links[p])}" target="_blank" rel="noopener noreferrer">${PLATFORMS[p].label}</a>`)
    .join("、 ") || "確認できる媒体なし";
  const roles = [];
  if (m.role) roles.push(escapeHtml(m.role));
  const former = new Map(); // 同一役職の複数期はまとめて表示
  for (const h of m.roleHistory || []) {
    if (!h.to) continue;
    if (!former.has(h.role)) former.set(h.role, []);
    former.get(h.role).push(`${formatDateJa(h.from).slice(0, 7)}〜${formatDateJa(h.to).slice(0, 7)}`);
  }
  for (const [role, periods] of former) {
    roles.push(`前${escapeHtml(role)}(${periods.join("、")})`);
  }
  const items = [
    roles.length ? `<dt>役職</dt><dd>${roles.join("、 ")}</dd>` : "",
    `<dt>所属委員会</dt><dd>${(m.committees || []).map(escapeHtml).join("、 ") || "—"}</dd>`,
    `<dt>生年月日</dt><dd>${m.birthDate ? formatDateJa(m.birthDate) + `(${row.age}歳)` : "—"}</dd>`,
    row.votes != null ? `<dt>前回市議選</dt><dd>${formatVotesHtml(row.votes)}票(得票率 ${formatShareHtml(row.share)})/ 2024年1月21日執行</dd>` : "",
    `<dt>発信媒体</dt><dd>${media}</dd>`,
    `<dt>公式情報</dt><dd><a href="${escapeHtml(m.officialPage)}" target="_blank" rel="noopener noreferrer">名取市議会 議員紹介ページ</a></dd>`,
  ].join("");
  return `<tr class="detail-row" data-detail="${escapeHtml(m.id)}"><td colspan="8"><dl class="member-detail">${items}</dl></td></tr>`;
}

function renderTable() {
  const tbody = document.getElementById("member-table-body");
  tbody.innerHTML = tableRows
    .map((row) => {
      const m = row.member;
      const nameHtml = m.officialPage
        ? `<a class="name-link" href="${escapeHtml(m.officialPage)}" target="_blank" rel="noopener noreferrer" title="名取市議会 公式プロフィールを開く">${escapeHtml(m.name)}</a>`
        : escapeHtml(m.name);
      const roleBadge = m.role ? ` <span class="role-badge">${escapeHtml(m.role)}</span>` : "";
      return `<tr class="member-row" data-id="${escapeHtml(m.id)}" title="クリックで詳細を表示">
        <td class="cell-num cell-seat">${m.seatNo ?? "—"}</td>
        <td class="cell-name"><span class="name">${nameHtml}${roleBadge}</span><span class="kana">${escapeHtml(m.kana || "")}</span></td>
        <td class="cell-faction">${escapeHtml(m.faction)}</td>
        <td class="cell-num">${row.age ?? "—"}</td>
        <td class="cell-num">${m.terms ?? "—"}</td>
        <td class="cell-num">${formatVotesHtml(row.votes)}</td>
        <td class="cell-num">${formatShareHtml(row.share)}</td>
        <td class="cell-committee">${row.committee ? escapeHtml(row.committee.replace("常任委員会", "")) : "—"}</td>
        <td class="cell-media">${mediaIconsHtml(m)}</td>
      </tr>` + detailHtml(row);
    })
    .join("");

  // 行クリックで詳細をトグル(リンク・アイコンのクリックは除外)
  tbody.querySelectorAll("tr.member-row").forEach((tr) => {
    tr.addEventListener("click", (ev) => {
      if (ev.target.closest("a")) return;
      const detail = tbody.querySelector(`tr.detail-row[data-detail="${tr.dataset.id}"]`);
      if (detail) detail.classList.toggle("open");
    });
  });
}

/* 現在の任期の残りを表示 */
function renderCountdown() {
  const el = document.getElementById("term-remaining");
  const sub = document.getElementById("term-remaining-sub");
  if (!el) return;
  el.textContent = humanizeUntil(TERM_END_DATE) || "任期満了(改選期)";
  if (sub) sub.textContent = `${formatDateJa(TERM_END_DATE)} 満了`;
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
        sortState = { key, asc: ["seat", "name", "faction", "committee"].includes(key) };
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
    seat: (a, b) => (a.member.seatNo ?? 999) - (b.member.seatNo ?? 999),
    name: (a, b) => (a.member.kana || a.member.name).localeCompare(b.member.kana || b.member.name, "ja"),
    faction: (a, b) =>
      a.member.faction.localeCompare(b.member.faction, "ja") || a.index - b.index,
    age: (a, b) => (a.age ?? -1) - (b.age ?? -1) || a.index - b.index,
    terms: (a, b) => (a.member.terms ?? -1) - (b.member.terms ?? -1) || a.index - b.index,
    votes: (a, b) => (a.votes ?? -1) - (b.votes ?? -1) || a.index - b.index,
    share: (a, b) => (a.share ?? -1) - (b.share ?? -1) || a.index - b.index,
    committee: (a, b) =>
      (a.committee || "").localeCompare(b.committee || "", "ja") || a.index - b.index,
    media: (a, b) => a.mediaCount - b.mediaCount || a.index - b.index,
  }[key];
  if (cmp) tableRows.sort((a, b) => dir * cmp(a, b));
}
