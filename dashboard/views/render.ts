import type { Manifest } from "../../scanner/types.js";
import type { RepoSummary, FunctionScore, HistoryEntry } from "../store.js";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function statusIcon(status: string): string {
  if (status === "present" || status === "generated" || status === "manual" || status === "pass") return '<span class="icon pass">[OK]</span>';
  if (status === "partial") return '<span class="icon warn">[!!]</span>';
  return '<span class="icon fail">[XX]</span>';
}

function scoreColor(pct: number): string {
  if (pct >= 80) return "#39ff14";
  if (pct >= 60) return "#ffff00";
  if (pct >= 40) return "#ff8c00";
  return "#ff0040";
}

function hpBar(pct: number, width: number = 20, label: string = "HP"): string {
  const color = scoreColor(pct);
  const filled = Math.round((pct / 100) * width);
  const empty = width - filled;
  return `<span class="hp-bar"><span class="hp-label">${label}</span> <span style="color:${color}">${"\u2588".repeat(filled)}</span><span class="hp-empty">${"\u2591".repeat(empty)}</span> <span style="color:${color}">${pct}%</span></span>`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "JUST NOW";
  if (mins < 60) return `${mins}M AGO`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}H AGO`;
  const days = Math.floor(hours / 24);
  return `${days}D AGO`;
}

function layout(title: string, content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)}</title>
  <script src="https://unpkg.com/htmx.org@2.0.4"></script>
  <link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Press Start 2P', monospace;
      background: #0a0a0a;
      color: #39ff14;
      min-height: 100vh;
      font-size: 11px;
      line-height: 1.8;
    }
    body::after {
      content: "";
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: repeating-linear-gradient(0deg, rgba(0,0,0,0.15) 0px, rgba(0,0,0,0.15) 1px, transparent 1px, transparent 3px);
      pointer-events: none;
      z-index: 9999;
    }
    body::before {
      content: "";
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: radial-gradient(ellipse at center, transparent 60%, rgba(0,0,0,0.7) 100%);
      pointer-events: none;
      z-index: 9998;
    }
    a { color: #00ffff; text-decoration: none; }
    a:hover { color: #ff00ff; text-shadow: 0 0 8px #ff00ff; }
    .header {
      background: #0a0a0a;
      border-bottom: 3px double #39ff14;
      padding: 12px 24px;
      text-align: center;
    }
    .header h1 {
      font-size: 14px;
      color: #39ff14;
      text-shadow: 0 0 10px #39ff14, 0 0 20px #39ff14, 0 0 40px #006400;
      letter-spacing: 2px;
      animation: flicker 4s infinite alternate;
    }
    .header .subtitle { font-size: 7px; color: #00ffff; margin-top: 4px; letter-spacing: 4px; }
    @keyframes flicker { 0%,95%,100%{opacity:1} 96%{opacity:0.8} 97%{opacity:1} 98%{opacity:0.9} }
    @keyframes blink { 0%,49%{opacity:1} 50%,100%{opacity:0} }
    @keyframes slideIn { from{transform:translateY(-10px);opacity:0} to{transform:translateY(0);opacity:1} }
    .container { max-width: 1100px; margin: 0 auto; padding: 16px; }

    /* Compact stats row */
    .stats-row { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
    .stat-card {
      background: #0a0a0a;
      border: 1px solid #333;
      padding: 8px 12px;
      flex: 1;
      min-width: 100px;
    }
    .stat-card .label { font-size: 6px; color: #888; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 2px; }
    .stat-card .value { font-size: 16px; text-shadow: 0 0 8px currentColor; }

    /* Search bar */
    .search-bar {
      margin-bottom: 16px;
    }
    .search-bar input {
      width: 100%;
      font-family: 'Press Start 2P', monospace;
      font-size: 9px;
      background: #050505;
      border: 1px solid #333;
      color: #39ff14;
      padding: 8px 12px;
      outline: none;
    }
    .search-bar input:focus { border-color: #39ff14; box-shadow: 0 0 8px rgba(57,255,20,0.2); }
    .search-bar input::placeholder { color: #444; }

    .section-title {
      font-size: 9px; color: #ff00ff; text-transform: uppercase;
      letter-spacing: 3px; margin-bottom: 12px; text-shadow: 0 0 6px #ff00ff;
    }
    .section-title::before { content: ">> "; }
    .section-title::after { content: " <<"; }

    /* Repo card */
    .repo-card {
      background: #0a0a0a; border: 1px solid #333; padding: 12px;
      margin-bottom: 8px; cursor: pointer; transition: all 0.15s; position: relative;
    }
    .repo-card:hover { border-color: #39ff14; box-shadow: 0 0 15px rgba(57,255,20,0.2); }
    .repo-card.open { border-color: #39ff14; }
    .repo-card .repo-header { display: flex; justify-content: space-between; align-items: center; }
    .repo-card .repo-name { font-size: 11px; color: #39ff14; }
    .repo-card:hover .repo-name { text-shadow: 0 0 8px #39ff14; }
    .repo-card .repo-meta { font-size: 7px; color: #666; margin-top: 2px; }
    .repo-card .checks-grid { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: 10px; border-top: 1px solid #1a1a1a; padding-top: 8px; }
    .repo-card .check { font-size: 8px; display: flex; align-items: center; gap: 4px; color: #aaa; white-space: nowrap; }
    .hp-bar { font-size: 9px; display: flex; align-items: center; gap: 4px; }
    .hp-label { color: #ff0040; font-size: 7px; }
    .hp-empty { color: #333; }
    .icon { font-size: 9px; }
    .icon.pass { color: #39ff14; }
    .icon.warn { color: #ffff00; }
    .icon.fail { color: #ff0040; }

    /* Branch selector */
    .branch-selector { display: flex; gap: 0; margin-bottom: 0; flex-wrap: wrap; }
    .branch-btn {
      padding: 6px 12px; font-size: 7px; color: #666; cursor: pointer;
      border: 1px solid #333; background: #050505;
      font-family: 'Press Start 2P', monospace;
      letter-spacing: 1px; transition: all 0.15s;
    }
    .branch-btn:hover { color: #00ffff; border-color: #00ffff; }
    .branch-btn.active { color: #00ffff; border-color: #00ffff; background: #0a0a0a; text-shadow: 0 0 6px #00ffff; }

    /* Tabs */
    .tab-bar { display: flex; gap: 0; margin-bottom: 0; border-bottom: 2px solid #333; flex-wrap: wrap; }
    .tab {
      padding: 6px 12px; font-size: 7px; color: #666; cursor: pointer;
      border: 1px solid #333; border-bottom: none; background: #050505;
      font-family: 'Press Start 2P', monospace;
      letter-spacing: 1px; transition: all 0.15s;
    }
    .tab:hover { color: #39ff14; border-color: #39ff14; }
    .tab.active { color: #39ff14; border-color: #39ff14; background: #0a0a0a; text-shadow: 0 0 6px #39ff14; }

    /* Detail panel */
    .detail {
      background: #050505; border: 1px solid #39ff14; border-top: none;
      padding: 16px; margin-bottom: 12px;
      box-shadow: 0 0 15px rgba(57,255,20,0.1);
      animation: slideIn 0.2s ease-out;
    }
    .detail h3 { font-size: 9px; margin-bottom: 8px; color: #00ffff; text-shadow: 0 0 6px #00ffff; }
    .detail h3::before { content: "[ "; color: #555; }
    .detail h3::after { content: " ]"; color: #555; }
    .detail table { width: 100%; border-collapse: collapse; margin-bottom: 16px; table-layout: fixed; }
    .detail th, .detail td { text-align: left; padding: 5px 8px; font-size: 8px; border-bottom: 1px solid #1a1a1a; word-wrap: break-word; overflow-wrap: break-word; }
    .detail th { color: #ff00ff; font-weight: normal; letter-spacing: 1px; }
    .detail td { color: #ccc; }
    .detail td code { color: #ffff00; background: none; font-family: 'Press Start 2P', monospace; font-size: 7px; word-break: break-all; }

    /* NIST radar */
    .nist-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
    .nist-func { background: #0a0a0a; border: 1px solid #222; padding: 10px; }
    .nist-func .func-name { font-size: 8px; color: #00ffff; margin-bottom: 6px; text-shadow: 0 0 4px #00ffff; }
    .nist-func .func-stats { font-size: 7px; color: #666; margin-top: 4px; }

    /* Branch comparison */
    .branch-row { display: flex; gap: 16px; margin-bottom: 12px; align-items: center; }
    .branch-name { font-size: 9px; color: #00ffff; min-width: 200px; }
    .branch-diff { font-size: 8px; margin-left: 8px; }
    .branch-diff.up { color: #39ff14; }
    .branch-diff.down { color: #ff0040; }

    /* Trend chart (ASCII) */
    .trend-chart { font-size: 8px; line-height: 1.4; white-space: pre; color: #666; margin: 10px 0; overflow-x: auto; }
    .trend-chart .bar { color: #39ff14; }
    .trend-chart .bar-warn { color: #ffff00; }
    .trend-chart .bar-fail { color: #ff0040; }

    .empty { text-align: center; padding: 60px 20px; }
    .empty h2 { font-size: 12px; color: #39ff14; margin-bottom: 12px; text-shadow: 0 0 10px #39ff14; }
    .empty p { color: #666; font-size: 8px; }
    .cursor-blink::after { content: "_"; animation: blink 1s infinite; }
    .insert-coin { text-align: center; font-size: 7px; color: #555; margin-top: 30px; letter-spacing: 2px; }

    /* Hidden helper */
    .hidden { display: none !important; }

    /* Mobile */
    @media (max-width: 768px) {
      body { font-size: 9px; }
      .container { padding: 10px; }
      .header { padding: 10px 12px; }
      .header h1 { font-size: 11px; }
      .header .subtitle { font-size: 6px; letter-spacing: 2px; }
      .stats-row { gap: 4px; }
      .stat-card { padding: 6px 8px; min-width: 70px; }
      .stat-card .label { font-size: 5px; }
      .stat-card .value { font-size: 12px; }
      .repo-card { padding: 10px; }
      .repo-card .repo-header { flex-direction: column; align-items: flex-start; gap: 6px; }
      .repo-card .repo-name { font-size: 9px; }
      .repo-card .checks-grid { gap: 3px 8px; }
      .repo-card .check { font-size: 7px; }
      .hp-bar { font-size: 7px; }
      .hp-label { font-size: 6px; }
      .tab-bar { flex-wrap: wrap; }
      .tab { padding: 5px 8px; font-size: 6px; }
      .branch-btn { padding: 5px 8px; font-size: 6px; }
      .detail { padding: 10px; }
      .detail h3 { font-size: 8px; }
      .detail th, .detail td { padding: 4px 4px; font-size: 7px; }
      .detail td code { font-size: 6px; }
      .nist-grid { grid-template-columns: 1fr; gap: 8px; }
      .nist-func { padding: 8px; }
      .trend-chart { font-size: 7px; }
      .search-bar input { font-size: 8px; padding: 6px 10px; }
      .section-title { font-size: 8px; }
      .branch-selector { flex-wrap: wrap; }
    }

    @media (max-width: 480px) {
      .stat-card { min-width: 55px; }
      .stat-card .value { font-size: 10px; }
      .stat-card .label { font-size: 4px; }
      .hp-bar { font-size: 6px; }
      .repo-card .repo-name { font-size: 8px; word-break: break-all; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>GRC OBSERVABILITY</h1>
    <div class="subtitle">GOVERNANCE RISK COMPLIANCE OBSERVABILITY DASHBOARD</div>
  </div>
  <div class="container">
    ${content}
    <div class="insert-coin">SYSTEM ACTIVE <span class="cursor-blink"></span></div>
  </div>
  <script>
    function toggleRepo(id) {
      const el = document.getElementById(id);
      const card = el.previousElementSibling;
      if (el.style.display === 'none' || !el.style.display) {
        el.style.display = 'block';
        card.classList.add('open');
      } else {
        el.style.display = 'none';
        card.classList.remove('open');
      }
    }
    function filterRepos() {
      const q = document.getElementById('repo-search').value.toLowerCase();
      document.querySelectorAll('.repo-entry').forEach(function(entry) {
        const name = entry.getAttribute('data-repo').toLowerCase();
        entry.style.display = name.includes(q) ? '' : 'none';
      });
    }
    function switchBranch(repoId, owner, name, branch, btn) {
      btn.parentElement.querySelectorAll('.branch-btn').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      var panel = document.getElementById('panel-' + repoId);
      htmx.ajax('GET', '/repo/' + owner + '/' + name + '?branch=' + encodeURIComponent(branch), {target: panel, swap: 'innerHTML'});
    }
  </script>
</body>
</html>`;
}

