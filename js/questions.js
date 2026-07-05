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

let matrixEntries = []; // マトリクスのソート用に保持
let qSort = { key: "default", asc: true };

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const [members, questions] = await Promise.all([
      fetchJson("data/members.json"),
      fetchJson("data/questions.json"),
    ]);

    // 直近5年分のみに絞る
    const cutoff = cutoffDate();
    matrixEntries = members.members.map((m) => {
      const entries = (questions.members[m.id] || []).filter((e) => e.date >= cutoff);
      return {
        member: m,
        entries,
        termCount: entries.filter((e) => e.date >= TERM_START_DATE).length,
        votes: m.lastElection ? m.lastElection.votes : null,
        share: m.lastElection ? m.lastElection.share : null,
      };
    });

    renderMatrix();
    renderCharts();
    setupWordcloud();
    renderTopics(matrixEntries);
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

/* ソート順を適用したマトリクス行 */
function sortedMatrixEntries() {
  const { key, asc } = qSort;
  const dir = asc ? 1 : -1;
  const cmp = {
    name: (a, b) =>
      (a.t.member.kana || a.t.member.name).localeCompare(b.t.member.kana || b.t.member.name, "ja"),
    terms: (a, b) => (a.t.member.terms ?? -1) - (b.t.member.terms ?? -1) || a.i - b.i,
    termCount: (a, b) => a.t.termCount - b.t.termCount || a.i - b.i,
    fiveYear: (a, b) => a.t.entries.length - b.t.entries.length || a.i - b.i,
    votes: (a, b) => (a.t.votes ?? -1) - (b.t.votes ?? -1) || a.i - b.i,
    share: (a, b) => (a.t.share ?? -1) - (b.t.share ?? -1) || a.i - b.i,
  }[key];
  if (!cmp) return matrixEntries;
  return matrixEntries
    .map((t, i) => ({ t, i }))
    .sort((a, b) => dir * cmp(a, b))
    .map((x) => x.t);
}

function renderMatrix() {
  const wrap = document.getElementById("q-matrix-wrap");
  const columns = buildColumns(matrixEntries);
  if (!columns.length) {
    wrap.innerHTML = "<p>直近5年の一般質問データがありません。</p>";
    return;
  }

  const dirAttr = (key) => (qSort.key === key ? ` data-dir="${qSort.asc ? "asc" : "desc"}"` : "");
  const head = `<tr><th class="sticky-col" data-sort="name"${dirAttr("name")}>議員</th><th data-sort="terms"${dirAttr("terms")}>期数</th>${columns
    .map((c) =>
      c.type === "election"
        ? `<th class="election-col" title="${escapeHtml(c.title)}">${escapeHtml(c.label)}</th>`
        : `<th title="${escapeHtml(c.assembly)}">${escapeHtml(shortAssembly(c.assembly))}</th>`
    )
    .join("")}<th data-sort="termCount"${dirAttr("termCount")}>今期</th><th data-sort="fiveYear"${dirAttr("fiveYear")}>5年計</th><th data-sort="votes"${dirAttr("votes")} title="前回市議選(2024年1月)の得票数">得票数</th><th data-sort="share"${dirAttr("share")} title="前回市議選(2024年1月)の得票率(有効投票数に対する割合)">得票率</th></tr>`;

  const rows = sortedMatrixEntries().map((t) => {
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
    const votesTd = t.votes != null ? t.votes.toLocaleString() : "—";
    const shareTd = t.share != null ? t.share.toFixed(2) + "%" : "—";
    return `<tr><th class="sticky-col row-name">${nameWithRole(m)}</th><td class="q-terms">${m.terms ?? "—"}</td>${cells}<td class="total">${t.termCount}</td><td class="total">${t.entries.length}</td><td class="total">${votesTd}</td><td class="total">${shareTd}</td></tr>`;
  });

  wrap.innerHTML = `<table class="matrix q-matrix"><thead>${head}</thead><tbody>${rows.join("")}</tbody></table>`;

  // 列見出しクリックでソート(再描画のたびに付け直す)
  wrap.querySelectorAll("th[data-sort]").forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.dataset.sort;
      if (qSort.key === key) {
        qSort.asc = !qSort.asc;
      } else {
        qSort = { key, asc: key === "name" };
      }
      renderMatrix();
    });
  });
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

