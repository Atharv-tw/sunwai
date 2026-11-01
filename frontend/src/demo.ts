import type { DeanData, DemoEvent, Incident, Role } from "./types";

const now = Date.now();
const ago = (minutes: number) => new Date(now - minutes * 60_000).toISOString();
const tomorrow = (hour: number) => {
  const d = new Date(now + 60 * 60_000);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};
const timeline = (...items: [number, string, string][]) => items.map(([mins, actor, text]) => ({ ts: ago(mins), actor, text, scripted: true }));

export const DEMO_STUDENTS = [
  { seed: "demo-hostel-a-204", label: "Aarav · Hostel A, room 204", id: "S-7a2f" },
  { seed: "demo-hostel-a-207", label: "Mira · Hostel A, room 207", id: "S-8b31" },
  { seed: "demo-hostel-b-311", label: "Kabir · Hostel B, room 311", id: "S-13c9" },
  { seed: "demo-block-c-01", label: "Nisha · Block C", id: "S-90ae" },
  { seed: "demo-mess-01", label: "Dev · Mess resident", id: "S-42d1" },
];

const initialIncidents: Incident[] = [
  {
    id: "INC-1048", dept: "hostel", category: "Hostel maintenance", place: "Hostel A · 2nd floor", severity: "medium",
    safety_risk: false, summary: "Geyser not heating since morning", asset: "geyser", status: "fixed", reporters: 3,
    eta: ago(-15), eta_reason: "Caretaker recorded the repair. Waiting for the students who reported it to confirm.",
    plan: "Check the thermostat and breaker, then test the unit under load.", awaiting: "student", studentSeeds: ["demo-hostel-a-204", "demo-hostel-a-207"],
    reportText: "The geyser on floor 2 is cold again. No hot water since 7am.", confirmations: { held: 0, broken: 0 },
    timeline: timeline([188,"student","Reported no hot water in Hostel A, floor 2."],[184,"Desk","Grouped 3 similar reports into INC-1048."],[172,"Hostel agent","Recalled last winter’s breaker reset and proposed a thermostat check."],[61,"Caretaker","Approved the repair plan."],[16,"Caretaker","Replaced the thermostat and reset the breaker. (42 min)"],[15,"Curator","Fix recorded. Waiting for student confirmation."]),
    context: [{ datapack:"sunwai-hostel", source:"memory", memory_id:"demo-hostel-91a", text:"Similar geyser fault: thermostat drift caused repeated breaker trips; reset breaker and set thermostat to 55°C." }, { datapack:"sunwai-canon", source:"knowledgebase", memory_id:"demo-canon-42b", text:"Verified lesson: reset breaker, set thermostat to 55°C; confirmed in Hostel A and Hostel B." }],
  },
  {
    id: "INC-1047", dept: "it", category: "Network", place: "Block C · floors 1–3", severity: "high", safety_risk: false,
    summary: "Wi-Fi drops across Block C every evening", asset: "router", status: "assigned", reporters: 18,
    eta: tomorrow(20), eta_reason: "IT cell is checking the overheating router and power adapter.",
    plan: "Inspect the Block C router cabinet, test the power adapter, and check evening load.", awaiting: "it_cell",
    reportText: "Block C Wi-Fi keeps dying around 9pm. We can connect but nothing loads.", confirmations:{held:0,broken:0},
    timeline: timeline([94,"student","Reported recurring evening outage in Block C."],[91,"Desk","Merged 18 matching reports into INC-1047."],[83,"IT agent","Recalled two verified overheating-router fixes from campus canon."],[78,"Desk","Sent the shared incident to the IT cell."]),
    context:[{datapack:"sunwai-it",source:"memory",memory_id:"demo-it-2dd",text:"Router in Block C overheated inside a closed cabinet; vents and replacement adapter stopped evening drops."},{datapack:"sunwai-canon",source:"knowledgebase",memory_id:"demo-canon-81e",text:"Verified: move router out of cabinet and replace swollen adapter. Resolved two evening outages."}],
  },
  {
    id: "INC-1046", dept: "mess", category: "Food safety", place: "Main Mess · dinner service", severity: "critical", safety_risk: true,
    summary: "Several students sick after Tuesday dinner", asset: "food", status: "lesson_pending", reporters: 5,
    eta: null, eta_reason: "The food-safety response was completed; committee review is needed before the lesson is saved.",
    plan: "Hold the paneer batch, retain samples, and document the cold-chain check.", awaiting: "mess_committee",
    reportText: "Five people felt ill after dinner. The paneer smelled off.", confirmations:{held:4,broken:0},
    lesson:{text:"Paneer batch was held after multiple reports of illness; samples retained for testing.",memory_id:"demo-lesson-pending",status:"draft"},
    timeline: timeline([800,"student","Reported illness after dinner; safety escalation opened."],[787,"Mess agent","Escalated the cluster as a food-safety incident."],[668,"Mess committee","Held the batch and kept samples for review."],[552,"student","Confirmed symptoms resolved after the response."],[550,"Curator","Drafted a lesson for committee approval."]),
  },
  {
    id: "INC-1044", dept: "hostel", category: "Plumbing", place: "Hostel B · ground floor", severity: "low", safety_risk: false,
    summary: "Bathroom tap leaking overnight", asset: "tap", status: "in_progress", reporters: 2,
    eta: tomorrow(14), eta_reason: "Caretaker is replacing a worn washer.", plan:"Replace the tap washer and check the joint for cracks.", awaiting:"caretaker",
    confirmations:{held:0,broken:0},timeline:timeline([2400,"student","Reported a leaking bathroom tap."],[2320,"Caretaker","Approved the washer replacement plan."]),
  },
  {
    id:"INC-1045",dept:"hostel",category:"Electrical maintenance",place:"Hostel A · 3rd floor",severity:"medium",safety_risk:false,
    summary:"Ceiling lights flickering in the east corridor",asset:"lighting",status:"lesson_pending",reporters:6,awaiting:"warden",
    plan:"Replace the failing ballast and check the corridor circuit for a loose neutral.",eta:null,
    eta_reason:"Repair completed and confirmed by the affected students; waiting for warden approval.",
    lesson:{text:"The corridor lights flickered because the ballast was failing. Replacing the ballast resolved the issue and passed the load test.",memory_id:"demo-draft-inc-1045",status:"draft"},
    confirmations:{held:5,broken:0},
    timeline:timeline([1200,"student","Reported flickering lights in the east corridor."],[1170,"Hostel agent","Recalled two electrical faults on this floor and proposed ballast inspection."],[1100,"Caretaker","Replaced the ballast and checked the circuit."],[1050,"student","Five residents confirmed the lights are stable."],[1048,"Curator","Drafted a lesson. Waiting for the Warden."]),
    context:[{datapack:"sunwai-hostel",source:"memory",memory_id:"demo-hostel-a61",text:"Last corridor light fault traced to a failing ballast; neutral connection tested before replacement."}],
  },
  {
    id:"INC-1043",dept:"hostel",category:"Hostel maintenance",place:"Hostel B · 1st floor",severity:"high",safety_risk:false,
    summary:"Bathroom exhaust fan stopped working",asset:"fan",status:"assigned",reporters:4,awaiting:"caretaker",
    plan:"Inspect the fan capacitor and isolate the circuit before replacing the unit.",eta:tomorrow(16),
    eta_reason:"Caretaker needs to approve the proposed inspection and safe isolation plan.",confirmations:{held:0,broken:0},
    timeline:timeline([530,"student","Reported the bathroom fan has stopped."],[512,"Desk","Grouped four matching reports into INC-1043."],[500,"Hostel agent","Suggested capacitor test and a circuit safety check."]),
    context:[{datapack:"sunwai-hostel",source:"memory",memory_id:"demo-hostel-b13",text:"Bathroom fan stopped after a capacitor failure. Isolate circuit before replacing capacitor."}],
  },
  {
    id: "INC-1041", dept: "it", category: "Network", place: "Library · east wing", severity: "medium", safety_risk: false,
    summary: "Library Wi-Fi unable to assign an IP address", asset: "router", status: "closed", reporters: 7,
    eta: null, eta_reason:"Resolved and verified by reporters.",plan:"Expand the DHCP pool and monitor lease availability.",awaiting:null,
    lesson:{text:"DHCP pool ran out during exam-week load. Expanded address pool; resolved in 40 min.",memory_id:"demo-canon-711",status:"promoted"},confirmations:{held:6,broken:0},
    timeline:timeline([9000,"student","Reported no internet in the east wing."],[8800,"IT cell","Expanded the DHCP pool."],[8600,"student","Confirmed the connection stayed stable."],[8500,"IT cell","Approved the verified lesson to canon."]),
  },
];

