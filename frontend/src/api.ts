import type { DeanData, Incident, Role } from "./types";

export class ApiError extends Error {
  constructor(message: string, readonly status = 0) { super(message); }
}
async function request<T>(path:string, init?:RequestInit):Promise<T>{
  let response:Response;
  try { response=await fetch(path,{...init,headers:{"Content-Type":"application/json",...(init?.headers??{})}}); }
  catch { throw new ApiError("The Sunwai server could not be reached."); }
  const text=await response.text();
  let data:unknown;
  try{data=text?JSON.parse(text):null;}catch{data=text;}
  if(!response.ok){const detail=(data as {detail?:unknown}|null)?.detail;throw new ApiError(typeof detail==="string"?detail:`Request failed (${response.status}).`,response.status);}
  return data as T;
}
export const api={
  health:()=>request<{ok:boolean;meko_enabled:boolean;meko_error:string;llm_model:string}>("/api/health"),
  incidents:()=>request<Incident[]>("/api/incidents"),
  studentIncidents:(seed:string)=>request<Incident[]>(`/api/students/${encodeURIComponent(seed)}/incidents`),
  create:(student_seed:string,text:string)=>request<Incident>("/api/grievances",{method:"POST",body:JSON.stringify({student_seed,text})}),
  act:(id:string,actor_role:Role,action:string,note?:string,student_seed?:string)=>request<Incident>(`/api/incidents/${encodeURIComponent(id)}/actions`,{method:"POST",body:JSON.stringify({actor_role,action,note,student_seed})}),
  outage:(place:string,until:string,note:string)=>request<{notes_written:string[]}>("/api/dept-events",{method:"POST",body:JSON.stringify({actor_role:"electricity",kind:"power_cut",place,until,note})}),
  dean:()=>request<DeanData>("/api/dean/patterns"),
  meko:(enabled:boolean)=>request<{meko_enabled:boolean;meko_error:string}>("/api/meko",{method:"POST",body:JSON.stringify({enabled})}),
};
