"use client";
import { useState } from "react";
import type { Request } from "@/lib/data";
import { FeeLines, Icon } from "./ui";

export function Messages({ r }: { r: Request }) {
  const [msgs, setMsgs] = useState(r.messages);
  const [text, setText] = useState("");
  const send = () => {
    if (!text.trim()) return;
    setMsgs([...msgs, { who: "You", initials: "AU", me: true, time: "Just now", body: text.trim() }]);
    setText("");
  };
  return (
    <section id="messages" className="card" aria-labelledby="msg-h">
      <div className="card-head"><h2 id="msg-h" className="d" style={{ fontSize: 18 }}>Messages</h2><span className="mut" style={{ fontSize: 13 }}>Also on WhatsApp</span></div>
      <div className="stack g16" style={{ padding: 20 }} aria-live="polite">
        {msgs.length === 0 && <p className="hint">No messages yet. Your agent will write here and on WhatsApp.</p>}
        {msgs.map((m, i) => (
          <div key={i} className="row g10" style={{ alignItems: "flex-start", flexDirection: m.me ? "row-reverse" : "row" }}>
            <span className="av" style={{ width: 32, height: 32, fontSize: 12, background: m.me ? "var(--ink)" : undefined, color: m.me ? "#fff" : undefined }}>{m.initials}</span>
            <div className="stack g4" style={{ maxWidth: "78%", alignItems: m.me ? "flex-end" : "flex-start" }}>
              <span className="mut" style={{ fontSize: 12 }}><strong style={{ color: "var(--ink)" }}>{m.who}</strong> · {m.time}</span>
              <p style={{ padding: "10px 14px", borderRadius: 8, fontSize: 14, lineHeight: 1.5, background: m.me ? "var(--ink)" : "var(--bone)", color: m.me ? "var(--bone)" : undefined }}>{m.body}</p>
            </div>
          </div>
        ))}
      </div>
      <form className="row g10" style={{ padding: "14px 20px", borderTop: "1px solid var(--line)" }} onSubmit={(e) => { e.preventDefault(); send(); }}>
        <label className="btn btn-g btn-ico btn-sm" aria-label="Attach file" style={{ cursor: "pointer" }}><Icon name="clip" size={18} /><input type="file" className="sr-only" /></label>
        <label htmlFor="rm" className="sr-only">Message</label>
        <input id="rm" className="in" value={text} onChange={(e) => setText(e.target.value)} placeholder={`Write to ${r.agent.split(" ")[0]}…`} style={{ height: 44 }} />
        <button className="btn btn-d" type="submit" aria-label="Send message"><Icon name="send" size={18} /></button>
      </form>
    </section>
  );
}

export function PayButton({ r }: { r: Request }) {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<"form" | "sending" | "sent">("form");
  const [num, setNum] = useState("+250 788 123 456");
  return (
    <>
      <button className="btn btn-p" type="button" onClick={() => { setOpen(true); setStage("form"); }}>Pay {r.payment.total}</button>
      {open && (
        <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="pay-t">
            <div className="row between" style={{ alignItems: "flex-start" }}><h3 id="pay-t" className="d" style={{ fontSize: 20 }}>{stage === "sent" ? "Check your phone" : "Confirm and pay"}</h3><button className="btn btn-g btn-sm btn-ico" type="button" aria-label="Close" onClick={() => setOpen(false)}><Icon name="x" size={18} /></button></div>
            {stage === "sent" ? (
              <>
                <p style={{ fontSize: 15, lineHeight: 1.55 }}>We sent a payment prompt to <strong>{num}</strong>. Approve it with your MoMo PIN. Your receipt will show both lines separately.</p>
                <button className="btn btn-d" type="button" onClick={() => setOpen(false)}>Done</button>
              </>
            ) : (
              <>
                <FeeLines officialLabel={r.payment.officialLabel} official={r.payment.official} ours={r.payment.ours} total={r.payment.total} />
                <div className="field"><label htmlFor="mm">MTN MoMo or Airtel Money number</label><input id="mm" className="in" value={num} onChange={(e) => setNum(e.target.value)} inputMode="tel" /><span className="hint">You’ll get a prompt on your phone to approve.</span></div>
                <div className="row g10" style={{ justifyContent: "flex-end" }}>
                  <button className="btn btn-g" type="button" onClick={() => setOpen(false)}>Cancel</button>
                  <button className="btn btn-p" type="button" disabled={stage === "sending"} onClick={() => { setStage("sending"); setTimeout(() => setStage("sent"), 900); }}>{stage === "sending" ? <><span className="spin" /> Sending…</> : "Send payment prompt"}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

