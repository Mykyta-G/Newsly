import type { Letter } from "./newsletter";

// Fixed HTML email template. GPT only writes the text fields; it never writes HTML.
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const paras = (s: string, style: string) =>
  s.split(/\n\s*\n/).filter((p) => p.trim()).map((p) => `<p style="${style}">${esc(p.trim()).replace(/\n/g, "<br>")}</p>`).join("");

const P = "margin:0 0 14px;font-size:16px;line-height:1.6;color:#1f2328;";

export function renderEmail(l: Letter, brand: { companyName: string; color: string }, unsubscribeUrl?: string, test = false) {
  const color = /^#[0-9a-f]{6}$/i.test(brand.color) ? brand.color : "#4361EE";
  return `<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(l.subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,'Segoe UI',Inter,Arial,sans-serif;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(l.preheader)}</span>
${test ? `<div style="background:#fff7d6;color:#5c4a00;font-size:13px;padding:10px 16px;text-align:center;">Testutskick: bara du ser det här. Godkänn i Newsly för att skicka till alla.</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#ffffff;border-radius:12px;overflow:hidden;">
<tr><td style="background:${color};padding:20px 28px;color:#ffffff;font-size:20px;font-weight:700;">${esc(brand.companyName)}</td></tr>
<tr><td style="padding:28px;">
<p style="${P}font-weight:600;">${esc(l.greeting)}</p>
${paras(l.intro, P)}
${l.sections.map((s) => `<h2 style="margin:24px 0 8px;font-size:18px;color:${color};">${esc(s.heading)}</h2>${paras(s.body, P)}`).join("\n")}
<div style="height:8px"></div>
${paras(l.closing, P)}
<p style="${P}font-weight:600;">${esc(l.signature)}</p>
</td></tr>
<tr><td style="padding:16px 28px;background:#fafafa;font-size:12px;color:#6b7280;">
Du får det här brevet eftersom du är kund hos ${esc(brand.companyName)}.${unsubscribeUrl ? ` <a href="${esc(unsubscribeUrl)}" style="color:#6b7280;">Avsluta prenumerationen</a>` : ""}
</td></tr></table></td></tr></table></body></html>`;
}
