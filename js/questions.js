/* 一般質問ページ: 議員×定例会マトリクス + 質問テーマ一覧(今期) */

const TERM_START_DATE = TERM_START + "-01"; // 今期開始(2024-02-01)

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const [members, questions] = await Promise.all([
      fetchJson("data/members.json"),
      fetchJson("data/questions.json"),
    ]);

    // 今期分のみに絞る
    const termEntries = members.members.map((m) => ({
      member: m,
      entries: (questions.members[m.id] || []).filter((e) => e.date >= TERM_START_DATE),
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

/* 今期の定例会一覧(初出日順) */
function assemblyColumns(termEntries) {
  const firstDate = {};
  for (const t of termEntries) {
    for (const e of t.entries) {
      if (!(e.assembly in firstDate) || e.date < firstDate[e.assembly]) {
        firstDate[e.assembly] = e.date;
      }
    }
  }
  return Object.keys(firstDate).sort((a, b) => firstDate[a].localeCompare(firstDate[b]));
}

function nameWithRole(m) {
  const badge = m.role ? ` <span class="role-badge">${escapeHtml(m.role)}</span>` : "";
  return `${escapeHtml(m.name)}${badge}`;
}

function renderMatrix(termEntries) {
  const wrap = document.getElementById("q-matrix-wrap");
  const assemblies = assemblyColumns(termEntries);
  if (!assemblies.length) {
    wrap.innerHTML = "<p>今期の一般質問データがありません。</p>";
    return;
  }

  const head = `<tr><th class="sticky-col">議員</th>${assemblies
    .map((a) => `<th title="${escapeHtml(a)}">${escapeHtml(shortAssembly(a))}</th>`)
    .join("")}<th>今期合計</th></tr>`;

  const rows = termEntries.map((t) => {
    const byAssembly = {};
    for (const e of t.entries) byAssembly[e.assembly] = e;
    const cells = assemblies
      .map((a) => {
        const e = byAssembly[a];
        if (!e) return '<td class="q-none"></td>';
        const tip = `${e.date.replaceAll("-", "/")} ${e.topics.join(" / ") || "一般質問"}`;
        return `<td class="q-yes"><a href="${escapeHtml(e.url)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(tip)}" aria-label="${escapeHtml(t.member.name)} ${escapeHtml(a)} の質問映像">●</a></td>`;
      })
      .join("");
    return `<tr><th class="sticky-col row-name">${nameWithRole(t.member)}</th>${cells}<td class="total">${t.entries.length}</td></tr>`;
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
        ${items || '<p class="q-entry">今期の一般質問はありません。</p>'}
      </details>`;
    })
    .join("");
}
