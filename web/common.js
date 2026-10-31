// Shared helpers for the role screens. Talks only to the Incident API (never to Meko), so polling here
// never shows up in the swarm view.

const ROLE_DEPT = { caretaker: "hostel", warden: "hostel", mess_committee: "mess", it_cell: "it" };
const ROLE_LABEL = {
  student: "Student", caretaker: "Caretaker", warden: "Warden", mess_committee: "Mess committee",
  it_cell: "IT cell", electricity: "Electricity", dean: "Dean",
};
const APPROVER = { hostel: "warden", mess: "mess_committee", it: "it_cell" };
const STATUS_LABEL = {
  reported: "reported", assigned: "plan proposed", in_progress: "being fixed", fixed: "marked fixed",
  verified: "verified", lesson_pending: "lesson pending", closed: "closed",
};
const POLL_MS = 2000;

// Inline stroke icons (24×24), so pages work without an icon font or CDN.
const ICONS = {
  inbox: "M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z",
  building: "M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M15 9h.01M9 13h.01M15 13h.01M10 21v-4h4v4",
  bowl: "M3 11h18M4 11a8 8 0 0 0 16 0M8 7c0-1 1-1.5 1-2.5S8 3 8 3M12 7c0-1 1-1.5 1-2.5S12 3 12 3M16 7c0-1 1-1.5 1-2.5S16 3 16 3",
  wifi: "M5 12.55a11 11 0 0 1 14.08 0M1.42 9a16 16 0 0 1 21.16 0M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01",
  sparkles: "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z",
  cap: "M22 10L12 5 2 10l10 5 10-5zM6 12v5c3 3 9 3 12 0v-5",
  user: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  wrench: "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  clipboard: "M9 2h6v4H9zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 12h6M9 16h4",
  monitor: "M3 4h18v12H3zM8 20h8M12 16v4",
  zap: "M13 2L3 14h9l-1 8 10-12h-9l1-8z",
  network: "M12 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM5 16a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19 16a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 8v4M12 12l-5 4M12 12l5 4",
  db: "M12 3c4.97 0 9 1.34 9 3s-4.03 3-9 3-9-1.34-9-3 4.03-3 9-3zM3 6v12c0 1.66 4 3 9 3s9-1.34 9-3V6M3 12c0 1.66 4 3 9 3s9-1.34 9-3",
  clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2",
  bot: "M12 8V4H8M4 8h16v12H4zM2 14h2M20 14h2M9 13v2M15 13v2",
  home: "M3 10l9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM9 22V12h6v10",
};
function icon(name, cls = "ic") {
  return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[name] || ICONS.bot}"/></svg>`;
}