/* ---------- 相関グラフ ---------- */

/* 今期(2024年2月〜)に議長・副議長・監査委員の在任期間がある議員か */
function hasRoleThisTerm(m) {
  if (m.role) return true;
  // to は退任日(その日を含まない)なので、今期開始日ちょうどの退任は含めない
  return (m.roleHistory || []).some((h) => !h.to || h.to > TERM_START_DATE);
}

function renderCharts() {
  if (typeof Chart === "undefined") return;
  const ink = "#67766f";
  const gridColor = "#dde5e1";
  // 各点の右横に議員名を常時表示するプラグイン(重なる場合は上下にずらす)
  const labelPlugin = {
    id: "memberLabels",
    afterDatasetsDraw(chart) {
      const ctx = chart.ctx;
      ctx.font = "11px 'Hiragino Kaku Gothic ProN', Meiryo, sans-serif";
      ctx.fillStyle = "#22302c";
      const pts = [];
      chart.data.datasets.forEach((ds, di) => {
        chart.getDatasetMeta(di).data.forEach((pt, i) => {
          pts.push({ x: pt.x, y: pt.y, name: ds.data[i].name });
        });
      });
      pts.sort((a, b) => a.x - b.x || a.y - b.y);
      const placed = [];
      for (const p of pts) {
        const w = ctx.measureText(p.name).width;
        let dy = 4;
        for (const cand of [4, -10, 16, -22, 28]) {
          const box = { x1: p.x + 7, x2: p.x + 9 + w, y1: p.y + cand - 11, y2: p.y + cand + 2 };
          const hit = placed.some(
            (b) => box.x1 < b.x2 && box.x2 > b.x1 && box.y1 < b.y2 && box.y2 > b.y1
          );
          dy = cand;
          if (!hit) break;
        }
        placed.push({ x1: p.x + 7, x2: p.x + 9 + w, y1: p.y + dy - 11, y2: p.y + dy + 2 });
        ctx.fillText(p.name, p.x + 7, p.y + dy);
      }
    },
  };
  const build = (canvasId, xKey, xTitle, xMin, xMax, jitter) => {
    const normal = [];
    const withRole = [];
    const seen = {};
    for (const t of matrixEntries) {
      const m = t.member;
      let x = xKey === "share" ? t.share : m.terms;
      if (x == null) continue;
      if (jitter) {
        // 同一座標の議員が重なって見えなくなるのを防ぐ
        const key = `${x}:${t.termCount}`;
        seen[key] = (seen[key] || 0) + 1;
        if (seen[key] > 1) x += (seen[key] - 1) * 0.15;
      }
      const p = { x, y: t.termCount, name: m.name.replace(/\s+/g, "") };
      (hasRoleThisTerm(m) ? withRole : normal).push(p);
    }
    new Chart(document.getElementById(canvasId), {
      type: "scatter",
      data: {
        datasets: [
          { data: normal, backgroundColor: "#1a735b", pointRadius: 5, pointStyle: "circle" },
          { data: withRole, backgroundColor: "#9aa8a1", pointRadius: 5, pointStyle: "rect" },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { right: 70 } },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (c) => `${c.raw.name}: ${c.raw.y}回` } },
        },
        scales: {
          x: {
            min: xMin,
            max: xMax,
            title: { display: true, text: xTitle, color: ink },
            ticks: { color: ink },
            grid: { color: gridColor },
          },
          y: {
            min: -0.6,
            max: 11,
            title: { display: true, text: "今期の一般質問回数", color: ink },
            ticks: { color: ink, stepSize: 2 },
            grid: { color: gridColor },
          },
        },
      },
      plugins: [labelPlugin],
    });
  };
  build("corr-share", "share", "得票率(%、2024年1月市議選)", 2.4, 7.4, false);
  build("corr-terms", "terms", "期数", 0.4, 7.8, true);
}

