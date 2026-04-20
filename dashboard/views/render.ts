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

function layout(
  title: string,
  content: string,
  orgName: string = "",
  activeNav: "dashboard" | "inventory" = "dashboard",
  opts: { fullBleed?: boolean } = {},
): string {
  const subtitle = orgName ? `${orgName.toUpperCase()} // ` : "";
  const navCls = (n: string) => n === activeNav ? "active" : "";
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
    .header .header-nav {
      display: flex; justify-content: center; gap: 24px; margin-top: 12px;
      font-family: var(--font-pixel); font-size: 8px; letter-spacing: 2px;
    }
    .header .header-nav a { color: #666; text-decoration: none; }
    .header .header-nav a.active { color: #39ff14; text-shadow: 0 0 6px #39ff14; }
    .header .header-nav a:hover { color: #ff00ff; text-shadow: 0 0 6px #ff00ff; }

    /* ========= V2 DASHBOARD SHELL =========
       Two-pane layout: sidebar repo list (left) + detail pane (right).
       Derived from the v2 design mock. Coexists with the v1 styles above;
       views that still use v1 classes (NIST tab, Branches, Trends, etc.)
       keep working unchanged. */
    .v2-shell {
      background: #0a0a0a; color: #c8c8c8;
      font-family: var(--font-mono); font-size: 13px;
      min-height: calc(100vh - 120px); display: grid;
      grid-template-rows: auto 1fr; position: relative;
    }
    .v2-topbar {
      display: flex; align-items: center; gap: 14px;
      padding: 12px 20px; border-bottom: 1px solid #1a1a1a;
      flex-wrap: wrap;
    }
    .v2-brand {
      font-family: var(--font-pixel); font-size: 12px;
      color: #39ff14; letter-spacing: 2px;
    }
    .v2-org { font-family: var(--font-pixel); font-size: 7px; color: #555; letter-spacing: 2px; }
    .v2-stats-spacer { flex: 1; }
    .v2-stats { display: flex; gap: 22px; align-items: center; flex-wrap: wrap; }
    .v2-stat {
      display: inline-flex; align-items: baseline; gap: 6px;
    }
    .v2-stat .v2-stat-label {
      font-family: var(--font-pixel); font-size: 7px;
      color: #555; letter-spacing: 1.5px;
    }
    .v2-stat .v2-stat-val {
      font-family: var(--font-pixel); font-size: 11px;
    }

    .v2-panes {
      display: grid; grid-template-columns: 340px 1fr;
      min-height: 0;
    }
    .v2-sidebar {
      border-right: 1px solid #1a1a1a;
      display: flex; flex-direction: column; min-width: 0;
    }
    .v2-sidebar-filter {
      padding: 10px 14px; border-bottom: 1px solid #1a1a1a;
      display: flex; align-items: center; gap: 8px;
    }
    .v2-sidebar-filter input {
      flex: 1; background: none; border: none; outline: none;
      color: #c8c8c8; font-family: var(--font-mono); font-size: 12px;
    }
    .v2-sidebar-filter input::placeholder { color: #555; }
    .v2-repo-row {
      padding: 10px 14px; cursor: pointer;
      border-left: 2px solid transparent;
      display: flex; flex-direction: column; gap: 4px;
      text-decoration: none; color: inherit;
    }
    .v2-repo-row:hover { background: #0f140d; }
    .v2-repo-row.active { border-left-color: #39ff14; background: #0f140d; }
    .v2-repo-row .v2-repo-head { display: flex; align-items: baseline; gap: 8px; }
    .v2-repo-row .v2-repo-name {
      font-family: var(--font-pixel); font-size: 9px;
      color: #c8c8c8; letter-spacing: 0.5px;
    }
    .v2-repo-row.active .v2-repo-name { color: #39ff14; }
    .v2-repo-row .v2-repo-alert {
      font-family: var(--font-pixel); font-size: 6px;
      color: #ff0040; letter-spacing: 1px;
    }
    .v2-repo-row .v2-repo-ai {
      font-family: var(--font-pixel); font-size: 6px;
      color: #00ffff; letter-spacing: 1px;
    }
    .v2-repo-row .v2-repo-meta {
      display: flex; justify-content: space-between; align-items: center;
      font-size: 10px; color: #555;
    }
    .v2-hp-compact {
      font-family: var(--font-mono); font-size: 11px;
      display: inline-flex; align-items: center; gap: 6px; white-space: nowrap;
    }

    .v2-detail { overflow: auto; min-height: 0; min-width: 0; }
    .v2-detail-head {
      padding: 18px 24px; border-bottom: 1px solid #1a1a1a;
    }
    .v2-detail-head-row {
      display: flex; align-items: center; gap: 14px;
      margin-bottom: 14px; flex-wrap: wrap;
    }
    .v2-detail-title {
      font-family: var(--font-pixel); font-size: 14px;
      color: #39ff14; text-shadow: 0 0 8px #39ff14;
      letter-spacing: 1px; word-break: break-word;
    }
    .v2-detail-meta { font-size: 11px; color: #666; }

    .v2-scores { display: flex; gap: 32px; align-items: flex-end; flex-wrap: wrap; }
    .v2-big-score {
      display: flex; flex-direction: column; gap: 6px;
    }
    .v2-big-score .v2-big-score-label {
      font-family: var(--font-pixel); font-size: 7px;
      color: #666; letter-spacing: 2px;
    }
    .v2-big-score .v2-big-score-val {
      font-family: var(--font-pixel); font-size: 26px;
      line-height: 1;
    }

    .v2-tabs {
      display: flex; gap: 0; padding: 0 24px;
      border-bottom: 1px solid #1a1a1a; flex-wrap: wrap;
    }
    .v2-tab {
      background: none; border: none; padding: 12px 14px;
      cursor: pointer; font-family: var(--font-pixel);
      font-size: 8px; letter-spacing: 1.5px; color: #555;
      border-bottom: 2px solid transparent; margin-bottom: -1px;
      white-space: nowrap; text-decoration: none; display: inline-block;
    }
    .v2-tab.active { color: #39ff14; border-bottom-color: #39ff14; }
    .v2-tab:hover:not(.active) { color: #aaa; }

    .v2-panel-body { padding: 18px 24px; }
    .v2-panel-grid {
      display: grid; grid-template-columns: repeat(3, 1fr);
      gap: 24px;
    }
    .v2-panel-span-3 { grid-column: span 3; }
    .v2-panel-head {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 10px; border-bottom: 1px solid #1a1a1a; padding-bottom: 6px;
    }
    .v2-panel-title {
      font-family: var(--font-pixel); font-size: 8px;
      color: #00ffff; letter-spacing: 2px;
    }
    .v2-panel-title .v2-panel-count { color: #555; margin-left: 6px; }
    .v2-panel-expand {
      background: none; border: 1px solid #222; color: #888;
      padding: 3px 8px; cursor: pointer;
      font-family: var(--font-pixel); font-size: 6px; letter-spacing: 1.5px;
      text-decoration: none;
    }
    .v2-panel-expand:hover { color: #39ff14; border-color: #39ff14; }
    .v2-kv-row {
      display: flex; justify-content: space-between;
      padding: 6px 0; border-bottom: 1px solid #141414; font-size: 12px;
    }
    .v2-kv-row .v2-kv-k { color: #888; }
    .v2-kv-row .v2-kv-v {
      font-variant-numeric: tabular-nums; text-transform: uppercase;
    }
    .v2-kv-row .v2-kv-v.pass, .v2-kv-row .v2-kv-v.present { color: #39ff14; }
    .v2-kv-row .v2-kv-v.partial { color: #ffff00; }
    .v2-kv-row .v2-kv-v.fail, .v2-kv-row .v2-kv-v.missing { color: #ff0040; }
    .v2-kv-row .v2-kv-v.na { color: #555; text-transform: none; }
    .v2-kv-row .v2-kv-v.default { color: #c8c8c8; }

    .v2-artifacts-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0 22px; }

    .v2-empty-note {
      font-size: 11px; color: #555; padding: 6px 0;
    }
    .v2-empty-state {
      padding: 40px 24px; text-align: center;
    }
    .v2-empty-state p { color: #666; }

    .v2-back-btn {
      display: none;
      background: none; border: 1px solid #333; color: #aaa;
      padding: 6px 10px; cursor: pointer;
      font-family: var(--font-pixel); font-size: 7px; letter-spacing: 1.5px;
      margin-bottom: 10px; text-decoration: none;
    }

    /* Tablet: narrower sidebar, 2-column panel grid */
    @media (max-width: 960px) {
      .v2-panes { grid-template-columns: 240px 1fr; }
      .v2-panel-grid { grid-template-columns: repeat(2, 1fr); gap: 18px; }
      .v2-panel-span-3 { grid-column: span 2; }
      .v2-artifacts-grid { grid-template-columns: 1fr 1fr; }
      .v2-detail-head { padding: 14px 16px; }
      .v2-tabs { padding: 0 16px; }
      .v2-panel-body { padding: 14px 16px; }
      .v2-detail-title { font-size: 12px; }
    }

    /* Mobile: single-pane. Sidebar is the homepage; picking a repo navigates
       to /repo/owner/name which renders the detail-only view. */
    @media (max-width: 700px) {
      .v2-panes { grid-template-columns: 1fr; }
      .v2-sidebar { border-right: none; }
      .v2-shell[data-mobile-view="detail"] .v2-sidebar { display: none; }
      .v2-shell[data-mobile-view="list"] .v2-detail { display: none; }
      .v2-back-btn { display: inline-flex; align-items: center; gap: 6px; }
      .v2-panel-grid { grid-template-columns: 1fr; gap: 20px; }
      .v2-panel-span-3 { grid-column: span 1; }
      .v2-artifacts-grid { grid-template-columns: 1fr; gap: 0; }
      .v2-detail-title { font-size: 11px; }
      .v2-scores { gap: 18px; }
      .v2-topbar { padding: 10px 14px; gap: 10px; }
      .v2-stats { gap: 14px; order: 3; width: 100%; padding-top: 6px; border-top: 1px solid #1a1a1a; }
      .v2-stats-spacer { display: none; }
    }
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

    /* Export dropdown on each repo card. Filename + format picker lives
       here; the actual download is a GET to /export/:owner/:name/:format
       with the currently selected branch from the combobox. */
    .export-combo { position: relative; display: inline-block; }
    .export-btn {
      font-family: var(--font-pixel); font-size: 8px; letter-spacing: 1px;
      background: #050505; border: 1px solid #00ffff; color: #00ffff;
      padding: 7px 12px; cursor: pointer; transition: all 0.15s;
    }
    .export-btn:hover { background: #00ffff; color: #0a0a0a; }
    .export-menu {
      position: absolute; right: 0; top: 100%; margin-top: 2px;
      list-style: none; background: #050505; border: 1px solid #00ffff;
      min-width: 240px; z-index: 50;
      box-shadow: 0 0 12px rgba(0,255,255,0.25); display: none;
    }
    .export-combo.open .export-menu { display: block; }
    .export-menu li {
      font-family: var(--font-mono); font-size: 12px; color: #aaa;
      padding: 7px 12px; cursor: pointer; white-space: nowrap;
    }
    .export-menu li:hover:not(.export-header) { background: #0a0a0a; color: #00ffff; }
    .export-menu li.export-header {
      font-family: var(--font-pixel); font-size: 7px; color: #666;
      letter-spacing: 2px; padding: 6px 12px 4px; cursor: default;
      border-top: 1px solid #1a1a1a;
    }
    .export-menu li.export-header:first-child { border-top: none; }
    /* Org export sits above the repo list, right-aligned. */
    .org-export-combo { float: right; margin-top: -58px; margin-bottom: 10px; }
    .org-export-combo .export-menu { right: 0; }

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
    .trend-chart .line-ai { stroke: #ff00ff; filter: drop-shadow(0 0 2px #ff00ff); }
    .trend-chart .fill-ai { fill: #ff00ff; }
    .trend-chart .line-vulns { stroke: #ff0040; filter: drop-shadow(0 0 2px #ff0040); }
    .trend-chart .fill-vulns { fill: #ff0040; }
    .legend-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 4px; vertical-align: middle; }
    .legend-dot.line-compliance { background: #39ff14; box-shadow: 0 0 4px #39ff14; }
    .legend-dot.line-nist { background: #00ffff; box-shadow: 0 0 4px #00ffff; }
    .legend-dot.line-ai { background: #ff00ff; box-shadow: 0 0 4px #ff00ff; }
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
    .trend-tooltip .tt-a { color: #ff00ff; }
    .trend-tooltip .tt-v { color: #ff0040; }
    .trend-tooltip .tt-ai-row { display: contents; }
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
  ${opts.fullBleed ? content : `
  <div class="header">
    <h1>GRC OBSERVABILITY</h1>
    <div class="subtitle">${subtitle}GOVERNANCE RISK COMPLIANCE DASHBOARD</div>
    <div class="header-nav">
      <a href="/" class="${navCls("dashboard")}">DASHBOARD</a>
      <a href="/inventory" class="${navCls("inventory")}">AI INVENTORY</a>
    </div>
  </div>
  <div class="container">
    ${content}
    <div class="insert-coin">SYSTEM ACTIVE <span class="cursor-blink"></span></div>
  </div>`}
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
    function showTrendTip(chartId, date, commit, c, n, v, evt, a) {
      var tip = document.getElementById('tt-' + chartId);
      if (!tip) return;
      tip.querySelector('.tt-date').textContent = date;
      tip.querySelector('.tt-commit').textContent = commit;
      tip.querySelector('.tt-c').textContent = c + '%';
      tip.querySelector('.tt-n').textContent = n + '%';
      var aiRow = tip.querySelector('.tt-ai-row');
      var aiVal = tip.querySelector('.tt-a');
      if (aiRow && aiVal) {
        if (a === undefined || a === null || a === '') {
          aiRow.style.display = 'none';
        } else {
          aiRow.style.display = 'contents';
          aiVal.textContent = a + '%';
        }
      }
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

    function toggleExportMenu(repoId) {
      // Close every other open export menu first so we don't stack them.
      document.querySelectorAll('.export-combo.open').forEach(function(el) {
        if (el.querySelector('#export-menu-' + repoId) === null) {
          el.classList.remove('open');
        }
      });
      var menu = document.getElementById('export-menu-' + repoId);
      if (!menu) return;
      menu.parentElement.classList.toggle('open');
    }

    function downloadExport(evt, owner, name, repoId, format) {
      evt.stopPropagation();
      // Honor the branch selected in the combobox for this repo card. Falls
      // back to no ?branch= so the server picks main/master.
      var combo = document.getElementById('branch-' + repoId);
      var branch = combo ? combo.getAttribute('data-value') : '';
      var url = '/export/' + owner + '/' + name + '/' + format;
      if (branch) url += '?branch=' + encodeURIComponent(branch);
      // Close the menu immediately so the dropdown doesn't linger while the
      // download starts.
      var parent = document.getElementById('export-menu-' + repoId);
      if (parent) parent.parentElement.classList.remove('open');
      window.location.href = url;
    }

    // Close export menus when clicking anywhere else on the page.
    document.addEventListener('click', function(evt) {
      if (!evt.target.closest('.export-combo')) {
        document.querySelectorAll('.export-combo.open').forEach(function(el) {
          el.classList.remove('open');
        });
      }
    });

    function toggleOrgExportMenu() {
      var el = document.querySelector('.org-export-combo');
      if (el) el.classList.toggle('open');
    }
    function downloadOrgExport(evt, format) {
      evt.stopPropagation();
      var el = document.querySelector('.org-export-combo');
      if (el) el.classList.remove('open');
      window.location.href = '/export/all/' + format;
    }
  </script>
</body>
</html>`;
}

/**
 * Render a single repo row in the left sidebar. Kept as a helper so the
 * new two-pane dashboard and any future "inventory by repo" view can
 * reuse the exact same row shape.
 */
function v2RepoRow(r: RepoSummary, active: boolean): string {
  const bad = r.criticalVulns + r.highVulns > 0 || r.secretsDetected;
  const aiCount = r.aiSystemCount ?? 0;
  const shortName = r.repo.split("/")[1] ?? r.repo;
  return `
    <a class="v2-repo-row${active ? " active" : ""}" href="/?repo=${encodeURIComponent(r.repo)}" data-repo="${esc(r.repo)}">
      <div class="v2-repo-head">
        <span class="v2-repo-name">${esc(shortName)}</span>
        ${bad ? '<span class="v2-repo-alert">ALERT</span>' : ""}
        ${aiCount > 0 ? `<span class="v2-repo-ai">AI·${aiCount}</span>` : ""}
      </div>
      <div class="v2-repo-meta">
        <span>${esc(r.branch)} · ${timeAgo(r.scanDate)}</span>
        <span class="v2-hp-compact">
          <span style="color:${scoreColor(r.complianceScore)}">${"\u2588".repeat(Math.round(r.complianceScore / 100 * 8))}</span><span style="color:#2a2a2a">${"\u2591".repeat(8 - Math.round(r.complianceScore / 100 * 8))}</span>
          <span style="color:${scoreColor(r.complianceScore)}">${r.complianceScore}%</span>
        </span>
      </div>
    </a>`;
}

export function renderDashboard(
  summaries: RepoSummary[],
  branchesPerRepo: Map<string, string[]>,
  orgName: string = "",
  opts: { selectedRepo?: string; repoDetailHtml?: string } = {},
): string {
  if (summaries.length === 0) {
    return layout("GRC OBSERVABILITY", `
      <div class="empty">
        <h2>NO TARGETS DETECTED</h2>
        <p>POST a manifest to <code>/api/report</code> to begin scanning.</p>
      </div>`, orgName);
  }

  // --- org-level stats for the top bar ---
  const totalRepos = summaries.length;
  const avgScore = Math.round(summaries.reduce((s, r) => s + r.complianceScore, 0) / totalRepos);
  const avgNist = Math.round(summaries.reduce((s, r) => s + r.nistScore, 0) / totalRepos);
  const totalVulns = summaries.reduce((s, r) => s + r.criticalVulns + r.highVulns, 0);
  const secretsCount = summaries.filter(r => r.secretsDetected).length;
  const totalAISystems = summaries.reduce((s, r) => s + (r.aiSystemCount ?? 0), 0);

  // --- selection + sidebar ---
  // The selected repo drives the right pane. Default to the first repo sorted
  // by scanDate desc (the homepage sort) so users land on fresh data.
  const selected = opts.selectedRepo
    ? summaries.find(r => r.repo === opts.selectedRepo) ?? summaries[0]!
    : summaries[0]!;

  const sidebarRows = summaries.map(r => v2RepoRow(r, r.repo === selected.repo)).join("\n");

  const orgHeader = orgName ? `${orgName.toUpperCase()} · ${totalRepos} REPOS` : `${totalRepos} REPOS`;

  const stat = (label: string, v: string, color: string) =>
    `<span class="v2-stat"><span class="v2-stat-label">${label}</span><span class="v2-stat-val" style="color:${color}">${v}</span></span>`;

  const topbarHtml = `
    <div class="v2-topbar">
      <div class="v2-brand">GRC OBSERVABILITY</div>
      <div class="v2-org">${esc(orgHeader)}</div>
      <div class="v2-stats-spacer"></div>
      <div class="v2-stats">
        ${stat("CMPL", avgScore + "%", scoreColor(avgScore))}
        ${stat("NIST", avgNist + "%", scoreColor(avgNist))}
        ${stat("AI SYS", String(totalAISystems), "#00ffff")}
        ${stat("THREATS", String(totalVulns), totalVulns ? "#ff0040" : "#39ff14")}
        ${stat("LEAKS", String(secretsCount), secretsCount ? "#ff0040" : "#39ff14")}
      </div>
      <a class="v2-tab" href="/inventory" style="padding:6px 10px;">AI INVENTORY \u2192</a>
    </div>`;

  const sidebarHtml = `
    <aside class="v2-sidebar">
      <div class="v2-sidebar-filter">
        <span style="color:#39ff14">&gt;</span>
        <input id="repo-search" placeholder="filter..." oninput="v2FilterRepos()">
      </div>
      <div id="v2-repo-list">${sidebarRows}</div>
    </aside>`;

  // Right pane: either the server-rendered detail for the selected repo,
  // or fall back to a placeholder if we weren't given one. Production always
  // passes one.
  const detailHtml = opts.repoDetailHtml
    ? opts.repoDetailHtml
    : `<div class="v2-empty-state"><p>Select a repo from the left to view compliance detail.</p></div>`;

  const shellHtml = `
    <div class="v2-shell">
      ${topbarHtml}
      <div class="v2-panes" id="v2-panes">
        ${sidebarHtml}
        <main class="v2-detail" id="v2-detail">${detailHtml}</main>
      </div>
    </div>
    <script>
      // Client-side filter over the sidebar repo list. Server returns every
      // repo's row; we just hide non-matches locally to keep the UI snappy.
      function v2FilterRepos() {
        var q = (document.getElementById('repo-search').value || '').toLowerCase();
        document.querySelectorAll('#v2-repo-list .v2-repo-row').forEach(function(el) {
          var repo = (el.getAttribute('data-repo') || '').toLowerCase();
          el.style.display = repo.includes(q) ? '' : 'none';
        });
      }
    </script>`;

  // v2 is full-bleed — it has its own topbar, so we skip layout()'s v1
  // header + the 1100px .container wrapper. Without that, the two-pane
  // grid gets clamped to ~1068px and the media query at <=960px fires
  // on typical desktop widths.
  return layout("GRC OBSERVABILITY", shellHtml, orgName, "dashboard", { fullBleed: true });
}

// V1 expanded-repo-card rendering removed — superseded by v2 two-pane shell.
// Prior layout available in git history before feat/dashboard-v2.

type PolicyServedState = "served" | "unreachable" | "not-configured";
type PolicyServedMap = Partial<Record<
  "privacyPolicy" | "termsOfService" | "vulnerabilityDisclosure" | "incidentResponsePlan" | "securityTxt",
  PolicyServedState
>>;

export interface ServedState {
  policyServed?: PolicyServedMap;
  policyServedCheckedAt?: string;
}

/** KV row inside one of the v2 overview panels. */
function v2Kv(k: string, v: string, status?: string): string {
  const cls = status ? ` ${status}` : " default";
  return `<div class="v2-kv-row"><span class="v2-kv-k">${esc(k)}</span><span class="v2-kv-v${cls}">${v}</span></div>`;
}

function v2Panel(title: string, body: string, opts: { count?: number; span3?: boolean } = {}): string {
  const countHtml = opts.count !== undefined ? `<span class="v2-panel-count">· ${opts.count}</span>` : "";
  return `
    <section class="${opts.span3 ? "v2-panel-span-3" : ""}">
      <div class="v2-panel-head">
        <div class="v2-panel-title">${title}${countHtml}</div>
      </div>
      <div>${body}</div>
    </section>`;
}

function v2BigScore(label: string, pct: number | null): string {
  if (pct === null) {
    return `
      <div class="v2-big-score">
        <div class="v2-big-score-label">${label}</div>
        <div class="v2-big-score-val" style="color:#555">—</div>
      </div>`;
  }
  const color = scoreColor(pct);
  return `
    <div class="v2-big-score">
      <div class="v2-big-score-label">${label}</div>
      <div class="v2-big-score-val" style="color:${color};text-shadow:0 0 10px ${color}">${pct}%</div>
      <div style="margin-top:4px;">${hpBar(pct, 14, "")}</div>
    </div>`;
}

export type RepoDetailTab = "overview" | "nist" | "ai" | "branches" | "trends";

/**
 * Render the right pane of the v2 two-pane shell. `tab` selects which body
 * to show under the detail head — overview keeps the 3-col panel grid,
 * the others embed the existing NIST / AI / branches / trends views so
 * navigation is a single full-page load rather than HTMX.
 */
export function renderRepoDetail(
  manifest: Manifest,
  summary: RepoSummary,
  served: ServedState = {},
  opts: {
    tab?: RepoDetailTab;
    functionScores?: FunctionScore[];
    branchSummaries?: RepoSummary[];
    history?: HistoryEntry[];
  } = {},
): string {
  const [owner, name] = manifest.repo.split("/") as [string, string];
  const safeId = (owner + "-" + name).replace(/\./g, "-");
  const h = manifest.securityHeaders;
  const ac = manifest.accessControls;
  const dc = manifest.dataCollection;
  const tp = manifest.thirdPartyServices;
  const ai = manifest.aiSystems || [];
  const aiCount = ai.length;
  const aiScore = summary.aiScore;
  const hasSiteUrl = !!summary.siteUrl;

  // --- panels ---

  const dataBody = dc.length === 0
    ? `<div class="v2-empty-note">No data collection detected.</div>`
    : [
        v2Kv("Forms", String(dc.filter(d => d.source === "form" || d.source === "web-form").length)),
        v2Kv("API endpoints", String(dc.filter(d => d.source.startsWith("POST") || d.source === "api-input").length)),
        v2Kv("Cookies", String(dc.filter(d => d.type === "cookie").length)),
        v2Kv("Trackers", String(dc.filter(d => d.type === "tracking").length)),
      ].join("");

  const transportBody = !h && !manifest.https
    ? `<div class="v2-empty-note">No live site URL configured.</div>`
    : [
        manifest.https
          ? v2Kv("HTTPS", manifest.https.enforced ? "enforced" : "NOT ENFORCED", manifest.https.enforced ? "pass" : "fail")
          : v2Kv("HTTPS", "not checked", "na"),
        manifest.https?.certExpiry
          ? v2Kv("Cert expiry", manifest.https.certExpiry)
          : "",
        h
          ? v2Kv("Headers", `${summary.headersPresent}/${summary.headersTotal}`, summary.headersPresent === summary.headersTotal ? "pass" : summary.headersPresent >= 3 ? "partial" : "fail")
          : v2Kv("Headers", "not checked", "na"),
      ].join("");

  const depsBody = !manifest.dependencies
    ? `<div class="v2-empty-note">No dependency scan performed.</div>`
    : [
        v2Kv("Critical", String(manifest.dependencies.criticalVulnerabilities), manifest.dependencies.criticalVulnerabilities > 0 ? "fail" : "pass"),
        v2Kv("High", String(manifest.dependencies.highVulnerabilities), manifest.dependencies.highVulnerabilities > 0 ? "fail" : "pass"),
        v2Kv("Medium", String(manifest.dependencies.mediumVulnerabilities)),
        v2Kv("Last audit", manifest.dependencies.lastAudit),
      ].join("");

  const accessBody = [
    v2Kv("Branch protection",
      ac.branchProtection === true ? "enabled" : ac.branchProtection === false ? "DISABLED" : "UNKNOWN",
      ac.branchProtection === true ? "pass" : ac.branchProtection === false ? "fail" : "na"),
    v2Kv("Required reviews", String(ac.requiredReviews ?? "\u2014")),
    v2Kv("Signed commits",
      ac.signedCommits === true ? "yes" : ac.signedCommits === false ? "no" : "\u2014",
      ac.signedCommits === true ? "pass" : ac.signedCommits === false ? "fail" : "na"),
  ].join("");

  const aiBody = aiCount === 0
    ? `<div class="v2-empty-note">No AI SDKs, training libs, or inference endpoints detected in this repo.</div>`
    : ai.slice(0, 4).map(s => {
        const tier = s.riskTier ?? "unknown";
        const status = tier === "high" || tier === "prohibited" ? "fail" : tier === "limited" ? "partial" : "pass";
        return v2Kv(`${s.provider} · ${s.sdk}`, tier.toUpperCase(), status);
      }).join("") + (aiCount > 4 ? `<div class="v2-empty-note">+${aiCount - 4} more — see AI tab</div>` : "");

  const tpBody = tp.length === 0
    ? `<div class="v2-empty-note">No external services detected.</div>`
    : tp.slice(0, 6).map(s => v2Kv(s.name, s.dpaUrl ? "DPA \u2713" : "no DPA", s.dpaUrl ? "pass" : "partial")).join("");

  // Governance artifacts: IN REPO vs SERVED (v1 logic kept intact, rendered in v2 panel shell)
  const artifactRows: string[] = [];
  const labels: Record<string, string> = {
    privacyPolicy: "Privacy Policy",
    termsOfService: "Terms of Service",
    securityTxt: "security.txt",
    vulnerabilityDisclosure: "Vuln Disclosure",
    incidentResponsePlan: "Incident Response Plan",
  };
  for (const [key, label] of Object.entries(labels)) {
    const val = (manifest.artifacts as any)[key] as string;
    const servedState = (served.policyServed || {})[key as keyof PolicyServedMap];
    const servedText = servedState === "served" ? "served"
      : servedState === "unreachable" ? "UNREACHABLE"
      : servedState === "not-configured" ? "not configured"
      : "\u2014";
    const servedCls = servedState === "served" ? "pass"
      : servedState === "unreachable" ? "fail"
      : "na";
    artifactRows.push(`
      <div class="v2-kv-row"><span class="v2-kv-k">${esc(label)}</span><span class="v2-kv-v ${val === "missing" ? "fail" : val === "partial" ? "partial" : "pass"}">${esc(val).toUpperCase()}</span></div>
      <div class="v2-kv-row"><span class="v2-kv-k" style="padding-left:12px;font-style:italic;">└ served</span><span class="v2-kv-v ${servedCls}">${servedText}</span></div>
    `);
  }
  // AI artifacts — only render rows that aren't N/A
  const aiArtifactLabels: Record<string, string> = { aiUsagePolicy: "AI Usage Policy", modelCards: "Model Cards", fria: "FRIA" };
  for (const [key, label] of Object.entries(aiArtifactLabels)) {
    const val = (manifest.artifacts as any)[key] as string | undefined;
    if (val === undefined || val === "not-applicable") continue;
    artifactRows.push(v2Kv(label, val.toUpperCase(), val === "present" ? "pass" : val === "missing" ? "fail" : "partial"));
  }
  const artifactsBody = `<div class="v2-artifacts-grid">${artifactRows.join("")}</div>` +
    (served.policyServedCheckedAt
      ? `<div class="v2-empty-note" style="margin-top:10px;">Served state last checked ${timeAgo(served.policyServedCheckedAt)}. CHECK PRODUCTION refreshes it.</div>`
      : `<div class="v2-empty-note" style="margin-top:10px;">Served state never checked. Click CHECK PRODUCTION above to populate — only URLs declared in <code style="color:#ffff00">policy_urls:</code> are verified.</div>`);

  const panelsHtml = [
    v2Panel(`DATA COLLECTION`, dataBody, { count: dc.length }),
    v2Panel(`TRANSPORT`, transportBody),
    v2Panel(`DEPENDENCIES`, depsBody),
    v2Panel(`ACCESS CONTROLS`, accessBody),
    v2Panel(aiCount > 0 ? `AI SYSTEMS` : `AI SYSTEMS · NONE`, aiBody, aiCount > 0 ? { count: aiCount } : {}),
    v2Panel(`THIRD-PARTY`, tpBody, tp.length > 0 ? { count: tp.length } : {}),
    v2Panel(`GOVERNANCE ARTIFACTS`, artifactsBody, { span3: true }),
  ].join("\n");

  // --- detail head (title + meta + action buttons + score trio + tabs) ---

  // Keep v1 class names (export-combo, branch-combo, check-prod-btn) for
  // backward compatibility with the existing JS functions — they still work
  // the same way, just styled at new positions.
  const exportDropdownHtml = `
    <div class="export-combo" onclick="event.stopPropagation();">
      <button class="export-btn" onclick="toggleExportMenu('${safeId}')">EXPORT \u25BE</button>
      <ul id="export-menu-${safeId}" class="export-menu">
        <li class="export-header">MACHINE-READABLE</li>
        <li onclick="downloadExport(event,'${owner}','${name}','${safeId}','manifest.json')">JSON (full state)</li>
        <li onclick="downloadExport(event,'${owner}','${name}','${safeId}','findings.sarif')">SARIF (code scanning)</li>
        <li onclick="downloadExport(event,'${owner}','${name}','${safeId}','assessment.oscal.json')">OSCAL (assessment)</li>
        <li class="export-header">CSV</li>
        <li onclick="downloadExport(event,'${owner}','${name}','${safeId}','nist-csf.csv')">NIST CSF controls</li>
        <li onclick="downloadExport(event,'${owner}','${name}','${safeId}','eu-ai-act.csv')">EU AI Act articles</li>
        <li onclick="downloadExport(event,'${owner}','${name}','${safeId}','risks.csv')">Risk register</li>
        <li onclick="downloadExport(event,'${owner}','${name}','${safeId}','vulnerabilities.csv')">Vulnerabilities</li>
      </ul>
    </div>`;

  const checkProdBtn = hasSiteUrl
    ? `<button class="check-prod-btn" onclick="checkProduction('${owner}','${name}',this)">CHECK PRODUCTION</button><span class="check-prod-result"></span>`
    : "";

  const activeTab: RepoDetailTab = opts.tab ?? "overview";
  const tabLabels: Array<[RepoDetailTab, string]> = [
    ["overview", "OVERVIEW"],
    ["nist", "NIST"],
    ["ai", "AI"],
    ["branches", "BRANCHES"],
    ["trends", "TRENDS"],
  ];
  const repoHref = `/?repo=${encodeURIComponent(manifest.repo)}`;
  const tabHref = (tab: RepoDetailTab, label: string) =>
    `<a class="v2-tab${tab === activeTab ? " active" : ""}" href="${repoHref}&tab=${tab}">${label}</a>`;

  // Body varies by tab. Non-overview tabs embed the existing specialized
  // views — they were originally HTMX fragments but render fine as plain
  // content inside the panel body.
  let bodyHtml: string;
  switch (activeTab) {
    case "nist":
      bodyHtml = opts.functionScores
        ? renderNistView(summary, opts.functionScores)
        : `<div class="v2-empty-note">NIST data unavailable.</div>`;
      break;
    case "ai":
      bodyHtml = renderAIComplianceView(manifest);
      break;
    case "branches":
      bodyHtml = opts.branchSummaries && opts.branchSummaries.length > 0
        ? renderBranchComparison(opts.branchSummaries)
        : `<div class="v2-empty-note">Only one branch scanned for this repo.</div>`;
      break;
    case "trends":
      bodyHtml = renderTrendChart(opts.history ?? [], manifest.repo, manifest.branch);
      break;
    default:
      bodyHtml = `<div class="v2-panel-grid">${panelsHtml}</div>`;
  }

  return `
    <div class="v2-detail-head">
      <div class="v2-detail-head-row">
        <span class="v2-detail-title">${esc(manifest.repo)}</span>
        <span class="v2-detail-meta">${esc(manifest.branch)} · ${esc(manifest.commit)} · ${timeAgo(manifest.scanDate)}</span>
        <div style="flex:1"></div>
        ${exportDropdownHtml}
        ${checkProdBtn}
      </div>
      <div class="v2-scores">
        ${v2BigScore("COMPLIANCE", summary.complianceScore)}
        ${v2BigScore("NIST CSF 2.0", summary.nistScore)}
        ${aiCount > 0 ? v2BigScore("EU AI ACT", aiScore) : ""}
      </div>
    </div>
    <nav class="v2-tabs">
      ${tabLabels.map(([t, l]) => tabHref(t, l)).join("")}
    </nav>
    <div class="v2-panel-body">${bodyHtml}</div>`;
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
  metric: "compliance" | "nist" | "ai" | "vulns";
  axis: "left" | "right";
}

interface HoverDatum { date: string; commit: string; c: number; n: number; v: number; a?: number }

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
      const aArg = d.a === undefined ? "undefined" : String(d.a);
      hoverHtml += `<rect class="trend-hover-zone" x="${x.toFixed(1)}" y="${padT}" width="${w.toFixed(1)}" height="${chartH}" data-commit="${esc(d.commit)}" onmouseover="showTrendTip('${opts.chartId}', '${esc(d.date)}', '${esc(d.commit)}', ${d.c}, ${d.n}, ${d.v}, event, ${aArg})" onmouseout="hideTrendTip('${opts.chartId}')"/>`;
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
  const latest = recent[recent.length - 1]!;
  const first = recent[0]!;

  const arrowPct = (d: number) => d > 0 ? `<span style="color:#39ff14">+${d}%</span>` : d < 0 ? `<span style="color:#ff0040">${d}%</span>` : `<span style="color:#888">=</span>`;
  const arrowCount = (d: number) => d > 0 ? `<span style="color:#ff0040">+${d}</span>` : d < 0 ? `<span style="color:#39ff14">${d}</span>` : `<span style="color:#888">=</span>`;

  const complianceDelta = latest.complianceScore - first.complianceScore;
  const nistDelta = latest.nistScore - first.nistScore;
  const vulnsNow = latest.criticalVulns + latest.highVulns;
  const vulnsFirst = first.criticalVulns + first.highVulns;
  const vulnDelta = vulnsNow - vulnsFirst;

  // EU AI Act series is drawn only if this branch has ever had AI systems.
  // Otherwise the line would just be 100% throughout (all articles N/A → score
  // = 100%), which is noise on the chart for repos that don't use AI.
  const showAISeries = recent.some(e => (e.aiSystemCount ?? 0) > 0);
  const aiLatest = latest.aiScore ?? null;
  const aiFirst = first.aiScore ?? null;
  const aiDelta = (aiLatest !== null && aiFirst !== null) ? aiLatest - aiFirst : 0;

  // Stats row
  html += `<div style="display:flex;gap:16px;flex-wrap:wrap;font-size:11px;margin-bottom:8px;">
    <span><span class="legend-dot line-compliance"></span> COMPLIANCE <span style="color:#39ff14">${latest.complianceScore}%</span> ${arrowPct(complianceDelta)}</span>
    <span><span class="legend-dot line-nist"></span> NIST <span style="color:#00ffff">${latest.nistScore}%</span> ${arrowPct(nistDelta)}</span>`;
  if (showAISeries && aiLatest !== null) {
    html += `<span><span class="legend-dot line-ai"></span> EU AI <span style="color:#ff00ff">${aiLatest}%</span> ${arrowPct(aiDelta)}</span>`;
  }
  html += `<span><span class="legend-dot line-vulns"></span> VULNS <span style="color:#ff0040">${vulnsNow}</span> ${arrowCount(vulnDelta)}</span>
  </div>`;

  const vulnValues = recent.map(e => e.criticalVulns + e.highVulns);
  const maxVulns = Math.max(5, ...vulnValues);

  const series: Series[] = [
    { values: recent.map(e => e.complianceScore), metric: "compliance", axis: "left" },
    { values: recent.map(e => e.nistScore), metric: "nist", axis: "left" },
    ...(showAISeries ? [{ values: recent.map(e => e.aiScore ?? 0), metric: "ai" as const, axis: "left" as const }] : []),
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
    a: showAISeries ? (e.aiScore ?? undefined) : undefined,
  }));

  // Chart wrapper is relative so the absolute tooltip positions above the hovered column.
  html += `<div class="trend-wrap" id="wrap-${chartId}">
    <div class="trend-tooltip" id="tt-${chartId}">
      <span class="tt-key">DATE</span><span class="tt-val tt-date"></span>
      <span class="tt-key">COMMIT</span><span class="tt-val tt-commit"></span>
      <span class="tt-key">COMPLIANCE</span><span class="tt-val tt-c"></span>
      <span class="tt-key">NIST</span><span class="tt-val tt-n"></span>
      <span class="tt-ai-row"${showAISeries ? "" : ` style="display:none"`}><span class="tt-key">EU AI</span><span class="tt-val tt-a"></span></span>
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

  html += `<div style="font-size:11px;color:#888;margin-top:6px;letter-spacing:1px;">LEFT AXIS: % COMPLIANCE // <span style="color:#ff0040">RIGHT AXIS: VULN COUNT</span> // HOVER TO INSPECT${showAISeries ? "" : " // <span style=\"color:#555\">EU AI line hidden (no AI systems detected on this branch)</span>"}</div>`;

  html += `</div>`;
  return html;
}

/**
 * Input to renderInventoryView. One row per (repo, AI system) pair so
 * filtering by provider/tier flattens cleanly.
 */
export interface InventoryRow {
  repo: string;
  branch: string;
  scanDate: string;
  provider: string;
  sdk: string;
  category: string;
  location: string;
  riskTier: string;
  riskTierSource: string;
  euMarket: boolean;
  riskReasoning?: string;
}

export function renderInventoryView(rows: InventoryRow[], orgName: string = ""): string {
  const providers = Array.from(new Set(rows.map(r => r.provider))).sort();
  const repos = Array.from(new Set(rows.map(r => r.repo))).sort();
  const tierOrder = ["prohibited", "high", "limited", "minimal", "unknown"];
  const tiers = Array.from(new Set(rows.map(r => r.riskTier))).sort(
    (a, b) => tierOrder.indexOf(a) - tierOrder.indexOf(b),
  );

  const totals = {
    rows: rows.length,
    repos: repos.length,
    prohibited: rows.filter(r => r.riskTier === "prohibited").length,
    high: rows.filter(r => r.riskTier === "high").length,
    limited: rows.filter(r => r.riskTier === "limited").length,
    minimal: rows.filter(r => r.riskTier === "minimal").length,
    euMarket: rows.filter(r => r.euMarket).length,
  };

  const statsHtml = `
    <div class="stats-row">
      <div class="stat-card"><div class="label">Systems</div><div class="value" style="color:#00ffff">${totals.rows}</div></div>
      <div class="stat-card"><div class="label">Repos</div><div class="value" style="color:#00ffff">${totals.repos}</div></div>
      <div class="stat-card"><div class="label">Prohibited</div><div class="value" style="color:${totals.prohibited > 0 ? "#ff0040" : "#555"}">${totals.prohibited}</div></div>
      <div class="stat-card"><div class="label">High Risk</div><div class="value" style="color:${totals.high > 0 ? "#ff8c00" : "#555"}">${totals.high}</div></div>
      <div class="stat-card"><div class="label">EU Market</div><div class="value" style="color:${totals.euMarket > 0 ? "#00ffff" : "#555"}">${totals.euMarket}</div></div>
    </div>`;

  // Filter controls — client-side JS below reads these and hides rows.
  let filtersHtml = `<div class="detail" style="margin-bottom:12px;">`;
  filtersHtml += `<h3>FILTERS</h3>`;
  filtersHtml += `<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;">`;
  filtersHtml += `<div><label style="font-family:var(--font-pixel);font-size:8px;color:#888;margin-right:8px;">TIER</label><select id="flt-tier" class="inv-select" onchange="filterInventory()"><option value="">ALL</option>`;
  for (const t of tiers) filtersHtml += `<option value="${esc(t)}">${esc(t)}</option>`;
  filtersHtml += `</select></div>`;
  filtersHtml += `<div><label style="font-family:var(--font-pixel);font-size:8px;color:#888;margin-right:8px;">PROVIDER</label><select id="flt-provider" class="inv-select" onchange="filterInventory()"><option value="">ALL</option>`;
  for (const p of providers) filtersHtml += `<option value="${esc(p)}">${esc(p)}</option>`;
  filtersHtml += `</select></div>`;
  filtersHtml += `<div><label style="font-family:var(--font-pixel);font-size:8px;color:#888;margin-right:8px;">REPO</label><select id="flt-repo" class="inv-select" onchange="filterInventory()"><option value="">ALL</option>`;
  for (const r of repos) filtersHtml += `<option value="${esc(r)}">${esc(r)}</option>`;
  filtersHtml += `</select></div>`;
  filtersHtml += `<div><label style="font-family:var(--font-pixel);font-size:8px;color:#888;margin-right:8px;">EU</label><select id="flt-eu" class="inv-select" onchange="filterInventory()"><option value="">ALL</option><option value="yes">YES</option><option value="no">NO</option></select></div>`;
  filtersHtml += `<button class="load-more-btn" type="button" onclick="resetInventoryFilters()" style="margin: 0;">RESET</button>`;
  filtersHtml += `<a class="load-more-btn" href="/api/inventory.csv" style="margin:0;text-decoration:none;">EXPORT CSV</a>`;
  filtersHtml += `</div></div>`;

  // Inventory table
  let tableHtml = `<div class="detail"><h3>AI SYSTEMS // ${rows.length} ROWS</h3>`;
  if (rows.length === 0) {
    tableHtml += `<p>No AI systems detected across any scanned repo. Run a scan on a repo that imports an AI SDK or uses an AI HTTP API to populate this view.</p></div>`;
  } else {
    tableHtml += `<table id="inventory-table"><colgroup><col style="width:20%"><col style="width:14%"><col style="width:14%"><col style="width:10%"><col style="width:10%"><col style="width:7%"><col style="width:25%"></colgroup>`;
    tableHtml += `<tr><th>REPO</th><th>PROVIDER</th><th>SDK</th><th>TIER</th><th>CATEGORY</th><th>EU</th><th>LOCATION</th></tr>`;
    for (const r of rows) {
      const tierColor = r.riskTier === "prohibited" ? "#ff0040"
        : r.riskTier === "high" ? "#ff8c00"
        : r.riskTier === "limited" ? "#ffff00"
        : r.riskTier === "minimal" ? "#39ff14"
        : "#888";
      const sourceBadge = r.riskTierSource === "override"
        ? ' <span style="color:#888;font-size:10px;">\u2605</span>'
        : "";
      const tierCell = r.riskReasoning
        ? `<span class="tip" data-tip="${esc(r.riskReasoning)}" style="color:${tierColor}">${esc(r.riskTier)}</span>${sourceBadge}`
        : `<span style="color:${tierColor}">${esc(r.riskTier)}</span>${sourceBadge}`;
      tableHtml += `<tr class="inv-row" data-tier="${esc(r.riskTier)}" data-provider="${esc(r.provider)}" data-repo="${esc(r.repo)}" data-eu="${r.euMarket ? "yes" : "no"}">`;
      tableHtml += `<td><a href="/#${esc(r.repo)}" style="color:#00ffff">${esc(r.repo)}</a><div style="font-size:10px;color:#666;">${esc(r.branch)}</div></td>`;
      tableHtml += `<td>${esc(r.provider)}</td>`;
      tableHtml += `<td>${esc(r.sdk)}</td>`;
      tableHtml += `<td>${tierCell}</td>`;
      tableHtml += `<td style="color:#888">${esc(r.category)}</td>`;
      tableHtml += `<td style="color:${r.euMarket ? "#00ffff" : "#555"}">${r.euMarket ? "YES" : "NO"}</td>`;
      tableHtml += `<td><code>${esc(r.location)}</code></td>`;
      tableHtml += `</tr>`;
    }
    tableHtml += `</table>`;
    tableHtml += `<p class="note"><strong>Inventory scope.</strong> This view aggregates AI systems across every repo currently scanned by the dashboard. Rows marked with \u2605 have their risk tier set by an explicit override in <code>.grc/config.yml</code>; other rows are heuristic classifications. <strong>Use.</strong> This list is intended as an internal AI systems inventory feeding the EU AI Act Article 49 / Article 26(8) registration flow (EU database established by Article 71) and for auditor evidence packages. Export as CSV via the button above.</p>`;
    tableHtml += `</div>`;
  }

  const inventoryScript = `<script>
    function filterInventory() {
      var tier = document.getElementById('flt-tier').value;
      var prov = document.getElementById('flt-provider').value;
      var repo = document.getElementById('flt-repo').value;
      var eu = document.getElementById('flt-eu').value;
      var rows = document.querySelectorAll('.inv-row');
      var visible = 0;
      rows.forEach(function(r) {
        var show = (!tier || r.dataset.tier === tier)
          && (!prov || r.dataset.provider === prov)
          && (!repo || r.dataset.repo === repo)
          && (!eu || r.dataset.eu === eu);
        r.style.display = show ? '' : 'none';
        if (show) visible++;
      });
      // The empty-state inventory page renders filter controls but no
      // #inventory-table, so a reset click must not chain through null.
      var table = document.querySelector('#inventory-table');
      if (table) {
        var detail = table.closest('.detail');
        var hdr = detail ? detail.querySelector('h3') : null;
        if (hdr) hdr.textContent = '[ AI SYSTEMS // ' + visible + ' ROWS ]';
      }
    }
    function resetInventoryFilters() {
      document.getElementById('flt-tier').value = '';
      document.getElementById('flt-provider').value = '';
      document.getElementById('flt-repo').value = '';
      document.getElementById('flt-eu').value = '';
      filterInventory();
    }
  </script>
  <style>
    .inv-select {
      font-family: var(--font-mono); font-size: 12px;
      background: #050505; border: 1px solid #333; color: #00ffff;
      padding: 5px 8px; outline: none;
    }
  </style>`;

  return layout("AI INVENTORY // GRC OBSERVABILITY", statsHtml + filtersHtml + tableHtml + inventoryScript, orgName, "inventory");
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
