import { useCallback, useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  Activity, AlertTriangle, ArrowRight, ArrowUpRight, Bell, Check, CheckCircle2, ChevronDown,
  ChevronRight, CircleHelp, Clock3, Database, FileCheck2, Filter, Home, LifeBuoy, Network, Plus, Radio,
  Search, ShieldCheck, Sparkles, Users, Wifi, Wrench, X,
} from "lucide-react";
import { api } from "./api";
import { clearDemo, demoAction, DEMO_STUDENTS, newDemoIncident, readDemo, writeDemo } from "./demo";
import type { DeanData, DemoEvent, Incident, Mode, Role, Status } from "./types";

type Route={page:"home"|"student"|"staff"|"electricity"|"dean";role:Role};
const roleTitles:Record<Role,string>={student:"You",caretaker:"Hostel maintenance",warden:"Warden approvals",mess_committee:"Mess committee",it_cell:"IT cell",electricity:"Electricity desk",dean:"Dean overview"};
const roleRoute:Record<Role,string>={student:"#/student",caretaker:"#/staff/caretaker",warden:"#/staff/warden",mess_committee:"#/staff/mess_committee",it_cell:"#/staff/it_cell",electricity:"#/electricity",dean:"#/dean"};
const roleIcons:Record<Role,typeof Home>={student:Users,caretaker:Wrench,warden:ShieldCheck,mess_committee:LifeBuoy,it_cell:Wifi,electricity:Activity,dean:Sparkles};
const departmentFor:Partial<Record<Role,Incident["dept"]>>={caretaker:"hostel",warden:"hostel",mess_committee:"mess",it_cell:"it"};
const statusNames:Record<Status,string>={reported:"New report",assigned:"Plan proposed",in_progress:"In progress",fixed:"Awaiting confirmation",verified:"Confirmed",lesson_pending:"Needs approval",closed:"Resolved"};
const statusOrder:Status[]=["reported","assigned","in_progress","fixed","verified","lesson_pending","closed"];
const priorityOrder:Record<string,number>={critical:0,high:1,medium:2,low:3};
const initialDemo=readDemo();

function routeFromHash():Route{
  const parts=location.hash.replace(/^#\/?/,"").split("/");
  if(parts[0]==="student")return{page:"student",role:"student"};
  if(parts[0]==="staff")return{page:"staff",role:(parts[1] as Role)||"caretaker"};
  if(parts[0]==="electricity")return{page:"electricity",role:"electricity"};
  if(parts[0]==="dean")return{page:"dean",role:"dean"};
  return{page:"home",role:"student"};
}
function useRoute(){const [route,setRoute]=useState(routeFromHash);useEffect(()=>{const fn=()=>setRoute(routeFromHash());window.addEventListener("hashchange",fn);return()=>window.removeEventListener("hashchange",fn);},[]);return route;}
function go(to:string){location.hash=to;}
const shortTime=(value?:string|null)=>value?new Date(value).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}):"—";
const dateLabel=(value?:string|null)=>value?new Date(value).toLocaleDateString([],{day:"numeric",month:"short"}):"—";
const deptLabel=(dept:string)=>({hostel:"Hostel",mess:"Mess",it:"IT cell",desk:"Desk"}[dept]||dept);

