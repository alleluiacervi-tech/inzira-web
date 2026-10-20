"use client";

export function PrintButton({ label, className = "btn btn-p btn-sm" }: { label: string; className?: string }) {
  return <button type="button" className={className} onClick={() => window.print()}>{label}</button>;
}
