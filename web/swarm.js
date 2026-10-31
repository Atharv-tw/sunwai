// Swarm view (D-039 restyle of Alok's D-034..D-038). Every edge, counter, status line, bubble and stream row comes from
// a logged Meko call (/api/calls, /api/events); nothing here invents a call. Only the breathing and the dotted orbits
// are decoration. Contract: TASKS.md "Swarm API". Uses ICONS / ACTORS / icon() from common.js.
(() => {
  const NS = "http://www.w3.org/2000/svg";
  const EDGE_LIFE = 6;        // seconds an edge stays visible (D-036)
  const STREAM_MAX = 150;     // rows drawn in the message stream
  const PLAY_SPEED = 30;      // replay seconds of history per real second
  const W = 1000, H = 560, HUB = { x: 500, y: 280 };
  const AGENT_POS = {
    desk: [240, 187], hostel: [500, 95], mess: [760, 187],
    it: [760, 373], curator: [500, 465], dean: [240, 373],
  };
  const PEOPLE_POS = {
    student: [72, 130], caretaker: [72, 280], warden: [72, 430],
    mess_committee: [928, 130], it_cell: [928, 280], electricity: [928, 430],
  };
  const DP_PULL = 0.45;       // datapack chip sits this far from the hub towards its agent
  const KINDS = ["write", "read", "share", "promote", "approval", "admin"];
  const VERB = {
    write: "noted to", read: "recalled from", share: "shared a note into", promote: "promoted into",
    approval: "recorded approval in", admin: "housekeeping in",
  };
  const BUSY_VERB = { write: "writing to", read: "recalling from", share: "sharing into", promote: "promoting into", approval: "approving in", admin: "opening" };

  const $ = (s) => document.querySelector(s);
  const svg = $("#graph"), world = $("#world"), stage = $("#stage");
  const edgeLayer = $("#edges"), dotLayer = $("#particles");

  const state = {
    calls: [], seen: new Set(), nodes: {},
    windowSec: 300, replayT: null, playing: false, showAdmin: false, selected: null,
  };

  const shortName = (id) => String(id || "").replace(/^sunwai-(\w+-)?/, "");
  const fmt = (ts) => new Date(ts * 1000).toTimeString().slice(0, 8);
  const now = () => Date.now() / 1000;
  const T = () => (state.replayT == null ? now() : state.replayT);
  const kc = (c) => (c.ok ? `var(--k-${c.kind})` : "var(--k-error)");
  const meta = (id) => ACTORS[id] || { label: id, icon: "bot", hue: "#94a3b8", kind: "person" };
  const secs = (ms) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`);
  const el = (tag, attrs = {}, parent) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (parent) parent.appendChild(e);
    return e;
  };
  const div = (cls, html, parent) => {
    const d = document.createElement("div");
    d.className = cls; d.innerHTML = html;
    if (parent) parent.appendChild(d);
    return d;
  };
  function esc(s) {
    return String(s ?? "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
  }

  // ---------- fit the fixed 1000×560 world into the stage ----------
  function fit() {
    const r = stage.getBoundingClientRect();
    const k = Math.min(r.width / W, r.height / H);
    world.style.transform = `translate(${(r.width - W * k) / 2}px, ${(r.height - H * k) / 2}px) scale(${k})`;
  }
  new ResizeObserver(fit).observe(stage);

  // ---------- layout: hub in the middle, agents on an ellipse, each datapack between agent and hub, people outside ----------
  function buildGraph(g) {
    const nodesEl = $("#nodes");
    nodesEl.innerHTML = "";
    state.nodes = {};
    const orbits = $("#orbits");
    orbits.innerHTML = "";
    el("ellipse", { cx: HUB.x, cy: HUB.y, rx: 260, ry: 185 }, orbits);
    el("ellipse", { cx: HUB.x, cy: HUB.y, rx: 135, ry: 96 }, orbits);

    let i = 0;
    for (const a of g.agents) {
      const [x, y] = AGENT_POS[a.id] || [HUB.x + 300 * Math.cos(i), HUB.y + 190 * Math.sin(i)];
      const m = meta(a.id);
      const card = div("agent", `
        <div class="av">${icon(m.icon)}</div>
        <div class="meta"><b>${esc(a.label)} <span class="tot num">0</span></b>
          <span class="status">idle</span>
          <svg class="spk" viewBox="0 0 100 12" preserveAspectRatio="none"><polyline/></svg></div>`, nodesEl);
      card.style.cssText = `left:${x}px;top:${y}px;--hue:${m.hue};--d:${-i * 0.7}s`;
      card.addEventListener("click", () => select(a.id));
      state.nodes[a.id] = { ...a, x, y, el: card, hue: m.hue, up: y < HUB.y };

      const dp = g.datapacks.find((d) => d.id === a.datapack);
      if (dp) {
        const dx = HUB.x + (x - HUB.x) * DP_PULL, dy = HUB.y + (y - HUB.y) * DP_PULL;
        const chip = div(`dpk${dp.id.endsWith("canon") ? " canon" : ""}`,
          `${icon("db")}<span>${esc(shortName(dp.id))}</span><span class="n num">0</span>`, nodesEl);
        chip.style.cssText = `left:${dx}px;top:${dy}px;--hue:${m.hue}`;
        chip.title = dp.id;
        chip.addEventListener("click", () => select(dp.id));
        state.nodes[dp.id] = { ...dp, x: dx, y: dy, el: chip, hue: m.hue };
        el("line", { x1: HUB.x, y1: HUB.y, x2: dx, y2: dy }, orbits);
      }
      i++;
    }
    for (const p of g.people) {
      const [x, y] = PEOPLE_POS[p.id] || [HUB.x, 30];
      const m = meta(p.id);
      const box = div("person", `<div class="pa">${icon(m.icon)}</div><span>${esc(p.label)}</span>`, nodesEl);
      box.style.cssText = `left:${x}px;top:${y}px`;
      box.addEventListener("click", () => select(p.id));
      state.nodes[p.id] = { ...p, x, y, el: box, hue: m.hue, up: y > HUB.y, side: x < HUB.x ? "l" : "r" };
    }
    $("#hub-sub").textContent = `${g.datapacks.length} datapacks · one per agent`;
  }

  // Curve from the actor to the datapack, bowed towards the hub.
  function edgePath(a, d) {
    const mx = (a.x + d.x) / 2, my = (a.y + d.y) / 2;
    const cx = mx + (HUB.x - mx) * 0.35, cy = my + (HUB.y - my) * 0.35;
    return `M${a.x},${a.y} Q${cx},${cy} ${d.x},${d.y}`;
  }

  function visible(c) { return state.showAdmin || c.kind !== "admin"; }

  function drawEdge(c, age, animate) {
    const a = state.nodes[c.actor], d = state.nodes[c.datapack];
    if (!a || !d || !visible(c)) return;
    const dpath = edgePath(a, d);
    const path = el("path", { d: dpath, class: `edge ${c.kind}${c.ok ? "" : " err"}${animate ? " flow" : ""}` }, edgeLayer);
    const life = Math.max(0.3, EDGE_LIFE - age);
    path.style.opacity = animate ? "0.95" : String(Math.max(0.15, 1 - age / EDGE_LIFE));
    if (animate) activity(c, a, d, dpath);
    setTimeout(() => { path.classList.remove("flow"); path.style.opacity = "0"; }, Math.max(0, (life - 1.2) * 1000));
    setTimeout(() => path.remove(), life * 1000);
  }

  // A live call landing: particle along the edge (back towards the agent for a read), the actor "works" for a time
  // scaled from the call's real latency, says what it did, and the datapack and hub light up.
  function activity(c, a, d, dpath) {
    const dur = Math.min(3.5, Math.max(0.7, c.ms / 3000));
    const colour = getComputedStyle(document.documentElement).getPropertyValue(c.ok ? `--k-${c.kind}` : "--k-error").trim();
    const dot = el("circle", { r: c.kind === "promote" ? 7 : 5, class: "dot", fill: colour }, dotLayer);
    const motion = { dur: `${dur}s`, fill: "freeze", path: dpath, begin: "indefinite" };
    if (c.kind === "read") Object.assign(motion, { keyPoints: "1;0", keyTimes: "0;1", calcMode: "linear" });
    const m = el("animateMotion", motion, dot);
    if (m.beginElement) m.beginElement();
    setTimeout(() => dot.remove(), dur * 1000 + 150);

    const card = a.el;
    card.style.setProperty("--kc", kc(c));
    card.classList.add("busy");
    const status = card.querySelector(".status");
    if (status) status.textContent = `${BUSY_VERB[c.kind] || c.kind} ${shortName(c.datapack)}…`;
    clearTimeout(card._t);
    card._t = setTimeout(() => {
      card.classList.remove("busy");
      if (status) status.textContent = statusText(c);
    }, dur * 1000);
    if (!c.ok) { card.classList.remove("shake"); void card.offsetWidth; card.classList.add("shake"); }

    if (c.kind !== "admin") {
      card.querySelector(".bubble")?.remove();
      const b = div(`bubble ${a.up ? "up" : "down"} ${a.side || ""}`, `<em>${esc(c.ok ? c.kind : "error")}</em> ${esc(String(c.summary || c.tool).slice(0, 110))}`, card);
      b.style.setProperty("--kc", kc(c));
      setTimeout(() => b.remove(), 4000);
    }

    setTimeout(() => {
      d.el.style.setProperty("--kc", kc(c));
      d.el.classList.add("hit");
      if (c.kind === "promote") d.el.classList.add("burst");
      setTimeout(() => d.el.classList.remove("hit", "burst"), 1300);
      const r = div("ripple", "", $("#hub"));
      r.style.setProperty("--kc", kc(c));
      setTimeout(() => r.remove(), 1500);
    }, c.kind === "read" ? 0 : dur * 1000 * 0.85);
  }

  function statusText(c) {
    return `${VERB[c.kind] || c.kind} ${shortName(c.datapack)} · ${secs(c.ms)}${c.ok ? "" : " · failed"}`;
  }

  // ---------- derived views over the window ----------
  function windowBounds() {
    const t = T();
    if (state.windowSec) return [t - state.windowSec, t];
    const first = state.calls.length ? state.calls[0].ts : t - 60;
    return [first, t];
  }
  function windowCalls() {
    const [t0, t] = windowBounds();
    return state.calls.filter((c) => c.ts >= t0 && c.ts <= t && visible(c));
  }
  function buckets(list, n, pred) {
    const [t0, t] = windowBounds();
    const out = new Array(n).fill(0), span = Math.max(1, t - t0);
    for (const c of list) if (pred(c)) out[Math.min(n - 1, Math.floor(((c.ts - t0) / span) * n))]++;
    return out;
  }
  function sparkPoints(vals, h = 28) {
    const max = Math.max(1, ...vals), n = vals.length;
    return vals.map((v, i) => `${((i / (n - 1)) * 100).toFixed(1)},${(h - 2 - (v / max) * (h - 6)).toFixed(1)}`).join(" ");
  }

  const COUNTERS = {
    notes: (c) => c.kind === "write" || c.kind === "share",
    reads: (c) => c.kind === "read",
    promotions: (c) => c.kind === "promote",
    directives: (c) => c.kind === "share",
    approvals: (c) => c.kind === "approval",
    errors: (c) => !c.ok,
  };
  const shown = {};
  function renderCounters(list) {
    for (const [name, pred] of Object.entries(COUNTERS)) {
      const box = document.querySelector(`.ctr[data-k=${name}]`);
      const v = list.filter(pred).length;
      countTo(box.querySelector("b"), name, v);
      box.querySelector("polyline").setAttribute("points", sparkPoints(buckets(list, 24, pred)));
      if (name === "errors") box.classList.toggle("has", v > 0);
    }
  }
  function countTo(b, name, v) {
    const from = shown[name];
    shown[name] = v;
    if (from === undefined || from === v) { b.textContent = v; return; }
    const box = b.closest(".ctr");
    box.classList.add("bump");
    setTimeout(() => box.classList.remove("bump"), 500);
    const t0 = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - t0) / 450);
      b.textContent = Math.round(from + (v - from) * (1 - Math.pow(1 - p, 3)));
      if (p < 1 && shown[name] === v) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function rowHtml(c) {
    const a = meta(c.actor);
    const av = a.kind === "agent"
      ? `<span class="fa" style="background:${a.hue}">${icon(a.icon)}</span>`
      : `<span class="fa ppl">${icon(a.icon)}</span>`;
    const tag = c.scripted ? '<span class="tag">SCRIPTED</span>' : "";
    const err = c.ok ? "" : '<span class="tag e">ERROR</span>';
    return `${av}<div>
      <div class="l1"><span class="who">${esc(a.label)}</span><span class="to">→ ${esc(shortName(c.datapack))}</span>
        <span class="kp">${esc(c.kind)}</span>${tag}${err}<time>${fmt(c.ts)}</time></div>
      <div class="l2">${esc(c.summary)}${c.ok ? "" : ` (${esc(c.error)})`}</div>
      <div class="l3">${esc(c.tool)} · ${secs(c.ms)}</div></div>`;
  }
  const liOf = (c, fresh) => `<li class="${c.ok ? "" : "bad"}${fresh ? " new" : ""}" style="--kc:${kc(c)}">${rowHtml(c)}</li>`;

  let streamSig = "", streamTop = Infinity;
  function renderStream(list) {
    const rows = list.slice(-STREAM_MAX).reverse();   // newest first
    const sig = `${list.length}:${rows[0]?.id ?? ""}`;
    $("#stream-n").textContent = `${list.length} calls`;
    if (sig === streamSig) return;                    // don't redraw an unchanged feed
    streamSig = sig;
    // only rows that arrived since the last draw slide in
    $("#stream").innerHTML = rows.length ? rows.map((c) => liOf(c, c.id > streamTop)).join("") : '<li class="empty">No Meko calls in this window.</li>';
    streamTop = rows.length ? Math.max(...rows.map((c) => c.id)) : streamTop;
  }

  function renderNodes(list) {
    const perDp = {}, perActor = {}, last = {};
    for (const c of list) {
      perDp[c.datapack] = (perDp[c.datapack] || 0) + 1;
      perActor[c.actor] = (perActor[c.actor] || 0) + 1;
      last[c.actor] = c;
    }
    for (const n of Object.values(state.nodes)) {
      if (n.type === "datapack") { n.el.querySelector(".n").textContent = perDp[n.id] || 0; continue; }
      if (n.type !== "agent") continue;
      n.el.querySelector(".tot").textContent = perActor[n.id] || 0;
      n.el.classList.toggle("quiet", !perActor[n.id]);
      if (!n.el.classList.contains("busy")) {
        n.el.querySelector(".status").textContent = last[n.id] ? statusText(last[n.id]) : "idle · waiting for a case";
      }
      n.el.querySelector(".spk polyline").setAttribute("points",
        sparkPoints(buckets(list, 20, (c) => c.actor === n.id), 12));
    }
  }

  let panelSig = "";
  function renderPanel() {
    const id = state.selected, p = $("#panel");
    for (const [k, n] of Object.entries(state.nodes)) n.el.classList.toggle("sel", k === id);
    if (!id) { p.hidden = true; panelSig = ""; return; }
    const n = state.nodes[id];
    const mine = windowCalls().filter((c) => (n.type === "datapack" ? c.datapack === id : c.actor === id)).slice(-20).reverse();
    const sig = `${id}:${mine.length}:${mine[0]?.id ?? ""}`;
    p.hidden = false;
    if (sig === panelSig) return;
    panelSig = sig;
    const m = n.type === "datapack" ? { icon: "db", hue: n.hue, job: "Meko datapack" } : meta(id);
    $("#panel-av").innerHTML = icon(m.icon);
    $("#panel-av").style.background = m.kind === "person" ? "#64748b" : m.hue;
    $("#panel-title").textContent = n.type === "datapack" ? n.id : n.label;
    $("#panel-sub").textContent = n.type === "agent" ? `${m.job || ""} · datapack ${n.datapack}`
      : n.type === "datapack" ? "Every call into this datapack, newest first" : "Person · decisions written to Meko";
    $("#panel-list").innerHTML = mine.length ? mine.map((c) => liOf(c, false)).join("") : '<li class="empty">No calls in this window.</li>';
  }

  function select(id) { state.selected = state.selected === id ? null : id; renderPanel(); }

  // Timeline: calls across the whole recorded range, stacked by kind; the shaded part is the current window.
  function renderHist() {
    const h = $("#hist");
    const [a, b] = range();
    const n = 120, span = Math.max(1, b - a);
    const bins = Array.from({ length: n }, () => ({}));
    for (const c of state.calls) {
      if (!visible(c)) continue;
      const i = Math.min(n - 1, Math.max(0, Math.floor(((c.ts - a) / span) * n)));
      const k = c.ok ? c.kind : "error";
      bins[i][k] = (bins[i][k] || 0) + 1;
    }
    const max = Math.max(1, ...bins.map((o) => Object.values(o).reduce((x, y) => x + y, 0)));
    const bw = 1000 / n;
    let out = "";
    const [w0, w1] = windowBounds();
    const x0 = ((w0 - a) / span) * 1000, x1 = ((w1 - a) / span) * 1000;
    out += `<rect x="${Math.max(0, x0)}" y="0" width="${Math.max(2, x1 - Math.max(0, x0))}" height="40" fill="#eef2ff"/>`;
    bins.forEach((o, i) => {
      let y = 40;
      for (const k of [...KINDS, "error"]) {
        if (!o[k]) continue;
        const hgt = (o[k] / max) * 34;
        y -= hgt;
        out += `<rect x="${(i * bw + 0.6).toFixed(1)}" y="${y.toFixed(1)}" width="${(bw - 1.2).toFixed(1)}" height="${hgt.toFixed(1)}" rx="1" fill="var(--k-${k})"/>`;
      }
    });
    out += `<line class="head" x1="${x1}" x2="${x1}" y1="0" y2="40"/>`;
    h.innerHTML = out;
    $("#t-start").textContent = fmt(a);
    $("#t-end").textContent = state.replayT == null ? "now" : fmt(b);
  }

  function renderAll() {
    const list = windowCalls();
    renderCounters(list);
    renderStream(list);
    renderNodes(list);
    renderPanel();
    renderHist();
    $("#clock").textContent = fmt(T());
  }

  // Redraw the edges that belong to the instant T (replay) so the graph matches the slider.
  function redrawEdgesAt(t) {
    edgeLayer.innerHTML = "";
    for (const c of state.calls) {
      const age = t - c.ts;
      if (age >= 0 && age < EDGE_LIFE) drawEdge(c, age, false);
    }
  }

  // ---------- data ----------
  function addCall(c, live) {
    if (state.seen.has(c.id)) return;
    state.seen.add(c.id);
    state.calls.push(c);
    state.calls.sort((a, b) => a.ts - b.ts || a.id - b.id);
    if (live && state.replayT == null) {
      drawEdge(c, 0, true);
      renderAll();
    } else {
      updateSlider();
    }
  }

  async function init() {
    $("#logo").innerHTML = icon("network");
    fit();
    const g = await (await fetch("/api/graph")).json();
    buildGraph(g);
    const hist = await (await fetch("/api/calls?since=0")).json();
    hist.forEach((c) => addCall(c, false));
    const es = new EventSource("/api/events");
    es.addEventListener("call", (e) => addCall(JSON.parse(e.data), true));
    renderAll();
    updateSlider();
    health(); setInterval(health, 4000);
    setInterval(tick, 1000);
  }

  async function health() {
    const b = $("#meko-badge");
    try {
      const h = await (await fetch("/api/health")).json();
      b.textContent = h.meko_enabled ? "MEKO ON" : "MEKO OFF";
      b.className = "meko " + (h.meko_enabled ? "on" : "off");
      b.title = h.meko_error || `model ${h.llm_model}`;
      document.body.classList.toggle("meko-off", !h.meko_enabled);
      $("#off-note").hidden = h.meko_enabled;
    } catch {
      b.textContent = "SERVER DOWN"; b.className = "meko off";
    }
  }

  // ---------- time controls ----------
  const slider = $("#slider");
  function range() {
    const first = state.calls.length ? state.calls[0].ts : now() - 60;
    return [first, Math.max(now(), first + 1)];
  }
  function updateSlider() {
    if (state.replayT != null) return;
    slider.value = 1000;
  }
  function tick() {
    if (state.replayT == null) renderAll();   // window slides with the clock
  }

  slider.addEventListener("input", () => {
    const [a, b] = range();
    const v = +slider.value;
    if (v >= 1000) return goLive();
    state.replayT = a + (b - a) * (v / 1000);
    $("#live").classList.remove("on");
    renderAll();
    redrawEdgesAt(state.replayT);
  });
  function goLive() {
    state.replayT = null; state.playing = false;
    $("#play").classList.remove("on"); $("#play").innerHTML = "&#9654;";
    $("#live").classList.add("on");
    slider.value = 1000;
    edgeLayer.innerHTML = "";
    renderAll();
  }
  $("#live").addEventListener("click", goLive);

  $("#play").addEventListener("click", () => {
    state.playing = !state.playing;
    $("#play").classList.toggle("on", state.playing);
    $("#play").innerHTML = state.playing ? "&#10074;&#10074;" : "&#9654;";
    if (state.playing) {
      if (state.replayT == null) {
        const [a] = range();
        state.replayT = a;
      }
      $("#live").classList.remove("on");
      last = performance.now();
      requestAnimationFrame(playLoop);
    }
  });
  let last = 0;
  function playLoop(ts) {
    if (!state.playing) return;
    const dt = (ts - last) / 1000; last = ts;
    const [a, b] = range();
    state.replayT += dt * PLAY_SPEED;
    if (state.replayT >= b) return goLive();
    slider.value = Math.round(((state.replayT - a) / (b - a)) * 1000);
    renderAll();
    redrawEdgesAt(state.replayT);
    requestAnimationFrame(playLoop);
  }

  $("#window-seg").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    state.windowSec = +b.dataset.w;
    document.querySelectorAll("#window-seg button").forEach((x) => x.classList.toggle("on", x === b));
    renderAll();
  });
  $("#show-admin").addEventListener("change", (e) => { state.showAdmin = e.target.checked; streamSig = ""; renderAll(); });
  $("#panel-close").addEventListener("click", () => { state.selected = null; renderPanel(); });

  init();
})();