export function renderDashboard(summaries: RepoSummary[]): string {
  if (summaries.length === 0) {
    return layout("GRC OBSERVABILITY", `
      <div class="empty">
        <h2>NO TARGETS DETECTED</h2>
        <p>POST a manifest to <code>/api/report</code> to begin scanning.</p>
      </div>`);
  }

  // Group summaries by repo
  const repoMap = new Map<string, RepoSummary[]>();
  for (const s of summaries) {
    const existing = repoMap.get(s.repo) || [];
    existing.push(s);
    repoMap.set(s.repo, existing);
  }

  // Use latest scan per repo for top-level stats
  const latestPerRepo: RepoSummary[] = [];
  for (const [, branches] of repoMap) {
    branches.sort((a, b) => new Date(b.scanDate).getTime() - new Date(a.scanDate).getTime());
    latestPerRepo.push(branches[0]);
  }

  const totalRepos = latestPerRepo.length;
  const avgScore = Math.round(latestPerRepo.reduce((s, r) => s + r.complianceScore, 0) / totalRepos);
  const avgNist = Math.round(latestPerRepo.reduce((s, r) => s + r.nistScore, 0) / totalRepos);
  const totalVulns = latestPerRepo.reduce((s, r) => s + r.criticalVulns + r.highVulns, 0);
  const secretsCount = latestPerRepo.filter(r => r.secretsDetected).length;

  const statsHtml = `
    <div class="stats-row">
      <div class="stat-card">
        <div class="label">Targets</div>
        <div class="value" style="color:#00ffff">${totalRepos}</div>
      </div>
      <div class="stat-card">
        <div class="label">Compliance</div>
        <div class="value" style="color:${scoreColor(avgScore)}">${avgScore}%</div>
      </div>
      <div class="stat-card">
        <div class="label">NIST CSF</div>
        <div class="value" style="color:${scoreColor(avgNist)}">${avgNist}%</div>
      </div>
      <div class="stat-card">
        <div class="label">Threats</div>
        <div class="value" style="color:${totalVulns > 0 ? "#ff0040" : "#39ff14"}">${totalVulns}</div>
      </div>
      <div class="stat-card">
        <div class="label">Leaks</div>
        <div class="value" style="color:${secretsCount > 0 ? "#ff0040" : "#39ff14"}">${secretsCount}</div>
      </div>
    </div>`;

  const searchHtml = `
    <div class="search-bar">
      <input type="text" id="repo-search" placeholder="> SEARCH REPOS..." oninput="filterRepos()">
    </div>`;

  const reposHtml: string[] = [];
  for (const [repo, branches] of repoMap) {
    const [owner, name] = repo.split("/");
    const safeId = (owner + "-" + name).replace(/\./g, "-");
    const latest = branches[0]; // already sorted by date desc

    // Branch selector buttons
    const branchBtns = branches.map((b, i) =>
      `<div class="branch-btn${i === 0 ? " active" : ""}" onclick="switchBranch('${safeId}','${owner}','${name}','${esc(b.branch)}',this)">${esc(b.branch)}</div>`
    ).join("");

    reposHtml.push(`
    <div class="repo-entry" data-repo="${esc(repo)}">
      <div class="repo-card" onclick="toggleRepo('detail-${safeId}')">
        <div class="repo-header">
          <div>
            <div class="repo-name">&gt; ${esc(repo)}</div>
            <div class="repo-meta">${branches.length} branch${branches.length > 1 ? "es" : ""} // latest: ${timeAgo(latest.scanDate)}</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:3px;align-items:flex-end;">
            ${hpBar(latest.complianceScore, 12, "HP")}
            ${hpBar(latest.nistScore, 12, "NIST")}
          </div>
        </div>
        <div class="checks-grid">
          <div class="check">${latest.secretsDetected ? '<span class="icon fail">[XX]</span>' : '<span class="icon pass">[OK]</span>'} SECRETS</div>
          <div class="check">${latest.headersPresent === latest.headersTotal && latest.headersTotal > 0 ? '<span class="icon pass">[OK]</span>' : latest.headersPresent > 0 ? '<span class="icon warn">[!!]</span>' : '<span class="icon fail">[XX]</span>'} HDR ${latest.headersPresent}/${latest.headersTotal}</div>
          <div class="check">${latest.httpsEnforced === true ? '<span class="icon pass">[OK]</span>' : latest.httpsEnforced === false ? '<span class="icon fail">[XX]</span>' : '<span style="color:#555">[-]</span>'} HTTPS</div>
          <div class="check">${latest.criticalVulns + latest.highVulns === 0 ? '<span class="icon pass">[OK]</span>' : '<span class="icon fail">[XX]</span>'} DEPS ${latest.criticalVulns}C/${latest.highVulns}H</div>
          <div class="check">${statusIcon(latest.artifacts.privacyPolicy)} PRIV</div>
          <div class="check">${statusIcon(latest.artifacts.securityTxt)} SEC</div>
          <div class="check">${statusIcon(latest.artifacts.incidentResponsePlan)} IRP</div>
          <div class="check">${statusIcon(latest.artifacts.vulnerabilityDisclosure)} DISC</div>
        </div>
      </div>
      <div id="detail-${safeId}" style="display:none;">
        ${branches.length > 1 ? `<div class="branch-selector">${branchBtns}</div>` : ""}
        <div class="tab-bar">
          <div class="tab active" hx-get="/repo/${owner}/${name}" hx-target="#panel-${safeId}" hx-swap="innerHTML" onclick="document.querySelectorAll('#detail-${safeId} .tab').forEach(t=>t.classList.remove('active'));this.classList.add('active')">OVERVIEW</div>
          <div class="tab" hx-get="/nist/${owner}/${name}" hx-target="#panel-${safeId}" hx-swap="innerHTML" onclick="document.querySelectorAll('#detail-${safeId} .tab').forEach(t=>t.classList.remove('active'));this.classList.add('active')">NIST CSF</div>
          <div class="tab" hx-get="/branches/${owner}/${name}" hx-target="#panel-${safeId}" hx-swap="innerHTML" onclick="document.querySelectorAll('#detail-${safeId} .tab').forEach(t=>t.classList.remove('active'));this.classList.add('active')">BRANCHES</div>
          <div class="tab" hx-get="/trends/${owner}/${name}" hx-target="#panel-${safeId}" hx-swap="innerHTML" onclick="document.querySelectorAll('#detail-${safeId} .tab').forEach(t=>t.classList.remove('active'));this.classList.add('active')">TRENDS</div>
        </div>
        <div id="panel-${safeId}" hx-get="/repo/${owner}/${name}" hx-trigger="load"></div>
      </div>
    </div>`);
  }

  return layout("GRC OBSERVABILITY", statsHtml + searchHtml + `<div class="section"><div class="section-title">Scanned Repos</div>${reposHtml.join("\n")}</div>`);
}

