import type { Manifest } from "../../scanner/types.js";
import type { RepoSummary, FunctionScore, HistoryEntry } from "../worker.js";
import {
  evaluateEUAIAct,
  calcAIComplianceScore,
  getAIPhaseScores,
} from "../../scanner/frameworks/eu-ai-act.js";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function statusIcon(status: string): string {
  if (status === "present" || status === "generated" || status === "manual" || status === "pass") return '<span class="icon pass">[OK]</span>';
  if (status === "partial") return '<span class="icon warn">[!!]</span>';
  if (status === "not-applicable") return '<span class="icon na">[--]</span>';
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

function layout(title: string, content: string, orgName: string = ""): string {
  const subtitle = orgName ? `${orgName.toUpperCase()} // ` : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)}</title>
  <script src="https://unpkg.com/htmx.org@2.0.4"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    /*
     * Typography split: Press Start 2P for pixel-font accents (headers,
     * tab labels, stat values, hero text). JetBrains Mono for everything
     * readable — tables, body text, inputs, tooltips. This keeps the
     * retro arcade vibe where it matters and ditches it where eyes start
     * to hurt.
     */
    :root {
      --font-pixel: 'Press Start 2P', monospace;
      --font-mono: 'JetBrains Mono', ui-monospace, 'SF Mono', Consolas, monospace;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: var(--font-mono);
      background: #0a0a0a;
      color: #39ff14;
      min-height: 100vh;
      font-size: 13px;
      line-height: 1.55;
    }
    .pixel { font-family: var(--font-pixel); }
    body::after {
      content: "";
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: repeating-linear-gradient(0deg, rgba(0,0,0,0.15) 0px, rgba(0,0,0,0.15) 1px, transparent 1px, transparent 3px);
      pointer-events: none; z-index: 9999;
    }
    body::before {
      content: "";
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: radial-gradient(ellipse at center, transparent 60%, rgba(0,0,0,0.7) 100%);
      pointer-events: none; z-index: 9998;
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
      font-family: var(--font-pixel);
      font-size: 18px; color: #39ff14;
      text-shadow: 0 0 10px #39ff14, 0 0 20px #39ff14, 0 0 40px #006400;
      letter-spacing: 2px; animation: flicker 4s infinite alternate;
    }
    .header .subtitle { font-family: var(--font-pixel); font-size: 8px; color: #00ffff; margin-top: 8px; letter-spacing: 4px; }
    @keyframes flicker { 0%,95%,100%{opacity:1} 96%{opacity:0.8} 97%{opacity:1} 98%{opacity:0.9} }
    @keyframes blink { 0%,49%{opacity:1} 50%,100%{opacity:0} }
    @keyframes slideIn { from{transform:translateY(-10px);opacity:0} to{transform:translateY(0);opacity:1} }
    .container { max-width: 1100px; margin: 0 auto; padding: 16px; }

    .stats-row { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
    .stat-card { background: #0a0a0a; border: 1px solid #333; padding: 10px 14px; flex: 1; min-width: 120px; }
    .stat-card .label { font-family: var(--font-pixel); font-size: 7px; color: #888; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px; }
    .stat-card .value { font-family: var(--font-pixel); font-size: 20px; text-shadow: 0 0 8px currentColor; line-height: 1.1; }

    .search-bar { margin-bottom: 16px; }
    .search-bar input {
      width: 100%; font-family: var(--font-mono); font-size: 13px;
      background: #050505; border: 1px solid #333; color: #39ff14; padding: 10px 14px; outline: none;
    }
    .search-bar input:focus { border-color: #39ff14; box-shadow: 0 0 8px rgba(57,255,20,0.2); }
    .search-bar input::placeholder { color: #444; }

    .section-title {
      font-family: var(--font-pixel);
      font-size: 10px; color: #ff00ff; text-transform: uppercase;
      letter-spacing: 3px; margin-bottom: 12px; text-shadow: 0 0 6px #ff00ff;
    }
    .section-title::before { content: ">> "; }
    .section-title::after { content: " <<"; }

    .repo-card {
      background: #0a0a0a; border: 1px solid #333; padding: 12px;
      margin-bottom: 8px; cursor: pointer; transition: all 0.15s;
    }
    .repo-card:hover { border-color: #39ff14; box-shadow: 0 0 15px rgba(57,255,20,0.2); }
    .repo-card.open { border-color: #39ff14; }
    .repo-card .repo-header { display: flex; justify-content: space-between; align-items: center; }
    .repo-card .repo-name { font-family: var(--font-pixel); font-size: 12px; color: #39ff14; letter-spacing: 1px; }
    .repo-card:hover .repo-name { text-shadow: 0 0 8px #39ff14; }
    .repo-card .repo-meta { font-size: 11px; color: #888; margin-top: 6px; }
    .repo-card .checks-grid { display: flex; flex-wrap: wrap; gap: 4px 14px; margin-top: 12px; border-top: 1px solid #1a1a1a; padding-top: 10px; }
    .repo-card .check { font-size: 11px; display: flex; align-items: center; gap: 4px; color: #aaa; white-space: nowrap; }
    .hp-bar { font-family: var(--font-mono); font-size: 12px; display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
    .hp-label { font-family: var(--font-pixel); color: #ff0040; font-size: 8px; letter-spacing: 1px; }
    .hp-empty { color: #333; }
    .icon { font-family: var(--font-mono); font-size: 11px; letter-spacing: 0; }
    .icon.pass { color: #39ff14; }
    .icon.warn { color: #ffff00; }
    .icon.fail { color: #ff0040; }
    .icon.na { color: #555; }

    /* Searchable branch combobox */
    .branch-combo { position: relative; display: inline-block; min-width: 220px; }
    .branch-combo input {
      width: 100%; font-family: var(--font-mono); font-size: 12px;
      background: #050505; border: 1px solid #333; color: #00ffff;
      padding: 7px 24px 7px 10px; outline: none; cursor: text;
    }
    .branch-combo input:focus { border-color: #00ffff; box-shadow: 0 0 6px rgba(0,255,255,0.2); }
    .branch-combo .combo-caret {
      position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
      font-size: 10px; color: #666; pointer-events: none;
    }
    .branch-combo ul {
      position: absolute; left: 0; right: 0; top: 100%; margin-top: 2px;
      list-style: none; background: #050505; border: 1px solid #00ffff;
      max-height: 220px; overflow-y: auto; z-index: 50;
      box-shadow: 0 0 12px rgba(0,255,255,0.25); display: none;
    }
    .branch-combo.open ul { display: block; }
    .branch-combo li {
      font-family: var(--font-mono); font-size: 12px; color: #aaa;
      padding: 6px 10px; cursor: pointer; white-space: nowrap;
      overflow: hidden; text-overflow: ellipsis;
    }
    .branch-combo li.active { background: #0a0a0a; color: #00ffff; }
    .branch-combo li.hit { color: #39ff14; }
    .branch-combo li .main-pin {
      font-family: var(--font-pixel); font-size: 7px; color: #ff00ff;
      margin-left: 6px; letter-spacing: 1px;
    }
    .branch-combo li.no-results { color: #666; font-style: italic; cursor: default; }

    /* Controls bar (branch combobox + check production button) */
    .controls-bar { display: flex; align-items: center; gap: 10px; padding: 10px 0; flex-wrap: wrap; }
    .check-prod-btn {
      font-family: var(--font-pixel); font-size: 8px; letter-spacing: 1px;
      background: #050505; border: 1px solid #ff00ff; color: #ff00ff;
      padding: 7px 12px; cursor: pointer; transition: all 0.15s;
    }
    .check-prod-btn:hover { background: #ff00ff; color: #0a0a0a; }
    .check-prod-btn:disabled { opacity: 0.5; cursor: wait; }
    .check-prod-result { font-size: 11px; margin-left: 8px; color: #aaa; }

    /* Tabs */
    .tab-bar { display: flex; gap: 0; margin-bottom: 0; border-bottom: 2px solid #333; flex-wrap: wrap; }
    .tab {
      padding: 8px 14px; font-size: 8px; color: #666; cursor: pointer;
      border: 1px solid #333; border-bottom: none; background: #050505;
      font-family: var(--font-pixel); letter-spacing: 1px; transition: all 0.15s;
    }
    .tab:hover { color: #39ff14; border-color: #39ff14; }
    .tab.active { color: #39ff14; border-color: #39ff14; background: #0a0a0a; text-shadow: 0 0 6px #39ff14; }

    .detail {
      background: #050505; border: 1px solid #39ff14; border-top: none;
      padding: 18px; margin-bottom: 12px;
      box-shadow: 0 0 15px rgba(57,255,20,0.1); animation: slideIn 0.2s ease-out;
    }
    .detail h3 {
      font-family: var(--font-pixel);
      font-size: 11px; margin: 18px 0 10px; color: #00ffff; text-shadow: 0 0 6px #00ffff;
      letter-spacing: 2px;
    }
    .detail h3:first-child { margin-top: 0; }
    .detail h3::before { content: "[ "; color: #555; }
    .detail h3::after { content: " ]"; color: #555; }
    .detail table { width: 100%; border-collapse: collapse; margin-bottom: 14px; table-layout: fixed; }
    .detail th, .detail td { text-align: left; padding: 7px 10px; font-size: 12px; border-bottom: 1px solid #1a1a1a; word-wrap: break-word; vertical-align: top; }
    .detail th {
      font-family: var(--font-pixel); font-size: 8px;
      color: #ff00ff; font-weight: normal; letter-spacing: 1px;
    }
    .detail td { color: #ccc; }
    .detail td code { color: #ffff00; background: none; font-family: var(--font-mono); font-size: 11px; word-break: break-all; }
    .detail p { font-size: 12px; color: #aaa; line-height: 1.65; margin-bottom: 10px; }
    .detail p code { color: #ffff00; font-family: var(--font-mono); font-size: 11px; }

    .nist-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px; margin-bottom: 18px; }
    .nist-func { background: #0a0a0a; border: 1px solid #222; padding: 12px; }
    .nist-func .func-name { font-family: var(--font-pixel); font-size: 9px; color: #00ffff; margin-bottom: 8px; text-shadow: 0 0 4px #00ffff; letter-spacing: 1px; }
    .nist-func .func-stats { font-family: var(--font-mono); font-size: 11px; color: #777; margin-top: 6px; letter-spacing: 1px; }

    .branch-diff.up { color: #39ff14; }
    .branch-diff.down { color: #ff0040; }

    .trend-chart { margin: 8px 0 16px; }
    .trend-chart svg { width: 100%; height: auto; display: block; }
    .trend-chart .grid-line { stroke: #1a1a1a; stroke-width: 1; }
    .trend-chart .axis-line { stroke: #333; stroke-width: 1; }
    .trend-chart .axis-label { fill: #888; font-size: 10px; font-family: var(--font-mono); }
    .trend-chart .x-label { fill: #999; font-size: 10px; font-family: var(--font-mono); }
    .trend-chart .data-line { fill: none; stroke-width: 1.5; }
    .trend-chart .data-dot { stroke-width: 1; }
    .trend-chart .line-compliance { stroke: #39ff14; filter: drop-shadow(0 0 2px #39ff14); }
    .trend-chart .fill-compliance { fill: #39ff14; }
    .trend-chart .line-nist { stroke: #00ffff; filter: drop-shadow(0 0 2px #00ffff); }
    .trend-chart .fill-nist { fill: #00ffff; }
    .trend-chart .line-vulns { stroke: #ff0040; filter: drop-shadow(0 0 2px #ff0040); }
    .trend-chart .fill-vulns { fill: #ff0040; }
    .legend-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 4px; vertical-align: middle; }
    .legend-dot.line-compliance { background: #39ff14; box-shadow: 0 0 4px #39ff14; }
    .legend-dot.line-nist { background: #00ffff; box-shadow: 0 0 4px #00ffff; }
    .legend-dot.line-vulns { background: #ff0040; box-shadow: 0 0 4px #ff0040; }
    .trend-wrap { position: relative; }
    .trend-tooltip {
      position: absolute;
      display: none;
      grid-template-columns: auto 1fr;
      gap: 4px 12px;
      background: #0a0a0a;
      border: 1px solid #39ff14;
      padding: 10px 12px;
      font-family: var(--font-mono);
      font-size: 11px;
      color: #ccc;
      pointer-events: none;
      z-index: 10;
      box-shadow: 0 0 12px rgba(57,255,20,0.3);
      transform: translateX(-50%);
      white-space: nowrap;
    }
    .trend-tooltip.visible { display: grid; }
    .trend-tooltip::after {
      content: "";
      position: absolute;
      bottom: -5px;
      left: 50%;
      transform: translateX(-50%) rotate(45deg);
      width: 8px; height: 8px;
      background: #0a0a0a;
      border-right: 1px solid #39ff14;
      border-bottom: 1px solid #39ff14;
    }
    .trend-tooltip .tt-key { color: #666; letter-spacing: 1px; }
    .trend-tooltip .tt-val { color: #ccc; }
    .trend-tooltip .tt-date { color: #ff00ff; text-shadow: 0 0 4px #ff00ff; }
    .trend-tooltip .tt-commit { color: #ffff00; }
    .trend-tooltip .tt-c { color: #39ff14; }
    .trend-tooltip .tt-n { color: #00ffff; }
    .trend-tooltip .tt-v { color: #ff0040; }
    .trend-chart .trend-hover-zone { fill: transparent; cursor: crosshair; }
    .trend-chart .trend-hover-zone:hover, .trend-chart .trend-hover-zone.active { fill: rgba(255,255,255,0.04); }

    .empty { text-align: center; padding: 60px 20px; }
    .empty h2 { font-family: var(--font-pixel); font-size: 14px; color: #39ff14; margin-bottom: 14px; text-shadow: 0 0 10px #39ff14; }
    .empty p { color: #888; font-size: 12px; }
    .cursor-blink::after { content: "_"; animation: blink 1s infinite; }
    .insert-coin { font-family: var(--font-pixel); text-align: center; font-size: 8px; color: #555; margin-top: 30px; letter-spacing: 2px; }

    /* Footnote text inside detail panes (legends, disclaimers). */
    .detail .legend {
      display: flex; gap: 14px; flex-wrap: wrap; align-items: center;
      font-size: 11px; color: #888; margin: 8px 0 14px;
    }
    .detail .legend .swatch { display: inline-block; width: 10px; height: 10px; border: 1px solid #222; margin-right: 5px; vertical-align: -1px; }
    .detail .note { font-size: 11px; color: #888; line-height: 1.6; margin-top: 10px; padding: 10px 12px; border-left: 2px solid #333; background: rgba(0,0,0,0.3); }
    .detail .note code { color: #ffff00; font-family: var(--font-mono); font-size: 11px; }
    .detail .note strong { color: #ccc; font-weight: 600; }

    /* Lightweight CSS tooltip — attach by putting <span class="tip" data-tip="..."> wrapping trigger. */
    .tip { position: relative; cursor: help; border-bottom: 1px dotted currentColor; }
    .tip::after {
      content: attr(data-tip);
      position: absolute; left: 0; top: calc(100% + 6px);
      min-width: 200px; max-width: 360px;
      background: #0a0a0a; border: 1px solid #00ffff;
      color: #ccc; font-family: var(--font-mono); font-size: 11px;
      font-weight: normal; line-height: 1.5;
      padding: 8px 10px; z-index: 100;
      box-shadow: 0 0 10px rgba(0,255,255,0.25);
      white-space: normal; text-align: left;
      opacity: 0; visibility: hidden; transition: opacity 0.12s;
      pointer-events: none;
    }
    .tip:hover::after, .tip:focus::after { opacity: 1; visibility: visible; }

    /* Load more button for paginated lists. */
    .load-more-btn {
      display: block; margin: 10px auto 0;
      font-family: var(--font-pixel); font-size: 8px; letter-spacing: 2px;
      background: #050505; border: 1px solid #39ff14; color: #39ff14;
      padding: 8px 18px; cursor: pointer; transition: all 0.15s;
    }
    .load-more-btn:hover { background: #0a0a0a; box-shadow: 0 0 10px rgba(57,255,20,0.3); }
    .load-more-btn[hidden] { display: none; }

    @media (max-width: 768px) {
      body { font-size: 12px; }
      .container { padding: 10px; }
      .header { padding: 10px 12px; }
      .header h1 { font-size: 14px; }
      .stats-row { gap: 6px; }
      .stat-card { padding: 8px 10px; min-width: 90px; }
      .stat-card .value { font-size: 16px; }
      .repo-card .repo-header { flex-direction: column; align-items: flex-start; gap: 6px; }
      .hp-bar { font-size: 11px; }
      .tab { padding: 6px 10px; font-size: 7px; }
      .detail { padding: 12px; }
      .detail th, .detail td { padding: 5px; font-size: 11px; }
      .nist-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>GRC OBSERVABILITY</h1>
    <div class="subtitle">${subtitle}GOVERNANCE RISK COMPLIANCE DASHBOARD</div>
  </div>
  <div class="container">
    ${content}
    <div class="insert-coin">SYSTEM ACTIVE <span class="cursor-blink"></span></div>
  </div>
  <script>
    function toggleRepo(id) {
      var el = document.getElementById(id);
      var card = el.previousElementSibling;
      if (el.style.display === 'none' || !el.style.display) {
        el.style.display = 'block';
        card.classList.add('open');
      } else {
        el.style.display = 'none';
        card.classList.remove('open');
      }
    }
    function filterRepos() {
      var q = document.getElementById('repo-search').value.toLowerCase();
      document.querySelectorAll('.repo-entry').forEach(function(entry) {
        entry.style.display = entry.getAttribute('data-repo').toLowerCase().includes(q) ? '' : 'none';
      });
    }
    function openCombo(id) {
      var combo = document.getElementById('branch-' + id);
      if (!combo) return;
      combo.classList.add('open');
      // Select the input text so typing replaces the current branch name cleanly.
      var input = combo.querySelector('input');
      if (input) input.select();
    }
    function closeComboSoon(id) {
      setTimeout(function() {
        var combo = document.getElementById('branch-' + id);
        if (!combo) return;
        combo.classList.remove('open');
        // Restore the displayed branch name if the user typed a filter but
        // didn't pick anything — otherwise their current branch looks wrong.
        var input = combo.querySelector('input');
        var current = combo.getAttribute('data-value');
        if (input && input.value !== current) input.value = current;
        // Reset filter visibility so the next open shows everything.
        combo.querySelectorAll('li').forEach(function(li) { li.style.display = li.classList.contains('no-results') ? 'none' : ''; });
        combo.querySelectorAll('li.active').forEach(function(li) { li.classList.remove('active'); });
      }, 150);
    }
    function filterCombo(id) {
      var combo = document.getElementById('branch-' + id);
      if (!combo) return;
      combo.classList.add('open');
      var q = combo.querySelector('input').value.trim().toLowerCase();
      var items = combo.querySelectorAll('li');
      var visible = 0;
      items.forEach(function(li) {
        if (li.classList.contains('no-results')) return;
        var v = (li.getAttribute('data-value') || '').toLowerCase();
        var match = q === '' || v.indexOf(q) !== -1;
        li.style.display = match ? '' : 'none';
        li.classList.remove('active');
        if (match) visible++;
      });
      var empty = combo.querySelector('li.no-results');
      if (empty) empty.style.display = visible === 0 ? '' : 'none';
      // Highlight the first match so Enter picks something sensible.
      var firstVisible = combo.querySelector('li[data-value]:not([style*="display: none"])');
      if (firstVisible) firstVisible.classList.add('active');
    }
    function comboKey(evt, repoId, owner, name) {
      var combo = document.getElementById('branch-' + repoId);
      if (!combo) return;
      var key = evt.key;
      if (key === 'Escape') {
        combo.classList.remove('open');
        evt.target.blur();
        return;
      }
      if (key === 'Enter') {
        evt.preventDefault();
        var active = combo.querySelector('li.active');
        if (active) selectBranch(repoId, owner, name, active.getAttribute('data-value'));
        return;
      }
      if (key === 'ArrowDown' || key === 'ArrowUp') {
        evt.preventDefault();
        var visibles = Array.prototype.filter.call(combo.querySelectorAll('li[data-value]'), function(li) { return li.style.display !== 'none'; });
        if (visibles.length === 0) return;
        var idx = visibles.findIndex(function(li) { return li.classList.contains('active'); });
        visibles.forEach(function(li) { li.classList.remove('active'); });
        if (key === 'ArrowDown') idx = (idx + 1) % visibles.length;
        else idx = (idx - 1 + visibles.length) % visibles.length;
        if (idx < 0) idx = 0;
        visibles[idx].classList.add('active');
        visibles[idx].scrollIntoView({block: 'nearest'});
      }
    }
    function selectBranch(repoId, owner, name, branch) {
      var combo = document.getElementById('branch-' + repoId);
      if (!combo) return;
      combo.setAttribute('data-value', branch);
      var input = combo.querySelector('input');
      if (input) input.value = branch;
      combo.classList.remove('open');
      // Reload the active tab under the new branch.
      var panel = document.getElementById('panel-' + repoId);
      var activeTab = document.querySelector('#detail-' + repoId + ' .tab.active');
      var url = activeTab ? activeTab.getAttribute('data-url') : '/repo/' + owner + '/' + name;
      htmx.ajax('GET', url + '?branch=' + encodeURIComponent(branch), {target: panel, swap: 'innerHTML'});
    }
    function loadMoreBranches(btn) {
      // Reveal the next batch of hidden rows. When none remain, hide the button.
      var detail = btn.previousElementSibling; // skip back over the <table>
      // If the button moved (e.g. a <p> sits between), locate the table explicitly.
      var parent = btn.parentElement;
      var table = parent.querySelector('table');
      if (!table) return;
      var hidden = table.querySelectorAll('tr.branch-hidden');
      var batch = 5;
      var shown = 0;
      for (var i = 0; i < hidden.length && shown < batch; i++) {
        hidden[i].classList.remove('branch-hidden');
        hidden[i].style.display = '';
        shown++;
      }
      var remaining = table.querySelectorAll('tr.branch-hidden').length;
      if (remaining === 0) btn.hidden = true;
      else btn.textContent = 'LOAD MORE (' + remaining + ' HIDDEN)';
    }
    function switchTab(repoId, owner, name, tab, btn) {
      var combo = document.getElementById('branch-' + repoId);
      var branchValue = combo ? combo.getAttribute('data-value') : '';
      var branchParam = branchValue ? '?branch=' + encodeURIComponent(branchValue) : '';
      var url = '/' + tab + '/' + owner + '/' + name;
      btn.parentElement.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
      btn.classList.add('active');
      btn.setAttribute('data-url', url);
      htmx.ajax('GET', url + branchParam, {target: '#panel-' + repoId, swap: 'innerHTML'});
    }
    function showTrendTip(chartId, date, commit, c, n, v, evt) {
      var tip = document.getElementById('tt-' + chartId);
      if (!tip) return;
      tip.querySelector('.tt-date').textContent = date;
      tip.querySelector('.tt-commit').textContent = commit;
      tip.querySelector('.tt-c').textContent = c + '%';
      tip.querySelector('.tt-n').textContent = n + '%';
      tip.querySelector('.tt-v').textContent = v;
      // Position tooltip above the hovered column.
      var zone = evt.currentTarget;
      var wrap = document.getElementById('wrap-' + chartId);
      if (!wrap || !zone) return;
      var zoneRect = zone.getBoundingClientRect();
      var wrapRect = wrap.getBoundingClientRect();
      var centerX = zoneRect.left + zoneRect.width / 2 - wrapRect.left;
      tip.style.left = centerX + 'px';
      tip.style.top = (zoneRect.top - wrapRect.top - tip.offsetHeight - 10) + 'px';
      tip.classList.add('visible');
      // Now that it's visible and measurable, reposition with real height.
      tip.style.top = (zoneRect.top - wrapRect.top - tip.offsetHeight - 10) + 'px';
    }
    function hideTrendTip(chartId) {
      var tip = document.getElementById('tt-' + chartId);
      if (tip) tip.classList.remove('visible');
    }
    function checkProduction(owner, name, btn) {
      btn.disabled = true;
      btn.textContent = 'SCANNING...';
      // Scope the lookup to THIS repo card's controls bar — querying the
      // whole document would match the first open card's combobox when
      // multiple cards are expanded. Read from the combobox's data-value
      // attribute (the old select.value no longer applies).
      var branch = 'main';
      var bar = btn.closest('.controls-bar');
      var combo = bar ? bar.querySelector('.branch-combo') : null;
      if (combo) {
        var val = combo.getAttribute('data-value');
        if (val) branch = val;
      }
      fetch('/api/check-production/' + owner + '/' + name + '?branch=' + encodeURIComponent(branch), { method: 'POST' })
        .then(function(r) { return r.json(); })
        .then(function(data) {
          btn.textContent = 'CHECK PRODUCTION';
          btn.disabled = false;
          if (data.status === 'ok') {
            var result = btn.nextElementSibling;
            if (result) result.innerHTML = '<span class="icon pass">[OK]</span> Headers: ' + data.headersPresent + '/' + data.headersTotal;
            // Reload the page to reflect updated data
            setTimeout(function() { location.reload(); }, 1500);
          } else {
            var result = btn.nextElementSibling;
            if (result) result.innerHTML = '<span class="icon fail">[XX]</span> ' + (data.error || 'Failed');
          }
        })
        .catch(function() {
          btn.textContent = 'CHECK PRODUCTION';
          btn.disabled = false;
        });
    }
  </script>
</body>
</html>`;
}

export function renderDashboard(summaries: RepoSummary[], branchesPerRepo: Map<string, string[]>, orgName: string = ""): string {
  if (summaries.length === 0) {
    return layout("GRC OBSERVABILITY", `
      <div class="empty">
        <h2>NO TARGETS DETECTED</h2>
        <p>POST a manifest to <code>/api/report</code> to begin scanning.</p>
      </div>`, orgName);
  }

  const totalRepos = summaries.length;
  const avgScore = Math.round(summaries.reduce((s, r) => s + r.complianceScore, 0) / totalRepos);
  const avgNist = Math.round(summaries.reduce((s, r) => s + r.nistScore, 0) / totalRepos);
  const totalVulns = summaries.reduce((s, r) => s + r.criticalVulns + r.highVulns, 0);
  const secretsCount = summaries.filter(r => r.secretsDetected).length;

  const statsHtml = `
    <div class="stats-row">
      <div class="stat-card"><div class="label">Targets</div><div class="value" style="color:#00ffff">${totalRepos}</div></div>
      <div class="stat-card"><div class="label">Compliance</div><div class="value" style="color:${scoreColor(avgScore)}">${avgScore}%</div></div>
      <div class="stat-card"><div class="label">NIST CSF</div><div class="value" style="color:${scoreColor(avgNist)}">${avgNist}%</div></div>
      <div class="stat-card"><div class="label">Threats</div><div class="value" style="color:${totalVulns > 0 ? "#ff0040" : "#39ff14"}">${totalVulns}</div></div>
      <div class="stat-card"><div class="label">Leaks</div><div class="value" style="color:${secretsCount > 0 ? "#ff0040" : "#39ff14"}">${secretsCount}</div></div>
    </div>`;

  const searchHtml = `<div class="search-bar"><input type="text" id="repo-search" placeholder="> SEARCH REPOS..." oninput="filterRepos()"></div>`;

  const reposHtml = summaries.map(r => {
    const [owner, name] = r.repo.split("/");
    const safeId = (owner + "-" + name).replace(/\./g, "-");
    const branches = branchesPerRepo.get(r.repo) || [r.branch];

    // Sort branches: main/master first
    const sortedBranches = [...branches].sort((a, b) => {
      if (a === "main" || a === "master") return -1;
      if (b === "main" || b === "master") return 1;
      return a.localeCompare(b);
    });

    // Branch names never get embedded into the inline JS string — the handler
    // reads `this.dataset.value` so names containing characters like `'` or
    // `"` can't break out of the attribute context or inject script. `esc()`
    // only sanitizes for HTML attribute values (double-quoted), which is all
    // `data-value` needs.
    const branchItems = sortedBranches.map(b => {
      const isMain = b === "main" || b === "master";
      return `<li data-value="${esc(b)}" onmousedown="selectBranch('${safeId}','${owner}','${name}',this.dataset.value)">${esc(b)}${isMain ? '<span class="main-pin">PINNED</span>' : ''}</li>`;
    }).join("");
    const branchItemsWithEmpty = branchItems + `<li class="no-results" style="display:none;">no matches</li>`;

    const hasSiteUrl = !!r.siteUrl;

    return `
    <div class="repo-entry" data-repo="${esc(r.repo)}">
      <div class="repo-card" onclick="toggleRepo('detail-${safeId}')">
        <div class="repo-header">
          <div>
            <div class="repo-name">&gt; ${esc(r.repo)}</div>
            <div class="repo-meta">${esc(r.branch)} // ${r.commit} // ${timeAgo(r.scanDate)}</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:3px;align-items:flex-end;">
            ${hpBar(r.complianceScore, 12, "HP")}
            ${hpBar(r.nistScore, 12, "NIST")}
          </div>
        </div>
        <div class="checks-grid">
          <div class="check">${r.secretsDetected ? '<span class="icon fail">[XX]</span>' : '<span class="icon pass">[OK]</span>'} SECRETS</div>
          <div class="check">${r.headersPresent === r.headersTotal && r.headersTotal > 0 ? '<span class="icon pass">[OK]</span>' : r.headersPresent > 0 ? '<span class="icon warn">[!!]</span>' : '<span class="icon fail">[XX]</span>'} HDR ${r.headersPresent}/${r.headersTotal}</div>
          <div class="check">${r.httpsEnforced === true ? '<span class="icon pass">[OK]</span>' : r.httpsEnforced === false ? '<span class="icon fail">[XX]</span>' : '<span style="color:#555">[-]</span>'} HTTPS</div>
          <div class="check">${r.criticalVulns + r.highVulns === 0 ? '<span class="icon pass">[OK]</span>' : '<span class="icon fail">[XX]</span>'} DEPS ${r.criticalVulns}C/${r.highVulns}H</div>
          <div class="check">${statusIcon(r.artifacts.privacyPolicy)} PRIV</div>
          <div class="check">${statusIcon(r.artifacts.securityTxt)} SEC</div>
          <div class="check">${statusIcon(r.artifacts.incidentResponsePlan)} IRP</div>
          <div class="check">${statusIcon(r.artifacts.vulnerabilityDisclosure)} DISC</div>
        </div>
      </div>
      <div id="detail-${safeId}" style="display:none;">
        <div class="controls-bar">
          <div class="branch-combo" id="branch-${safeId}" data-value="${esc(r.branch)}" onclick="event.stopPropagation();">
            <input type="text" id="branch-input-${safeId}" value="${esc(r.branch)}" autocomplete="off" spellcheck="false" placeholder="filter branches..."
              onfocus="openCombo('${safeId}')"
              oninput="filterCombo('${safeId}')"
              onblur="closeComboSoon('${safeId}')"
              onkeydown="comboKey(event,'${safeId}','${owner}','${name}')">
            <span class="combo-caret">\u25BE</span>
            <ul>
              ${branchItemsWithEmpty}
            </ul>
          </div>
          ${hasSiteUrl ? `<button class="check-prod-btn" onclick="event.stopPropagation();checkProduction('${owner}','${name}',this)">CHECK PRODUCTION</button><span class="check-prod-result"></span>` : ""}
        </div>
        <div class="tab-bar">
          <div class="tab active" data-url="/repo/${owner}/${name}" onclick="switchTab('${safeId}','${owner}','${name}','repo',this)">OVERVIEW</div>
          <div class="tab" data-url="/nist/${owner}/${name}" onclick="switchTab('${safeId}','${owner}','${name}','nist',this)">NIST CSF</div>
          <div class="tab" data-url="/branches/${owner}/${name}" onclick="switchTab('${safeId}','${owner}','${name}','branches',this)">BRANCHES</div>
          <div class="tab" data-url="/trends/${owner}/${name}" onclick="switchTab('${safeId}','${owner}','${name}','trends',this)">TRENDS</div>
          <div class="tab" data-url="/ai/${owner}/${name}" onclick="switchTab('${safeId}','${owner}','${name}','ai',this)">AI</div>
        </div>
        <div id="panel-${safeId}" hx-get="/repo/${owner}/${name}" hx-trigger="load"></div>
      </div>
    </div>`;
  }).join("\n");

  return layout("GRC OBSERVABILITY", statsHtml + searchHtml + `<div class="section"><div class="section-title">Scanned Repos</div>${reposHtml}</div>`, orgName);
}

export function renderRepoDetail(manifest: Manifest, summary: RepoSummary): string {
  const dc = manifest.dataCollection;
  const tp = manifest.thirdPartyServices;
  const h = manifest.securityHeaders;
  const ac = manifest.accessControls;

  let html = `<div class="detail">`;
  html += `<div style="font-size:7px;color:#666;margin-bottom:12px;">${esc(manifest.branch)} // ${esc(manifest.commit)} // ${timeAgo(manifest.scanDate)}</div>`;

  html += `<h3>DATA COLLECTION // ${dc.length} POINTS</h3>`;
  if (dc.length > 0) {
    html += `<table><colgroup><col style="width:15%"><col style="width:15%"><col style="width:40%"><col style="width:30%"></colgroup>`;
    html += `<tr><th>TYPE</th><th>SOURCE</th><th>LOCATION</th><th>FIELDS</th></tr>`;
    for (const d of dc) html += `<tr><td>${esc(d.type)}</td><td>${esc(d.source)}</td><td><code>${esc(d.location)}</code></td><td>${esc(d.fields.join(", "))}</td></tr>`;
    html += `</table>`;
  }

  if (tp.length > 0) {
    html += `<h3>THIRD-PARTY SERVICES</h3>`;
    html += `<table><colgroup><col style="width:20%"><col style="width:25%"><col style="width:35%"><col style="width:20%"></colgroup>`;
    html += `<tr><th>SERVICE</th><th>PURPOSE</th><th>DATA SHARED</th><th>DPA</th></tr>`;
    for (const s of tp) html += `<tr><td>${esc(s.name)}</td><td>${esc(s.purpose)}</td><td>${esc(s.dataShared.join(", "))}</td><td>${s.dpaUrl ? `<a href="${esc(s.dpaUrl)}" target="_blank">[LINK]</a>` : '<span style="color:#555">NONE</span>'}</td></tr>`;
    html += `</table>`;
  }

  if (h) {
    html += `<h3>SECURITY HEADERS // ${summary.headersPresent}/${summary.headersTotal}</h3>`;
    html += `<table><colgroup><col style="width:60%"><col style="width:40%"></colgroup><tr><th>HEADER</th><th>STATUS</th></tr>`;
    const names: Record<string, string> = { csp:"Content-Security-Policy", hsts:"Strict-Transport-Security", xFrameOptions:"X-Frame-Options", xContentTypeOptions:"X-Content-Type-Options", referrerPolicy:"Referrer-Policy", permissionsPolicy:"Permissions-Policy" };
    for (const [key, label] of Object.entries(names)) { const val = (h as any)[key] as string; html += `<tr><td>${label}</td><td>${statusIcon(val)} ${val.toUpperCase()}</td></tr>`; }
    html += `</table>`;
  }

  if (manifest.https) {
    html += `<h3>HTTPS // TLS</h3>`;
    html += `<table><colgroup><col style="width:60%"><col style="width:40%"></colgroup><tr><th>CHECK</th><th>STATUS</th></tr>`;
    html += `<tr><td>HTTPS Enforced</td><td>${manifest.https.enforced ? '<span class="icon pass">[OK]</span> YES' : '<span class="icon fail">[XX]</span> NO'}</td></tr>`;
    html += `<tr><td>Cert Expiry</td><td>${manifest.https.certExpiry ?? '<span style="color:#555">UNKNOWN</span>'}</td></tr>`;
    html += `</table>`;
  }

  if (manifest.dependencies) {
    const d = manifest.dependencies;
    html += `<h3>DEPENDENCIES</h3>`;
    html += `<table><colgroup><col style="width:60%"><col style="width:40%"></colgroup><tr><th>SEVERITY</th><th>COUNT</th></tr>`;
    html += `<tr><td>CRITICAL</td><td style="color:${d.criticalVulnerabilities > 0 ? "#ff0040" : "#39ff14"};text-shadow:0 0 6px currentColor">${d.criticalVulnerabilities}</td></tr>`;
    html += `<tr><td>HIGH</td><td style="color:${d.highVulnerabilities > 0 ? "#ff0040" : "#39ff14"};text-shadow:0 0 6px currentColor">${d.highVulnerabilities}</td></tr>`;
    html += `<tr><td>MEDIUM</td><td style="color:#ffff00">${d.mediumVulnerabilities}</td></tr>`;
    html += `<tr><td>LAST AUDIT</td><td>${d.lastAudit}</td></tr>`;
    html += `</table>`;
  }

  html += `<h3>ACCESS CONTROLS</h3>`;
  html += `<table><colgroup><col style="width:60%"><col style="width:40%"></colgroup><tr><th>CONTROL</th><th>STATUS</th></tr>`;
  html += `<tr><td>Branch Protection</td><td>${ac.branchProtection === true ? '<span class="icon pass">[OK]</span> ENABLED' : ac.branchProtection === false ? '<span class="icon fail">[XX]</span> DISABLED' : '<span style="color:#555">UNKNOWN</span>'}</td></tr>`;
  html += `<tr><td>Required Reviews</td><td>${ac.requiredReviews ?? '<span style="color:#555">\u2014</span>'}</td></tr>`;
  html += `<tr><td>Signed Commits</td><td>${ac.signedCommits === true ? '<span class="icon pass">[OK]</span>' : ac.signedCommits === false ? '<span class="icon fail">[XX]</span>' : '<span style="color:#555">\u2014</span>'}</td></tr>`;
  html += `</table>`;

  html += `<h3>GOVERNANCE ARTIFACTS</h3>`;
  html += `<table><colgroup><col style="width:60%"><col style="width:40%"></colgroup><tr><th>ARTIFACT</th><th>STATUS</th></tr>`;
  const labels: Record<string, string> = { privacyPolicy:"Privacy Policy", termsOfService:"Terms of Service", securityTxt:"security.txt", vulnerabilityDisclosure:"Vuln Disclosure", incidentResponsePlan:"Incident Response Plan" };
  for (const [key, label] of Object.entries(labels)) { const val = (manifest.artifacts as any)[key] as string; html += `<tr><td>${label}</td><td>${statusIcon(val)} ${val.toUpperCase()}</td></tr>`; }
  html += `</table></div>`;
  return html;
}

export function renderNistView(summary: RepoSummary, functionScores: FunctionScore[]): string {
  let html = `<div class="detail">`;
  html += `<h3>NIST CSF 2.0 // ${summary.nistScore}% COMPLIANT</h3>`;
  html += `<div style="margin-bottom:16px">${hpBar(summary.nistScore, 25, "NIST")}</div>`;

  html += `<div class="nist-grid">`;
  for (const fn of functionScores) {
    html += `<div class="nist-func"><div class="func-name">${fn.name.toUpperCase()}</div>${hpBar(fn.percentage, 16, fn.name.substring(0, 3).toUpperCase())}<div class="func-stats">${fn.passed}P ${fn.partial}A ${fn.failed}F</div></div>`;
  }
  html += `</div>`;

  html += `<h3>CONTROL DETAILS</h3>`;
  html += `<table><colgroup><col style="width:10%"><col style="width:30%"><col style="width:15%"><col style="width:22%"><col style="width:23%"></colgroup>`;
  html += `<tr><th>ID</th><th>CONTROL</th><th>STATUS</th><th>SOC 2</th><th>ISO 27001</th></tr>`;
  for (const r of summary.nistResults) {
    html += `<tr><td style="color:#00ffff">${r.control.id}</td><td>${esc(r.control.description)}</td><td>${statusIcon(r.status)} ${r.status.toUpperCase()}</td><td style="font-size:6px;color:#888">${r.soc2.join(", ") || "\u2014"}</td><td style="font-size:6px;color:#888">${r.iso27001.join(", ") || "\u2014"}</td></tr>`;
  }
  html += `</table>`;

  const gaps = summary.nistResults.filter(r => r.status === "fail" || r.status === "partial");
  if (gaps.length > 0) {
    html += `<h3>GAPS // ${gaps.length} CONTROLS</h3>`;
    html += `<table><colgroup><col style="width:12%"><col style="width:15%"><col style="width:73%"></colgroup><tr><th>ID</th><th>STATUS</th><th>EVIDENCE</th></tr>`;
    for (const g of gaps) html += `<tr><td style="color:#ff0040">${g.control.id}</td><td>${statusIcon(g.status)} ${g.status.toUpperCase()}</td><td style="font-size:7px">${esc(g.evidence)}</td></tr>`;
    html += `</table>`;
  }

  html += `</div>`;
  return html;
}

// How many branches are visible before LOAD MORE needs to be clicked.
// main is always included in the visible set, so the actual row count is
// INITIAL_BRANCH_LIMIT + 1 when main isn't in the top N most recent.
const INITIAL_BRANCH_LIMIT = 5;
const LOAD_MORE_BATCH = 5;

export function renderBranchComparison(summaries: RepoSummary[]): string {
  let html = `<div class="detail">`;
  html += `<h3>BRANCH COMPARISON // ${summaries.length} BRANCHES</h3>`;

  if (summaries.length <= 1) {
    html += `<p style="color:#888;padding:16px 0;">Only one branch scanned.</p>`;
    if (summaries.length === 1) {
      const s = summaries[0]!;
      html += `<div style="display:flex;gap:16px;align-items:center;"><span style="color:#00ffff;font-size:12px">${esc(s.branch)}</span>${hpBar(s.complianceScore, 12, "HP")} ${hpBar(s.nistScore, 12, "NIST")}</div>`;
    }
    html += `</div>`;
    return html;
  }

  // Build display order: main first (pinned), then everything else by scanDate desc.
  const mainBranch = summaries.find(s => s.branch === "main" || s.branch === "master") || summaries[0]!;
  const others = summaries
    .filter(s => s !== mainBranch)
    .sort((a, b) => new Date(b.scanDate).getTime() - new Date(a.scanDate).getTime());
  const ordered = [mainBranch, ...others];

  // Visible = main + up to 5 most recent others. Everything past that gets
  // `branch-hidden` and is revealed in batches by the LOAD MORE button.
  const visibleCount = Math.min(ordered.length, 1 + INITIAL_BRANCH_LIMIT);

  html += `<table><colgroup><col style="width:25%"><col style="width:20%"><col style="width:20%"><col style="width:12%"><col style="width:12%"><col style="width:11%"></colgroup>`;
  html += `<tr><th>BRANCH</th><th>COMPLIANCE</th><th>NIST</th><th>VULNS</th><th>HDRS</th><th>VS MAIN</th></tr>`;
  for (let i = 0; i < ordered.length; i++) {
    const s = ordered[i]!;
    const diff = s.complianceScore - mainBranch.complianceScore;
    const diffStr = s.branch === mainBranch.branch ? '<span style="color:#555">BASE</span>'
      : diff > 0 ? `<span class="branch-diff up">+${diff}%</span>`
      : diff < 0 ? `<span class="branch-diff down">${diff}%</span>`
      : '<span style="color:#666">=</span>';
    const hidden = i >= visibleCount;
    const rowAttrs = hidden ? ` class="branch-hidden" style="display:none"` : "";
    const namePrefix = s.branch === mainBranch.branch ? '<span class="main-pin" style="color:#ff00ff;margin-right:6px;font-family:var(--font-pixel);font-size:7px;letter-spacing:1px;">PINNED</span>' : "";
    html += `<tr${rowAttrs}><td style="color:#00ffff">${namePrefix}${esc(s.branch)}</td><td>${hpBar(s.complianceScore, 8, "")}</td><td>${hpBar(s.nistScore, 8, "")}</td><td style="color:${s.criticalVulns + s.highVulns > 0 ? "#ff0040" : "#39ff14"}">${s.criticalVulns}C/${s.highVulns}H</td><td>${s.headersPresent}/${s.headersTotal}</td><td>${diffStr}</td></tr>`;
  }
  html += `</table>`;

  const hiddenCount = ordered.length - visibleCount;
  if (hiddenCount > 0) {
    html += `<button class="load-more-btn" type="button" onclick="loadMoreBranches(this)">LOAD MORE (${hiddenCount} HIDDEN)</button>`;
  }

  html += `<p class="note" style="margin-top:14px">Main is pinned; other branches ordered by most recent scan. Branches beyond the first ${INITIAL_BRANCH_LIMIT + 1} are hidden — reveal in batches of ${LOAD_MORE_BATCH} with the button above.</p>`;

  html += `</div>`;
  return html;
}

interface Series {
  values: number[];
  metric: "compliance" | "nist" | "vulns";
  axis: "left" | "right";
}

interface HoverDatum { date: string; commit: string; c: number; n: number; v: number }

function renderSvgChart(
  series: Series[],
  labels: string[],
  opts: { leftMax: number; rightMax: number; yTicks?: number; leftUnit?: string; rightUnit?: string; chartId?: string; hoverData?: HoverDatum[] },
): string {
  const { leftMax, rightMax } = opts;
  const yTicks = opts.yTicks ?? 4;
  const leftUnit = opts.leftUnit ?? "";
  const rightUnit = opts.rightUnit ?? "";
  const n = labels.length;
  if (n === 0) return "";

  const vbW = 420;
  const vbH = 180;
  const padL = 36;
  const padR = 32;
  const padT = 12;
  const padB = 28;
  const chartW = vbW - padL - padR;
  const chartH = vbH - padT - padB;

  const toX = (i: number): number => {
    if (n === 1) return padL + chartW / 2;
    return padL + (i / (n - 1)) * chartW;
  };
  const toY = (v: number, max: number): number => {
    const clamped = Math.max(0, Math.min(max, v));
    return padT + chartH - (clamped / max) * chartH;
  };

  // Grid lines + left axis labels.
  let gridHtml = "";
  for (let i = 0; i <= yTicks; i++) {
    const y = padT + (i / yTicks) * chartH;
    const leftVal = Math.round(leftMax - (i / yTicks) * leftMax);
    const rightVal = Math.round(rightMax - (i / yTicks) * rightMax);
    gridHtml += `<line class="grid-line" x1="${padL}" y1="${y}" x2="${vbW - padR}" y2="${y}"/>`;
    gridHtml += `<text class="axis-label" x="${padL - 4}" y="${y + 2}" text-anchor="end">${leftVal}${leftUnit}</text>`;
    gridHtml += `<text class="axis-label fill-vulns" x="${vbW - padR + 4}" y="${y + 2}" text-anchor="start">${rightVal}${rightUnit}</text>`;
  }

  // Axes.
  const axesHtml =
    `<line class="axis-line" x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + chartH}"/>` +
    `<line class="axis-line" x1="${vbW - padR}" y1="${padT}" x2="${vbW - padR}" y2="${padT + chartH}"/>` +
    `<line class="axis-line" x1="${padL}" y1="${padT + chartH}" x2="${vbW - padR}" y2="${padT + chartH}"/>`;

  // Data polylines + dots for each series.
  let seriesHtml = "";
  for (const s of series) {
    const max = s.axis === "left" ? leftMax : rightMax;
    const points = s.values.map((v, i) => `${toX(i).toFixed(1)},${toY(v, max).toFixed(1)}`).join(" ");
    if (s.values.length > 1) {
      seriesHtml += `<polyline class="data-line line-${s.metric}" points="${points}"/>`;
    }
    for (let i = 0; i < s.values.length; i++) {
      const cx = toX(i).toFixed(1);
      const cy = toY(s.values[i], max).toFixed(1);
      seriesHtml += `<circle class="data-dot fill-${s.metric}" cx="${cx}" cy="${cy}" r="2"/>`;
    }
  }

  // X-axis labels: first, middle, last.
  const xIdxs = n >= 3 ? [0, Math.floor((n - 1) / 2), n - 1] : n === 2 ? [0, 1] : [0];
  let xLabelHtml = "";
  for (const i of xIdxs) {
    const x = toX(i).toFixed(1);
    const y = padT + chartH + 12;
    const anchor = i === 0 ? "start" : i === n - 1 ? "end" : "middle";
    xLabelHtml += `<text class="x-label" x="${x}" y="${y}" text-anchor="${anchor}">${esc(labels[i])}</text>`;
  }

  // Invisible hover zones for each x position — show tooltip on hover.
  let hoverHtml = "";
  if (opts.hoverData && opts.chartId) {
    const zoneW = n > 1 ? chartW / (n - 1) : chartW;
    for (let i = 0; i < n; i++) {
      const centerX = toX(i);
      const x = Math.max(padL, centerX - zoneW / 2);
      const w = Math.min(vbW - padR - x, zoneW);
      const d = opts.hoverData[i];
      hoverHtml += `<rect class="trend-hover-zone" x="${x.toFixed(1)}" y="${padT}" width="${w.toFixed(1)}" height="${chartH}" data-commit="${esc(d.commit)}" onmouseover="showTrendTip('${opts.chartId}', '${esc(d.date)}', '${esc(d.commit)}', ${d.c}, ${d.n}, ${d.v}, event)" onmouseout="hideTrendTip('${opts.chartId}')"/>`;
    }
  }

  const idAttr = opts.chartId ? ` id="chart-${opts.chartId}"` : "";
  return `<svg${idAttr} viewBox="0 0 ${vbW} ${vbH}" preserveAspectRatio="xMidYMid meet">${gridHtml}${axesHtml}${seriesHtml}${hoverHtml}${xLabelHtml}</svg>`;
}

export function renderTrendChart(history: HistoryEntry[], repo: string, branch: string): string {
  let html = `<div class="detail">`;
  html += `<h3>TRENDS // ${esc(repo)} // ${esc(branch)}</h3>`;

  if (history.length === 0) {
    html += `<p style="color:#666;font-size:8px;padding:16px 0;">No history for this branch yet.</p></div>`;
    return html;
  }

  const recent = history.slice(-20);
  const labels = recent.map(e => new Date(e.scanDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }));
  const latest = recent[recent.length - 1];
  const first = recent[0];

  const arrowPct = (d: number) => d > 0 ? `<span style="color:#39ff14">+${d}%</span>` : d < 0 ? `<span style="color:#ff0040">${d}%</span>` : `<span style="color:#888">=</span>`;
  const arrowCount = (d: number) => d > 0 ? `<span style="color:#ff0040">+${d}</span>` : d < 0 ? `<span style="color:#39ff14">${d}</span>` : `<span style="color:#888">=</span>`;

  const complianceDelta = latest.complianceScore - first.complianceScore;
  const nistDelta = latest.nistScore - first.nistScore;
  const vulnsNow = latest.criticalVulns + latest.highVulns;
  const vulnsFirst = first.criticalVulns + first.highVulns;
  const vulnDelta = vulnsNow - vulnsFirst;

  // Stats row
  html += `<div style="display:flex;gap:16px;flex-wrap:wrap;font-size:8px;margin-bottom:8px;">
    <span><span class="legend-dot line-compliance"></span> COMPLIANCE <span style="color:#39ff14">${latest.complianceScore}%</span> ${arrowPct(complianceDelta)}</span>
    <span><span class="legend-dot line-nist"></span> NIST <span style="color:#00ffff">${latest.nistScore}%</span> ${arrowPct(nistDelta)}</span>
    <span><span class="legend-dot line-vulns"></span> VULNS <span style="color:#ff0040">${vulnsNow}</span> ${arrowCount(vulnDelta)}</span>
  </div>`;

  const vulnValues = recent.map(e => e.criticalVulns + e.highVulns);
  const maxVulns = Math.max(5, ...vulnValues);

  const series: Series[] = [
    { values: recent.map(e => e.complianceScore), metric: "compliance", axis: "left" },
    { values: recent.map(e => e.nistScore), metric: "nist", axis: "left" },
    { values: vulnValues, metric: "vulns", axis: "right" },
  ];

  // Base64url encoding keeps repo+branch 1:1 so distinct pairs never collide.
  // HTML5 IDs accept [A-Za-z0-9_-], which matches base64url's alphabet.
  const chartId = "c" + btoa(repo + "\0" + branch)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const hoverData: HoverDatum[] = recent.map(e => ({
    date: new Date(e.scanDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    commit: e.commit,
    c: e.complianceScore,
    n: e.nistScore,
    v: e.criticalVulns + e.highVulns,
  }));

  // Chart wrapper is relative so the absolute tooltip positions above the hovered column.
  html += `<div class="trend-wrap" id="wrap-${chartId}">
    <div class="trend-tooltip" id="tt-${chartId}">
      <span class="tt-key">DATE</span><span class="tt-val tt-date"></span>
      <span class="tt-key">COMMIT</span><span class="tt-val tt-commit"></span>
      <span class="tt-key">COMPLIANCE</span><span class="tt-val tt-c"></span>
      <span class="tt-key">NIST</span><span class="tt-val tt-n"></span>
      <span class="tt-key">VULNS</span><span class="tt-val tt-v"></span>
    </div>
    <div class="trend-chart">${renderSvgChart(series, labels, {
      leftMax: 100,
      rightMax: maxVulns,
      yTicks: 4,
      leftUnit: "%",
      chartId,
      hoverData,
    })}</div>
  </div>`;

  html += `<div style="font-size:7px;color:#666;margin-top:6px;letter-spacing:1px;">LEFT AXIS: % COMPLIANCE // <span style="color:#ff0040">RIGHT AXIS: VULN COUNT</span> // HOVER TO INSPECT</div>`;

  html += `</div>`;
  return html;
}

export function renderAIComplianceView(manifest: Manifest): string {
  const ai = manifest.aiSystems || [];

  let html = `<div class="detail">`;
  html += `<h3>AI SYSTEMS // ${ai.length} DETECTED</h3>`;

  if (ai.length === 0) {
    html += `<p>No AI systems detected in this repo. The scanner checks package.json, requirements.txt, pyproject.toml, and outbound API calls.</p>`;
    html += `</div>`;
    return html;
  }

  // Systems table. Risk tier and source badge each wrap in a `.tip` span
  // so the hover tooltip is actually discoverable (dotted underline, CSS
  // tooltip box) instead of relying on the browser's slow native title hint.
  html += `<table><colgroup><col style="width:20%"><col style="width:16%"><col style="width:13%"><col style="width:28%"><col style="width:23%"></colgroup>`;
  html += `<tr><th>PROVIDER</th><th>SDK</th><th>CATEGORY</th><th>LOCATION</th><th>RISK TIER</th></tr>`;
  for (const s of ai) {
    const categoryColor = s.category === "inference" ? "#00ffff"
      : s.category === "training" ? "#ff00ff"
      : s.category === "vector-db" ? "#ffff00"
      : s.category === "framework" ? "#39ff14"
      : "#888";

    const tier = s.riskTier || "unknown";
    const tierColor = tier === "prohibited" ? "#ff0040"
      : tier === "high" ? "#ff8c00"
      : tier === "limited" ? "#ffff00"
      : tier === "minimal" ? "#39ff14"
      : "#888";
    const overridden = s.riskTierSource === "override";
    const reasoning = s.riskReasoning ? esc(s.riskReasoning) : "";
    const tierCell = reasoning
      ? `<span class="tip" data-tip="${reasoning}" style="color:${tierColor}">${esc(tier)}</span>`
      : `<span style="color:${tierColor}">${esc(tier)}</span>`;
    const sourceBadge = overridden
      ? `<span class="tip" data-tip="Risk tier set by an explicit entry in .grc/config.yml — not the heuristic classifier." style="color:#888;margin-left:8px;font-size:10px;">\u2605 OVERRIDE</span>`
      : `<span class="tip" data-tip="Heuristic classification — treat as a starting point. Override via ai_systems in .grc/config.yml if misclassified." style="color:#666;margin-left:8px;font-size:10px;">TENTATIVE</span>`;

    html += `<tr>`;
    html += `<td style="color:#00ffff">${esc(s.provider)}</td>`;
    html += `<td>${esc(s.sdk)}</td>`;
    html += `<td style="color:${categoryColor}">${esc(s.category)}</td>`;
    html += `<td><code>${esc(s.location)}</code></td>`;
    html += `<td>${tierCell}${sourceBadge}</td>`;
    html += `</tr>`;
  }
  html += `</table>`;

  // Combined legend — tiers on one row, categories on a second.
  html += `<div class="legend" style="flex-direction:column;align-items:flex-start;gap:6px">`;
  html += `<div style="display:flex;gap:14px;flex-wrap:wrap;"><span style="color:#666;letter-spacing:1px;">RISK TIER</span>`;
  html += `<span><span class="swatch" style="background:#ff0040"></span>prohibited (Art. 5)</span>`;
  html += `<span><span class="swatch" style="background:#ff8c00"></span>high (Annex III)</span>`;
  html += `<span><span class="swatch" style="background:#ffff00"></span>limited (Art. 50)</span>`;
  html += `<span><span class="swatch" style="background:#39ff14"></span>minimal</span>`;
  html += `</div>`;
  html += `<div style="display:flex;gap:14px;flex-wrap:wrap;"><span style="color:#666;letter-spacing:1px;">CATEGORY</span>`;
  html += `<span><span class="swatch" style="background:#00ffff"></span>inference</span>`;
  html += `<span><span class="swatch" style="background:#ff00ff"></span>training</span>`;
  html += `<span><span class="swatch" style="background:#ffff00"></span>vector-db</span>`;
  html += `<span><span class="swatch" style="background:#39ff14"></span>framework</span>`;
  html += `<span><span class="swatch" style="background:#888"></span>self-hosted</span>`;
  html += `</div>`;
  html += `</div>`;

  // Data flows section (populates when forms/endpoints correlation is built)
  const hasFlows = ai.some(s => s.dataFlows && s.dataFlows.length > 0);
  if (hasFlows) {
    html += `<h3>DATA FLOWS</h3>`;
    html += `<table><colgroup><col style="width:25%"><col style="width:75%"></colgroup>`;
    html += `<tr><th>AI SYSTEM</th><th>DATA SENT</th></tr>`;
    for (const s of ai) {
      if (s.dataFlows && s.dataFlows.length > 0) {
        html += `<tr><td style="color:#00ffff">${esc(s.provider)}</td><td>${esc(s.dataFlows.join(", "))}</td></tr>`;
      }
    }
    html += `</table>`;
  }

  // EU AI Act compliance (Sub-phase C)
  const compliance = evaluateEUAIAct(manifest);
  const complianceScore = calcAIComplianceScore(compliance);
  const phaseScores = getAIPhaseScores(compliance);
  const applicable = compliance.filter(r => r.status !== "not-applicable");
  const passedCount = applicable.filter(r => r.status === "pass").length;
  const partialCount = applicable.filter(r => r.status === "partial").length;
  const failedCount = applicable.filter(r => r.status === "fail").length;
  const naCount = compliance.length - applicable.length;
  const euMarketCount = ai.filter(s => s.euMarket === true).length;
  const highRiskCount = ai.filter(s => s.riskTier === "high" || s.riskTier === "prohibited").length;

  html += `<h3>EU AI ACT COMPLIANCE // ${complianceScore}%</h3>`;
  html += `<div style="display:flex;flex-wrap:wrap;gap:18px;align-items:center;margin-bottom:14px;">`;
  html += `<div>${hpBar(complianceScore, 25, "EU")}</div>`;
  html += `<div style="font-size:11px;color:#aaa;">`;
  html += `<span style="color:#39ff14">${passedCount} PASS</span> &middot; `;
  html += `<span style="color:#ffff00">${partialCount} PARTIAL</span> &middot; `;
  html += `<span style="color:#ff0040">${failedCount} FAIL</span> &middot; `;
  html += `<span style="color:#666">${naCount} N/A</span>`;
  html += `</div>`;
  html += `<div style="font-size:11px;color:#888;">HIGH-RISK <span style="color:#ff8c00">${highRiskCount}</span> &middot; EU MARKET <span style="color:#00ffff">${euMarketCount}</span></div>`;
  html += `</div>`;

  // Phase grid (NIST AI RMF: Govern / Map / Measure / Manage)
  html += `<div class="nist-grid">`;
  for (const p of phaseScores) {
    const naPhase = compliance.filter(r => r.phase === p.name && r.status === "not-applicable").length;
    const label = p.applicable === 0
      ? `<span style="color:#555;font-family:var(--font-mono);font-size:12px;">N/A</span>`
      : `${hpBar(p.percentage, 16, p.name.substring(0, 3).toUpperCase())}`;
    html += `<div class="nist-func">
      <div class="func-name">${p.name.toUpperCase()}</div>
      ${label}
      <div class="func-stats">${p.passed}P &middot; ${p.partial}A &middot; ${p.failed}F${naPhase > 0 ? " &middot; " + naPhase + " N/A" : ""}</div>
    </div>`;
  }
  html += `</div>`;

  // Articles table — the evidence string is attached as a tooltip on the
  // article title for quick preview; the gaps table below shows full text.
  html += `<h3>ARTICLES // ${applicable.length} APPLICABLE</h3>`;
  html += `<table><colgroup><col style="width:10%"><col style="width:10%"><col style="width:32%"><col style="width:14%"><col style="width:17%"><col style="width:17%"></colgroup>`;
  html += `<tr><th>ID</th><th>PHASE</th><th>ARTICLE</th><th>STATUS</th><th>NIST AI RMF</th><th>ISO 42001</th></tr>`;
  for (const r of compliance) {
    const statusColor = r.status === "pass" ? "#39ff14"
      : r.status === "partial" ? "#ffff00"
      : r.status === "fail" ? "#ff0040"
      : "#555";
    const statusText = r.status === "not-applicable" ? "N/A" : r.status.toUpperCase();
    const titleCell = r.evidence
      ? `<span class="tip" data-tip="${esc(r.evidence)}">${esc(r.title)}</span>`
      : esc(r.title);
    html += `<tr>`;
    html += `<td style="color:#00ffff">${r.articleId}</td>`;
    html += `<td style="color:#888;font-size:11px">${esc(r.phase)}</td>`;
    html += `<td>${titleCell}</td>`;
    html += `<td style="color:${statusColor}">${statusIcon(r.status)} ${statusText}</td>`;
    html += `<td style="font-size:11px;color:#888">${r.nistAiRmf.join(", ") || "\u2014"}</td>`;
    html += `<td style="font-size:11px;color:#888">${r.iso42001.join(", ") || "\u2014"}</td>`;
    html += `</tr>`;
  }
  html += `</table>`;

  // Gaps with evidence
  const gaps = compliance.filter(r => r.status === "fail" || r.status === "partial");
  if (gaps.length > 0) {
    html += `<h3>GAPS // ${gaps.length} ARTICLES</h3>`;
    html += `<table><colgroup><col style="width:10%"><col style="width:22%"><col style="width:13%"><col style="width:55%"></colgroup>`;
    html += `<tr><th>ID</th><th>ARTICLE</th><th>STATUS</th><th>EVIDENCE</th></tr>`;
    for (const g of gaps) {
      const color = g.status === "fail" ? "#ff0040" : "#ffff00";
      html += `<tr>`;
      html += `<td style="color:${color}">${g.articleId}</td>`;
      html += `<td>${esc(g.title)}</td>`;
      html += `<td style="color:${color}">${statusIcon(g.status)} ${g.status.toUpperCase()}</td>`;
      html += `<td>${esc(g.evidence)}</td>`;
      html += `</tr>`;
    }
    html += `</table>`;
  }

  // Disclaimer block — split from one dense sentence into a readable note.
  html += `<div class="note">`;
  html += `<strong>Scoping.</strong> High-risk-only articles (9 / 11 / 12 / 13 / 14 / 15 / 27 / 60 / 73) display <span style="color:#555">N/A</span> unless a <code>high</code> or <code>prohibited</code> system is detected. Articles 27 and 60 additionally require <code>eu_market: true</code>.<br>`;
  html += `<strong>Overrides.</strong> Hover any tier for its reasoning. Declare <code>risk_tier</code> and <code>eu_market</code> per system under <code>ai_systems:</code> in <code>.grc/config.yml</code> to replace the heuristic.<br>`;
  html += `<strong>Caveat.</strong> Advisory output — this is not a conformity assessment and does not substitute for review by a notified body.`;
  html += `</div>`;

  html += `</div>`;
  return html;
}