const storageKey = "sunwai.demo.v2";
type DemoState = { incidents: Incident[]; events: DemoEvent[]; dean: DeanData };
const initialState = (): DemoState => ({
  incidents: structuredClone(initialIncidents), events: [],
  dean: {
    patterns:[
      {text:"RO filter cartridges needed a verified replacement about every 40 days; the next service window is approaching.",memory_ids:["demo-canon-ro-1","demo-canon-ro-2","demo-canon-ro-3","demo-canon-ro-4"]},
      {text:"Block C evening Wi-Fi drops were repeatedly caused by router heat and failing adapters.",memory_ids:["demo-canon-81e","demo-canon-28f"]},
    ],
    lessons:[
      {memory_id:"demo-canon-ro-1",dept:"mess",asset:"ro_water",promoted_at:"2026-06-10",text:"RO water tasted salty; filter cartridge clogged. Replaced cartridge and flushed tank (60 min)."},
      {memory_id:"demo-canon-ro-2",dept:"mess",asset:"ro_water",promoted_at:"2026-07-21",text:"RO flow low and cloudy; cartridge clogged again. Replaced cartridge (55 min)."},
      {memory_id:"demo-canon-81e",dept:"it",asset:"router",promoted_at:"2026-08-04",text:"Block C Wi-Fi down every evening; router overheated in closed cabinet. Replaced adapter and opened vents (90 min)."},
    ],
  },
});

