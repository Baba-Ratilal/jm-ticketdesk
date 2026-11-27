// Excel export / import for tickets, issues and MOM points.
import ExcelJS from "exceljs";
import { query } from "./db";
import { PRIORITIES, STATUSES } from "./constants";
import { MOM_STATUSES } from "./mom";
import { TASK_STATUSES } from "./tasks";
import { getMasterLists } from "./masters";
import { HttpError } from "./http";
import { TEAM_CTE, TEAM_OPT } from "./tasks-server";

export type BulkKind = "tickets" | "issues" | "mom" | "tasks" | "managers";
export const BULK_KINDS: BulkKind[] = ["tickets", "issues", "mom", "tasks", "managers"];
export const MAX_IMPORT_ROWS = 2000;

type Col = { h: string; w: number };
const COLS: Record<BulkKind, Col[]> = {
  tickets: [
    { h: "Ticket No", w: 11 }, { h: "Type", w: 8 }, { h: "Category", w: 22 }, { h: "Priority", w: 10 }, { h: "Status", w: 12 },
    { h: "Description", w: 60 }, { h: "Unit", w: 16 }, { h: "Department", w: 18 }, { h: "ERP Module", w: 18 }, { h: "ERP Screen", w: 20 },
    { h: "Raised By (User ID)", w: 18 }, { h: "Raised Date", w: 13 }, { h: "Closed Date", w: 13 }, { h: "Assigned To (User ID)", w: 20 }, { h: "Target Date", w: 13 },
  ],
  issues: [
    { h: "Issue No", w: 10 }, { h: "Type", w: 8 }, { h: "Title", w: 40 }, { h: "Description", w: 60 }, { h: "Priority", w: 10 }, { h: "Status", w: 12 },
    { h: "ERP Module", w: 18 }, { h: "Raised Date", w: 13 }, { h: "Closed Date", w: 13 }, { h: "Assigned To (User ID)", w: 20 },
  ],
  mom: [
    { h: "Sr No", w: 8 }, { h: "MOM Date", w: 13 }, { h: "Point", w: 70 }, { h: "Target Date", w: 13 }, { h: "Status", w: 12 },
    { h: "Assigned To (User ID)", w: 20 }, { h: "Remark", w: 40 },
  ],
  tasks: [
    { h: "Task No", w: 9 }, { h: "Task", w: 70 }, { h: "Given Date", w: 13 }, { h: "Assigned To (User ID)", w: 22 }, { h: "Assigned By (User ID)", w: 22 },
    { h: "Source", w: 22 }, { h: "Target Date", w: 13 }, { h: "Status", w: 12 }, { h: "Remark", w: 40 },
  ],
  managers: [
    { h: "User ID", w: 18 }, { h: "Full Name", w: 28 }, { h: "Manager (User ID)", w: 20 },
  ],
};
const DATE_HEADERS = new Set(["Raised Date", "Closed Date", "Target Date", "MOM Date", "Given Date"]);
export const SHEET_NAME: Record<BulkKind, string> = { tickets: "Tickets", issues: "Issues", mom: "MOM", tasks: "Tasks", managers: "Managers" };

const ymd = (v: unknown) => (typeof v === "string" && v ? v.slice(0, 10) : "");
const who = (login: unknown, name: unknown) => String(login || name || "");

function toDate(s: string): Date | string {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + "T00:00:00Z") : s;
}

