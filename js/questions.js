/* 一般質問ページ: 議員×定例会マトリクス + 質問テーマ一覧(直近5年) */

const TERM_START_DATE = TERM_START + "-01"; // 今期開始(2024-02-01)

/* 役職ごとの補足(セルのツールチップ) */
const ROLE_NOTES = {
  "議長": "議事を主宰する立場のため、慣例として一般質問を行わない場合があります",
  "副議長": "議長を補佐する立場のため、慣例として一般質問を行わない場合があります",
  "監査委員": "市の事務を監査する立場のため、一般質問を控える場合があります",
};

/* 表示範囲: 実行日の5年前から */
function cutoffDate() {
  const now = new Date();
  return `${now.getFullYear() - 5}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const [members, questions] = await Promise.all([
      fetchJson("data/members.json"),
      fetchJson("data/questions.json"),
    ]);

    // 直近5年分のみに絞る
    const cutoff = cutoffDate();
    const termEntries = members.members.map((m) => ({
      member: m,
      entries: (questions.members[m.id] || []).filter((e) => e.date >= cutoff),
    }));

    renderMatrix(termEntries);
    renderTopics(termEntries);
    renderGeneratedAt(questions);
  } catch (e) {
    document.getElementById("q-matrix-wrap").innerHTML =
      `<p>データの読み込みに失敗しました: ${escapeHtml(e.message)}</p>`;
  }
});

/* 定例会名の短縮表記(令和6年第2回定例会 → R6-2) */
function shortAssembly(assembly) {
  const m = assembly.match(/令和(\d+)年第(\d+)回(定例会|臨時会)/);
  if (!m) return assembly;
  return `R${m[1]}-${m[2]}${m[3] === "臨時会" ? "臨" : ""}`;
}

/* 表示する列(定例会を初出日順に並べ、間に市議選があればマーカー列を挿入) */
function buildColumns(termEntries) {
  const firstDate = {};
  for (const t of termEntries) {
    for (const e of t.entries) {
      if (!(e.assembly in firstDate) || e.date < firstDate[e.assembly]) {
        firstDate[e.assembly] = e.date;
      }
    }
  }
  const assemblies = Object.keys(firstDate).sort((a, b) => firstDate[a].localeCompare(firstDate[b]));
  const columns = [];
  let prevDate = null;
  for (const a of assemblies) {
    const d = firstDate[a];
    if (prevDate !== null) {
      for (const [ym, label] of Object.entries(ELECTION_MONTHS)) {
        const eDate = ym + "-01";
        if (prevDate < eDate && eDate <= d) {
          const [y, mo] = ym.split("-").map(Number);
          columns.push({ type: "election", label, title: `${y}年${mo}月 名取市議会議員選挙` });
        }
      }
    }
    columns.push({ type: "assembly", assembly: a, date: d });
    prevDate = d;
  }
  return columns;
}

function formatMonthJa(dateStr) {
  const d = parseDate(dateStr);
  return d ? `${d.getFullYear()}年${d.getMonth() + 1}月` : "";
}

/* 指定日に在任していた役職(議長/副議長/監査委員)を返す */
function roleOnDate(m, dateStr) {
  for (const h of m.roleHistory || []) {
    if (h.from <= dateStr && (!h.to || dateStr < h.to)) return h.role;
  }
  return null;
}

/* 現職・前職の役職バッジ(同一役職は在任期間をまとめて1つに) */
function nameWithRole(m) {
  let badges = "";
  if (m.role) {
    badges += ` <span class="role-badge">${escapeHtml(m.role)}</span>`;
  }
  const former = new Map();
  for (const h of m.roleHistory || []) {
    if (!h.to) continue; // 現職は role で表示済み
    if (!former.has(h.role)) former.set(h.role, []);
    former.get(h.role).push(`${formatMonthJa(h.from)}〜${formatMonthJa(h.to)}`);
  }
  for (const [role, periods] of former) {
    badges += ` <span class="role-badge former" title="在任期間: ${escapeHtml(periods.join("、"))}">前${escapeHtml(role)}</span>`;
  }
  const nameHtml = m.officialPage
    ? `<a class="name-link" href="${escapeHtml(m.officialPage)}" target="_blank" rel="noopener noreferrer" title="名取市議会 公式プロフィールを開く">${escapeHtml(m.name)}</a>`
    : escapeHtml(m.name);
  return `${nameHtml}${badges}`;
}

function renderMatrix(termEntries) {
  const wrap = document.getElementById("q-matrix-wrap");
  const columns = buildColumns(termEntries);
  if (!columns.length) {
    wrap.innerHTML = "<p>直近5年の一般質問データがありません。</p>";
    return;
  }

  const head = `<tr><th class="sticky-col">議員</th>${columns
    .map((c) =>
      c.type === "election"
        ? `<th class="election-col" title="${escapeHtml(c.title)}">${escapeHtml(c.label)}</th>`
        : `<th title="${escapeHtml(c.assembly)}">${escapeHtml(shortAssembly(c.assembly))}</th>`
    )
    .join("")}<th>今期</th><th>5年計</th></tr>`;

  const rows = termEntries.map((t) => {
    const m = t.member;
    const byAssembly = {};
    for (const e of t.entries) byAssembly[e.assembly] = e;
    const cells = columns
      .map((c) => {
        if (c.type === "election") {
          return `<td class="q-election" title="${escapeHtml(c.title)}"></td>`;
        }
        const e = byAssembly[c.assembly];
        if (e) {
          const tip = `${e.date.replaceAll("-", "/")} ${e.topics.join(" / ") || "一般質問"}`;
          return `<td class="q-yes"><a href="${escapeHtml(e.url)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(tip)}" aria-label="${escapeHtml(m.name)} ${escapeHtml(c.assembly)} の質問映像">●</a></td>`;
        }
        // 在職前(初当選より前)の定例会
        if (m.memberSince && c.date < m.memberSince) {
          return `<td class="q-out" title="この定例会当時は在職していません(${escapeHtml(formatMonthJa(m.memberSince))}〜在職)">—</td>`;
        }
        // 質問なし: 当時 議長/副議長/監査委員 在任中ならその旨を表示
        const role = roleOnDate(m, c.date);
        if (role) {
          return `<td class="q-role" title="この定例会当時は${escapeHtml(role)}(${escapeHtml(ROLE_NOTES[role] || "")})">${escapeHtml(role)}</td>`;
        }
        return '<td class="q-none"></td>';
      })
      .join("");
    const termCount = t.entries.filter((e) => e.date >= TERM_START_DATE).length;
    return `<tr><th class="sticky-col row-name">${nameWithRole(m)}</th>${cells}<td class="total">${termCount}</td><td class="total">${t.entries.length}</td></tr>`;
  });

  wrap.innerHTML = `<table class="matrix q-matrix"><thead>${head}</thead><tbody>${rows.join("")}</tbody></table>`;
}

function renderTopics(termEntries) {
  const wrap = document.getElementById("q-topics-wrap");
  wrap.innerHTML = termEntries
    .map((t) => {
      const items = t.entries
        .map((e) => {
          const topics = e.topics.length
            ? `<ul>${e.topics.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>`
            : "<ul><li>(テーマ情報なし)</li></ul>";
          return `<div class="q-entry">
            <p class="q-entry-head">${escapeHtml(e.assembly)}(${formatDateJa(e.date)})
              <a href="${escapeHtml(e.url)}" target="_blank" rel="noopener noreferrer">映像を見る</a></p>
            ${topics}
          </div>`;
        })
        .join("");
      return `<details class="q-member">
        <summary>${nameWithRole(t.member)} <span class="q-count">${t.entries.length} 回</span></summary>
        ${items || '<p class="q-entry">直近5年の一般質問はありません。</p>'}
      </details>`;
    })
    .join("");
}
