"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "./Icon";

type Item = { file: File; url: string };

/**
 * Lets the user attach screenshots by:
 *  - uploading images (or taking a photo on a phone)
 *  - pasting from the clipboard (Ctrl/Cmd+V, e.g. after Win+Shift+S or Cmd+Shift+4)
 *  - capturing the screen / a window / a tab directly in the page (needs HTTPS)
 */
export default function ScreenshotPicker({
  files,
  onChange,
  max = 6,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  max?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [capturing, setCapturing] = useState(false);
  const [msg, setMsg] = useState("");
  const [canCapture, setCanCapture] = useState(false);

  useEffect(() => {
    setCanCapture(
      typeof navigator !== "undefined" &&
        !!navigator.mediaDevices &&
        typeof navigator.mediaDevices.getDisplayMedia === "function"
    );
  }, []);

  // keep previews in sync with files
  useEffect(() => {
    const next = files.map((f) => ({ file: f, url: URL.createObjectURL(f) }));
    setItems(next);
    return () => next.forEach((i) => URL.revokeObjectURL(i.url));
  }, [files]);

  const add = useCallback(
    (incoming: File[]) => {
      const imgs = incoming.filter((f) => f.type.startsWith("image/"));
      if (!imgs.length) return;
      const merged = [...files, ...imgs].slice(0, max);
      setMsg(files.length + imgs.length > max ? `Maximum ${max} screenshots per ticket.` : "");
      onChange(merged);
    },
    [files, max, onChange]
  );

  // paste from clipboard anywhere on the page
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const pasted: File[] = [];
      for (const it of Array.from(e.clipboardData?.items || [])) {
        if (it.kind === "file" && it.type.startsWith("image/")) {
          const f = it.getAsFile();
          if (f) {
            const ext = f.type.split("/")[1] || "png";
            pasted.push(new File([f], `pasted-${Date.now()}.${ext}`, { type: f.type }));
          }
        }
      }
      if (pasted.length) {
        e.preventDefault();
        add(pasted);
      }
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [add]);

  async function capture() {
    setMsg("");
    setCapturing(true);
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const video = document.createElement("video");
      video.srcObject = stream;
      video.muted = true;
      await video.play();
      // let the browser's "sharing" banner disappear so it isn't in the shot
      await new Promise((r) => setTimeout(r, 600));
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d")!.drawImage(video, 0, 0);
      const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/png"));
      if (blob) add([new File([blob], `screenshot-${Date.now()}.png`, { type: "image/png" })]);
    } catch (e: any) {
      if (e?.name !== "NotAllowedError") setMsg("Could not capture the screen. Try upload or paste instead.");
    } finally {
      stream?.getTracks().forEach((t) => t.stop());
      setCapturing(false);
    }
  }

  return (
    <div>
      <div className="acts">
        {canCapture && (
          <button type="button" onClick={capture} disabled={capturing} className="btn pri sm">
            <Icon name="camera" size={16} />
            {capturing ? "Capturing…" : "Capture screen"}
          </button>
        )}
        <button type="button" onClick={() => inputRef.current?.click()} className="btn sm">
          <Icon name="upload" size={16} />
          Upload / take photo
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          multiple
          style={{ display: "none" }}
          onChange={(e) => {
            add(Array.from(e.target.files || []));
            e.target.value = "";
          }}
        />
      </div>
      <p className="fine" style={{ marginTop: 8 }}>
        Tip: you can also press <kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>V</kbd> to paste a copied screenshot.
        {canCapture && " Capture lets you pick the ERP window or tab you want to show."}
      </p>
      {msg && (
        <p className="fine" style={{ marginTop: 4, color: "var(--warn)" }}>
          {msg}
        </p>
      )}

      {items.length > 0 && (
        <div className="shots" style={{ marginTop: 12 }}>
          {items.map((it, i) => (
            <div key={it.url} className="shot" style={{ cursor: "default" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={it.url} alt={it.file.name} />
              <button
                type="button"
                className="x"
                aria-label="Remove screenshot"
                onClick={() => onChange(files.filter((_, idx) => idx !== i))}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
