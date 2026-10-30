"use client";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteCategory, getCategoryRw, moveCategory, saveCategory, type LogoChange } from "@/app/actions/categories";
import { CATEGORY_ICONS } from "@/lib/category-icons";
import type { CategoryRw } from "@/lib/content-admin";
import type { Category } from "@/lib/types";
import { Badge, Icon } from "./ui";
import { useDialog } from "./useDialog";

export type CategoryService = { slug: string; name: string; visible: boolean };

const slugify = (v: string) => v.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30);
const blank = (): Category => ({ id: "", icon: "c-other", name: "", short: "", desc: "", visible: true, featured: false, institution: "" });
const EMPTY_RW: CategoryRw = { name: "", short: "", desc: "", institution: "" };
const MAX_LOGO_BYTES = 190_000;

/** A logo the browser can read, shrunk to fit 640 × 256 and kept as PNG (or WebP when the PNG is large), as a data URL. */
async function prepareLogo(file: File): Promise<string> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error("Choose a PNG, JPEG or WebP image.");
  const bitmap = await createImageBitmap(file).catch(() => { throw new Error("That image could not be read."); });
  const scale = Math.min(1, 640 / bitmap.width, 256 / bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const [type, quality] of [["image/png", undefined], ["image/webp", 0.9], ["image/webp", 0.7]] as const) {
    const url = canvas.toDataURL(type, quality);
    if (url.startsWith(`data:${type}`) && url.length * 0.75 <= MAX_LOGO_BYTES) return url;
  }
  throw new Error("That logo is too detailed. Use a simpler or smaller image.");
}

