// Staff screens: department queues (caretaker, warden, mess committee, IT cell), electricity, dean.
const role = new URLSearchParams(location.search).get("role") || "caretaker";
const main = document.getElementById("main");
header(role);
document.title = `Sunwai · ${ROLE_LABEL[role] || role}`;

const OPEN = ["reported", "assigned", "in_progress"];
const DEPT_LABEL = { hostel: "Hostel", mess: "Mess", it: "IT", desk: "Desk" };

if (ROLE_DEPT[role]) queueView(ROLE_DEPT[role]);
else if (role === "electricity") electricityView();
else if (role === "dean") deanView();
else main.innerHTML = `<div class="panel">Unknown role ${esc(role)}. <a href="index.html">Pick a role</a>.</div>`;

// --- department queue ---------------------------------------------------------

function queueView(dept) {
  const approver = APPROVER[dept];
  main.innerHTML = `
    <div class="row" style="margin-bottom:12px">
      <h1>${DEPT_LABEL[dept]} queue</h1>
      <span class="muted">you are the ${esc(ROLE_LABEL[role])}</span>
      <span class="spacer" style="flex:1"></span>
      <label class="row small" style="margin:0"><input type="checkbox" id="all" style="width:auto"> show closed</label>
    </div>
    <p class="note" style="margin-top:-4px">Plans and ETAs come from what the ${DEPT_LABEL[dept]} agent recalled from Meko.
      Each context card shows the datapack and memory id it came from.</p>
    <div id="list"></div>`;
  const list = document.getElementById("list");
  const all = document.getElementById("all");
  all.onchange = () => refresh();

  function actions(inc) {
    const err = `<div class="err" data-err></div>`;
    if (inc.working) return "";
    if (inc.status === "assigned") {
      return `<div class="acts"><button class="primary" data-act="approve_plan">Approve plan</button>
        <input data-draft="plan-${esc(inc.id)}" placeholder="Note for the record (optional)">${err}</div>`;
    }
    if (inc.status === "in_progress") {
      return `<div class="acts">
        <input data-draft="fix-${esc(inc.id)}" placeholder="What fixed it? Add the time it took, e.g. (40 min)">
        <button class="primary" data-act="record_fix">Record fix</button>${err}</div>`;
    }
    if (inc.status === "fixed") {
      return `<div class="acts muted small">Waiting for the students who reported it to confirm the fix held.</div>`;
    }
    if (inc.status === "lesson_pending") {
      if (role !== approver) {
        return `<div class="acts muted small">Waiting for the ${esc(ROLE_LABEL[approver])} to approve the lesson.</div>`;
      }
      return `<div class="acts">
        <button class="good" data-act="approve_lesson">Approve lesson → campus canon</button>
        <input data-draft="reject-${esc(inc.id)}" placeholder="Why reject? (optional)">
        <button class="bad" data-act="reject_lesson">Reject</button>${err}</div>`;
    }
    return "";
  }

  function card(inc, openTl) {
    const mineNow = inc.awaiting === role || (inc.awaiting === "caretaker" && role === "warden");
    return `
      <div class="head">
        <span class="id">${esc(inc.id)}</span>
        ${statusChip(inc.status)}
        <span class="summary">${esc(inc.summary)}</span>
        ${inc.safety_risk ? `<span class="chip risk">safety</span>` : ""}
        ${inc.reporters > 1 ? `<span class="chip">${inc.reporters} reports merged</span>` : ""}
        ${scriptedChip(isScripted(inc))}
        ${mineNow ? `<span class="chip st-assigned">needs you</span>` : ""}
      </div>
      <div class="body">
        <div class="facts">
          <span><b>${esc(inc.place)}</b></span>
          <span>${esc(inc.asset || inc.category)}</span>
          <span>severity <b>${esc(inc.severity)}</b></span>
          ${inc.confirmations && (inc.confirmations.held || inc.confirmations.broken)
            ? `<span>held <b>${inc.confirmations.held}</b> · still broken <b>${inc.confirmations.broken}</b></span>` : ""}
        </div>
        ${inc.working ? `<div class="working">${esc(inc.working)}</div>` : ""}
        ${inc.plan ? `<div class="plan"><span class="muted small">Agent's plan</span><br>${esc(inc.plan)}</div>` : ""}
        ${etaLine(inc)}
        ${inc.status === "reported" ? "" : contextCards(inc)}
        ${lessonBox(inc)}
        ${timeline(inc, openTl)}
      </div>
      ${actions(inc)}`;
  }

  list.addEventListener("click", async e => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    const el = btn.closest("[data-inc]");
    const id = el.dataset.inc;
    const input = el.querySelector("[data-draft]");
    const note = input?.value.trim() || null;
    if (btn.dataset.act === "record_fix" && !note) {
      el.querySelector("[data-err]").textContent = "Say what fixed it: the Curator turns this note into the lesson.";
      return;
    }
    btn.disabled = true;
    const r = await api(`/api/incidents/${id}/actions`, { actor_role: role, action: btn.dataset.act, note });
    if (!r.ok) {
      el.querySelector("[data-err]").textContent = `${r.status || ""} ${r.error}`;
      btn.disabled = false;
      return;
    }
    if (input) delete drafts[input.dataset.draft];
    refresh();
  });

  const rank = inc => (inc.awaiting === role ? 0 : OPEN.includes(inc.status) || inc.status === "lesson_pending" ? 1 : inc.status === "closed" ? 3 : 2);
  const refresh = startPolling(async () => {
    const r = await api(`/api/incidents?dept=${dept}`);
    if (!r.ok) { list.innerHTML = `<div class="empty">${esc(r.error)}</div>`; return; }
    const rows = r.data.filter(i => all.checked || i.status !== "closed");
    rows.sort((a, b) => rank(a) - rank(b));
    keyedRender(list, rows, card, all.checked ? "No incidents yet." : "Nothing open. Tick “show closed” for history.");
  });
}

// --- electricity ---------------------------------------------------------------

function electricityView() {
  const later = new Date(Date.now() + 60 * 60 * 1000);
  const hh = String(later.getHours()).padStart(2, "0"), mm = String(later.getMinutes()).padStart(2, "0");
  main.innerHTML = `
    <div class="cols">
      <form class="panel stack" id="cut">
        <h2>Record a power cut</h2>
        <p class="note">Written as a note into the Hostel and IT agents' datapacks (a <b>share</b> in the swarm view), so their
          open incidents in that building move their ETA and say why.</p>
        <div><label for="place">Where</label>
          <select id="place">${["Hostel A", "Hostel B", "Block C", "Library", "Mess"].map(p => `<option>${p}</option>`).join("")}</select></div>
        <div><label for="until">Power back at</label><input id="until" type="time" value="${hh}:${mm}" required></div>
        <div><label for="note">Note (optional)</label><input id="note" placeholder="e.g. transformer maintenance"></div>
        <button class="primary" type="submit">Record power cut</button>
        <div class="toast" id="res"></div>
      </form>
      <section>
        <h2 style="margin-bottom:10px">Open hostel and IT incidents</h2>
        <div id="list"></div>
      </section>
    </div>`;
  const res = document.getElementById("res");
  document.getElementById("cut").addEventListener("submit", async e => {
    e.preventDefault();
    const body = {
      actor_role: "electricity", kind: "power_cut", place: document.getElementById("place").value,
      until: document.getElementById("until").value, note: document.getElementById("note").value.trim() || null,
    };
    res.className = "toast";
    res.textContent = "recording…";
    const r = await api("/api/dept-events", body);
    if (!r.ok) { res.className = "toast err"; res.textContent = r.error; return; }
    const dps = r.data.notes_written || [];
    res.className = "toast ok";
    res.textContent = dps.length
      ? `Power cut at ${body.place} until ${body.until} written into ${dps.join(", ")}.`
      : `Meko is off: nothing was written, so no department will know about this power cut.`;
    refresh();
  });

  const list = document.getElementById("list");
  const card = inc => `
    <div class="head"><span class="id">${esc(inc.id)}</span>${statusChip(inc.status)}
      <span class="summary">${esc(inc.summary)}</span></div>
    <div class="body"><div class="facts"><span><b>${esc(inc.place)}</b></span><span>${esc(DEPT_LABEL[inc.dept])}</span></div>
      ${inc.working ? `<div class="working">${esc(inc.working)}</div>` : ""}${etaLine(inc)}</div>`;
  const refresh = startPolling(async () => {
    const r = await api("/api/incidents");
    if (!r.ok) { list.innerHTML = `<div class="empty">${esc(r.error)}</div>`; return; }
    const rows = r.data.filter(i => ["hostel", "it"].includes(i.dept) && OPEN.includes(i.status));
    keyedRender(list, rows, card, "No open hostel or IT incidents.");
  });
}

// --- dean ------------------------------------------------------------------------

function deanView() {
  main.innerHTML = `
    <div class="panel">
      <h1>Verified patterns</h1>
      <p class="note">The Dean reads only campus canon: lessons that students confirmed held and a warden or committee approved,
        promoted to <span class="mono">sunwai-canon</span>. No anecdotes, no unverified complaints. Each pattern cites its lessons'
        memory ids. Refreshes every 15 s (reading canon is a Meko call, cached for a minute).</p>
      <div id="patterns" class="stack" style="margin-top:12px"></div>
    </div>
    <div class="panel">
      <h2>Lessons in canon</h2>
      <div id="lessons" style="margin-top:10px"></div>
    </div>`;
  const pEl = document.getElementById("patterns"), lEl = document.getElementById("lessons");
  const tick = async () => {
    const r = await api("/api/dean/patterns");
    if (!r.ok) { pEl.innerHTML = `<div class="empty">${esc(r.error)}</div>`; return; }
    const { lessons, patterns } = r.data;
    pEl.innerHTML = patterns.length ? patterns.map(p => `
      <div class="card lesson"><b>${esc(p.text)}</b>
        <span class="src">from lessons ${p.memory_ids.map(esc).join(", ")}</span></div>`).join("")
      : `<div class="empty">No pattern yet: a pattern needs at least two verified lessons about the same thing.</div>`;
    lEl.innerHTML = lessons.length ? `<div class="cards">${lessons.map(l => {
      const day = (l.text.match(/\d{4}-\d\d-\d\d/) || [String(l.promoted_at || "").slice(0, 10)])[0];
      return `<div class="card"><span class="src">${esc(day)} · ${esc(l.dept)} · ${esc(l.asset)} · memory ${esc(l.memory_id)}</span>
        ${esc(l.text)} ${l.text.includes("SCRIPTED") ? scriptedChip(true) : ""}</div>`;
    }).join("")}</div>`
      : `<div class="empty">Canon is empty${document.getElementById("meko-badge").textContent === "MEKO OFF" ? " (Meko is off)" : ""}.</div>`;
  };
  tick();
  setInterval(tick, 15000);
}
