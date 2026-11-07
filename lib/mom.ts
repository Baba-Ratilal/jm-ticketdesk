export const MOM_STATUSES = ["Open", "In Progress", "On Hold", "Done"] as const;
export type MomPoint = {
  id: string;
  sr_no: number;
  mom_on: string;
  point: string;
  target_on: string | null;
  status: string;
  assigned_to: string | null;
  assignee_name: string | null;
  remark: string | null;
};