export function readDemo(): DemoState {
  try { const raw=localStorage.getItem(storageKey); if (raw) return JSON.parse(raw) as DemoState; } catch { /* use fresh sample */ }
  return initialState();
}
export function writeDemo(state: DemoState) { localStorage.setItem(storageKey, JSON.stringify(state)); }
export function clearDemo() { localStorage.removeItem(storageKey); }

export function demoAction(incidents: Incident[], id: string, role: Role, action: string, note?: string): Incident[] {
  const nowText = new Date().toISOString();
  return incidents.map((item) => {
    if (item.id !== id) return item;
    const inc = structuredClone(item);
    const timeline = [...(inc.timeline ?? [])];
    const add = (actor: string, text: string) => timeline.push({ts:nowText,actor,text,scripted:true});
    if (action === "approve_plan") { inc.status="in_progress"; inc.awaiting=inc.dept === "hostel" ? "caretaker" : role; add(role,"Approved the proposed plan."+(note?` ${note}`:"")); }
    if (action === "record_fix") { inc.status="fixed"; inc.awaiting="student"; inc.eta=null; inc.eta_reason="Fix recorded. Waiting for the students who reported it to confirm."; inc.plan=inc.plan||"Staff completed the repair."; inc.lesson={text:`${note||"Repair completed."} Verified by affected students; ready for approver review.`,memory_id:"demo-draft-"+inc.id.toLowerCase(),status:"draft"}; add(role,`Recorded the fix: ${note||"Repair completed."}`); }
    if (action === "confirm_fixed") { inc.confirmations={held:(inc.confirmations?.held??0)+1,broken:inc.confirmations?.broken??0}; inc.status="lesson_pending"; inc.awaiting=inc.dept === "hostel" ? "warden" : inc.dept === "mess" ? "mess_committee" : "it_cell"; if(inc.lesson) inc.lesson.status="draft"; add("student","Confirmed the fix held. Lesson is ready for staff review."); }
    if (action === "still_broken") { inc.confirmations={held:inc.confirmations?.held??0,broken:(inc.confirmations?.broken??0)+1}; inc.status="in_progress"; inc.awaiting=inc.dept === "hostel" ? "caretaker" : inc.dept === "mess" ? "mess_committee" : "it_cell"; add("student",`Reported that the issue is still present${note?`: ${note}`:"."}`); }
    if (action === "approve_lesson") { inc.status="closed"; inc.awaiting=null; if(inc.lesson) inc.lesson.status="promoted"; add(role,"Approved the verified lesson for campus canon."); }
    if (action === "reject_lesson") { inc.status="closed"; inc.awaiting=null; if(inc.lesson) inc.lesson.status="rejected"; add(role,`Rejected the draft lesson${note?`: ${note}`:"."}`); }
    inc.timeline=timeline;
    return inc;
  });
}

export function newDemoIncident(text:string, seed:string): Incident {
  const stripped=text.trim();
  const lower=stripped.toLowerCase();
  const dept:Incident["dept"]=/mess|food|sick|water/.test(lower)?"mess":/wifi|wi-fi|internet|network|router/.test(lower)?"it":"hostel";
  const place=/block c/.test(lower)?"Block C · floor 2":/hostel b/.test(lower)?"Hostel B":dept==="mess"?"Main Mess":"Hostel A · 2nd floor";
  const route:Role=dept==="hostel"?"caretaker":dept==="mess"?"mess_committee":"it_cell";
  const label=dept==="hostel"?"Hostel maintenance":dept==="mess"?"Mess":"Network";
  return {id:`DEMO-${String(Math.floor(Math.random()*9000)+1000)}`,dept,category:label,place,severity:dept==="mess"?"high":"medium",safety_risk:dept==="mess",summary:stripped.length>72?stripped.slice(0,69)+"…":stripped,asset:dept==="mess"?"food":dept==="it"?"router":"maintenance",status:"assigned",reporters:1,awaiting:route,studentSeeds:[seed],reportText:stripped,plan:"Review the report, inspect the affected area, and record a clear repair plan.",eta:tomorrow(17),eta_reason:"A staff member has been assigned. The estimate will be updated after inspection.",confirmations:{held:0,broken:0},timeline:[{ts:new Date().toISOString(),actor:"student",text:"Submitted a new campus help request.",scripted:true},{ts:new Date().toISOString(),actor:"Desk",text:`Categorized as ${label} and sent it to the ${route.replaceAll("_"," ")} team.`,scripted:true}]};
}
