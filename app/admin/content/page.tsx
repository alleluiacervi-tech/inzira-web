import Link from "next/link";
import ContentEditor from "@/components/ContentEditor";
import { NoAccess } from "@/components/PageStates";
import { PageHead } from "@/components/ui";
import { contentEntries, primeContent } from "@/lib/content";
import { lastEdits } from "@/lib/content-admin";
import { countRows, rowsFor, sectionFields, sections, type Counts, type Section } from "@/lib/content-fields";
import { getMyPermissions, listServices } from "@/lib/repo";

export const metadata = { title: "Kinyarwanda text" };

const SEARCH_LIMIT = 40;
const href = (s: Section) => `/admin/content/${s.kind}/${s.id}`;

function Card({ section, counts }: { section: Section; counts: Counts }) {
  return (
    <Link href={href(section)} className="card cx-card">
      <span className="stack" style={{ gap: 4 }}>
        <strong>{section.title}</strong>
        <span className="hint">{section.hint}</span>
      </span>
      <span className="row g8 wrapx cx-counts">
        <span className="tag">{counts.total} texts</span>
        {counts.edited > 0 && <span className="tag tag-ember">{counts.edited} edited</span>}
        {counts.missing > 0 && <span className="tag tag-warn">{counts.missing} not translated</span>}
      </span>
    </Link>
  );
}

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  if (!(await getMyPermissions()).includes("editContent")) return <><PageHead title="Kinyarwanda text" /><NoAccess what="editing Kinyarwanda text" /></>;
  const q = ((await searchParams).q ?? "").trim().slice(0, 100);
  await primeContent(true);
  const entries = contentEntries();
  const services = await listServices({ includeHidden: true });
  const all = sections(services);
  const withFields = (list: Section[]) => list.map((section) => ({ section, fields: sectionFields(section.kind, section.id, services) ?? [] }));
  const groups = [
    { title: "Pages and screens", items: withFields(all.ui) },
    { title: "Fees and institutions", items: withFields(all.catalogue) },
    { title: "Services", items: withFields(all.services) },
  ];

  let results: ReturnType<typeof rowsFor> = [];
  let more = 0;
  const where: Record<string, string> = {};
  if (q) {
    const needle = q.toLowerCase();
    const found = groups.flatMap((g) => g.items.flatMap(({ section, fields }) => rowsFor(fields, entries).filter((r) => [r.label, r.en, r.value, r.key].some((v) => v.toLowerCase().includes(needle))).map((r) => ({ r, section }))));
    more = Math.max(0, found.length - SEARCH_LIMIT);
    results = found.slice(0, SEARCH_LIMIT).map(({ r, section }) => { where[r.key] = section.title; return r; });
  }
  const edits = results.length ? await lastEdits(results.filter((r) => r.edited).map((r) => r.key)) : {};

  return (
    <>
      <PageHead title="Kinyarwanda text" sub="Every Kinyarwanda text on the public site · saved changes show within about 2 minutes" />
      <div className="content">
        <form className="cx-search" action="/admin/content" role="search">
          <input className="in" type="search" name="q" defaultValue={q} placeholder="Search all text, in English or Kinyarwanda" aria-label="Search all text" autoComplete="off" />
          <button className="btn btn-p" type="submit">Search</button>
          {q && <Link className="btn btn-g" href="/admin/content">Clear</Link>}
        </form>
        {!q && <div className="row g8 wrapx"><Link className="btn btn-g btn-sm" href="/admin/content/replace">Find and replace…</Link><span className="hint">Make a word or phrase consistent across all the Kinyarwanda.</span></div>}

        {q ? (
          <div className="stack g16">
            <p className="hint" role="status">{results.length === 0 ? `No text matches “${q}”.` : `${more ? `First ${SEARCH_LIMIT} of ${SEARCH_LIMIT + more}` : results.length} ${results.length === 1 ? "text" : "texts"} matching “${q}”${more ? ". Search for more of the text to narrow it." : "."}`}</p>
            {results.length > 0 && <ContentEditor key={q} rows={results} edits={edits} where={where} />}
          </div>
        ) : (
          groups.map((g) => (
            <section key={g.title} className="stack g12" aria-label={g.title}>
              <h2 className="d" style={{ fontSize: 16 }}>{g.title}</h2>
              <div className="cx-cards">
                {g.items.map(({ section, fields }) => <Card key={`${section.kind}/${section.id}`} section={section} counts={countRows(fields, entries)} />)}
              </div>
            </section>
          ))
        )}
      </div>
    </>
  );
}
