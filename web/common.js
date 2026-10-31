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
    ["student.html", "student", "Student"],
    ["staff.html?role=caretaker", "caretaker", "Caretaker"],
    ["staff.html?role=warden", "warden", "Warden"],
    ["staff.html?role=mess_committee", "mess_committee", "Mess"],
    ["staff.html?role=it_cell", "it_cell", "IT cell"],
    ["staff.html?role=electricity", "electricity", "Electricity"],
    ["staff.html?role=dean", "dean", "Dean"],
    ["swarm.html", "swarm", "Swarm view"],
  ];
  const bar = document.createElement("header");
  bar.className = "bar";
  bar.innerHTML = `
    <a class="brand" href="index.html">Sunwai<small>campus grievances, heard and remembered</small></a>
    <nav>${links.map(([href, id, label]) => `<a href="${href}" class="${id === active ? "on" : ""}">${label}</a>`).join("")}</nav>
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

function scriptedChip(on) {
  return on ? `<span class="chip scripted" title="Simulated person or seeded data (D-013); Meko was still called live">SCRIPTED</span>` : "";
}

function isScripted(inc) {
  return (inc.timeline || []).some(t => t.scripted);
}

// Context cards: exactly what Meko returned, each with its datapack and memory id (D-011)
function contextCards(inc) {
  const cards = inc.context || [];
  if (!cards.length) return `<div class="note">No context from Meko for this incident.</div>`;
  return `<div class="cards">${cards.map(c => `
    <div class="card ${c.text.startsWith("LESSON") ? "lesson" : ""}">
      <span class="src">${esc(c.datapack)}${c.source === "memory" ? "" : " · " + esc(c.source.replace("_", " "))} · memory id ${esc(c.memory_id)}</span>
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
  return `<div class="why"><b>ETA ${esc(hhmm(inc.eta))}</b> <span class="muted">because ${esc(inc.eta_reason)}</span></div>`;
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
