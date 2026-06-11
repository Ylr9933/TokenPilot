export function renderVisualPageHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>TokenPilot Visual</title>
  <style>
    :root {
      --bg: #f4f1ea;
      --panel: rgba(255, 252, 246, 0.92);
      --panel-strong: #fffdf8;
      --line: rgba(77, 63, 44, 0.14);
      --text: #2f261c;
      --muted: #796958;
      --accent: #0f766e;
      --accent-soft: rgba(15, 118, 110, 0.1);
      --shadow: 0 18px 40px rgba(63, 45, 25, 0.08);
      --radius: 18px;
      --sidebar-width: 252px;
      --sidebar-collapsed: 52px;
      --font-sans: "IBM Plex Sans", "Helvetica Neue", sans-serif;
      --font-mono: "IBM Plex Mono", "SFMono-Regular", monospace;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: var(--font-sans);
      color: var(--text);
      background:
        radial-gradient(circle at top left, rgba(15, 118, 110, 0.12), transparent 34%),
        linear-gradient(180deg, #f7f4ee 0%, var(--bg) 100%);
    }
    .app {
      display: grid;
      grid-template-columns: var(--sidebar-width) 1fr;
      min-height: 100vh;
      transition: grid-template-columns 180ms ease;
    }
    .app.collapsed {
      grid-template-columns: var(--sidebar-collapsed) 1fr;
    }
    .sidebar {
      border-right: 1px solid var(--line);
      background: rgba(255, 250, 243, 0.82);
      backdrop-filter: blur(18px);
      padding: 16px 12px;
      overflow: hidden;
    }
    .sidebar-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 14px;
    }
    .collapse-btn, .nav-btn, .tab-btn {
      border: 1px solid var(--line);
      background: var(--panel-strong);
      color: var(--text);
      border-radius: 12px;
      cursor: pointer;
    }
    .collapse-btn {
      width: 28px;
      height: 28px;
      font-size: 15px;
      flex: 0 0 auto;
    }
    .brand {
      font-size: 13px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .sidebar-copy {
      color: var(--muted);
      font-size: 12px;
      line-height: 1.45;
      margin-bottom: 14px;
    }
    .session-list {
      display: grid;
      gap: 8px;
    }
    .session-item {
      width: 100%;
      border: 1px solid transparent;
      background: transparent;
      color: inherit;
      border-radius: 14px;
      padding: 10px 12px;
      text-align: left;
      cursor: pointer;
      transition: background 140ms ease, border-color 140ms ease, transform 140ms ease;
    }
    .session-item:hover {
      background: rgba(255, 255, 255, 0.55);
      border-color: var(--line);
      transform: translateX(1px);
    }
    .session-item.active {
      background: var(--accent-soft);
      border-color: rgba(15, 118, 110, 0.2);
    }
    .session-id {
      font-size: 12px;
      line-height: 1.4;
      word-break: break-all;
    }
    .session-meta {
      margin-top: 6px;
      font-size: 11px;
      color: var(--muted);
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .collapsed .brand,
    .collapsed .sidebar-copy,
    .collapsed .session-item .session-id,
    .collapsed .session-item .session-meta {
      display: none;
    }
    .collapsed .session-item {
      padding: 10px 8px;
      min-height: 40px;
      background: rgba(255, 255, 255, 0.48);
      border-color: var(--line);
    }
    .collapsed .session-item::before {
      content: attr(data-index);
      font-size: 12px;
      color: var(--muted);
    }
    .main {
      padding: 28px;
      overflow: auto;
    }
    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 22px;
    }
    .title {
      font-size: 28px;
      line-height: 1.1;
      margin: 0 0 6px;
    }
    .subtitle {
      margin: 0;
      color: var(--muted);
      font-size: 14px;
    }
    .tabs {
      display: inline-flex;
      gap: 8px;
      padding: 4px;
      border: 1px solid var(--line);
      border-radius: 16px;
      background: rgba(255, 255, 255, 0.52);
    }
    .tab-btn {
      padding: 10px 14px;
      background: transparent;
    }
    .tab-btn.active {
      background: var(--panel-strong);
      border-color: rgba(15, 118, 110, 0.18);
      color: var(--accent);
    }
    .panel {
      background: var(--panel);
      border: 1px solid rgba(255, 255, 255, 0.48);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      padding: 20px;
    }
    .panel-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 18px;
    }
    .panel-title {
      margin: 0;
      font-size: 18px;
    }
    .panel-meta {
      margin-top: 6px;
      color: var(--muted);
      font-size: 12px;
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    .pager {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    .nav-btn {
      padding: 8px 12px;
    }
    .nav-btn:disabled {
      cursor: not-allowed;
      opacity: 0.45;
    }
    .pager-label {
      font-size: 12px;
      color: var(--muted);
      min-width: 72px;
      text-align: center;
    }
    .compare {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }
    .pane {
      border: 1px solid var(--line);
      border-radius: 16px;
      background: rgba(255, 255, 255, 0.72);
      overflow: hidden;
      min-height: 320px;
    }
    .pane-label {
      padding: 12px 14px;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      border-bottom: 1px solid var(--line);
      color: var(--muted);
      background: rgba(255, 255, 255, 0.68);
    }
    pre {
      margin: 0;
      padding: 16px;
      font-family: var(--font-mono);
      font-size: 12px;
      line-height: 1.55;
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 72vh;
      overflow: auto;
    }
    .stats {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      margin-bottom: 16px;
    }
    .chip {
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 8px 12px;
      font-size: 12px;
      background: rgba(255, 255, 255, 0.78);
    }
    .pass-list {
      margin-top: 12px;
      display: grid;
      gap: 8px;
    }
    .pass-item {
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 10px 12px;
      background: rgba(255, 255, 255, 0.64);
      font-size: 12px;
      line-height: 1.5;
    }
    .empty {
      padding: 38px 20px;
      text-align: center;
      color: var(--muted);
      border: 1px dashed var(--line);
      border-radius: 16px;
      background: rgba(255, 255, 255, 0.4);
    }
    @media (max-width: 980px) {
      .app, .app.collapsed {
        grid-template-columns: 1fr;
      }
      .sidebar {
        border-right: 0;
        border-bottom: 1px solid var(--line);
      }
      .collapsed .brand,
      .collapsed .sidebar-copy,
      .collapsed .session-item .session-id,
      .collapsed .session-item .session-meta {
        display: initial;
      }
      .collapsed .session-item::before {
        content: "";
      }
      .compare {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <div id="app" class="app">
    <aside class="sidebar">
      <div class="sidebar-header">
        <button id="collapseBtn" class="collapse-btn" type="button" aria-label="Toggle sidebar">‹</button>
        <div class="brand">TokenPilot Visual</div>
      </div>
      <div class="sidebar-copy">Pick a session, then inspect one reduction or eviction event at a time.</div>
      <div id="sessionList" class="session-list"></div>
    </aside>
    <main class="main">
      <div class="topbar">
        <div>
          <h1 class="title">Reduction / Eviction Visual</h1>
          <p id="subtitle" class="subtitle">Loading sessions…</p>
        </div>
        <div class="tabs">
          <button id="tabReduction" class="tab-btn active" type="button">Reduction</button>
          <button id="tabEviction" class="tab-btn" type="button">Eviction</button>
        </div>
      </div>
      <section class="panel">
        <div class="panel-header">
          <div>
            <h2 id="panelTitle" class="panel-title">No session selected</h2>
            <div id="panelMeta" class="panel-meta"></div>
          </div>
          <div class="pager">
            <button id="prevBtn" class="nav-btn" type="button">Previous</button>
            <div id="pagerLabel" class="pager-label">0 / 0</div>
            <button id="nextBtn" class="nav-btn" type="button">Next</button>
          </div>
        </div>
        <div id="stats" class="stats"></div>
        <div id="compareRoot"></div>
        <div id="passRoot"></div>
      </section>
    </main>
  </div>
  <script>
    const state = {
      sessions: [],
      activeSessionId: new URL(window.location.href).searchParams.get("session") || "",
      activeTab: "reduction",
      indexes: { reduction: 0, eviction: 0 },
      sessionData: new Map(),
      collapsed: false,
    };

    const el = {
      app: document.getElementById("app"),
      collapseBtn: document.getElementById("collapseBtn"),
      sessionList: document.getElementById("sessionList"),
      subtitle: document.getElementById("subtitle"),
      tabReduction: document.getElementById("tabReduction"),
      tabEviction: document.getElementById("tabEviction"),
      panelTitle: document.getElementById("panelTitle"),
      panelMeta: document.getElementById("panelMeta"),
      pagerLabel: document.getElementById("pagerLabel"),
      prevBtn: document.getElementById("prevBtn"),
      nextBtn: document.getElementById("nextBtn"),
      stats: document.getElementById("stats"),
      compareRoot: document.getElementById("compareRoot"),
      passRoot: document.getElementById("passRoot"),
    };

    function fmtDate(iso) {
      if (!iso) return "";
      try {
        return new Date(iso).toLocaleString();
      } catch {
        return iso;
      }
    }

    function fmtInt(value) {
      return new Intl.NumberFormat("en-US").format(Number(value || 0));
    }

    function escapeHtml(text) {
      return String(text || "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
    }

    async function fetchJson(path) {
      const response = await fetch(path);
      if (!response.ok) throw new Error("HTTP " + response.status);
      return response.json();
    }

    async function loadSessions() {
      const payload = await fetchJson("/api/sessions");
      state.sessions = Array.isArray(payload.sessions) ? payload.sessions : [];
      if (!state.activeSessionId && state.sessions.length > 0) {
        state.activeSessionId = state.sessions[0].sessionId;
      }
      renderSessionList();
      if (state.activeSessionId) {
        await loadSession(state.activeSessionId);
      } else {
        renderEmpty("No visual snapshots yet. Run a few TokenPilot turns first, then refresh this page.");
      }
    }

    async function loadSession(sessionId) {
      if (!sessionId) return;
      state.activeSessionId = sessionId;
      const query = new URL(window.location.href);
      query.searchParams.set("session", sessionId);
      history.replaceState(null, "", query.toString());
      if (!state.sessionData.has(sessionId)) {
        const payload = await fetchJson("/api/session?sessionId=" + encodeURIComponent(sessionId));
        state.sessionData.set(sessionId, payload);
      }
      renderSessionList();
      renderActiveView();
    }

    function renderSessionList() {
      if (state.sessions.length === 0) {
        el.sessionList.innerHTML = '<div class="empty">No sessions</div>';
        el.subtitle.textContent = "No visual snapshots available yet.";
        return;
      }
      el.subtitle.textContent = state.activeSessionId
        ? "Session " + state.activeSessionId
        : "Pick a session from the left.";
      el.sessionList.innerHTML = state.sessions.map((session, index) => {
        const active = session.sessionId === state.activeSessionId ? "active" : "";
        return '<button class="session-item ' + active + '" data-session-id="' + escapeHtml(session.sessionId) + '" data-index="' + (index + 1) + '" type="button">'
          + '<div class="session-id">' + escapeHtml(session.sessionId) + '</div>'
          + '<div class="session-meta"><span>R ' + fmtInt(session.reductionCount) + '</span><span>E ' + fmtInt(session.evictionCount) + '</span><span>' + escapeHtml(fmtDate(session.lastAt)) + '</span></div>'
          + '</button>';
      }).join("");
      el.sessionList.querySelectorAll(".session-item").forEach((node) => {
        node.addEventListener("click", () => {
          void loadSession(node.getAttribute("data-session-id") || "");
        });
      });
    }

    function activeItems() {
      const data = state.sessionData.get(state.activeSessionId);
      if (!data) return [];
      return state.activeTab === "reduction" ? (data.reduction || []) : (data.eviction || []);
    }

    function renderEmpty(message) {
      el.panelTitle.textContent = state.activeSessionId || "No session selected";
      el.panelMeta.innerHTML = "";
      el.pagerLabel.textContent = "0 / 0";
      el.prevBtn.disabled = true;
      el.nextBtn.disabled = true;
      el.stats.innerHTML = "";
      el.compareRoot.innerHTML = '<div class="empty">' + escapeHtml(message) + '</div>';
      el.passRoot.innerHTML = "";
    }

    function renderReduction(item) {
      const passes = Array.isArray(item.report) ? item.report : [];
      const changedPasses = passes.filter((entry) => entry && entry.changed);
      el.panelTitle.textContent = "Reduction";
      el.panelMeta.innerHTML = '<span>' + escapeHtml(fmtDate(item.at)) + '</span>'
        + '<span>request ' + escapeHtml(item.requestId) + '</span>'
        + '<span>tool ' + escapeHtml(item.toolName || "unknown") + '</span>'
        + '<span>' + escapeHtml(item.field) + '</span>'
        + '<span>model ' + escapeHtml(item.model || item.upstreamModel || "unknown") + '</span>';
      el.stats.innerHTML = [
        ['Saved chars', fmtInt(item.savedChars)],
        ['Segment', item.segmentId],
        ['Item index', fmtInt(item.itemIndex)],
        ['Passes touched', fmtInt(changedPasses.length)],
        ['Path', item.dataPath || '-'],
      ].map(([label, value]) => '<div class="chip">' + escapeHtml(label) + ': ' + escapeHtml(value) + '</div>').join("");
      el.compareRoot.innerHTML = '<div class="compare">'
        + '<div class="pane"><div class="pane-label">Before Tool Segment</div><pre>' + escapeHtml(item.beforeText) + '</pre></div>'
        + '<div class="pane"><div class="pane-label">After Tool Segment</div><pre>' + escapeHtml(item.afterText) + '</pre></div>'
        + '</div>';
      el.passRoot.innerHTML = passes.length === 0
        ? ""
        : '<div class="pass-list">' + passes.map((entry) => {
            const saved = Math.max(0, Number(entry.beforeChars || 0) - Number(entry.afterChars || 0));
            return '<div class="pass-item">'
              + '<strong>' + escapeHtml(entry.id || "pass") + '</strong>'
              + ' · ' + escapeHtml(entry.phase || "")
              + ' · ' + escapeHtml(entry.target || "")
              + '<br />changed=' + escapeHtml(String(Boolean(entry.changed)))
              + ' · saved=' + escapeHtml(fmtInt(saved))
              + (entry.note ? ' · note=' + escapeHtml(entry.note) : '')
              + (entry.skippedReason ? ' · skipped=' + escapeHtml(entry.skippedReason) : '')
              + '</div>';
          }).join("") + '</div>';
    }

    function renderEviction(item) {
      el.panelTitle.textContent = "Eviction";
      el.panelMeta.innerHTML = '<span>' + escapeHtml(fmtDate(item.at)) + '</span>'
        + '<span>task ' + escapeHtml(item.taskLabel || item.taskId) + '</span>'
        + '<span>' + escapeHtml(item.replacementMode) + '</span>';
      el.stats.innerHTML = [
        ['Before chars', fmtInt(item.beforeChars)],
        ['After chars', fmtInt(item.afterChars)],
        ['Task id', item.taskId],
        ['Turns', Array.isArray(item.turnAbsIds) ? fmtInt(item.turnAbsIds.length) : '0'],
      ].map(([label, value]) => '<div class="chip">' + escapeHtml(label) + ': ' + escapeHtml(value) + '</div>').join("");
      el.compareRoot.innerHTML = '<div class="compare">'
        + '<div class="pane"><div class="pane-label">Before Eviction</div><pre>' + escapeHtml(item.beforeText) + '</pre></div>'
        + '<div class="pane"><div class="pane-label">After Eviction</div><pre>' + escapeHtml(item.afterText) + '</pre></div>'
        + '</div>';
      el.passRoot.innerHTML = item.archivePath
        ? '<div class="pass-list"><div class="pass-item"><strong>Archive</strong><br />' + escapeHtml(item.archivePath) + '</div></div>'
        : "";
    }

    function renderActiveView() {
      const items = activeItems();
      const index = state.indexes[state.activeTab] || 0;
      el.tabReduction.classList.toggle("active", state.activeTab === "reduction");
      el.tabEviction.classList.toggle("active", state.activeTab === "eviction");
      if (!state.activeSessionId) {
        renderEmpty("Pick a session from the left.");
        return;
      }
      if (items.length === 0) {
        renderEmpty("This session has no " + state.activeTab + " snapshots yet.");
        return;
      }
      const safeIndex = Math.max(0, Math.min(index, items.length - 1));
      state.indexes[state.activeTab] = safeIndex;
      el.pagerLabel.textContent = (safeIndex + 1) + " / " + items.length;
      el.prevBtn.disabled = safeIndex <= 0;
      el.nextBtn.disabled = safeIndex >= items.length - 1;
      const item = items[safeIndex];
      if (state.activeTab === "reduction") {
        renderReduction(item);
      } else {
        renderEviction(item);
      }
    }

    el.tabReduction.addEventListener("click", () => {
      state.activeTab = "reduction";
      renderActiveView();
    });
    el.tabEviction.addEventListener("click", () => {
      state.activeTab = "eviction";
      renderActiveView();
    });
    el.prevBtn.addEventListener("click", () => {
      state.indexes[state.activeTab] = Math.max(0, (state.indexes[state.activeTab] || 0) - 1);
      renderActiveView();
    });
    el.nextBtn.addEventListener("click", () => {
      state.indexes[state.activeTab] = (state.indexes[state.activeTab] || 0) + 1;
      renderActiveView();
    });
    el.collapseBtn.addEventListener("click", () => {
      state.collapsed = !state.collapsed;
      el.app.classList.toggle("collapsed", state.collapsed);
      el.collapseBtn.textContent = state.collapsed ? "›" : "‹";
    });

    void loadSessions().catch((error) => {
      renderEmpty("Failed to load visual data: " + (error && error.message ? error.message : String(error)));
    });
  </script>
</body>
</html>`;
}
