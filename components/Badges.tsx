import { priorityLevel, statusPill } from "@/lib/constants";

export function StatusBadge({ status }: { status: string }) {
  return <span className={`pill ${statusPill[status] || "neutral"}`}>{status}</span>;
}

export function TypeBadge({ type }: { type: string }) {
  return <span className={`pill ${type === "ERP" ? "violet" : "info"}`}>{type}</span>;
}

/** Priority shown as a 4-segment meter, like the stock level in the shop app. */
export function PriorityBadge({ priority, label = true }: { priority: string; label?: boolean }) {
  const level = priorityLevel[priority] || 1;
  return (
    <span className="pm" title={`${priority} priority`}>
      <span className={`vu p${level}`} aria-hidden="true">
        {[1, 2, 3, 4].map((n) => (
          <i key={n} className={n <= level ? "on" : ""} />
        ))}
      </span>
      {label && priority}
    </span>
  );
}
