"use client";
import { useEffect, useRef } from "react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const dialogs: HTMLElement[] = [];
let originalOverflow = "";

/** Makes an overlay behave like a dialog: Escape closes it, Tab stays inside it, the page behind
 *  does not scroll, and focus returns to whatever opened it. Put the returned ref on the overlay. */
export function useDialog<T extends HTMLElement>(open: boolean, onClose: () => void) {
  const ref = useRef<T>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const dialog = ref.current;
    if (!dialog) return;
    const opener = document.activeElement as HTMLElement | null;
    if (!dialogs.length) originalOverflow = document.body.style.overflow;
    dialogs.push(dialog);
    const top = () => dialogs[dialogs.length - 1] === dialog;
    const items = () => Array.from(ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter((n) => n.getClientRects().length > 0);
    const previousTabIndex = dialog.getAttribute("tabindex");
    dialog.tabIndex = -1;
    (items()[0] ?? dialog).focus();
    const onKey = (e: KeyboardEvent) => {
      if (!top()) return;
      if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); close.current(); return; }
      if (e.key !== "Tab") return;
      const list = items();
      if (!list.length) { e.preventDefault(); dialog.focus(); return; }
      const first = list[0], last = list[list.length - 1];
      if (!dialog.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    const onFocus = (e: FocusEvent) => {
      if (top() && !dialog.contains(e.target as Node)) (items()[0] ?? dialog).focus();
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("focusin", onFocus);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("focusin", onFocus);
      const wasTop = top();
      const index = dialogs.indexOf(dialog);
      if (index >= 0) dialogs.splice(index, 1);
      if (!dialogs.length) document.body.style.overflow = originalOverflow;
      if (previousTabIndex === null) dialog.removeAttribute("tabindex");
      else dialog.setAttribute("tabindex", previousTabIndex);
      if (wasTop && opener?.isConnected) opener.focus();
    };
  }, [open]);
  return ref;
}