export function renderRepoDetail(manifest: Manifest, summary: RepoSummary): string {
  const dc = manifest.dataCollection;
  const tp = manifest.thirdPartyServices;
  const h = manifest.securityHeaders;
  const ac = manifest.accessControls;

  let html = `<div class="detail">`;

  // Repo + branch info
  html += `<div style="font-size:7px;color:#666;margin-bottom:12px;">${esc(manifest.branch)} // ${esc(manifest.commit)} // ${timeAgo(manifest.scanDate)}</div>`;

  html += `<h3>DATA COLLECTION // ${dc.length} POINTS</h3>`;
  if (dc.length > 0) {
    html += `<table><colgroup><col style="width:15%"><col style="width:15%"><col style="width:40%"><col style="width:30%"></colgroup>`;
    html += `<tr><th>TYPE</th><th>SOURCE</th><th>LOCATION</th><th>FIELDS</th></tr>`;
    for (const d of dc) {
      html += `<tr><td>${esc(d.type)}</td><td>${esc(d.source)}</td><td><code>${esc(d.location)}</code></td><td>${esc(d.fields.join(", "))}</td></tr>`;
    }
    html += `</table>`;
  }

  if (tp.length > 0) {
    html += `<h3>THIRD-PARTY SERVICES</h3>`;
    html += `<table><colgroup><col style="width:20%"><col style="width:25%"><col style="width:35%"><col style="width:20%"></colgroup>`;
    html += `<tr><th>SERVICE</th><th>PURPOSE</th><th>DATA SHARED</th><th>DPA</th></tr>`;
    for (const s of tp) {
      html += `<tr><td>${esc(s.name)}</td><td>${esc(s.purpose)}</td><td>${esc(s.dataShared.join(", "))}</td><td>${s.dpaUrl ? `<a href="${esc(s.dpaUrl)}" target="_blank">[LINK]</a>` : '<span style="color:#555">NONE</span>'}</td></tr>`;
    }
    html += `</table>`;
  }

  if (h) {
    html += `<h3>SECURITY HEADERS // ${summary.headersPresent}/${summary.headersTotal}</h3>`;
    html += `<table><colgroup><col style="width:60%"><col style="width:40%"></colgroup>`;
    html += `<tr><th>HEADER</th><th>STATUS</th></tr>`;
    const names: Record<string, string> = { csp:"Content-Security-Policy", hsts:"Strict-Transport-Security", xFrameOptions:"X-Frame-Options", xContentTypeOptions:"X-Content-Type-Options", referrerPolicy:"Referrer-Policy", permissionsPolicy:"Permissions-Policy" };
    for (const [key, label] of Object.entries(names)) {
      const val = (h as any)[key] as string;
      html += `<tr><td>${label}</td><td>${statusIcon(val)} ${val.toUpperCase()}</td></tr>`;
    }
    html += `</table>`;
  }

  if (manifest.https) {
    html += `<h3>HTTPS // TLS</h3>`;
    html += `<table><colgroup><col style="width:60%"><col style="width:40%"></colgroup>`;
    html += `<tr><th>CHECK</th><th>STATUS</th></tr>`;
    html += `<tr><td>HTTPS Enforced</td><td>${manifest.https.enforced ? '<span class="icon pass">[OK]</span> YES' : '<span class="icon fail">[XX]</span> NO'}</td></tr>`;
    html += `<tr><td>Cert Expiry</td><td>${manifest.https.certExpiry ?? '<span style="color:#555">UNKNOWN</span>'}</td></tr>`;
    html += `</table>`;
  }

  if (manifest.dependencies) {
    const d = manifest.dependencies;
    html += `<h3>DEPENDENCIES</h3>`;
    html += `<table><colgroup><col style="width:60%"><col style="width:40%"></colgroup>`;
    html += `<tr><th>SEVERITY</th><th>COUNT</th></tr>`;
    html += `<tr><td>CRITICAL</td><td style="color:${d.criticalVulnerabilities > 0 ? "#ff0040" : "#39ff14"};text-shadow:0 0 6px currentColor">${d.criticalVulnerabilities}</td></tr>`;
    html += `<tr><td>HIGH</td><td style="color:${d.highVulnerabilities > 0 ? "#ff0040" : "#39ff14"};text-shadow:0 0 6px currentColor">${d.highVulnerabilities}</td></tr>`;
    html += `<tr><td>MEDIUM</td><td style="color:#ffff00">${d.mediumVulnerabilities}</td></tr>`;
    html += `<tr><td>LAST AUDIT</td><td>${d.lastAudit}</td></tr>`;
    html += `</table>`;
  }

  html += `<h3>ACCESS CONTROLS</h3>`;
  html += `<table><colgroup><col style="width:60%"><col style="width:40%"></colgroup>`;
  html += `<tr><th>CONTROL</th><th>STATUS</th></tr>`;
  html += `<tr><td>Branch Protection</td><td>${ac.branchProtection === true ? '<span class="icon pass">[OK]</span> ENABLED' : ac.branchProtection === false ? '<span class="icon fail">[XX]</span> DISABLED' : '<span style="color:#555">UNKNOWN</span>'}</td></tr>`;
  html += `<tr><td>Required Reviews</td><td>${ac.requiredReviews ?? '<span style="color:#555">\u2014</span>'}</td></tr>`;
  html += `<tr><td>Signed Commits</td><td>${ac.signedCommits === true ? '<span class="icon pass">[OK]</span>' : ac.signedCommits === false ? '<span class="icon fail">[XX]</span>' : '<span style="color:#555">\u2014</span>'}</td></tr>`;
  html += `</table>`;

  html += `<h3>GOVERNANCE ARTIFACTS</h3>`;
  html += `<table><colgroup><col style="width:60%"><col style="width:40%"></colgroup>`;
  html += `<tr><th>ARTIFACT</th><th>STATUS</th></tr>`;
  const labels: Record<string, string> = { privacyPolicy:"Privacy Policy", termsOfService:"Terms of Service", securityTxt:"security.txt", vulnerabilityDisclosure:"Vuln Disclosure", incidentResponsePlan:"Incident Response Plan" };
  for (const [key, label] of Object.entries(labels)) {
    const val = (manifest.artifacts as any)[key] as string;
    html += `<tr><td>${label}</td><td>${statusIcon(val)} ${val.toUpperCase()}</td></tr>`;
  }
  html += `</table></div>`;
  return html;
}

