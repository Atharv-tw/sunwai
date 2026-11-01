export type Mode = "demo" | "live";
export type Role = "student" | "caretaker" | "warden" | "mess_committee" | "it_cell" | "electricity" | "dean";
export type Status = "reported" | "assigned" | "in_progress" | "fixed" | "verified" | "lesson_pending" | "closed";

export interface TimelineEntry {
  ts: string;
  actor: string;
  text: string;
  scripted?: boolean;
}
export interface MemoryContext {
  datapack: string;
  source: string;
  memory_id: string;
  text: string;
}
export interface Incident {
  id: string;
  dept: "hostel" | "mess" | "it" | "desk";
  category: string;
  place: string;
  severity: "low" | "medium" | "high" | "critical" | string;
  safety_risk: boolean;
  summary: string;
  asset?: string;
  status: Status;
  reporters: number;
  eta?: string | null;
  eta_reason?: string;
  plan?: string;
  context?: MemoryContext[];
  timeline?: TimelineEntry[];
  awaiting?: Role | null;
  lesson?: { text: string; memory_id?: string; status: string } | null;
  working?: string | null;
  confirmations?: { held: number; broken: number };
  studentSeeds?: string[];
  reportText?: string;
}
export interface DeanData {
  lessons: { memory_id: string; dept: string; asset: string; text: string; promoted_at?: string }[];
  patterns: { text: string; memory_ids: string[] }[];
}
export interface DemoEvent {
  id: string;
  place: string;
  until: string;
  note: string;
  created: string;
}
