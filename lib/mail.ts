// The emails Inzira sends. Customer emails follow the language they used on the site (Kinyarwanda
// by default); staff emails are in English. Plain HTML with inline styles: no images, no remote assets.
import type { Locale } from "./i18n/locale";
import { fill, text } from "./i18n/messages";
import type { Mail } from "./email";
import { absoluteUrl, SITE } from "./site";

const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const upper = (v: string) => (v ? v[0].toUpperCase() + v.slice(1) : v);

const COPY = {
  en: {
    hello: "Hello {name},",
    codeSubject: "{code} is your Inzira sign-in code",
    codeTitle: "Your sign-in code",
    codeLead: "Use this code to sign in to Inzira. It expires in 10 minutes.",
    codeIgnore: "Didn’t ask for it? Ignore this email: nobody can sign in without the code. Never share it.",
    receivedSubject: "We received your request {ref}",
    receivedTitle: "Request received",
    receivedBody: "We received your request for {service}. An agent will check it and contact you on {phone} within {time}. Your reference is {ref}.",
    open: "Open my request",
    linkNote: "This button is your private link: anyone who has it can see your request and documents, so don’t forward this email. Lost it? Sign in with this email address to see all your requests.",
    updateSubject: "Inzira {ref}: {title}",
    footer: "Inzira is a private assistance company, not a government institution. Questions? Reply to this email or call {phone}.",
    signIn: "Sign in",
    staffSubject: "{who} added you to Inzira as {role}",
    staffBody: "{who} added you to the Inzira staff console as {role}. Sign in with this email address: we send you a code each time, so there is no password to remember.",
  },
  rw: {
    hello: "Muraho {name},",
    codeSubject: "Kode yawe yo kwinjira muri Inzira: {code}",
    codeTitle: "Kode yawe yo kwinjira",
    codeLead: "Koresha iyi kode kugira ngo winjire muri Inzira. Itakaza agaciro nyuma y’iminota 10.",
    codeIgnore: "Utayisabye? Ntiwite kuri iyi mimeyili: nta wundi ushobora kwinjira atayifite. Ntuzigere uyiha undi muntu.",
    receivedSubject: "Twakiriye ubusabe bwawe {ref}",
    receivedTitle: "Ubusabe bwakiriwe",
    receivedBody: "Twakiriye ubusabe bwawe bwa {service}. Umukozi araburebera maze akuvugishe kuri {phone} mu {time}. Nomero y’ubusabe bwawe ni {ref}.",
    open: "Fungura ubusabe bwanjye",
    linkNote: "Iyi buto ni umurongo wawe bwite: umuntu wese uwufite ashobora kubona ubusabe n’inyandiko zawe, bityo ntukohereze iyi mimeyili ku bandi. Wawutakaje? Injira ukoresheje iyi aderesi y’imeyili maze ubone ubusabe bwawe bwose.",
    updateSubject: "Inzira {ref}: {title}",
    footer: "Inzira ni sosiyete yigenga itanga ubufasha, si ikigo cya leta. Ufite ikibazo? Subiza iyi mimeyili cyangwa uhamagare {phone}.",
    signIn: "Injira",
    staffSubject: "{who} yagushyize muri Inzira nka {role}",
    staffBody: "{who} yagushyize muri Inzira nka {role}. Injira ukoresheje iyi aderesi y’imeyili: tukoherereza kode buri gihe, nta jambo ry’ibanga ugomba kwibuka.",
  },
} as const;
type Key = keyof (typeof COPY)["en"];
const c = (locale: Locale, key: Key, vars?: Record<string, string | number>) => fill(COPY[locale][key], vars);

type Block = { p?: string; small?: string; code?: string; button?: { label: string; url: string }; list?: string[] };