export function renderNistView(summary: RepoSummary, functionScores: FunctionScore[]): string {
  let html = `<div class="detail">`;
  html += `<h3>NIST CSF 2.0 // ${summary.nistScore}% COMPLIANT</h3>`;
  html += `<div style="margin-bottom:16px">${hpBar(summary.nistScore, 25, "NIST")}</div>`;

  html += `<div class="nist-grid">`;
  for (const fn of functionScores) {
    html += `<div class="nist-func">
      <div class="func-name">${fn.name.toUpperCase()}</div>
      ${hpBar(fn.percentage, 16, fn.name.substring(0, 3).toUpperCase())}
      <div class="func-stats">${fn.passed}P ${fn.partial}A ${fn.failed}F</div>
    </div>`;
  }
  html += `</div>`;

  html += `<h3>CONTROL DETAILS</h3>`;
  html += `<table><colgroup><col style="width:10%"><col style="width:30%"><col style="width:15%"><col style="width:22%"><col style="width:23%"></colgroup>`;
  html += `<tr><th>ID</th><th>CONTROL</th><th>STATUS</th><th>SOC 2</th><th>ISO 27001</th></tr>`;
  for (const r of summary.nistResults) {
    html += `<tr>
      <td style="color:#00ffff">${r.control.id}</td>
      <td>${esc(r.control.description)}</td>
      <td>${statusIcon(r.status)} ${r.status.toUpperCase()}</td>
      <td style="font-size:6px;color:#888">${r.soc2.join(", ") || "\u2014"}</td>
      <td style="font-size:6px;color:#888">${r.iso27001.join(", ") || "\u2014"}</td>
    </tr>`;
  }
  html += `</table>`;

  const gaps = summary.nistResults.filter(r => r.status === "fail" || r.status === "partial");
  if (gaps.length > 0) {
    html += `<h3>GAPS // ${gaps.length} CONTROLS</h3>`;
    html += `<table><colgroup><col style="width:12%"><col style="width:15%"><col style="width:73%"></colgroup>`;
    html += `<tr><th>ID</th><th>STATUS</th><th>EVIDENCE</th></tr>`;
    for (const g of gaps) {
      html += `<tr>
        <td style="color:#ff0040">${g.control.id}</td>
        <td>${statusIcon(g.status)} ${g.status.toUpperCase()}</td>
        <td style="font-size:7px">${esc(g.evidence)}</td>
      </tr>`;
    }
    html += `</table>`;
  }

  html += `</div>`;
  return html;
}

