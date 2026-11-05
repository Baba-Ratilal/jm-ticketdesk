"use client";

import { useState } from "react";
import { STATUSES } from "@/lib/constants";
import { statusPill } from "@/lib/constants";

type Item = { id: string; status: string };

/**
 * Board with one column per status. Drag a card to another column to change its status.
 * On a phone (no dragging) every card also has a small "Move to…" menu.
 * `onMove` should save the change and reload the list; if it throws, the card jumps back.
 */
export default function Kanban<T extends Item>({
  items,
  onMove,
  renderCard,
}: {
  items: T[];
  onMove: (item: T, status: string) => Promise<void>;
  renderCard: (item: T) => React.ReactNode;
}) {
  const [moved, setMoved] = useState<Record<string, string>>({}); // shown straight away, before the save finishes
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const statusOf = (i: T) => moved[i.id] ?? i.status;

  async function move(item: T, status: string) {
    if (statusOf(item) === status) return;
    setMoved((m) => ({ ...m, [item.id]: status }));
    try {
      await onMove(item, status);
    } catch (e: any) {
      alert(e?.message || "Could not move it");
    } finally {
      setMoved((m) => {
        const { [item.id]: _gone, ...rest } = m;
        return rest;
      });
    }
  }

  return (
    <div className="kb" role="list">
      {STATUSES.map((s) => {
        const col = items.filter((i) => statusOf(i) === s);
        return (
          <section
            key={s}
            className={`kcol ${over === s ? "over" : ""}`}
            role="listitem"
            aria-label={`${s}, ${col.length} cards`}
            onDragOver={(e) => {
              if (dragId) {
                e.preventDefault();
                setOver(s);
              }
            }}
            onDragLeave={() => setOver((o) => (o === s ? null : o))}
            onDrop={(e) => {
              e.preventDefault();
              setOver(null);
              const item = items.find((i) => i.id === dragId);
              setDragId(null);
              if (item) move(item, s);
            }}
          >
            <header className="kh">
              <span className={`pill ${statusPill[s] || "neutral"}`}>{s}</span>
              <span className="kn">{col.length}</span>
            </header>
            <div className="kbody">
              {col.length === 0 && <p className="kempty">Nothing here</p>}
              {col.map((i) => (
                <div
                  key={i.id}
                  className={`kcard ${dragId === i.id ? "drag" : ""}`}
                  draggable
                  onDragStart={(e) => {
                    setDragId(i.id);
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", i.id);
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    setOver(null);
                  }}
                >
                  {renderCard(i)}
                  <select
                    className="in sel kmove"
                    aria-label="Move to"
                    value={statusOf(i)}
                    onChange={(e) => move(i, e.target.value)}
                  >
                    {STATUSES.map((x) => (
                      <option key={x} value={x}>
                        {x === statusOf(i) ? `Status: ${x}` : `Move to ${x}`}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
