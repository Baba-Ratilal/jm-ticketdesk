// Shared (browser + server) definitions for the Task Manager.
export const TASK_STATUSES = ["Open", "In Progress", "Done", "Not mine"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export type Task = {
  id: string;
  task_no: number;
  task: string;
  given_on: string;
  assigned_to: string;
  assignee_name: string | null;
  assigned_by: string;
  assigner_name: string | null;
  source: string | null;
  target_on: string | null;
  status: TaskStatus;
  remark: string | null;
  done_on: string | null;
  /** earlier target dates, oldest first: [{from, to}] */
  history: { from: string | null; to: string | null }[];
};

export type TaskEvent = { id: number; kind: string; old_value: string | null; new_value: string | null; actor_name: string | null; created_at: string };
export type PersonLite = { id: string; name: string };
