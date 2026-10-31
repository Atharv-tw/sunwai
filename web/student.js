// Student screen: file a complaint, follow your incidents, confirm the fix held.
header("student");

// Fake demo students from scenarios/campus.json, plus one id kept in this browser
const DEMO_STUDENTS = [
  ["demo-hostel-a-204", "Student A-204 (Hostel A, floor 2)"],
  ["demo-hostel-a-207", "Student A-207 (Hostel A, floor 2)"],
  ["demo-hostel-a-212", "Student A-212 (Hostel A, floor 2)"],
  ["demo-hostel-b-311", "Student B-311 (Hostel B, floor 3)"],
  ["demo-block-c-01", "Student C-01 (studies in Block C)"],
  ["demo-mess-01", "Student M-01 (eats at the Mess)"],
];

function store(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, value);
  } catch { return null; }
}

let mine = store("sunwai.browserSeed");
if (!mine) {
  mine = "browser-" + Math.random().toString(36).slice(2, 10);
  store("sunwai.browserSeed", mine);
}

const who = document.getElementById("who");
who.innerHTML = [[mine, "Me (this browser)"], ...DEMO_STUDENTS]
  .map(([seed, label]) => `<option value="${esc(seed)}">${esc(label)}</option>`).join("");
const params = new URLSearchParams(location.search);
const wanted = params.get("seed") || store("sunwai.seed") || mine;
if (![...who.options].some(o => o.value === wanted)) who.add(new Option(wanted, wanted));
who.value = wanted;

const sidLine = document.getElementById("sid");
function showSid() {
  const sid = store("sunwai.sid." + who.value);
  sidLine.textContent = sid ? `Staff and agents see you as ${sid}.` : "You get a pseudonymous id with your first complaint.";
}
showSid();

const list = document.getElementById("list");
who.onchange = () => {
  store("sunwai.seed", who.value);
  showSid();
  list.innerHTML = "";
  refresh();
};

function card(inc, openTl) {
  const others = inc.reporters - 1;
  const asking = inc.awaiting === "student";
  const late = ["verified", "lesson_pending"].includes(inc.status);
  const conf = inc.confirmations || { held: 0, broken: 0 };
  return `
    <div class="head">
      <span class="id">${esc(inc.id)}</span>
      ${statusChip(inc.status)}
      <span class="summary">${esc(inc.summary)}</span>
      ${inc.safety_risk ? `<span class="chip risk">safety</span>` : ""}
    </div>
    <div class="body">
      <div class="facts">
        <span><b>${esc(inc.place)}</b></span>
        <span>${others > 0 ? `<b>${others}</b> other student${others === 1 ? "" : "s"} reported the same thing` : "only you so far"}</span>
        ${conf.held || conf.broken ? `<span>confirmed held: <b>${conf.held}</b>, still broken: <b>${conf.broken}</b></span>` : ""}
      </div>
      ${inc.working ? `<div class="working">${esc(inc.working)}</div>` : ""}
      ${etaLine(inc)}
      ${inc.plan ? `<div class="plan small"><span class="muted">What staff will do:</span> ${esc(inc.plan)}</div>` : ""}
      ${timeline(inc, openTl)}
    </div>
    ${asking ? `
    <div class="acts">
      <b>Staff marked this fixed. Did it hold?</b>
      <button class="good" data-act="confirm_fixed">Fixed, it held</button>
      <input data-draft="broken-${esc(inc.id)}" placeholder="What is still wrong? (optional)">
      <button class="bad" data-act="still_broken">Still broken</button>
      <div class="err" data-err></div>
    </div>` : late ? `
    <div class="acts">
      <span class="muted small">Already confirmed by another student. Fixed for you too?</span>
      <button data-act="confirm_fixed">Yes, it held for me</button>
      <div class="err" data-err></div>
    </div>` : ""}`;
}

list.addEventListener("click", async e => {
  const btn = e.target.closest("button[data-act]");
  if (!btn) return;
  const el = btn.closest("[data-inc]");
  const id = el.dataset.inc;
  const note = el.querySelector("[data-draft]")?.value || null;
  btn.disabled = true;
  const r = await api(`/api/incidents/${id}/actions`, {
    actor_role: "student", action: btn.dataset.act, student_seed: who.value, note,
  });
  if (!r.ok) {
    el.querySelector("[data-err]").textContent = r.error;
    btn.disabled = false;
    return;
  }
  delete drafts["broken-" + id];
  refresh();
});

const form = document.getElementById("complain");
const text = document.getElementById("text");
const sent = document.getElementById("sent");
form.addEventListener("submit", async e => {
  e.preventDefault();
  const words = text.value.trim();
  if (!words) return;
  document.getElementById("send").disabled = true;
  document.getElementById("sending").hidden = false;
  sent.className = "toast";
  sent.textContent = "";
  const r = await api("/api/grievances", { student_seed: who.value, text: words });
  document.getElementById("send").disabled = false;
  document.getElementById("sending").hidden = true;
  if (!r.ok) {
    sent.className = "toast err";
    sent.textContent = r.error;
    return;
  }
  const inc = r.data;
  store("sunwai.sid." + who.value, inc.student_id);
  showSid();
  text.value = "";
  sent.className = "toast ok";
  sent.textContent = inc.reporters > 1
    ? `Added to ${inc.id}: ${inc.reporters - 1} other student${inc.reporters === 2 ? "" : "s"} already reported this.`
    : `Filed as ${inc.id} (${inc.dept}). The ${inc.dept} agent is looking for past fixes.`;
  refresh();
});

const refresh = startPolling(async () => {
  const seed = who.value;
  const r = await api(`/api/students/${encodeURIComponent(seed)}/incidents`);
  if (seed !== who.value) return;
  if (!r.ok) {
    list.innerHTML = `<div class="empty">${esc(r.error)}</div>`;
    return;
  }
  keyedRender(list, r.data, card, "No complaints yet.");
});