export default function CategoryAdmin({ categories, services, builtIn, canTranslate }: { categories: Category[]; services: Record<string, CategoryService[]>; builtIn: string[]; canTranslate: boolean }) {
  const router = useRouter();
  const [edit, setEdit] = useState<Category | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [logo, setLogo] = useState<LogoChange>({ type: "keep" });
  const [preview, setPreview] = useState<string | undefined>();
  const [tab, setTab] = useState<"details" | "rw">("details");
  const [rw, setRw] = useState<CategoryRw | null>(null);
  const [rwState, setRwState] = useState<"loading" | "ready" | "failed">("ready");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const dialog = useDialog<HTMLElement>(!!edit, () => setEdit(null));

  const open = (c: Category, fresh: boolean) => {
    setSaved(""); setError(""); setTab("details"); setEdit({ ...c }); setIsNew(fresh); setLogo({ type: "keep" }); setPreview(c.mark); setRw(null);
    if (!canTranslate) return;
    if (fresh) { setRw({ ...EMPTY_RW }); setRwState("ready"); return; }
    setRwState("loading");
    getCategoryRw(c.id).then((r) => { if (r.ok) { setRw(r.rw); setRwState("ready"); } else setRwState("failed"); }).catch(() => setRwState("failed"));
  };
  const run = async (what: () => Promise<{ ok: boolean; error?: string }>, message: string) => {
    setBusy(true); setError("");
    const r = await what().catch(() => ({ ok: false as const, error: "Not saved. Check your connection and try again." }));
    setBusy(false);
    if (!r.ok) { setError(r.error ?? "Not saved."); return false; }
    setSaved(message);
    router.refresh();
    return true;
  };
  const pickLogo = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    try { const url = await prepareLogo(file); setLogo({ type: "set", data: url }); setPreview(url); }
    catch (e) { setError(e instanceof Error ? e.message : "That image could not be read."); }
  };

  const fixed = !!edit?.href;
  const mine = edit ? services[edit.id] ?? [] : [];
  const fixedIn = (id: string) => builtIn.includes(id);

  return (
    <div className="stack g16">
      <div className="row between g12 wrapx">
        <p className="hint" style={{ margin: 0, maxWidth: 560 }}>Each category groups services, and can name the institution they are filed with. Hidden categories, and categories with no visible service, do not appear on the site.</p>
        <button type="button" className="btn btn-p btn-sm" onClick={() => open(blank(), true)}><Icon name="plus" size={16} /> New category</button>
      </div>
      {saved && <div className="alert t-ok" role="status"><Icon name="check" size={20} /><div className="alert-body"><strong>Saved</strong><span>{saved}</span></div></div>}

      <ul className="stack g12" style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {categories.map((c, i) => {
          const list = services[c.id] ?? [];
          const live = list.filter((s) => s.visible).length;
          return (
            <li key={c.id} className="card" style={{ padding: 16 }}>
              <div className="row g12" style={{ alignItems: "flex-start" }}>
                <span className="ico-tile" style={{ width: 44, height: 44, flexShrink: 0, overflow: "hidden" }}>
                  {c.mark ? <Image src={c.mark} alt="" width={36} height={28} unoptimized style={{ maxWidth: 36, maxHeight: 28, objectFit: "contain" }} /> : <Icon name={c.icon} size={24} />}
                </span>
                <div className="stack" style={{ gap: 4, flexGrow: 1, minWidth: 0 }}>
                  <strong>{c.name}</strong>
                  <span className="mut" style={{ fontSize: 13 }}>{c.institution ? `${c.institution} · ` : ""}{c.href ? "Opens the request form" : `${list.length} ${list.length === 1 ? "service" : "services"}${list.length ? `, ${live} shown` : ""}`}</span>
                  <span className="row g6 wrapx">
                    {c.visible === false && <Badge tone="neutral" label="Hidden" />}
                    {c.featured && <Badge tone="ok" label="Card on home page" />}
                    {c.visible !== false && !c.href && live === 0 && <Badge tone="warn" label="No visible service yet, so not on the site" />}
                  </span>
                </div>
              </div>
              <div className="row between g8" style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--line-2)" }}>
                <span className="row g4">
                  <button type="button" className="btn btn-g btn-sm btn-ico" aria-label={`Move ${c.name} up`} disabled={busy || i === 0} onClick={() => run(() => moveCategory(c.id, "up"), `${c.name} moved up.`)}><Icon name="arrow" size={16} style={{ transform: "rotate(-90deg)" }} /></button>
                  <button type="button" className="btn btn-g btn-sm btn-ico" aria-label={`Move ${c.name} down`} disabled={busy || i === categories.length - 1} onClick={() => run(() => moveCategory(c.id, "down"), `${c.name} moved down.`)}><Icon name="arrow" size={16} style={{ transform: "rotate(90deg)" }} /></button>
                </span>
                <span className="row g8">
                  {!c.href && <Link className="btn btn-g btn-sm" href={`/admin/services?category=${c.id}`}>Services</Link>}
                  <button type="button" className="btn btn-s btn-sm" onClick={() => open(c, false)}><Icon name="edit" size={16} /> Edit</button>
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      {edit && (
        <>
          <div className="drawer-bg" style={{ position: "fixed", zIndex: 65 }} onClick={() => setEdit(null)} />
          <aside ref={dialog} className="admin-drawer" role="dialog" aria-modal="true" aria-labelledby="cat-h">
            <div className="card-head" style={{ padding: "20px 24px" }}>
              <div className="stack" style={{ gap: 3 }}><span className="eb" style={{ fontSize: 11 }}>{isNew ? "New category" : "Edit category"}</span><h2 id="cat-h" className="d" style={{ fontSize: 20 }}>{edit.name || "Untitled category"}</h2></div>
              <button type="button" className="btn btn-g btn-sm btn-ico" aria-label="Close" onClick={() => setEdit(null)}><Icon name="x" size={18} /></button>
            </div>
            {canTranslate && (
              <div className="row g8" role="tablist" aria-label="Language" style={{ padding: "0 24px 12px", borderBottom: "1px solid var(--line)" }}>
                <button type="button" role="tab" aria-selected={tab === "details"} className={`chip chip-sm ${tab === "details" ? "chip-on" : ""}`} onClick={() => setTab("details")}>Details · English</button>
                <button type="button" role="tab" aria-selected={tab === "rw"} className={`chip chip-sm ${tab === "rw" ? "chip-on" : ""}`} onClick={() => setTab("rw")}>Kinyarwanda</button>
              </div>
            )}
            {tab === "rw" && canTranslate ? (
              <div className="stack g16" style={{ padding: "20px 24px", overflowY: "auto", flexGrow: 1 }}>
                {rwState === "loading" && <span className="hint">Loading the Kinyarwanda…</span>}
                {rwState === "failed" && <div className="alert t-err" role="alert"><Icon name="alert" size={20} /><div className="alert-body"><strong>Could not load the Kinyarwanda</strong><span>Close this and open the category again.</span></div></div>}
                {rwState === "ready" && rw && (
                  <>
                    <p className="hint" style={{ margin: 0 }}>What Kinyarwanda visitors read. A field left empty shows the English.</p>
                    {([["name", "Name", edit.name, false], ["short", "Short name (menu)", edit.short, false], ["desc", "Description", edit.desc, true], ["institution", "Institution", edit.institution ?? "", false]] as const).map(([k, label, en, long]) => (
                      (k !== "institution" || !fixed) && <div className="field" key={k}>
                        <label htmlFor={`rw-${k}`}>{label}</label>
                        {long
                          ? <textarea id={`rw-${k}`} className="in" rows={4} lang="rw" value={rw[k]} placeholder={en} onChange={(e) => setRw({ ...rw, [k]: e.target.value })} />
                          : <input id={`rw-${k}`} className="in" lang="rw" value={rw[k]} placeholder={en} onChange={(e) => setRw({ ...rw, [k]: e.target.value })} />}
                        {en && <span className="hint">English: {en}</span>}
                      </div>
                    ))}
                  </>
                )}
              </div>
            ) : (
              <div className="stack g18" style={{ padding: "20px 24px", overflowY: "auto", flexGrow: 1 }}>
                <div className="field"><label htmlFor="c1">Name</label><input id="c1" className="in" maxLength={80} value={edit.name} placeholder="e.g. Courts / IECMS" onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
                <div className="field"><label htmlFor="c2">Short name <span className="mut" style={{ fontWeight: 400 }}>(the label in the menu and on the cards)</span></label><input id="c2" className="in" maxLength={30} value={edit.short} placeholder="e.g. Courts" onChange={(e) => setEdit({ ...edit, short: e.target.value })} /></div>
                <div className="field"><label htmlFor="c3">Description <span className="mut" style={{ fontWeight: 400 }}>(a sentence or two)</span></label><textarea id="c3" className="in" rows={3} maxLength={300} value={edit.desc} onChange={(e) => setEdit({ ...edit, desc: e.target.value })} /></div>
                <fieldset className="stack g10" style={{ border: 0, margin: 0, padding: 0 }}>
                  <legend style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Icon</legend>
                  <div role="group" aria-label="Icon" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(76px, 1fr))", gap: 8 }}>
                    {CATEGORY_ICONS.map((i) => (
                      <button key={i.name} type="button" className={`chip ${edit.icon === i.name ? "chip-on" : ""}`} aria-pressed={edit.icon === i.name} title={i.label} onClick={() => setEdit({ ...edit, icon: i.name })}
                        style={{ flexDirection: "column", height: "auto", minHeight: 64, padding: "10px 4px", gap: 4, justifyContent: "center", whiteSpace: "normal", overflowWrap: "anywhere", textAlign: "center" }}>
                        <Icon name={i.name} size={22} /><span style={{ fontSize: 11.5, lineHeight: 1.2 }}>{i.label}</span>
                      </button>
                    ))}
                  </div>
                </fieldset>
                {!fixed && (
                  <fieldset className="stack g12" style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 16, margin: 0 }}>
                    <legend style={{ fontSize: 13, fontWeight: 700, padding: "0 6px" }}>Institution</legend>
                    <div className="field"><label htmlFor="c4">Who the services are filed with</label><input id="c4" className="in" maxLength={80} value={edit.institution ?? ""} placeholder="e.g. Rwanda Judiciary" onChange={(e) => setEdit({ ...edit, institution: e.target.value })} /></div>
                    <div className="stack g8">
                      <span className="field-label" style={{ fontSize: 14, fontWeight: 600 }}>Logo <span className="mut" style={{ fontWeight: 400 }}>(optional)</span></span>
                      <div className="row g12" style={{ alignItems: "center" }}>
                        <span style={{ width: 120, height: 56, border: "1px dashed var(--line)", borderRadius: 8, display: "grid", placeItems: "center", background: "var(--paper, #fff)", flexShrink: 0 }}>
                          {preview ? <Image src={preview} alt="Logo preview" width={108} height={44} unoptimized style={{ maxWidth: 108, maxHeight: 44, objectFit: "contain" }} /> : <span className="hint">No logo</span>}
                        </span>
                        <span className="row g8 wrapx">
                          <label className="btn btn-s btn-sm" style={{ cursor: "pointer" }}>
                            <Icon name="upload" size={16} /> {preview ? "Replace" : "Upload"}
                            <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => { void pickLogo(e.target.files?.[0]); e.target.value = ""; }} />
                          </label>
                          {preview && <button type="button" className="btn btn-g btn-sm" onClick={() => { setLogo({ type: "remove" }); setPreview(undefined); }}>Remove</button>}
                        </span>
                      </div>
                      <span className="hint">Use the institution’s own logo, on a transparent or white background. It is shown to name where the request is filed, and does not mean the institution endorses Inzira. Without a logo, the institution’s name is written instead.</span>
                    </div>
                  </fieldset>
                )}
                {!fixed && (
                  <fieldset className="stack g10" style={{ border: 0, margin: 0, padding: 0 }}>
                    <label className="check"><input type="checkbox" checked={edit.visible !== false} onChange={(e) => setEdit({ ...edit, visible: e.target.checked })} /> Show on the site</label>
                    <label className="check"><input type="checkbox" checked={!!edit.featured} onChange={(e) => setEdit({ ...edit, featured: e.target.checked })} /> Show as a card on the home page</label>
                  </fieldset>
                )}
                {!isNew && !fixed && (
                  <fieldset className="stack g10" style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 16, margin: 0 }}>
                    <legend style={{ fontSize: 13, fontWeight: 700, padding: "0 6px" }}>Services in this category</legend>
                    {mine.length === 0 && <span className="hint">No services yet. Add the first one; it starts as a draft, so customers see nothing until you tick “Visible in catalogue”.</span>}
                    {mine.map((s) => <div key={s.slug} className="row between g8"><span>{s.name || s.slug}</span><Badge tone={s.visible ? "ok" : "neutral"} label={s.visible ? "Active" : "Draft"} /></div>)}
                    <span className="row g8 wrapx">
                      <Link className="btn btn-s btn-sm" href={`/admin/services?category=${edit.id}&new=1`}><Icon name="plus" size={16} /> Add a service</Link>
                      {mine.length > 0 && <Link className="btn btn-g btn-sm" href={`/admin/services?category=${edit.id}`}>Edit prices and wording</Link>}
                    </span>
                  </fieldset>
                )}
                {isNew && <span className="hint">Save the category first, then add its services.</span>}
              </div>
            )}
            {error && <div className="alert t-err" role="alert" style={{ borderRadius: 0 }}><Icon name="alert" size={20} /><div className="alert-body"><strong>Not saved</strong><span>{error}</span></div></div>}
            <div className="row between g8 wrapx" style={{ padding: "16px 24px", borderTop: "1px solid var(--line)" }}>
              {!isNew && !fixed && !fixedIn(edit.id) ? (
                <button type="button" className="btn btn-g" disabled={busy} onClick={async () => {
                  if (!window.confirm(`Delete “${edit.name}”? This can’t be undone. A category with services in it can’t be deleted; hide it instead.`)) return;
                  if (await run(() => deleteCategory(edit.id), `${edit.name} was deleted.`)) setEdit(null);
                }}>Delete</button>
              ) : <span />}
              <div className="row g8"><button className="btn btn-g" type="button" onClick={() => setEdit(null)}>Cancel</button>
                <button className="btn btn-p" type="button" disabled={!edit.name.trim() || !edit.short.trim() || !edit.desc.trim() || busy || (canTranslate && rwState === "loading")} onClick={async () => {
                  const id = isNew ? slugify(edit.short || edit.name) : edit.id;
                  const ok = await run(() => saveCategory(
                    { id, name: edit.name, short: edit.short, desc: edit.desc, icon: edit.icon, institution: edit.institution ?? "", visible: edit.visible !== false, featured: !!edit.featured },
                    isNew, logo, canTranslate && rwState === "ready" ? rw ?? undefined : undefined,
                  ), `${edit.name} ${isNew ? "added" : "updated"}. Customers see it now, and the change is in the audit log.${isNew ? " It appears on the site once one of its services is visible." : ""}`);
                  if (ok) setEdit(null);
                }}>{busy ? "Saving…" : "Save changes"}</button></div>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
