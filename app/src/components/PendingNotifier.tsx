"use client";
import { useEffect, useRef, useState } from "react";
import { Bell, BellOff, BellRing } from "lucide-react";

const POLL_MS = 60_000;

export default function PendingNotifier({ initialPending }: { initialPending: number }) {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const lastCount = useRef(initialPending);

  useEffect(() => {
    setPermission(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  }, []);

  useEffect(() => {
    if (permission !== "granted") return;
    const poll = async () => {
      try {
        const r = await fetch("/api/admin/pending-count");
        if (!r.ok) return;
        const { n } = await r.json();
        if (n > lastCount.current) {
          const added = n - lastCount.current;
          const notif = new Notification("New photos to review", { body: `${added} new photo${added === 1 ? "" : "s"} waiting` });
          notif.onclick = () => { window.focus(); location.href = "/admin/queue"; };
        }
        lastCount.current = n;
      } catch {}
    };
    const id = setInterval(poll, POLL_MS);
    return () => clearInterval(id);
  }, [permission]);

  if (permission === "unsupported") return null;

  const request = async () => { const p = await Notification.requestPermission(); setPermission(p); };

  if (permission === "granted") return <span title="Browser notifications enabled for new queue items" className="text-emerald-400"><BellRing size={16} /></span>;
  if (permission === "denied") return <span title="Notifications are blocked for this site in your browser settings" className="text-[var(--text-3)] opacity-50"><BellOff size={16} /></span>;
  return (
    <button onClick={request} title="Enable browser notifications when new photos are submitted" className="text-[var(--text-3)] transition hover:text-[var(--text)]">
      <Bell size={16} />
    </button>
  );
}