export async function exportRows(kind: BulkKind, me: { id: string; role: string }): Promise<any[][]> {
  if (kind === "tickets") {
    const rows = await query<any>(
      `SELECT t.ticket_no, t.type, t.category, t.priority, t.status, t.description, t.unit, t.department, t.erp_module, t.erp_screen,
              c.login_id AS c_login, c.full_name AS c_name, CONVERT(varchar(10), t.raised_date, 23) AS raised_on,
              CONVERT(varchar(10), t.closed_date, 23) AS closed_on, a.login_id AS a_login, a.full_name AS a_name,
              CONVERT(varchar(10), t.target_date, 23) AS target_on
         FROM dbo.tickets t JOIN dbo.users c ON c.id = t.created_by LEFT JOIN dbo.users a ON a.id = t.assigned_to
        ${me.role === "admin" ? "" : "WHERE t.assigned_to=@me OR t.assigned_to IS NULL"}
        ORDER BY t.ticket_no`,
      { me: me.id }
    );
    return rows.map((r) => [Number(r.ticket_no), r.type, r.category, r.priority, r.status, r.description, r.unit, r.department, r.erp_module, r.erp_screen,
      who(r.c_login, r.c_name), toDate(ymd(r.raised_on)), toDate(ymd(r.closed_on)), who(r.a_login, r.a_name), toDate(ymd(r.target_on))]);
  }
  if (kind === "issues") {
    const rows = await query<any>(
      `SELECT i.issue_no, i.type, i.title, i.description, i.priority, i.status, i.erp_module,
              CONVERT(varchar(10), i.raised_date, 23) AS raised_on, CONVERT(varchar(10), i.closed_date, 23) AS closed_on,
              a.login_id AS a_login, a.full_name AS a_name
         FROM dbo.issues i LEFT JOIN dbo.users a ON a.id = i.assigned_to ORDER BY i.issue_no`
    );
    return rows.map((r) => [Number(r.issue_no), r.type, r.title, r.description, r.priority, r.status, r.erp_module,
      toDate(ymd(r.raised_on)), toDate(ymd(r.closed_on)), who(r.a_login, r.a_name)]);
  }
  if (kind === "tasks") {
    const rows = await query<any>(
      `${TEAM_CTE}
       SELECT t.task_no, t.task, CONVERT(varchar(10), t.given_date, 23) AS given_on, a.login_id AS a_login, a.full_name AS a_name,
              b.login_id AS b_login, b.full_name AS b_name, t.source, CONVERT(varchar(10), t.target_date, 23) AS target_on, t.status, t.remark
         FROM dbo.tasks t JOIN dbo.users a ON a.id = t.assigned_to JOIN dbo.users b ON b.id = t.assigned_by
        ${me.role === "admin" ? "" : "WHERE t.assigned_to=@me OR t.assigned_by=@me OR t.assigned_to IN (SELECT id FROM team)"}
        ORDER BY t.task_no ${TEAM_OPT}`, { me: me.id });
    return rows.map((r) => [Number(r.task_no), r.task, toDate(ymd(r.given_on)), who(r.a_login, r.a_name), who(r.b_login, r.b_name), r.source, toDate(ymd(r.target_on)), r.status, r.remark]);
  }
  if (kind === "managers") {
    const rows = await query<any>(
      `SELECT u.login_id, u.full_name, m.login_id AS m_login, m.full_name AS m_name FROM dbo.users u LEFT JOIN dbo.users m ON m.id = u.manager_id WHERE u.active=1 ORDER BY u.full_name`);
    return rows.map((r) => [r.login_id, r.full_name, r.m_login || r.m_name || ""]);
  }
  const rows = await query<any>(
    `SELECT m.sr_no, CONVERT(varchar(10), m.mom_date, 23) AS mom_on, m.point, CONVERT(varchar(10), m.target_date, 23) AS target_on,
            m.status, a.login_id AS a_login, a.full_name AS a_name, m.remark
       FROM dbo.mom_points m LEFT JOIN dbo.users a ON a.id = m.assigned_to ORDER BY m.sr_no`
  );
  return rows.map((r) => [Number(r.sr_no), toDate(ymd(r.mom_on)), r.point, toDate(ymd(r.target_on)), r.status, who(r.a_login, r.a_name), r.remark]);
}

const EXAMPLES: Record<BulkKind, any[]> = {
  tickets: ["", "IT", "Hardware", "Medium", "Open", "Printer in accounts is not printing", "", "", "", "", "ru005", toDate("2026-11-20"), "", "", ""],
  issues: ["", "ERP", "Sales invoice print format wrong", "Details here", "High", "Open", "Sales", toDate("2026-11-20"), "", ""],
  mom: ["", toDate("2026-11-20"), "Share the backup plan with management", toDate("2026-12-05"), "Open", "", ""],
  tasks: ["", "Share the Q3 review deck", toDate("2026-11-25"), "ru005", "", "QBR", toDate("2026-12-05"), "Open", ""],
  managers: ["ru005", "Example Person", "ru001"],
};

