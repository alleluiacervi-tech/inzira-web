import Link from "next/link";
import { notFound } from "next/navigation";
import ContentEditor from "@/components/ContentEditor";
import { NoAccess } from "@/components/PageStates";
import { Icon, PageHead } from "@/components/ui";
import { contentEntries, primeContent } from "@/lib/content";
import { lastEdits } from "@/lib/content-admin";
import { rowsFor, sectionFields, sections, type SectionKind } from "@/lib/content-fields";
import { getMyPermissions, listServices } from "@/lib/repo";

export async function generateMetadata({ params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await params;
  return { title: `Kinyarwanda text · ${kind === "service" ? id : id.replace(/-/g, " ")}` };
}

export default async function Page({ params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await params;
  if (!(await getMyPermissions()).includes("editContent")) return <><PageHead title="Kinyarwanda text" /><NoAccess what="editing Kinyarwanda text" /></>;
  if (kind !== "ui" && kind !== "catalogue" && kind !== "service") notFound();
  const services = await listServices({ includeHidden: true });
  const all = sections(services);
  const section = [...all.ui, ...all.catalogue, ...all.services].find((s) => s.kind === (kind as SectionKind) && s.id === id);
  const fields = section && sectionFields(section.kind, section.id, services);
  if (!section || !fields) notFound();
  await primeContent(true);
  const rows = rowsFor(fields, contentEntries());
  const edits = await lastEdits(rows.filter((r) => r.edited).map((r) => r.key));

  return (
    <>
      <PageHead title={section.title} sub={section.hint} />
      <div className="content">
        <div className="row g8 wrapx">
          <Link className="btn btn-g btn-sm" href="/admin/content"><Icon name="arrow-l" size={16} /> All text</Link>
          <a className="btn btn-g btn-sm" href={section.preview} target="_blank" rel="noopener noreferrer"><Icon name="eye" size={16} /> View on the site</a>
        </div>
        <ContentEditor key={`${kind}/${id}`} rows={rows} edits={edits} />
      </div>
    </>
  );
}