// Who is who: agents and people, with a hue and an icon. Shared with the swarm view.
const ACTORS = {
  desk: { label: "Desk", icon: "inbox", hue: "#6366f1", kind: "agent", job: "Front door: classifies, merges duplicates, replies with status and ETA" },
  hostel: { label: "Hostel", icon: "building", hue: "#14b8a6", kind: "agent", job: "Recalls past fixes and verified lessons, plans the repair" },
  mess: { label: "Mess", icon: "bowl", hue: "#ec4899", kind: "agent", job: "Clusters food complaints, escalates safety to the committee" },
  it: { label: "IT", icon: "wifi", hue: "#06b6d4", kind: "agent", job: "Network outages: many reports, one incident" },
  curator: { label: "Curator", icon: "sparkles", hue: "#d97706", kind: "agent", job: "Turns a fix students confirmed into a lesson, promotes it to canon" },
  dean: { label: "Dean", icon: "cap", hue: "#475569", kind: "agent", job: "Reads only verified canon, reports patterns" },
  student: { label: "Student", icon: "user", hue: "#64748b", kind: "person" },
  caretaker: { label: "Caretaker", icon: "wrench", hue: "#64748b", kind: "person" },
  warden: { label: "Warden", icon: "shield", hue: "#64748b", kind: "person" },
  mess_committee: { label: "Mess committee", icon: "clipboard", hue: "#64748b", kind: "person" },
  it_cell: { label: "IT cell", icon: "monitor", hue: "#64748b", kind: "person" },
  electricity: { label: "Electricity", icon: "zap", hue: "#64748b", kind: "person" },
  system: { label: "System", icon: "bot", hue: "#94a3b8", kind: "person" },
};
// datapack name -> owning agent (sunwai-canon belongs to the Curator)
function datapackAgent(dp) {
  const s = String(dp || "").replace(/^.*?(desk|hostel|mess|it|canon|dean)$/, "$1");
  return s === "canon" ? "curator" : s;
}
function dpChip(dp) {
  const a = ACTORS[datapackAgent(dp)];
  return `<span class="dp" style="${a ? `color:${a.hue}` : ""}">${icon("db")}${esc(dp)}</span>`;
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function hhmm(iso) {
  if (!iso) return "";
  const d = new Date(typeof iso === "number" ? iso * 1000 : iso);
  return isNaN(d) ? String(iso).slice(11, 16) : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

async function api(path, body) {
  const opts = body === undefined ? {} : {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  };
  try {
    const r = await fetch(path, opts);
    const text = await r.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!r.ok) {
      const detail = data && typeof data === "object" ? data.detail : data;
      return { ok: false, status: r.status, error: typeof detail === "string" ? detail : JSON.stringify(detail) };
    }
    return { ok: true, status: r.status, data };
  } catch (e) {
    return { ok: false, status: 0, error: "server unreachable" };
  }
}

// Top bar with role links and the MEKO ON / OFF badge from /api/health
function header(active) {
  const links = [
    ["student.html", "student", "Student", "user"],
    ["staff.html?role=caretaker", "caretaker", "Caretaker", "wrench"],
    ["staff.html?role=warden", "warden", "Warden", "shield"],
    ["staff.html?role=mess_committee", "mess_committee", "Mess", "clipboard"],
    ["staff.html?role=it_cell", "it_cell", "IT cell", "monitor"],
    ["staff.html?role=electricity", "electricity", "Electricity", "zap"],
    ["staff.html?role=dean", "dean", "Dean", "cap"],
    ["swarm.html", "swarm", "Swarm view", "network"],
  ];
  const bar = document.createElement("header");
  bar.className = "bar";
  bar.innerHTML = `
    <a class="brand" href="index.html"><span class="logo">${icon("network")}</span>
      <span><b>Sunwai</b><small>heard and remembered</small></span></a>
    <nav>${links.map(([href, id, label, ic]) => `<a href="${href}" class="${id === active ? "on" : ""}">${icon(ic)}${label}</a>`).join("")}</nav>
    <span class="spacer"></span>
    <span class="meko" id="meko-badge" title="Is Meko memory switched on?">MEKO …</span>`;
  document.body.prepend(bar);
  const badge = bar.querySelector("#meko-badge");
  const tick = async () => {
    const h = await api("/api/health");
    if (!h.ok) { badge.className = "meko off"; badge.textContent = "SERVER DOWN"; return; }
    badge.className = "meko " + (h.data.meko_enabled ? "on" : "off");
    badge.textContent = h.data.meko_enabled ? "MEKO ON" : "MEKO OFF";
    badge.title = h.data.meko_error || `model ${h.data.llm_model}`;
  };
  tick();
  setInterval(tick, 5000);
}

function statusChip(s) {
  return `<span class="chip st-${esc(s)}">${esc(STATUS_LABEL[s] || s)}</span>`;
}

// reported → plan → fixing → fixed → verified → lesson
const STEPS = [["reported", "Reported"], ["assigned", "Plan"], ["in_progress", "Fixing"], ["fixed", "Fixed"], ["verified", "Verified"], ["lesson_pending", "Lesson"]];
function stepper(status) {
  const at = status === "closed" ? STEPS.length : Math.max(0, STEPS.findIndex(([s]) => s === status));
  return `<div class="stepper">${STEPS.map(([, label], i) => {
    const cls = i < at ? "done" : i === at ? "now" : "";
    return `${i ? `<span class="bar-l ${i <= at ? "done" : ""}"></span>` : ""}<span class="s ${cls}"><i></i><span>${label}</span></span>`;
  }).join("")}</div>`;
}

function scriptedChip(on) {
  return on ? `<span class="chip scripted" title="Simulated person or seeded data (D-013); Meko was still called live">SCRIPTED</span>` : "";
}

function isScripted(inc) {
  return (inc.timeline || []).some(t => t.scripted);
}

// Context cards: exactly what Meko returned, each with its datapack and memory id (D-011)
function contextCards(inc) {
  const cards = inc.context || [];
  const title = `<div class="ctx-title">${icon("db")}Recalled from Meko (${cards.length})</div>`;
  if (!cards.length) return `${title}<div class="note">No context from Meko for this incident.</div>`;
  return `${title}<div class="cards">${cards.map(c => `
    <div class="card ${c.text.startsWith("LESSON") ? "lesson" : ""}">
      <span class="src">${dpChip(c.datapack)}${c.source === "memory" ? "" : `<span>${esc(c.source.replace("_", " "))}</span>`}<span>memory ${esc(c.memory_id)}</span></span>
      ${esc(c.text)}
    </div>`).join("")}</div>`;
}

function lessonBox(inc) {
  const l = inc.lesson;
  if (!l) return "";
  const what = { draft: "Draft lesson, waiting for approval", promoted: "Promoted to campus canon", rejected: "Lesson rejected", unsaved: "Approved, but Meko was off: not saved" }[l.status] || l.status;
  return `<div class="lessonbox ${l.status === "promoted" ? "promoted" : ""}">
    <b>${esc(what)}</b>${l.memory_id ? ` <span class="mono muted">memory ${esc(l.memory_id)}</span>` : ""}
    <div>${esc(l.text)}</div></div>`;
}

function timeline(inc, open) {
  const items = (inc.timeline || []).slice().reverse();
  return `<details class="tl" ${open ? "open" : ""}><summary>Timeline (${items.length})</summary><ol>${items.map(t => `
    <li><time>${esc(hhmm(t.ts))}</time><span class="who">${esc(t.actor)}</span><span>${esc(t.text)} ${scriptedChip(t.scripted)}</span></li>`).join("")}
  </ol></details>`;
}

function etaLine(inc) {
  if (!inc.eta) return "";
  return `<div class="why"><span class="eta">${icon("clock")}ETA ${esc(hhmm(inc.eta))}</span><span>because ${esc(inc.eta_reason)}</span></div>`;
}

// Re-render a list of incident cards without wiping what someone is typing: a card is redrawn only when its
// data changed, and never while one of its inputs has focus. Typed text survives redraws via `drafts`.
function keyedRender(container, incidents, renderCard, emptyText) {
  const seen = new Set();
  if (!incidents.length) {
    container.innerHTML = `<div class="empty">${esc(emptyText)}</div>`;
    return;
  }
  container.querySelector(".empty")?.remove();
  let prev = null;
  for (const inc of incidents) {
    seen.add(inc.id);
    let el = container.querySelector(`[data-inc="${inc.id}"]`);
    const sig = JSON.stringify(inc);
    if (!el) {
      el = document.createElement("article");
      el.className = "inc";
      el.dataset.inc = inc.id;
    }
    const busy = el.contains(document.activeElement) && document.activeElement.matches("input, textarea, select");
    if (el.dataset.sig !== sig && !busy) {
      const openTl = el.querySelector("details.tl")?.open;
      el.innerHTML = renderCard(inc, openTl);
      el.dataset.sig = sig;
      el.querySelectorAll("[data-draft]").forEach(i => {
        i.value = drafts[i.dataset.draft] || "";
        i.addEventListener("input", () => { drafts[i.dataset.draft] = i.value; });
      });
    }
    const want = prev ? prev.nextSibling : container.firstChild;
    if (el !== want) container.insertBefore(el, want);
    prev = el;
  }
  container.querySelectorAll("[data-inc]").forEach(el => { if (!seen.has(el.dataset.inc)) el.remove(); });
}
const drafts = {};

function startPolling(fn) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try { await fn(); } finally { running = false; }
  };
  run();
  setInterval(run, POLL_MS);
  return run;
}