export async function buildWorkbook(kind: BulkKind, data: any[][] | null, lists?: Awaited<ReturnType<typeof getMasterLists>>) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "JM TicketDesk";
  const ws = wb.addWorksheet(SHEET_NAME[kind], { views: [{ state: "frozen", ySplit: 1 }] });
  const cols = COLS[kind];
  ws.columns = cols.map((c) => ({ header: c.h, width: c.w }));
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } };
  head.alignment = { vertical: "middle" };
  cols.forEach((c, i) => {
    if (DATE_HEADERS.has(c.h)) ws.getColumn(i + 1).numFmt = "dd-mmm-yyyy";
  });
  for (const r of data ?? [EXAMPLES[kind]]) ws.addRow(r);
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  if (!data) {
    const info = wb.addWorksheet("Read me");
    info.getColumn(1).width = 28;
    info.getColumn(2).width = 90;
    const add = (a: string, b = "") => info.addRow([a, b]);
    add("How to use");
    info.getRow(1).font = { bold: true, size: 13 };
    add("1.", "Fill one row per item on the first sheet. The first row is only an EXAMPLE — overwrite or delete it, or it will be imported.");
    add("2.", "Leave the first column (number) empty — numbers are given automatically. Dates: dd-mm-yyyy or yyyy-mm-dd, not in the future.");
    add("3.", "User ID columns take the person's TicketDesk user ID (or exact full name). Assigned To must be an IT-team member or admin.");
    add("4.", "Resolved / Closed rows need a Closed Date (today is used if left empty). If any row has a problem nothing is imported and the problems are listed.");
    add("");
    add("Allowed values");
    info.getRow(info.rowCount).font = { bold: true };
    add("Type", "IT, ERP");
    add("Priority", PRIORITIES.join(", "));
    if (kind !== "managers") add("Status", (kind === "mom" ? MOM_STATUSES : kind === "tasks" ? TASK_STATUSES : STATUSES).join(", "));
    if (lists && kind === "tickets") {
      add("Category (IT)", lists.it_category.join(", "));
      add("Category (ERP)", lists.erp_category.join(", "));
      add("Unit", lists.unit.join(", "));
      add("Department", lists.department.join(", "));
    }
    if (lists && kind === "tasks") add("Source", lists.task_source.join(", "));
    if (lists && (kind === "tickets" || kind === "issues")) add("ERP Module", lists.erp_module.join(", "));
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ---------- reading an uploaded file ----------
function cellText(v: any): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("result" in v) return cellText(v.result);
    if ("text" in v) return String(v.text ?? "").trim();
    if ("richText" in v) return v.richText.map((x: any) => x.text).join("").trim();
    return "";
  }
  return String(v).trim();
}

function parseDate(raw: string, label: string, errs: string[]): string | null {
  if (!raw) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(raw);
  let y: number, mo: number, d: number;
  if (m) [y, mo, d] = [+m[1], +m[2], +m[3]];
  else if ((m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(raw))) [d, mo, y] = [+m[1], +m[2], +m[3]];
  else {
    errs.push(`${label} "${raw}" is not a date (use dd-mm-yyyy)`);
    return null;
  }
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1) {
    errs.push(`${label} "${raw}" is not a real date`);
    return null;
  }
  const s = dt.toISOString().slice(0, 10);
  if (s < "2020-01-01") errs.push(`${label} ${s} is too old`);
  return s;
}

const pick = (raw: string, allowed: readonly string[]) => allowed.find((a) => a.toLowerCase() === raw.toLowerCase());
const today = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);

type Person = { id: string; login_id: string | null; full_name: string | null; role: string };

export async function readSheet(buf: Buffer, kind: BulkKind) {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf as any);
  } catch {
    throw new HttpError(400, "That file could not be read. Upload an .xlsx file (use the template).");
  }
  const ws = wb.worksheets[0];
  if (!ws) throw new HttpError(400, "The file has no sheets");
  const want = COLS[kind].map((c) => c.h);
  const headerRow = ws.getRow(1);
  const idx: Record<string, number> = {};
  headerRow.eachCell((c, n) => {
    idx[cellText(c.value).toLowerCase()] = n;
  });
  const optional = (h: string) => /No$/.test(h) || h === "Full Name";
  const missing = want.filter((h) => !idx[h.toLowerCase()] && !optional(h));
  if (missing.length) throw new HttpError(400, `Wrong columns. Missing: ${missing.join(", ")}. Download the template and keep its headings.`);
  const rows: { n: number; get: (h: string) => string }[] = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const get = (h: string) => (idx[h.toLowerCase()] ? cellText(row.getCell(idx[h.toLowerCase()]).value) : "");
    if (want.some((h) => !optional(h) && get(h))) rows.push({ n, get });
  });
  if (!rows.length) throw new HttpError(400, "No rows found under the headings");
  if (rows.length > MAX_IMPORT_ROWS) throw new HttpError(400, `Too many rows (${rows.length}). Import at most ${MAX_IMPORT_ROWS} at a time.`);
  return rows;
}