export function renderBranchComparison(summaries: RepoSummary[]): string {
  let html = `<div class="detail">`;
  html += `<h3>BRANCH COMPARISON // ${summaries.length} BRANCHES</h3>`;

  if (summaries.length <= 1) {
    html += `<p style="color:#666;font-size:8px;padding:16px 0;">Only one branch scanned. Push scans from feature branches to see comparisons.</p>`;
    if (summaries.length === 1) {
      const s = summaries[0];
      html += `<div class="branch-row">
        <div class="branch-name">${esc(s.branch)}</div>
        ${hpBar(s.complianceScore, 12, "HP")}
        ${hpBar(s.nistScore, 12, "NIST")}
      </div>`;
    }
    html += `</div>`;
    return html;
  }

  const sorted = [...summaries].sort((a, b) => b.complianceScore - a.complianceScore);
  const mainBranch = sorted.find(s => s.branch === "main" || s.branch === "master") || sorted[0];

  html += `<table><colgroup><col style="width:25%"><col style="width:20%"><col style="width:20%"><col style="width:12%"><col style="width:12%"><col style="width:11%"></colgroup>`;
  html += `<tr><th>BRANCH</th><th>COMPLIANCE</th><th>NIST</th><th>VULNS</th><th>HDRS</th><th>VS MAIN</th></tr>`;
  for (const s of sorted) {
    const diff = s.complianceScore - mainBranch.complianceScore;
    const diffStr = s.branch === mainBranch.branch ? '<span style="color:#555">BASE</span>'
      : diff > 0 ? `<span class="branch-diff up">+${diff}%</span>`
      : diff < 0 ? `<span class="branch-diff down">${diff}%</span>`
      : '<span style="color:#666">=</span>';

    html += `<tr>
      <td style="color:#00ffff">${esc(s.branch)}</td>
      <td>${hpBar(s.complianceScore, 8, "")}</td>
      <td>${hpBar(s.nistScore, 8, "")}</td>
      <td style="color:${s.criticalVulns + s.highVulns > 0 ? "#ff0040" : "#39ff14"}">${s.criticalVulns}C/${s.highVulns}H</td>
      <td>${s.headersPresent}/${s.headersTotal}</td>
      <td>${diffStr}</td>
    </tr>`;
  }
  html += `</table></div>`;
  return html;
}