export function App(){
  const route=useRoute();
  const [mode,setMode]=useState<Mode>(()=>(localStorage.getItem("sunwai.ui.mode") as Mode)||"demo");
  const [demo,setDemo]=useState(initialDemo);
  const [incidents,setIncidents]=useState<Incident[]>(initialDemo.incidents);
  const [health,setHealth]=useState<{meko_enabled:boolean;llm_model:string;meko_error:string}|null>(null);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");
  const [demoEvents,setDemoEvents]=useState<DemoEvent[]>(initialDemo.events);
  useEffect(()=>{document.title=`Sunwai · ${route.page==="home"?"Campus helpdesk":roleTitles[route.role]}`;},[route]);
  useEffect(()=>{localStorage.setItem("sunwai.ui.mode",mode);setError("");if(mode==="demo"){const d=readDemo();setDemo(d);setIncidents(d.incidents);setDemoEvents(d.events);return;}let alive=true;api.incidents().then(rows=>alive&&setIncidents(rows)).catch(e=>alive&&setError((e as Error).message));api.health().then(h=>alive&&setHealth(h)).catch(()=>{});return()=>{alive=false;};},[mode]);
  const saveDemo=useCallback((next:typeof demo)=>{setDemo(next);setIncidents(next.incidents);setDemoEvents(next.events);writeDemo(next);},[]);
  const refresh=useCallback(async()=>{if(mode==="demo"){const d=readDemo();setDemo(d);setIncidents(d.incidents);setDemoEvents(d.events);return;}try{setIncidents(await api.incidents());}catch(e){setError((e as Error).message);}},[mode]);
  useEffect(()=>{if(mode!=="live")return;const timer=window.setInterval(()=>{api.incidents().then(setIncidents).catch(()=>{});},4000);return()=>window.clearInterval(timer);},[mode]);
  const act=useCallback(async(id:string,role:Role,action:string,note?:string,seed?:string)=>{
    setBusy(true);setError("");setNotice("");
    try{
      if(mode==="demo"){
        const next={...demo,incidents:demoAction(demo.incidents,id,role,action,note)};
        saveDemo(next);
      }else{
        const updated=await api.act(id,role,action,note,seed);setIncidents(rows=>rows.map(i=>i.id===id?updated:i));await refresh();
      }
      setNotice(action==="confirm_fixed"?"Thanks for confirming. The team can now review a verified lesson.":action==="still_broken"?"Thanks for letting the team know. The repair is back in progress.":"Update saved.");
      return true;
    }catch(e){setError((e as Error).message);return false;}finally{setBusy(false);}
  },[demo,mode,refresh,saveDemo]);
  const submit=useCallback(async(text:string,seed:string)=>{
    setBusy(true);setError("");setNotice("");
    try{
      if(mode==="demo"){
        const incident=newDemoIncident(text,seed);const next={...demo,incidents:[incident,...demo.incidents]};saveDemo(next);setNotice(`Request ${incident.id} is with the ${deptLabel(incident.dept)} team.`);return incident;
      }
      const incident=await api.create(seed,text);setIncidents(rows=>[incident,...rows.filter(i=>i.id!==incident.id)]);setNotice(`Request ${incident.id} was submitted.`);return incident;
    }catch(e){setError((e as Error).message);return null;}finally{setBusy(false);}
  },[demo,mode,saveDemo]);
  const studentRows=useCallback(async(seed:string)=>mode==="demo"?readDemo().incidents.filter(i=>i.studentSeeds?.includes(seed)):api.studentIncidents(seed),[mode]);
  const outage=useCallback(async(place:string,until:string,note:string)=>{
    setBusy(true);setError("");setNotice("");try{
      if(mode==="demo"){
        const item={id:`EVT-${String(Date.now()).slice(-4)}`,place,until,note,created:new Date().toISOString()};const next={...demo,events:[item,...demo.events]};saveDemo(next);setNotice(`Outage shared with Hostel and IT teams for ${place}.`);return true;
      }
      const result=await api.outage(place,until,note);setNotice(result.notes_written.length?`Update shared with ${result.notes_written.join(" and ")}.`:`Event recorded; Meko is off, so no department memory was updated.`);await refresh();return true;
    }catch(e){setError((e as Error).message);return false;}finally{setBusy(false);}
  },[demo,mode,refresh,saveDemo]);
  const getDean=useCallback(async()=>mode==="demo"?demo.dean:api.dean(),[demo.dean,mode]);
  const switchMeko=async()=>{if(mode==="demo")return;setBusy(true);try{const h=await api.meko(!health?.meko_enabled);setHealth(prev=>({meko_enabled:h.meko_enabled,meko_error:h.meko_error,llm_model:prev?.llm_model||""}));}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
  const resetDemo=()=>{clearDemo();const fresh=readDemo();saveDemo(fresh);setNotice("Demo scenarios restored to their starting state.");};
  return <div className="app-shell">
    <aside className="sidebar">
      <a href="#/" className="brand"><span className="brand-mark"><Network size={19}/></span><span><b>sunwai</b><small>campus care, connected</small></span></a>
      <div className="side-label">WORKSPACE</div>
      <nav className="side-nav">
        <NavLink href="#/" active={route.page==="home"} icon={Home}>Overview</NavLink>
        <NavLink href={roleRoute.student} active={route.page==="student"} icon={Users}>Student portal</NavLink>
        <div className="side-label team-label">TEAMS</div>
        {(["caretaker","warden","mess_committee","it_cell","electricity","dean"] as Role[]).map(role=>{const Icon=roleIcons[role];return <NavLink key={role} href={roleRoute[role]} active={route.role===role} icon={Icon}>{roleTitles[role]}</NavLink>;})}
        <div className="side-label team-label">OBSERVABILITY</div>
        <a className="nav-link" href="/swarm.html"><span className="nav-icon"><Radio size={17}/></span><span>Agent swarm</span><ArrowUpRight size={14} className="nav-external"/></a>
      </nav>
      <div className="side-bottom"><div className="campus-card"><span className="campus-icon"><Database size={16}/></span><div><b>Campus memory</b><small>{mode==="demo"?"Sample scenarios":"Meko connected"}</small></div><span className={`tiny-dot ${mode}`}/></div><span className="version-line">SUNWAI · HACKCBS 9.0</span></div>
    </aside>
    <main className="main-shell">
      <header className="topbar"><div className="mobile-brand"><span className="brand-mark"><Network size={18}/></span><b>sunwai</b></div><div className="crumb"><span>Workspace</span><ChevronRight size={14}/><b>{route.page==="home"?"Overview":roleTitles[route.role]}</b></div>
        <div className="top-actions"><span className={`mode-pill ${mode}`}><i/>{mode==="demo"?"DEMO DATA":"LIVE SYSTEM"}</span><button className="mode-switch" onClick={()=>setMode(mode==="demo"?"live":"demo")} disabled={busy}><span>{mode==="demo"?"Try live data":"View demo"}</span><ArrowRight size={14}/></button>
          {mode==="live"&&<button className={`meko-switch ${health?.meko_enabled?"enabled":""}`} onClick={switchMeko} disabled={busy} title={health?.meko_error||"Toggle Meko"}><span className="tiny-dot"/>{health?.meko_enabled?"Meko on":"Meko off"}</button>}
          <button className="icon-button notification" aria-label="Notifications"><Bell size={17}/><i/></button><div className="avatar">A</div></div>
      </header>
      {(error||notice)&&<div className={`notice-bar ${error?"error":"success"}`}><span>{error||notice}</span><button onClick={()=>{setError("");setNotice("");}} aria-label="Dismiss"><X size={15}/></button></div>}
      <div className="page-wrap">
        {mode==="demo"&&<div className="demo-banner"><Sparkles size={15}/><span><b>Demo workspace</b> · Fictional student reports and staff actions, stored only in this browser.</span><button onClick={resetDemo}>Reset scenarios</button></div>}
        {route.page==="home"&&<HomePage incidents={incidents} mode={mode} onNavigate={go}/>}
        {route.page==="student"&&<StudentPage mode={mode} incidents={incidents} getRows={studentRows} submit={submit} act={act} busy={busy} />}
        {route.page==="staff"&&<StaffPage role={route.role} incidents={incidents} act={act} busy={busy} refresh={refresh}/>}
        {route.page==="electricity"&&<ElectricityPage incidents={incidents} events={demoEvents} outage={outage} busy={busy} mode={mode}/>}
        {route.page==="dean"&&<DeanPage getDean={getDean}/>}
      </div>
      <footer className="app-footer"><span>Sunwai · campus grievances, heard and remembered</span><span>{mode==="demo"?"Demo actions never call Meko":"Every student and staff action follows the live incident API"}</span></footer>
    </main>
  </div>;
}

function NavLink({href,active,icon:Icon,children}:{href:string;active:boolean;icon:typeof Home;children:string}){return <a href={href} className={`nav-link ${active?"active":""}`}><span className="nav-icon"><Icon size={17}/></span><span>{children}</span>{active&&<i className="nav-active-dot"/>}</a>;}

function HomePage({incidents,mode,onNavigate}:{incidents:Incident[];mode:Mode;onNavigate:(to:string)=>void}){
  const active=incidents.filter(i=>i.status!=="closed").length;const waiting=incidents.filter(i=>i.awaiting&&i.awaiting!=="student").length;const risky=incidents.filter(i=>i.safety_risk&&i.status!=="closed").length;
  const latest=[...incidents].sort((a,b)=>new Date(b.timeline?.at(-1)?.ts||0).getTime()-new Date(a.timeline?.at(-1)?.ts||0).getTime()).slice(0,4);
  return <>
    <div className="welcome-row"><div><div className="eyebrow">SUNDAY · NOVEMBER 1</div><h1>Good afternoon, Atharv <span>✦</span></h1><p>Here’s what’s happening across campus today.</p></div><button className="button button-dark" onClick={()=>onNavigate("#/student")}><Plus size={16}/> New request</button></div>
    <section className="stat-grid">
      <StatCard label="Open requests" value={active} caption="Across all campus teams" icon={LifeBuoy} trend="Live queue"/>
      <StatCard label="Waiting on staff" value={waiting} caption="A person needs to take the next step" icon={Clock3} trend="Needs attention" warm/>
      <StatCard label="Safety escalations" value={risky} caption="Food or wellbeing concerns" icon={AlertTriangle} trend={risky?"Urgent review":"All clear"} danger={!!risky}/>
      <StatCard label="Memory status" value={mode==="demo"?"Demo":"Ready"} caption={mode==="demo"?"Sample Meko context is labeled":"Meko context available"} icon={Database} trend={mode==="demo"?"SIMULATED":"CONNECTED"}/>
    </section>
    <div className="home-grid">
      <section className="surface-panel recent-panel"><div className="section-heading"><div><div className="eyebrow">CAMPUS PULSE</div><h2>Requests needing a next step</h2></div><button className="text-button" onClick={()=>onNavigate(roleRoute.caretaker)}>Open staff queue <ArrowRight size={14}/></button></div>
        {latest.map(inc=><MiniIncident key={inc.id} incident={inc} onClick={()=>onNavigate(inc.dept==="mess"?roleRoute.mess_committee:inc.dept==="it"?roleRoute.it_cell:roleRoute.caretaker)}/>)}
      </section>
      <section className="surface-panel role-panel"><div className="section-heading"><div><div className="eyebrow">YOUR WORKSPACES</div><h2>Jump into a role</h2></div></div>
        {(["student","caretaker","warden","mess_committee","it_cell","electricity","dean"] as Role[]).map(role=>{const Icon=roleIcons[role];return <button className="role-row" key={role} onClick={()=>onNavigate(roleRoute[role])}><span className={`role-icon role-${role}`}><Icon size={16}/></span><span><b>{roleTitles[role]}</b><small>{role==="student"?"File and track a request":role==="dean"?"Verified campus patterns":role==="electricity"?"Share power updates":`Review ${deptLabel(departmentFor[role]||"")} work`}</small></span><ArrowRight size={15}/></button>;})}
        <a className="swarm-card" href="/swarm.html"><span className="swarm-mark"><Network size={18}/></span><span><b>Agent swarm</b><small>Watch Meko calls move through campus</small></span><ArrowUpRight size={15}/></a>
      </section>
    </div>
  </>;
}
function StatCard({label,value,caption,icon:Icon,trend,warm,danger}:{label:string;value:string|number;caption:string;icon:typeof Home;trend:string;warm?:boolean;danger?:boolean}){return <div className={`stat-card ${warm?"warm":""} ${danger?"danger":""}`}><div className="stat-top"><span className="stat-icon"><Icon size={17}/></span><span className="stat-trend">{trend}</span></div><div className="stat-value">{value}</div><div className="stat-label">{label}</div><div className="stat-caption">{caption}</div></div>;}
function MiniIncident({incident:i,onClick}:{incident:Incident;onClick:()=>void}){return <button className="mini-incident" onClick={onClick}><span className={`mini-status ${i.safety_risk?"risk":""}`}/><span className="mini-main"><span><b>{i.summary}</b>{i.safety_risk&&<span className="safety-tag">SAFETY</span>}</span><small>{i.id} · {i.place} · {i.reporters} reports</small></span><StatusBadge status={i.status}/><ChevronRight size={15}/></button>;}

function StatusBadge({status}:{status:Status}){return <span className={`status-badge status-${status}`}><i/>{statusNames[status]}</span>;}
function Progress({status}:{status:Status}){const idx=statusOrder.indexOf(status);const steps:[Status,string][]=[["reported","Reported"],["assigned","Planned"],["in_progress","Repair"],["fixed","Confirm"],["lesson_pending","Review"],["closed","Resolved"]];return <div className="progress-track">{steps.map(([key,label],i)=>{const done=idx>=i;const current=key===status||(status==="verified"&&key==="lesson_pending");return <div className={`progress-step ${done?"done":""} ${current?"current":""}`} key={key}><span className="progress-dot">{done&&!current?<Check size={11}/>:null}</span><small>{label}</small>{i<steps.length-1&&<i className={`progress-line ${idx>i?"done":""}`}/>}</div>;})}</div>;}

function IncidentRow({incident:i,selected,onClick}:{incident:Incident;selected?:boolean;onClick:()=>void}){return <button className={`incident-row ${selected?"selected":""}`} onClick={onClick}><span className={`severity-mark sev-${i.severity}`}/><span className="incident-row-copy"><span className="incident-row-title">{i.summary}{i.safety_risk&&<AlertTriangle size={14} className="danger-icon"/>}</span><small>{i.id} <span>·</span> {i.place} <span>·</span> {i.reporters} reports</small></span><StatusBadge status={i.status}/><ChevronRight size={15}/></button>;}

function StudentPage({mode,incidents,getRows,submit,act,busy}:{mode:Mode;incidents:Incident[];getRows:(s:string)=>Promise<Incident[]>;submit:(t:string,s:string)=>Promise<Incident|null>;act:(id:string,r:Role,a:string,n?:string,s?:string)=>Promise<boolean>;busy:boolean}){
  const [seed,setSeed]=useState(DEMO_STUDENTS[0].seed);const [rows,setRows]=useState<Incident[]>([]);const [text,setText]=useState("");const [broken,setBroken]=useState("");const [tab,setTab]=useState("active");
  const load=useCallback(()=>{getRows(seed).then(setRows).catch(()=>setRows([]));},[getRows,seed]);useEffect(()=>{load();},[load,incidents,mode]);
  const selected=DEMO_STUDENTS.find(s=>s.seed===seed)!;
  const visible=rows.filter(i=>tab==="all"||i.status!=="closed");
  const send=async(e:FormEvent)=>{e.preventDefault();if(!text.trim())return;const res=await submit(text,seed);if(res){setText("");load();}};
  const doAct=async(i:Incident,action:string,note?:string)=>{const ok=await act(i.id,"student",action,note,seed);if(ok){setBroken("");load();}};
  return <>
    <PageHeader eyebrow="STUDENT SERVICES" title="Your campus, taken care of." subtitle="Raise a request, follow every update, and tell us when the fix works for you." action={<div className="identity-select"><span className="identity-avatar">{selected.label.charAt(0)}</span><select value={seed} onChange={e=>setSeed(e.target.value)} aria-label="Choose demo student">{DEMO_STUDENTS.map(s=><option key={s.seed} value={s.seed}>{s.label}</option>)}</select><ChevronDown size={14}/></div>}/>
    <div className="student-layout">
      <section className="student-main">
        <div className="section-heading student-section-heading"><div><div className="eyebrow">REQUEST TRACKER</div><h2>Your requests <span className="count-pill">{rows.length}</span></h2></div><div className="tabs"><button className={tab==="active"?"selected":""} onClick={()=>setTab("active")}>Active <span>{rows.filter(i=>i.status!=="closed").length}</span></button><button className={tab==="all"?"selected":""} onClick={()=>setTab("all")}>All requests</button></div></div>
        {visible.length===0?<EmptyState icon={LifeBuoy} title="Your request list is clear" text="Submit an issue and you’ll see its status, updates, and next steps here."/>:visible.map(i=><StudentRequest key={i.id} incident={i} onAction={doAct} busy={busy} broken={broken} setBroken={setBroken}/>)}
      </section>
      <aside className="student-aside">
        <form className="surface-panel report-form" onSubmit={send}><div className="form-kicker"><span className="form-icon"><Plus size={18}/></span><span className="eyebrow">NEW REQUEST</span></div><h2>What needs attention?</h2><p>Describe what happened and where. You can write naturally, even if you’re not sure which team should handle it.</p>
          <label htmlFor="report-text">Issue details</label><textarea id="report-text" value={text} onChange={e=>setText(e.target.value)} placeholder="Example: The geyser on Hostel B, floor 3 has had no hot water since this morning…" maxLength={1200}/>
          <div className="form-foot"><small>{text.length}/1200 · Your identity is private</small><button className="button button-dark" disabled={busy||!text.trim()}><Plus size={15}/> Send request</button></div><div className="privacy-note"><ShieldCheck size={14}/> Contact details are removed before they reach campus memory.</div>
        </form>
        <div className="help-card"><div className="help-icon"><CircleHelp size={17}/></div><div><b>What happens next?</b><p>Our Desk groups similar requests and routes yours to the right campus team. You’ll see every update here.</p></div></div>
        <div className="id-card"><div className="eyebrow">PRIVATE STUDENT ID</div><div className="student-id">{selected.id}<span>● active</span></div><small>Only this pseudonymous ID is visible to staff and agents.</small></div>
      </aside>
    </div>
  </>;
}
function StudentRequest({incident:i,onAction,busy,broken,setBroken}:{incident:Incident;onAction:(i:Incident,a:string,n?:string)=>void;busy:boolean;broken:string;setBroken:(s:string)=>void}){
  const waiting=i.awaiting==="student";const needsReply=waiting||i.status==="verified"||i.status==="lesson_pending";
  return <article className="request-card"><div className="request-heading"><div><div className="request-ref"><span>{i.id}</span><span>·</span><span>{deptLabel(i.dept)}</span><span>·</span><span>{i.place}</span></div><h3>{i.summary}</h3></div><StatusBadge status={i.status}/></div>
    {i.status!=="closed"&&<Progress status={i.status}/>}<div className="request-summary-grid"><div><small>REPORTED BY</small><b>{i.reporters} {i.reporters===1?"student":"students"}</b></div><div><small>ESTIMATED UPDATE</small><b>{i.eta?`${dateLabel(i.eta)} · ${shortTime(i.eta)}`:"When staff updates"}</b></div><div><small>CURRENTLY WITH</small><b>{i.awaiting?roleTitles[i.awaiting]||i.awaiting:"Campus team"}</b></div></div>
    {i.eta_reason&&<div className="request-explain"><Clock3 size={15}/><span>{i.eta_reason}</span></div>}
    {waiting&&<div className="confirm-panel"><div className="confirm-copy"><span className="confirm-icon"><CheckCircle2 size={18}/></span><span><b>Staff marked this as fixed. Did it work for you?</b><small>Your response helps confirm the repair for everyone who reported it.</small></span></div><div className="confirm-actions"><button className="button button-dark" onClick={()=>onAction(i,"confirm_fixed")} disabled={busy}><Check size={15}/> Yes, it’s fixed</button><button className="button button-light" onClick={()=>onAction(i,"still_broken",broken)} disabled={busy}><AlertTriangle size={15}/> Still broken</button></div><input className="optional-note" value={broken} onChange={e=>setBroken(e.target.value)} placeholder="Optional: tell the team what still needs attention" /></div>}
    {needsReply&&!waiting&&<div className="confirm-success"><CheckCircle2 size={16}/><span>Thanks — your response has been recorded. The campus team will review the next step.</span></div>}
    <details className="request-timeline"><summary><span><Activity size={15}/> Activity & updates <small>{i.timeline?.length||0}</small></span><ChevronDown size={15}/></summary><ol>{[...(i.timeline||[])].reverse().map((t,n)=><li key={`${t.ts}-${n}`}><span className="timeline-marker"/><div><b>{t.actor}</b><p>{t.text}</p><small>{dateLabel(t.ts)} · {shortTime(t.ts)}{t.scripted&&<em>DEMO</em>}</small></div></li>)}</ol></details>
  </article>;
}

function PageHeader({eyebrow,title,subtitle,action}:{eyebrow:string;title:string;subtitle:string;action?:ReactNode}){return <div className="page-header"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{subtitle}</p></div>{action}</div>;}
function EmptyState({icon:Icon,title,text}:{icon:typeof Home;title:string;text:string}){return <div className="empty-state"><span><Icon size={21}/></span><h3>{title}</h3><p>{text}</p></div>;}

function StaffPage({role,incidents,act,busy,refresh}:{role:Role;incidents:Incident[];act:(id:string,r:Role,a:string,n?:string,s?:string)=>Promise<boolean>;busy:boolean;refresh:()=>void}){
  const dept=departmentFor[role]!;const [filter,setFilter]=useState("needs");const [priority,setPriority]=useState("any");const [search,setSearch]=useState("");const [selectedId,setSelectedId]=useState("");const [note,setNote]=useState("");
  const rows=incidents.filter(i=>i.dept===dept).sort((a,b)=>priorityOrder[a.severity]-priorityOrder[b.severity]||new Date(b.timeline?.at(-1)?.ts||0).getTime()-new Date(a.timeline?.at(-1)?.ts||0).getTime());
  const visible=rows.filter(i=>{const inTab=filter==="all"||(filter==="active"?i.status!=="closed":i.awaiting===role||(role==="warden"&&i.awaiting==="caretaker")||(role==="warden"&&i.status==="lesson_pending"));const inPriority=priority==="any"||(priority==="safety"?i.safety_risk:i.severity===priority);const q=search.trim().toLowerCase();const inSearch=!q||`${i.id} ${i.summary} ${i.place} ${i.asset||""}`.toLowerCase().includes(q);return inTab&&inPriority&&inSearch;});
  const selected=visible.find(i=>i.id===selectedId)||visible.find(i=>i.awaiting===role)||(role==="warden"?visible.find(i=>i.awaiting==="caretaker"):undefined)||visible[0];
  const needs=rows.filter(i=>i.awaiting===role||(role==="warden"&&i.status==="lesson_pending")).length;
  const active=rows.filter(i=>i.status!=="closed").length;
  const urgent=rows.filter(i=>i.safety_risk&&i.status!=="closed").length;
  const action=async(key:string)=>{if(!selected)return;const ok=await act(selected.id,role,key,note);if(ok){setNote("");refresh();}};
  const canPlan=selected?.status==="assigned"&&(selected.awaiting===role||role==="warden");
  const canFix=selected?.status==="in_progress"&&(selected.awaiting===role||role==="warden");
  const canLesson=selected?.status==="lesson_pending"&&selected.awaiting===role;
  const title=role==="warden"?"Review plans & verified lessons":`${deptLabel(dept)} service queue`;
  const summary=role==="warden"?"Approve the repair plan and verified lessons that become shared campus memory.":role==="mess_committee"?"Coordinate food and hygiene incidents, including safety escalations and lesson approvals.":role==="it_cell"?"Triage campus connectivity reports, investigate shared outages, and verify lasting fixes.":"Review maintenance plans, record completed repairs, and keep students informed.";
  return <>
    <PageHeader eyebrow={`${deptLabel(dept).toUpperCase()} · STAFF WORKSPACE`} title={title} subtitle={summary} action={<button className="button button-light" onClick={refresh}><Activity size={15}/> Refresh queue</button>}/>
    <section className="stat-grid staff-stats"><StatCard label="Needs your action" value={needs} caption="Cases currently waiting on this role" icon={Clock3} trend={needs?"Take next step":"Up to date"} warm/><StatCard label="Active requests" value={active} caption="Not yet confirmed and resolved" icon={LifeBuoy} trend="Open queue"/><StatCard label="Safety flags" value={urgent} caption="Requires careful human review" icon={AlertTriangle} trend={urgent?"Priority":"Clear"} danger={!!urgent}/><StatCard label="Team memory" value="Meko" caption="Plans include retrieved context" icon={Database} trend="Context enabled"/></section>
    <div className="queue-toolbar"><div className="queue-heading"><div className="eyebrow">CASE MANAGEMENT</div><h2>Requests <span className="count-pill">{rows.length}</span></h2></div><div className="queue-controls"><label className="searchbox"><Search size={15}/><input placeholder="Search requests" value={search} onChange={e=>setSearch(e.target.value)}/></label><label className="filter-button"><Filter size={14}/><select value={priority} onChange={e=>setPriority(e.target.value)} aria-label="Filter by priority"><option value="any">Any priority</option><option value="safety">Safety</option><option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></label></div></div>
    <div className="queue-tabs"><button className={filter==="needs"?"active":""} onClick={()=>setFilter("needs")}>Needs your action <span>{needs}</span></button><button className={filter==="active"?"active":""} onClick={()=>setFilter("active")}>All active <span>{active}</span></button><button className={filter==="all"?"active":""} onClick={()=>setFilter("all")}>History <span>{rows.length-active}</span></button></div>
    <div className="staff-layout"><section className="queue-list">{visible.length?visible.map(i=><IncidentRow key={i.id} incident={i} selected={i.id===selected?.id} onClick={()=>{setSelectedId(i.id);setNote("");}}/>):<EmptyState icon={CheckCircle2} title="Nothing is waiting on you" text="Requests will appear here when your role has the next action."/>}</section>
      {selected?<section className="case-detail surface-panel"><div className="detail-topline"><span className="eyebrow">REQUEST DETAIL</span><button className="icon-button" aria-label="More options"><ChevronDown size={16}/></button></div><div className="detail-id">{selected.id}<span className={`severity-chip sev-${selected.severity}`}>{selected.severity} priority</span>{selected.safety_risk&&<span className="safety-tag"><AlertTriangle size={12}/> SAFETY</span>}</div><h2>{selected.summary}</h2><div className="detail-meta"><span>{selected.place}</span><i/><span>{deptLabel(selected.dept)}</span><i/><span>{selected.reporters} reports merged</span></div>
        <div className="detail-status"><span>REQUEST STATUS</span><StatusBadge status={selected.status}/></div><Progress status={selected.status}/>
        <div className="agent-plan"><div className="plan-title"><span className="plan-agent"><Sparkles size={14}/></span><span><b>Agent’s recommended plan</b><small>Based on retrieved campus memory</small></span></div><p>{selected.plan||"The agent is reviewing this request and will propose a plan shortly."}</p>{selected.eta&&<div className="eta-row"><Clock3 size={14}/><b>Estimated update {shortTime(selected.eta)}</b><span>{selected.eta_reason}</span></div>}</div>
        {selected.context?.length? <div className="context-block"><div className="detail-section-title"><span>RECALLED CAMPUS CONTEXT</span><small>{selected.context.length} sources</small></div>{selected.context.map(c=><div className="memory-card" key={c.memory_id}><span className="memory-icon"><Database size={14}/></span><div><div className="memory-meta">{c.datapack}<span>·</span>{c.source}<span>·</span><code>{c.memory_id}</code></div><p>{c.text}</p></div></div>)}</div>:<div className="context-placeholder"><Database size={15}/>No recalled context attached to this request.</div>}
        {selected.lesson&&<div className="lesson-review"><div className="detail-section-title"><span>VERIFIED LESSON DRAFT</span><small>{selected.lesson.status}</small></div><p>{selected.lesson.text}</p>{selected.lesson.memory_id&&<code>memory {selected.lesson.memory_id}</code>}</div>}
        <div className="detail-section-title timeline-title"><span>CASE ACTIVITY</span><small>{selected.timeline?.length||0} updates</small></div><ol className="staff-timeline">{[...(selected.timeline||[])].reverse().slice(0,5).map((t,n)=><li key={`${t.ts}-${n}`}><span className="timeline-marker"/><div><b>{t.actor}</b><p>{t.text}</p><small>{dateLabel(t.ts)} · {shortTime(t.ts)}</small></div></li>)}</ol>
        {(canPlan||canFix||canLesson)&&<div className="staff-action-box"><div className="eyebrow">YOUR NEXT STEP</div>{canPlan&&<><h3>Review and approve this plan</h3><p>Approval assigns the work to your team and records the decision.</p><textarea value={note.startsWith("search:")?"":note} onChange={e=>setNote(e.target.value)} placeholder="Optional note for the record"/><button className="button button-dark" onClick={()=>action("approve_plan")} disabled={busy}><Check size={15}/> Approve plan</button></>}{canFix&&<><h3>Record the repair</h3><p>Describe what fixed the issue. Students will be asked to confirm it.</p><textarea value={note.startsWith("search:")?"":note} onChange={e=>setNote(e.target.value)} placeholder="What did you do? Add duration, for example (40 min)"/><button className="button button-dark" onClick={()=>action("record_fix")} disabled={busy||!note.trim()}><Wrench size={15}/> Record repair</button></>}{canLesson&&<><h3>Approve this campus lesson?</h3><p>Promoting shares this verified repair with other campus teams.</p><textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Optional approval note"/><div className="action-pair"><button className="button button-dark" onClick={()=>action("approve_lesson")} disabled={busy}><Check size={15}/> Approve lesson</button><button className="button button-light danger-button" onClick={()=>action("reject_lesson")} disabled={busy}>Reject draft</button></div></>}</div>}
      </section>:<section className="case-detail surface-panel"><EmptyState icon={FileCheck2} title="Choose a request" text="Select a case from the queue to see its context, timeline, and next action."/></section>}</div>
  </>;
}

function ElectricityPage({incidents,events,outage,busy,mode}:{incidents:Incident[];events:DemoEvent[];outage:(p:string,u:string,n:string)=>Promise<boolean>;busy:boolean;mode:Mode}){
  const [place,setPlace]=useState("Hostel A");const [until,setUntil]=useState("18:00");const [note,setNote]=useState("");const affected=incidents.filter(i=>["hostel","it"].includes(i.dept)&&i.status!=="closed"&&i.place.toLowerCase().includes(place.split(" ·")[0].toLowerCase()));
  const send=async(e:FormEvent)=>{e.preventDefault();if(await outage(place,until,note))setNote("");};
  return <><PageHeader eyebrow="CAMPUS OPERATIONS" title="Power & utility updates" subtitle="A power notice gives Hostel and IT teams shared context to adjust open repair plans." action={<span className="mode-pill"><Radio size={13}/> CROSS-TEAM SHARING</span>}/>
    <div className="electricity-grid"><div className="electricity-main"><form className="surface-panel event-form" onSubmit={send}><div className="section-heading"><div><div className="eyebrow">NEW CAMPUS EVENT</div><h2>Record a power interruption</h2></div><span className="event-avatar"><Activity size={18}/></span></div><p>Once recorded, the event is shared into the relevant department memories. Agents can use it to update active repair ETAs.</p><div className="form-grid"><div><label htmlFor="where">Affected location</label><select id="where" value={place} onChange={e=>setPlace(e.target.value)}>{["Hostel A","Hostel B","Block C","Library","Mess"].map(x=><option key={x}>{x}</option>)}</select></div><div><label htmlFor="return-time">Expected power return</label><input id="return-time" type="time" value={until} onChange={e=>setUntil(e.target.value)} required/></div></div><label htmlFor="event-note">Additional detail</label><input id="event-note" value={note} onChange={e=>setNote(e.target.value)} placeholder="e.g. Transformer maintenance near north gate"/><button className="button button-dark" disabled={busy}><Activity size={15}/> Share campus update</button><small className="form-helper">{mode==="demo"?"Simulated update; no Meko calls will be made.":"This creates shared notes in Hostel and IT memory."}</small></form>
      <section className="surface-panel impact-panel"><div className="section-heading"><div><div className="eyebrow">LIVE IMPACT</div><h2>Requests in this area</h2></div><span className="count-pill">{affected.length}</span></div>{affected.length?affected.map(i=><IncidentRow key={i.id} incident={i} onClick={()=>{}}/>):<EmptyState icon={Activity} title="No active requests here" text="If a related repair opens, it will appear here."/>}</section></div>
      <aside className="electricity-side"><div className="surface-panel side-panel"><div className="eyebrow">SHARING MAP</div><h3>Who receives this update</h3><div className="share-target"><span className="share-icon hostel"><Wrench size={15}/></span><span><b>Hostel maintenance</b><small>sunwai-hostel memory</small></span><CheckCircle2 size={15}/></div><div className="share-target"><span className="share-icon it"><Wifi size={15}/></span><span><b>IT cell</b><small>sunwai-it memory</small></span><CheckCircle2 size={15}/></div><p className="share-note">Sharing happens through department notes, so every receiving agent can recall the same event.</p></div>
        <div className="surface-panel side-panel"><div className="section-heading"><div><div className="eyebrow">RECENT EVENTS</div><h3>Campus notices</h3></div></div>{events.length?events.slice(0,4).map(e=><div className="event-history" key={e.id}><span className="event-history-dot"/><div><b>Power update · {e.place}</b><small>Expected back at {e.until} · {e.note||"Maintenance"}</small><time>{shortTime(e.created)}</time></div></div>):<EmptyState icon={Clock3} title="No recent updates" text="Shared campus events will show here."/>}</div></aside></div></>;
}

function DeanPage({getDean}:{getDean:()=>Promise<DeanData>}){
  const [data,setData]=useState<DeanData>(initialDemo.dean);const [error,setError]=useState("");useEffect(()=>{let alive=true;getDean().then(d=>alive&&setData(d)).catch(e=>alive&&setError((e as Error).message));return()=>{alive=false;};},[getDean]);
  const top=data.patterns[0];const count=data.lessons.length;const departments=new Set(data.lessons.map(l=>l.dept)).size;
  const monthly=Array(12).fill(0) as number[];for(const lesson of data.lessons){const date=new Date(lesson.promoted_at||"");if(!Number.isNaN(date.getTime())&&date.getFullYear()===new Date().getFullYear())monthly[date.getMonth()]++;}const peak=Math.max(1,...monthly);
  return <><PageHeader eyebrow="LEADERSHIP VIEW · VERIFIED DATA" title="Campus reliability, at a glance." subtitle="Patterns come only from student-confirmed fixes that a responsible person approved into campus canon." action={<button className="button button-light"><Filter size={15}/> This semester <ChevronDown size={14}/></button>}/>
    {error&&<div className="inline-error">{error}</div>}<section className="stat-grid dean-stats"><StatCard label="Verified lessons" value={count} caption="Promoted to campus canon" icon={FileCheck2} trend="STUDENT CONFIRMED"/><StatCard label="Teams represented" value={departments} caption="Departments with verified memory" icon={Users} trend="CAMPUS WIDE"/><StatCard label="Latest promotion" value={data.lessons[0]?dateLabel(data.lessons[0].promoted_at):"—"} caption="Most recent verified lesson" icon={Clock3} trend="CANON" warm/><StatCard label="Evidence standard" value="100%" caption="Every pattern cites its source memories" icon={ShieldCheck} trend="VERIFIED ONLY"/></section>
    <div className="dean-grid"><section className="surface-panel pattern-hero"><div className="section-heading"><div><div className="eyebrow">THE PATTERN TO WATCH</div><h2>What campus memory is telling us</h2></div><span className="verified-seal"><ShieldCheck size={16}/> VERIFIED</span></div>{top?<><div className="pattern-text">{top.text}</div><div className="pattern-source"><span className="source-dots">{top.memory_ids.map(id=><i key={id}/>)}</span><span>Supported by {top.memory_ids.length} verified memory records</span></div><div className="spark-chart"><div className="chart-labels"><span>Verified lesson promotions · {new Date().getFullYear()}</span><b>{data.lessons.length} records</b></div><div className="chart-bars">{monthly.map((v,i)=><div key={i} className="chart-bar-wrap"><span className="chart-bar" style={{height:`${v?Math.max(7,v/peak*65):2}px`,opacity:v?1:.28}}/><small>{["J","F","M","A","M","J","J","A","S","O","N","D"][i]}</small></div>)}</div><div className="chart-baseline"><i/></div></div><div className="source-citations"><div className="eyebrow">SOURCE MEMORY IDS</div>{top.memory_ids.map(id=><code key={id}>{id}</code>)}</div></>:<EmptyState icon={Sparkles} title="Not enough evidence yet" text="Patterns appear when multiple verified lessons describe the same recurring issue."/>}</section>
      <section className="surface-panel cadence-panel"><div className="eyebrow">CANON LIBRARY</div><h2>Verified lesson records</h2><p className="muted-copy">Lessons are added after affected students confirm the fix and the responsible role approves it.</p>{data.lessons.map(l=><article className="lesson-record" key={l.memory_id}><div className="lesson-record-top"><span className="lesson-dept">{deptLabel(l.dept)}</span><time>{dateLabel(l.promoted_at)}</time></div><h3>{l.asset.replaceAll("_"," ")}</h3><p>{l.text}</p><code><Database size={12}/> {l.memory_id}</code></article>)}{!data.lessons.length&&<EmptyState icon={Database} title="Canon is empty" text="Approved lessons will be listed here."/>}</section></div></>;
}