export type ImportResult = { count: number; errors: string[] };

export async function importRows(kind: BulkKind, buf: Buffer, me: { id: string }, dry: boolean): Promise<ImportResult> {
  const rows = await readSheet(buf, kind);
  const people = await query<Person>("SELECT id, login_id, full_name, role FROM dbo.users WHERE active=1");
  const find = (raw: string, staffOnly: boolean) => {
    const k = raw.toLowerCase();
    return people.find((p) => (!staffOnly || p.role === "admin" || p.role === "agent") && (p.login_id?.toLowerCase() === k || p.full_name?.toLowerCase() === k));
  };
  const lists = await getMasterLists();
  const errors: string[] = [];
  const out: any[] = [];

  if (kind === "tasks") {
    for (const { n, get } of rows) {
      const errs: string[] = [];
      const task = get("Task").slice(0, 1000);
      if (task.length < 3) errs.push("Task is required");
      const toRaw = get("Assigned To (User ID)");
      const to = toRaw ? find(toRaw, false) : undefined;
      if (!to) errs.push(toRaw ? `Assigned To "${toRaw}" is not an active user` : "Assigned To is required");
      const byRaw = get("Assigned By (User ID)");
      const by = byRaw ? find(byRaw, false) : undefined;
      if (byRaw && !by) errs.push(`Assigned By "${byRaw}" is not an active user`);
      const source = get("Source");
      if (source && !lists.task_source.includes(source)) errs.push(`Source "${source}" is not in the Masters list`);
      const status = pick(get("Status") || "Open", TASK_STATUSES);
      if (!status) errs.push(`Status must be one of ${TASK_STATUSES.join(", ")}`);
      const given = parseDate(get("Given Date"), "Given Date", errs) || today();
      if (given > today()) errs.push("Given Date cannot be in the future");
      const target = parseDate(get("Target Date"), "Target Date", errs);
      out.push({ task, to: to?.id, by: by?.id ?? me.id, source: source || null, status, given, target, remark: get("Remark").slice(0, 1000) || null, done: status === "Done" ? today() : null });
      if (errs.length) errors.push(...errs.map((e) => `Row ${n}: ${e}`));
    }
    if (errors.length) return { count: 0, errors: errors.slice(0, 60) };
    if (dry) return { count: out.length, errors: [] };
    await query(
      `SET XACT_ABORT ON; BEGIN TRAN;
       DECLARE @ids TABLE (id UNIQUEIDENTIFIER);
       INSERT INTO dbo.tasks (task, given_date, assigned_to, assigned_by, source, target_date, status, remark, done_date)
       OUTPUT INSERTED.id INTO @ids
       SELECT task, given, [to], [by], source, target, status, remark, done
         FROM OPENJSON(@rows) WITH (task nvarchar(1000) '$.task', given date '$.given', [to] uniqueidentifier '$.to', [by] uniqueidentifier '$.by', source nvarchar(100) '$.source',
              target date '$.target', status nvarchar(20) '$.status', remark nvarchar(1000) '$.remark', done date '$.done');
       INSERT INTO dbo.task_events (task_id, actor_id, kind, old_value, new_value) SELECT id, @me, 'created', NULL, 'Imported from Excel' FROM @ids;
       COMMIT;`,
      { rows: JSON.stringify(out), me: me.id }
    );
    return { count: out.length, errors: [] };
  }

  if (kind === "managers") {
    const all = await query<{ id: string; login_id: string | null; manager_id: string | null }>("SELECT id, login_id, manager_id FROM dbo.users");
    const mgr = new Map(all.map((u) => [u.id, u.manager_id]));
    const changes: { id: string; manager: string | null }[] = [];
    for (const { n, get } of rows) {
      const errs: string[] = [];
      const uRaw = get("User ID");
      const u = uRaw ? find(uRaw, false) : undefined;
      if (!u) errs.push(`User "${uRaw}" is not an active user`);
      const mRaw = get("Manager (User ID)");
      const m = mRaw ? find(mRaw, false) : undefined;
      if (mRaw && !m) errs.push(`Manager "${mRaw}" is not an active user`);
      if (u && m && u.id === m.id) errs.push("A person cannot be their own manager");
      if (u && !errs.length) {
        mgr.set(u.id, m?.id ?? null);
        changes.push({ id: u.id, manager: m?.id ?? null });
      }
      if (errs.length) errors.push(...errs.map((e) => `Row ${n}: ${e}`));
    }
    // a reporting chain must never loop back on itself
    for (const c of changes) {
      let cur: string | null | undefined = c.manager, hops = 0;
      while (cur && hops++ < 60) {
        if (cur === c.id) { const who = people.find((p) => p.id === c.id); errors.push(`${who?.login_id || who?.full_name}: the reporting chain loops back on itself`); break; }
        cur = mgr.get(cur);
      }
    }
    if (errors.length) return { count: 0, errors: errors.slice(0, 60) };
    if (dry) return { count: changes.length, errors: [] };
    await query(
      `UPDATE u SET u.manager_id = j.manager FROM dbo.users u
         JOIN OPENJSON(@rows) WITH (id uniqueidentifier '$.id', manager uniqueidentifier '$.manager') j ON j.id = u.id`,
      { rows: JSON.stringify(changes) }
    );
    return { count: changes.length, errors: [] };
  }

  for (const { n, get } of rows) {
    const errs: string[] = [];
    const type = kind === "mom" ? "" : pick(get("Type"), ["IT", "ERP"]);
    if (kind !== "mom" && !type) errs.push("Type must be IT or ERP");
    const priority = kind === "mom" ? "" : (get("Priority") ? pick(get("Priority"), PRIORITIES) : "Medium");
    if (kind !== "mom" && !priority) errs.push(`Priority must be one of ${PRIORITIES.join(", ")}`);
    const status = pick(get("Status") || "Open", kind === "mom" ? MOM_STATUSES : STATUSES);
    if (!status) errs.push(`Status must be one of ${(kind === "mom" ? MOM_STATUSES : STATUSES).join(", ")}`);
    const asg = get("Assigned To (User ID)");
    let assignee: string | null = null;
    if (asg) {
      const p = find(asg, true);
      if (!p) errs.push(`Assigned To "${asg}" is not an active IT-team member or admin`);
      else assignee = p.id;
    }

    if (kind === "mom") {
      const momOn = parseDate(get("MOM Date"), "MOM Date", errs);
      if (!momOn) errs.push("MOM Date is required");
      const point = get("Point").slice(0, 1000);
      if (point.length < 3) errs.push("Point is required");
      out.push({ mom: momOn, point, target: parseDate(get("Target Date"), "Target Date", errs), status, assignee, remark: get("Remark").slice(0, 1000) || null });
    } else {
      const raised = parseDate(get("Raised Date"), "Raised Date", errs) || today();
      if (raised > today()) errs.push("Raised Date cannot be in the future");
      const done = status === "Resolved" || status === "Closed";
      let closed: string | null = null;
      if (done) {
        closed = parseDate(get("Closed Date"), "Closed Date", errs) || today();
        if (closed < raised) errs.push("Closed Date is before the Raised Date");
        if (closed > today()) errs.push("Closed Date cannot be in the future");
      }
      const description = get("Description").slice(0, 5000);
      const erpModule = get("ERP Module");
      if (type === "ERP" && erpModule && !lists.erp_module.includes(erpModule)) errs.push(`ERP Module "${erpModule}" is not in the Masters list`);
      if (kind === "issues") {
        const title = get("Title").slice(0, 150);
        if (title.length < 3) errs.push("Title is required");
        out.push({ type, title, description, priority, status, erp: type === "ERP" && erpModule ? erpModule : null, raised, closed, assignee });
      } else {
        if (description.length < 5) errs.push("Description is required");
        const cats = type === "IT" ? lists.it_category : lists.erp_category;
        const category = get("Category");
        if (!cats.includes(category)) errs.push(`Category "${category}" is not valid for ${type || "this type"}`);
        const unit = get("Unit"), dept = get("Department");
        if (unit && !lists.unit.includes(unit)) errs.push(`Unit "${unit}" is not in the Masters list`);
        if (dept && !lists.department.includes(dept)) errs.push(`Department "${dept}" is not in the Masters list`);
        const by = get("Raised By (User ID)");
        let creator = me.id;
        if (by) {
          const p = find(by, false);
          if (!p) errs.push(`Raised By "${by}" is not an active user`);
          else creator = p.id;
        }
        const firstLine = description.split(/\r?\n/).find((l) => l.trim()) || description;
        out.push({
          type, category, priority, status, title: firstLine.trim().replace(/\s+/g, " ").slice(0, 120), description,
          unit: unit || null, dept: dept || null, erp: type === "ERP" && erpModule ? erpModule : null,
          screen: type === "ERP" ? get("ERP Screen").slice(0, 150) || null : null,
          creator, raised, closed, assignee, target: parseDate(get("Target Date"), "Target Date", errs),
        });
      }
    }
    if (errs.length) errors.push(...errs.map((e) => `Row ${n}: ${e}`));
  }
  if (errors.length) return { count: 0, errors: errors.slice(0, 60).concat(errors.length > 60 ? [`…and ${errors.length - 60} more problems`] : []) };
  if (dry) return { count: out.length, errors: [] };

  const json = JSON.stringify(out);
  if (kind === "mom") {
    await query(
      `INSERT INTO dbo.mom_points (mom_date, point, target_date, status, assigned_to, remark, created_by)
       SELECT mom, point, target, status, assignee, remark, @me
         FROM OPENJSON(@rows) WITH (mom date '$.mom', point nvarchar(1000) '$.point', target date '$.target', status nvarchar(20) '$.status', assignee uniqueidentifier '$.assignee', remark nvarchar(1000) '$.remark')`,
      { rows: json, me: me.id }
    );
  } else if (kind === "issues") {
    await query(
      `SET XACT_ABORT ON; BEGIN TRAN;
       DECLARE @ids TABLE (id UNIQUEIDENTIFIER);
       INSERT INTO dbo.issues (type, title, description, priority, status, erp_module, created_by, assigned_to, raised_date, closed_date, created_at, updated_at, resolved_at)
       OUTPUT INSERTED.id INTO @ids
       SELECT type, title, description, priority, status, erp, @me, assignee, raised, closed,
              DATEADD(minute,-330,DATEADD(hour,9,CAST(raised AS datetime2))), SYSUTCDATETIME(),
              CASE WHEN closed IS NULL THEN NULL ELSE DATEADD(minute,-330,DATEADD(hour,12,CAST(closed AS datetime2))) END
         FROM OPENJSON(@rows) WITH (type nvarchar(10) '$.type', title nvarchar(150) '$.title', description nvarchar(max) '$.description', priority nvarchar(10) '$.priority',
              status nvarchar(20) '$.status', erp nvarchar(100) '$.erp', assignee uniqueidentifier '$.assignee', raised date '$.raised', closed date '$.closed');
       INSERT INTO dbo.issue_events (issue_id, actor_id, action, detail) SELECT id, @me, 'created', 'Imported from Excel' FROM @ids;
       COMMIT;`,
      { rows: json, me: me.id }
    );
  } else {
    await query(
      `SET XACT_ABORT ON; BEGIN TRAN;
       DECLARE @ids TABLE (id UNIQUEIDENTIFIER);
       INSERT INTO dbo.tickets (type, category, priority, status, title, description, unit, department, erp_module, erp_screen, created_by, assigned_to, raised_date, closed_date, target_date, created_at, updated_at, resolved_at)
       OUTPUT INSERTED.id INTO @ids
       SELECT type, category, priority, status, title, description, unit, dept, erp, screen, creator, assignee, raised, closed, target,
              DATEADD(minute,-330,DATEADD(hour,9,CAST(raised AS datetime2))), SYSUTCDATETIME(),
              CASE WHEN closed IS NULL THEN NULL ELSE DATEADD(minute,-330,DATEADD(hour,12,CAST(closed AS datetime2))) END
         FROM OPENJSON(@rows) WITH (type nvarchar(10) '$.type', category nvarchar(100) '$.category', priority nvarchar(10) '$.priority', status nvarchar(20) '$.status',
              title nvarchar(150) '$.title', description nvarchar(max) '$.description', unit nvarchar(100) '$.unit', dept nvarchar(100) '$.dept', erp nvarchar(100) '$.erp',
              screen nvarchar(150) '$.screen', creator uniqueidentifier '$.creator', assignee uniqueidentifier '$.assignee', raised date '$.raised', closed date '$.closed', target date '$.target');
       INSERT INTO dbo.ticket_events (ticket_id, actor_id, action, detail) SELECT id, @me, 'created', 'Imported from Excel' FROM @ids;
       COMMIT;`,
      { rows: json, me: me.id }
    );
  }
  return { count: out.length, errors: [] };
}
