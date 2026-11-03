import { query } from "./db";
import { emailTemplate, esc, sendMail } from "./email";

type Ev = "created" | "assigned" | "status" | "comment";

/**
 * Sends the right Outlook emails for a ticket event. Runs in the background:
 * callers do not wait for it, and a failed email never blocks the user.
 */
export async function notifyEvent(event: Ev, ticketId: string, actorId: string, extra?: { status?: string }) {
  const [t] = await query("SELECT * FROM dbo.tickets WHERE id=@id", { id: ticketId });
  if (!t) return;
  const users = await query("SELECT id, email, full_name, role FROM dbo.users WHERE id IN (@a, @c) OR id = @s", {
    a: actorId,
    c: t.created_by,
    s: t.assigned_to ?? actorId,
  });
  const byId = (id: string | null) => users.find((u: any) => u.id === id);
  const actor = byId(actorId);
  const creator = byId(t.created_by);
  const assignee = byId(t.assigned_to);
  const actorIsAdmin = actor?.role === "admin" || actor?.role === "agent";

  const base = (process.env.NEXTAUTH_URL || "").replace(/\/$/, "");
  const common = {
    ticketUrl: `${base}/tickets/${t.id}`,
    ticketNo: Number(t.ticket_no),
    title: String(t.title),
  };
  const subjTitle = String(t.title).replace(/[\r\n]+/g, " ");

  const supportInbox = async (): Promise<string[]> => {
    const configured = (process.env.ADMIN_ALERT_EMAILS || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (configured.length) return configured;
    const admins = await query<{ email: string }>("SELECT email FROM dbo.users WHERE role IN ('admin','agent') AND active=1");
    return admins.map((a) => a.email);
  };

  const jobs: Promise<unknown>[] = [];

  if (event === "created") {
    jobs.push(
      sendMail(
        await supportInbox(),
        `[${t.type}] New ticket #${t.ticket_no}: ${subjTitle}`,
        emailTemplate({
          ...common,
          heading: "New ticket raised",
          lines: [
            `<b>${esc(creator?.full_name || creator?.email || "")}</b> (${esc([t.unit, t.department].filter(Boolean).join(" · "))})`,
            `<b>${esc(t.type)}</b> · ${esc(t.category)} · Priority: <b>${esc(t.priority)}</b>`,
            esc(String(t.description)).slice(0, 400).replace(/\n/g, "<br>"),
          ],
        })
      )
    );
    if (creator?.email)
      jobs.push(
        sendMail(
          creator.email,
          `Ticket #${t.ticket_no} received`,
          emailTemplate({
            ...common,
            heading: "We've received your ticket",
            lines: ["Our team will look into it shortly. You can track progress and reply from the link below."],
          })
        )
      );
  }

  if (event === "assigned" && assignee) {
    jobs.push(
      sendMail(
        assignee.email,
        `Ticket #${t.ticket_no} assigned to you`,
        emailTemplate({
          ...common,
          heading: "A ticket was assigned to you",
          lines: [
            `<b>${esc(t.type)}</b> · ${esc(t.category)} · Priority: <b>${esc(t.priority)}</b>`,
            `Raised by ${esc(creator?.full_name || creator?.email || "")}`,
          ],
        })
      )
    );
    if (creator?.email && creator.id !== assignee.id)
      jobs.push(
        sendMail(
          creator.email,
          `Ticket #${t.ticket_no} is being handled`,
          emailTemplate({
            ...common,
            heading: "Your ticket has been assigned",
            lines: [`<b>${esc(assignee.full_name || assignee.email)}</b> is now working on it.`],
          })
        )
      );
  }

  if (event === "status" && creator?.email && creator.id !== actorId) {
    const st = String(extra?.status || t.status);
    jobs.push(
      sendMail(
        creator.email,
        `Ticket #${t.ticket_no} is now ${st}`,
        emailTemplate({
          ...common,
          heading: `Status updated: ${st}`,
          lines: [
            st === "Resolved"
              ? "Your ticket has been marked resolved. If the problem continues, reply on the ticket and it will be reopened."
              : "Open the ticket to see the latest update.",
          ],
        })
      )
    );
  }

  if (event === "comment") {
    if (actorIsAdmin) {
      if (creator?.email && creator.id !== actorId)
        jobs.push(
          sendMail(
            creator.email,
            `New reply on ticket #${t.ticket_no}`,
            emailTemplate({ ...common, heading: "Support replied to your ticket", lines: ["Open the ticket to read the reply."] })
          )
        );
    } else {
      const to = assignee?.email ? [assignee.email] : await supportInbox();
      jobs.push(
        sendMail(
          to,
          `Reply from user on ticket #${t.ticket_no}`,
          emailTemplate({
            ...common,
            heading: "The user replied",
            lines: [`<b>${esc(actor?.full_name || actor?.email || "")}</b> added a reply to this ticket.`],
          })
        )
      );
    }
  }

  const results = await Promise.allSettled(jobs);
  for (const r of results) if (r.status === "rejected") console.error("Email error:", String(r.reason));
}

/** Fire and forget — safe because this is a long-running server, not serverless. */
export function notifyInBackground(event: Ev, ticketId: string, actorId: string, extra?: { status?: string }) {
  notifyEvent(event, ticketId, actorId, extra).catch((e) => console.error("notify failed:", e));
}