/* ---------- ワードクラウド ---------- */

const WC_STOP = new Set([
  "について", "こと", "ため", "など", "および", "また", "その他", "その後",
  "本市", "名取市", "市内", "市民", "状況", "現状", "対応", "対策", "取組", "取り組み",
  "推進", "充実", "強化", "整備", "支援", "活用", "促進", "確保", "検討", "課題",
  "方針", "計画", "令和", "平成", "年度", "事業", "問題", "改善", "運用", "運営",
  "導入", "向上", "周知", "管理", "実施", "実現", "必要", "現在", "今後", "在り方", "考え",
]);

/* 漢字とカタカナをまたぐ複合語は先に1語として数える([検出パターン, 集計語]) */
const WC_COMPOUNDS = [
  ["新型コロナウイルス感染症", "新型コロナ"],
  ["新型コロナウイルスワクチン", "新型コロナ"],
  ["新型コロナウイルス", "新型コロナ"],
  ["新型コロナ", "新型コロナ"],
  ["県立精神医療センター", "県立精神医療センター"],
  ["仙台赤十字病院", "仙台赤十字病院"],
  ["子どもの居場所", "子どもの居場所"],
];

/* 質問テーマ文から語句を抽出して頻度順に返す */
function extractWords(entries) {
  const counts = new Map();
  for (const e of entries) {
    for (const t of e.topics || []) {
      let s = t.replace(/について.*$/, "");
      for (const [pat, token] of WC_COMPOUNDS) {
        const n = s.split(pat).length - 1;
        if (n > 0) {
          counts.set(token, (counts.get(token) || 0) + n);
          s = s.split(pat).join(" ");
        }
      }
      for (const w of s.match(/[一-龥ヶ]{2,8}|[ァ-ヴー]{3,}|[A-Za-z0-9]{2,}/g) || []) {
        if (WC_STOP.has(w)) continue;
        counts.set(w, (counts.get(w) || 0) + 1);
      }
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 80);
}

function renderWordcloud(memberId) {
  if (typeof WordCloud === "undefined") return;
  const canvas = document.getElementById("wordcloud");
  const wrap = document.getElementById("wordcloud-wrap");
  canvas.width = wrap.clientWidth || 800;
  canvas.height = 320;
  const source =
    memberId === "all"
      ? matrixEntries.flatMap((t) => t.entries)
      : (matrixEntries.find((t) => t.member.id === memberId) || { entries: [] }).entries;
  const list = extractWords(source);
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!list.length) {
    ctx.font = "14px sans-serif";
    ctx.fillStyle = "#67766f";
    ctx.fillText("この期間の一般質問データがありません。", 20, 40);
    return;
  }
  const max = list[0][1];
  // 画面幅が狭いときは最大フォントを抑えて長い語が描画から漏れないようにする
  const span = max === 1 ? 12 : Math.min(42, Math.max(20, canvas.width / 12));
  WordCloud(canvas, {
    list,
    gridSize: 10,
    weightFactor: (count) => 13 + Math.sqrt(count / max) * span,
    fontFamily: '"Hiragino Kaku Gothic ProN", "BIZ UDPGothic", Meiryo, sans-serif',
    color: (word, weight) =>
      weight / max > 0.6 ? "#115243" : weight / max > 0.3 ? "#1a735b" : "#4fae8e",
    rotateRatio: 0.3,
    rotationSteps: 2,
    backgroundColor: "rgba(0,0,0,0)",
    drawOutOfBound: false,
    shuffle: false,
  });
}

function setupWordcloud(memberId) {
  const sel = document.getElementById("wc-member");
  if (!sel) return;
  sel.innerHTML =
    '<option value="all">全議員</option>' +
    matrixEntries
      .map((t) => `<option value="${escapeHtml(t.member.id)}">${escapeHtml(t.member.name)}</option>`)
      .join("");
  sel.addEventListener("change", () => renderWordcloud(sel.value));
  renderWordcloud("all");
}
