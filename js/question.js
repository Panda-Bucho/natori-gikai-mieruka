/* 質問要約ページ: question.html?m={議員id}&d={日付} で1件の質疑(要約+映像・議事録リンク)を表示 */

document.addEventListener("DOMContentLoaded", async () => {
  const wrap = document.getElementById("qd-wrap");
  const params = new URLSearchParams(location.search);
  const mid = params.get("m");
  const date = params.get("d");
  try {
    const [members, questions, summaries] = await Promise.all([
      fetchJson("data/members.json"),
      fetchJson("data/questions.json"),
      fetchJson("data/summaries.json").catch(() => ({ entries: {} })),
    ]);
    const member = members.members.find((x) => x.id === mid);
    const entry = member ? (questions.members[mid] || []).find((e) => e.date === date) : null;
    if (!member || !entry) {
      wrap.innerHTML =
        '<section class="card"><p>指定された質問が見つかりませんでした。<a href="questions.html">一般質問の一覧</a>からお探しください。</p></section>';
      return;
    }
    document.title = `${member.name}議員の一般質問(${formatDateJa(entry.date)})の要約 | 名取市議会議員 見える化`;
    const s = (summaries.entries || {})[`${mid}|${date}`];
    wrap.innerHTML = renderHeader(member, entry) + renderSummary(s, entry, summaries);
    const gen = document.getElementById("generated-at");
    if (gen && summaries.generatedAt) {
      gen.textContent = `要約データ生成: ${formatDateJa(summaries.generatedAt.slice(0, 10))}`;
    }
  } catch (e) {
    wrap.innerHTML = `<section class="card"><p>データの読み込みに失敗しました: ${escapeHtml(e.message)}</p></section>`;
  }
});

function renderHeader(m, e) {
  const seat = `<span class="seat-no">${m.seatNo ?? "—"}</span>`;
  const name = m.officialPage
    ? `<a class="name-link" href="${escapeHtml(m.officialPage)}" target="_blank" rel="noopener noreferrer" title="名取市議会 公式プロフィールを開く">${escapeHtml(m.name)}</a>`
    : escapeHtml(m.name);
  const role = m.role ? ` <span class="role-badge">${escapeHtml(m.role)}</span>` : "";
  const topics = (e.topics || []).length
    ? `<ul class="qd-topics">${e.topics.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul>`
    : "<p>(テーマ情報なし)</p>";
  return `<section class="card">
    <h2>一般質問 ${seat}${name}${role} <span class="qd-faction">${escapeHtml(m.faction)}</span></h2>
    <p class="qd-meeting">${escapeHtml(e.assembly)} 本会議(${formatDateJa(e.date)})</p>
    <p class="lead">通告テーマ:</p>
    ${topics}
  </section>`;
}

function renderSummary(s, e, summaries) {
  const video = `<a class="qd-btn" href="${escapeHtml(e.url)}" target="_blank" rel="noopener noreferrer">▶ 映像を見る</a>`;
  const minutes = e.minutesUrl
    ? `<a class="qd-btn" href="${escapeHtml(e.minutesUrl)}" target="_blank" rel="noopener noreferrer">📄 議事録を読む</a>`
    : "";
  const note = e.minutesUrl
    ? "※映像はこの質問の冒頭から再生されます。議事録は発言箇所が選択された状態で開きます。"
    : "※映像はこの質問の冒頭から再生されます。";
  const actions = `<div class="qd-actions">${video}${minutes}</div>
    <p class="lead chart-note">${note}</p>`;

  if (!s) {
    return `<section class="card">
      <h2>質疑の要約</h2>
      <p class="lead">この質問の要約はまだありません。会議録が公開され次第、作成されます。まずは映像でご覧いただけます。</p>
      ${actions}
    </section>`;
  }
  const gains = (s.gains || [])
    .map((g) => `<li>${escapeHtml(g)}</li>`)
    .join("");
  return `<section class="card">
    <h2>質疑の要約 <span class="ai-badge" title="${escapeHtml(summaries.model || "AI")}による自動生成">AI要約</span></h2>
    <p class="qd-summary">${escapeHtml(s.summary)}</p>
    <h3 class="qd-gains-head">質疑で得られたもの(答弁で示された約束・方針・現状)</h3>
    <ul class="qd-gains">${gains}</ul>
    ${actions}
  </section>`;
}