export function renderTrendChart(history: HistoryEntry[], repo: string): string {
  let html = `<div class="detail">`;
  html += `<h3>COMPLIANCE TREND // ${esc(repo)}</h3>`;

  if (history.length === 0) {
    html += `<p style="color:#666;font-size:8px;padding:16px 0;">No history yet. Scans will appear here over time.</p></div>`;
    return html;
  }

  const recent = history.slice(-20);
  const maxScore = 100;
  const barWidth = 25;

  html += `<div class="trend-chart">`;
  html += `<span style="color:#ff00ff">SCORE</span>\n`;
  for (const entry of recent) {
    const date = new Date(entry.scanDate).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const filled = Math.round((entry.complianceScore / maxScore) * barWidth);
    const bar = "\u2588".repeat(filled) + "\u2591".repeat(barWidth - filled);
    const colorClass = entry.complianceScore >= 80 ? "bar" : entry.complianceScore >= 50 ? "bar-warn" : "bar-fail";
    html += `${date.padStart(8)} <span class="${colorClass}">${bar}</span> ${entry.complianceScore}%  ${entry.commit}\n`;
  }
  html += `</div>`;

  html += `<div class="trend-chart">`;
  html += `<span style="color:#ff00ff">NIST</span>\n`;
  for (const entry of recent) {
    const date = new Date(entry.scanDate).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const filled = Math.round((entry.nistScore / maxScore) * barWidth);
    const bar = "\u2588".repeat(filled) + "\u2591".repeat(barWidth - filled);
    const colorClass = entry.nistScore >= 80 ? "bar" : entry.nistScore >= 50 ? "bar-warn" : "bar-fail";
    html += `${date.padStart(8)} <span class="${colorClass}">${bar}</span> ${entry.nistScore}%  ${entry.commit}\n`;
  }
  html += `</div>`;

  html += `<h3>VULNERABILITY TREND</h3>`;
  html += `<div class="trend-chart">`;
  html += `<span style="color:#ff00ff">VULNS</span>\n`;
  for (const entry of recent) {
    const date = new Date(entry.scanDate).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const total = entry.criticalVulns + entry.highVulns;
    const bar = total > 0 ? "\u2588".repeat(Math.min(total * 3, barWidth)) : "\u2500";
    const colorClass = total === 0 ? "bar" : total <= 2 ? "bar-warn" : "bar-fail";
    html += `${date.padStart(8)} <span class="${colorClass}">${bar}</span> ${entry.criticalVulns}C ${entry.highVulns}H\n`;
  }
  html += `</div></div>`;
  return html;
}