/** One layout for every email: wordmark, content, small print. */
function render(locale: Locale, to: string, subject: string, heading: string, blocks: Block[]): Mail {
  const body = blocks.map((b) => {
    if (b.code) return `<p style="margin:20px 0;font-size:34px;font-weight:700;letter-spacing:8px;font-family:ui-monospace,Menlo,Consolas,monospace;color:#142850">${esc(b.code)}</p>`;
    if (b.button) return `<p style="margin:24px 0"><a href="${esc(b.button.url)}" style="display:inline-block;background:#142850;color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;padding:14px 24px;border-radius:8px">${esc(b.button.label)}</a></p>`;
    if (b.list) return `<ul style="margin:12px 0;padding-left:20px;font-size:16px;line-height:1.6">${b.list.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;
    if (b.small) return `<p style="margin:16px 0 0;font-size:13px;line-height:1.55;color:#576075">${esc(b.small)}</p>`;
    return `<p style="margin:12px 0;font-size:16px;line-height:1.6">${esc(b.p ?? "")}</p>`;
  }).join("");
  const footer = c(locale, "footer", { phone: SITE.phone });
  const html = `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:24px 12px;background:#f4f6f9;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f1626">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#ffffff;border:1px solid #e1e5ec;border-radius:12px">
<tr><td style="padding:24px 28px 8px;font-size:22px;font-weight:700;color:#142850">inzira</td></tr>
<tr><td style="padding:8px 28px 28px"><h1 style="margin:8px 0 4px;font-size:22px;line-height:1.3;color:#0f1626">${esc(heading)}</h1>${body}</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #e1e5ec;font-size:12.5px;line-height:1.55;color:#576075">${esc(footer)}</td></tr>
</table></td></tr></table></body></html>`;
  const plain = [heading, "", ...blocks.map((b) => (b.code ?? b.p ?? b.small ?? (b.button ? `${b.button.label}: ${b.button.url}` : b.list?.map((i) => `- ${i}`).join("\n")) ?? "")), "", "—", footer].join("\n");
  return { to, subject, html, text: plain };
}

export function signInCodeMail(to: string, code: string, locale: Locale = "rw"): Mail {
  return render(locale, to, c(locale, "codeSubject", { code }), c(locale, "codeTitle"), [
    { p: c(locale, "codeLead") }, { code }, { small: c(locale, "codeIgnore") },
  ]);
}

export function requestReceivedMail(i: { to: string; name: string; service: string; ref: string; phone: string; link: string; locale: Locale }): Mail {
  const { locale } = i;
  return render(locale, i.to, c(locale, "receivedSubject", { ref: i.ref }), c(locale, "receivedTitle"), [
    { p: c(locale, "hello", { name: i.name.split(" ")[0] }) },
    { p: c(locale, "receivedBody", { service: i.service, phone: `+250 ${i.phone}`, time: text(locale, "responseTime"), ref: i.ref }) },
    { button: { label: c(locale, "open"), url: i.link } },
    { small: c(locale, "linkNote") },
  ]);
}

/** A progress update on a request, with the one-click link. `message` is a sentence that starts in lower case. */
export function requestUpdateMail(i: { to: string; name: string; ref: string; title: string; message: string; link: string; locale: Locale }): Mail {
  const { locale } = i;
  return render(locale, i.to, c(locale, "updateSubject", { ref: i.ref, title: i.title }), i.title, [
    { p: c(locale, "hello", { name: i.name.split(" ")[0] }) },
    { p: upper(i.message) },
    { button: { label: c(locale, "open"), url: i.link } },
    { small: c(locale, "linkNote") },
  ]);
}

export function staffInviteMail(to: string, name: string, who: string, role: string): Mail {
  return render("en", to, c("en", "staffSubject", { who, role }), c("en", "staffSubject", { who, role }), [
    { p: c("en", "hello", { name: name.split(" ")[0] }) }, { p: c("en", "staffBody", { who, role }) },
    { button: { label: c("en", "signIn"), url: absoluteUrl("/sign-in") } },
  ]);
}

export function staffDigestMail(to: string, name: string, parts: string[]): Mail {
  return render("en", to, `Inzira today: ${parts.length} thing${parts.length === 1 ? "" : "s"} need you`, "Your day at Inzira", [
    { p: c("en", "hello", { name: name.split(" ")[0] }) }, { list: parts.map(upper) },
    { button: { label: "Open the staff console", url: absoluteUrl("/console") } },
  ]);
}

export function testMail(to: string): Mail {
  const when = new Date().toLocaleString("en-GB", { timeZone: "Africa/Kigali" });
  return render("en", to, "Inzira test email", "Email is working", [{ p: `This test email was sent at ${when} Kigali time. If you can read it, customers will receive their codes and updates.` }]);
}
