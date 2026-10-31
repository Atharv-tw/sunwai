// Swarm view. Every edge, counter and stream row comes from a logged Meko call (/api/calls, /api/events).
// Nothing here invents a call. Contract: TASKS.md "Swarm API".
(() => {
  const NS = "http://www.w3.org/2000/svg";
  const EDGE_LIFE = 6;        // seconds an edge stays visible
  const STREAM_MAX = 150;     // rows drawn in the message stream
  const PLAY_SPEED = 30;      // replay seconds of history per real second
  const LAYOUT_PEOPLE = ["student", "caretaker", "mess_committee", "it_cell", "warden", "electricity"];

  const $ = (s) => document.querySelector(s);
  const svg = $("#graph");

  const state = {
    calls: [],              // all calls, oldest first
    seen: new Set(),        // call ids already stored
    nodes: {},              // id -> {id,label,type,x,y,r,w,h,datapack}
    windowSec: 300,         // 0 = all
    replayT: null,          // null = live, else unix seconds
    playing: false,
    showAdmin: false,
    selected: null,
  };

  const kindLabel = { write: "write", read: "read", promote: "promote", share: "share", approval: "approval", admin: "admin" };
  const shortName = (id) => id.replace(/^sunwai-/, "");
  const fmt = (ts) => new Date(ts * 1000).toTimeString().slice(0, 8);
  const now = () => Date.now() / 1000;
  const T = () => (state.replayT == null ? now() : state.replayT);
  const el = (tag, attrs = {}, parent) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (parent) parent.appendChild(e);
    return e;
  };

  // ---------- graph layout: agents (left) -> their datapack block -> people (right) ----------
  let edgeLayer;
  const nodeEls = {};

  function buildGraph(g) {
    svg.innerHTML = "";
    state.nodes = {};
    const rowY = (i, n) => 70 + i * ((540 - 100) / (n - 1));
    const people = [...g.people].sort((a, b) => {
      const ia = LAYOUT_PEOPLE.indexOf(a.id), ib = LAYOUT_PEOPLE.indexOf(b.id);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    const AX = 110, DX = 330, PX = 800;
    for (const [x, t] of [[AX, "agents"], [DX, "datapacks (Meko)"], [PX, "people"]]) {
      const tt = el("text", { x, y: 24, class: "col-title" }, svg);
      tt.textContent = t;
    }
    edgeLayer = el("g", { id: "edges" }, svg);

    g.agents.forEach((a, i) => {
      const y = rowY(i, g.agents.length);
      state.nodes[a.id] = { ...a, x: AX, y, r: 30 };
      const dp = g.datapacks.find((d) => d.id === a.datapack);
      if (dp) state.nodes[dp.id] = { ...dp, x: DX, y, w: 130, h: 46 };
    });
    people.forEach((p, i) => {
      state.nodes[p.id] = { ...p, x: PX, y: rowY(i, people.length), r: 30 };
    });

    for (const n of Object.values(state.nodes)) drawNode(n);
  }

  function drawNode(n) {
    const kind = n.type === "datapack" ? "dp" : n.type;
    const g = el("g", { class: `node ${kind}${n.id.endsWith("canon") ? " canon" : ""}`, transform: `translate(${n.x},${n.y})` }, svg);
    if (n.type === "datapack") {
      el("rect", { class: "shape", x: -n.w / 2, y: -n.h / 2, width: n.w, height: n.h, rx: 8 }, g);
      const t = el("text", { y: -3 }, g); t.textContent = n.label;
      const c = el("text", { y: 13, class: "cnt" }, g); c.textContent = "0 calls";
      n.cntEl = c;
    } else {
      el("circle", { class: "shape", r: n.r }, g);
      const t = el("text", { y: 4 }, g); t.textContent = n.label;
    }
    g.addEventListener("click", () => select(n.id));
    nodeEls[n.id] = g;
  }

  // Edge from actor to datapack. Agents leave from their right side, people from their left.
  function edgePath(a, d) {
    const x1 = a.type === "agent" ? a.x + a.r : a.x - a.r;
    const x2 = a.type === "agent" ? d.x - d.w / 2 : d.x + d.w / 2;
    const dx = (x2 - x1) / 2;
    return `M${x1},${a.y} C${x1 + dx},${a.y} ${x2 - dx},${d.y} ${x2},${d.y}`;
  }

  function visible(c) { return state.showAdmin || c.kind !== "admin"; }

  function drawEdge(c, age, animate) {
    const a = state.nodes[c.actor], d = state.nodes[c.datapack];
    if (!a || !d || !visible(c)) return;
    const path = el("path", { d: edgePath(a, d), class: `edge ${c.kind}${c.ok ? "" : " err"}`, "data-id": c.id }, edgeLayer);
    const life = Math.max(0.3, EDGE_LIFE - age);
    path.style.opacity = animate ? "1" : String(Math.max(0.15, 1 - age / EDGE_LIFE));
    if (animate) {
      const dot = el("circle", { r: c.kind === "promote" ? 6 : 4, class: "dot" }, edgeLayer);
      const m = el("animateMotion", { dur: "0.9s", fill: "freeze", path: path.getAttribute("d") }, dot);
      m.beginElement && m.beginElement();
      setTimeout(() => dot.remove(), 1000);
      pulse(a.id); setTimeout(() => pulse(d.id), 700);
    }
    setTimeout(() => (path.style.opacity = "0"), Math.max(0, (life - 1.2) * 1000));
    setTimeout(() => path.remove(), life * 1000);
  }

  function pulse(id) {
    const g = nodeEls[id]; if (!g) return;
    g.classList.add("pulse");
    setTimeout(() => g.classList.remove("pulse"), 450);
  }

  // ---------- derived views over the window ----------
  function windowCalls() {
    const t = T();
    const t0 = state.windowSec ? t - state.windowSec : 0;
    return state.calls.filter((c) => c.ts >= t0 && c.ts <= t && visible(c));
  }

  const lastCounts = {};
  function renderCounters(list) {
    const k = { notes: 0, reads: 0, promotions: 0, directives: 0, approvals: 0, errors: 0 };
    for (const c of list) {
      if (c.kind === "write" || c.kind === "share") k.notes++;
      if (c.kind === "read") k.reads++;
      if (c.kind === "promote") k.promotions++;
      if (c.kind === "share") k.directives++;
      if (c.kind === "approval") k.approvals++;
      if (!c.ok) k.errors++;
    }
    for (const [name, v] of Object.entries(k)) {
      const box = document.querySelector(`.ctr[data-k=${name}]`);
      box.querySelector("b").textContent = v;
      if (lastCounts[name] !== undefined && lastCounts[name] !== v) {
        box.classList.add("bump");
        setTimeout(() => box.classList.remove("bump"), 400);
      }
      lastCounts[name] = v;
    }
  }

  function rowHtml(c) {
    const who = `<span class="who">${esc(c.actor)} &rarr; ${esc(shortName(c.datapack))}</span>`;
    const tag = c.scripted ? '<span class="tag">SCRIPTED</span>' : "";
    const err = c.ok ? "" : ` <span class="tag" style="background:#5a1c24;color:#ffb4b4">ERROR</span>`;
    const sum = esc(c.summary) + (c.ok ? "" : ` (${esc(c.error)})`);
    return `<small>${fmt(c.ts)}</small>${who}${tag}${err}<span class="sum">${esc(c.tool)}: ${sum}</span>`;
  }
  function esc(s) {
    return String(s ?? "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
  }
  function liClass(c) { return `k-${c.kind}${c.ok ? "" : " bad"}`; }

  function renderStream(list) {
    const rows = list.slice(-STREAM_MAX).reverse();   // newest first
    $("#stream").innerHTML = rows.map((c) => `<li class="${liClass(c)}">${rowHtml(c)}</li>`).join("");
    $("#stream-n").textContent = `(${list.length})`;
  }

  function renderDatapackCounts(list) {
    const per = {};
    for (const c of list) per[c.datapack] = (per[c.datapack] || 0) + 1;
    for (const n of Object.values(state.nodes))
      if (n.cntEl) n.cntEl.textContent = `${per[n.id] || 0} calls`;
  }

  function renderPanel() {
    const id = state.selected, p = $("#panel");
    for (const [k, g] of Object.entries(nodeEls)) g.classList.toggle("sel", k === id);
    if (!id) { p.hidden = true; return; }
    const n = state.nodes[id];
    const mine = windowCalls().filter((c) => (n.type === "datapack" ? c.datapack === id : c.actor === id)).slice(-25).reverse();
    p.hidden = false;
    $("#panel-title").textContent = `${n.label} (${n.type}): recent calls`;
    $("#panel-list").innerHTML = mine.length
      ? mine.map((c) => `<li class="${liClass(c)}">${rowHtml(c)}</li>`).join("")
      : '<li style="color:var(--muted)">No calls in this window.</li>';
  }

  function select(id) { state.selected = state.selected === id ? null : id; renderPanel(); }

  function renderAll() {
    const list = windowCalls();
    renderCounters(list);
    renderStream(list);
    renderDatapackCounts(list);
    renderPanel();
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
      b.className = "badge " + (h.meko_enabled ? "on" : "off");
    } catch {
      b.textContent = "MEKO ?"; b.className = "badge unknown";
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
    $("#play").classList.remove("on"); $("#live").classList.add("on");
    slider.value = 1000;
    edgeLayer.innerHTML = "";
    renderAll();
  }
  $("#live").addEventListener("click", goLive);

  $("#play").addEventListener("click", () => {
    state.playing = !state.playing;
    $("#play").classList.toggle("on", state.playing);
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
  $("#show-admin").addEventListener("change", (e) => { state.showAdmin = e.target.checked; renderAll(); });
  $("#panel-close").addEventListener("click", () => { state.selected = null; renderPanel(); });

  init();
})();
