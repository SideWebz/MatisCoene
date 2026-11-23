export interface ContactDetails {
  name: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
  date: string;
}

export interface EmailSettings {
  inboxSubject: string;
  inboxTemplate: string;
  autoReplyEnabled: boolean;
  autoReplySubject: string;
  autoReplyTemplate: string;
}

export const DEFAULT_EMAIL_SETTINGS: EmailSettings = {
  inboxSubject: "Nieuw contactbericht: {{name}}",
  inboxTemplate: `<h1>Nieuw bericht via de website</h1>
<p>Je ontving een nieuw contactbericht via matiscoene.com.</p>
<p><strong>Naam:</strong> {{name}}<br>
<strong>E-mailadres:</strong> {{email}}<br>
<strong>Telefoon:</strong> {{phone}}<br>
<strong>Onderwerp:</strong> {{subject}}<br>
<strong>Datum:</strong> {{date}}</p>
<h2>Bericht</h2>
<p>{{message}}</p>`,
  autoReplyEnabled: true,
  autoReplySubject: "We hebben je bericht goed ontvangen",
  autoReplyTemplate: `<h1>Bedankt voor je bericht, {{name}}</h1>
<p>Je bericht is goed ontvangen. Ik neem zo snel mogelijk contact met je op.</p>
<h2>Je bericht</h2>
<p>{{message}}</p>
<p>Verzonden op {{date}}.</p>`,
};

const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "ul",
  "ol",
  "li",
  "h1",
  "h2",
  "h3",
  "blockquote",
]);

export function sanitizeEmailTemplate(template: string): string {
  return template
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(
      /<(script|style|iframe|object|embed|svg|math|form|input|img|video|audio)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
      "",
    )
    .replace(/<(script|style|iframe|object|embed|svg|math|form|input|img|video|audio)\b[^>]*\/?>/gi, "")
    .replace(/<\/?([a-z][a-z0-9]*)\b[^>]*>/gi, (tag, name: string) => {
      const safeName = name.toLowerCase();
      if (!ALLOWED_TAGS.has(safeName)) {
        return "";
      }
      return tag.startsWith("</") && safeName !== "br" ? `</${safeName}>` : `<${safeName}>`;
    });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function renderEmailTemplate(template: string, details: ContactDetails): string {
  const safeTemplate = sanitizeEmailTemplate(template);
  return safeTemplate.replace(/\{\{(name|email|phone|subject|message|date)\}\}/g, (_token, key: keyof ContactDetails) => {
    const value = escapeHtml(details[key]);
    return key === "message" ? value.replace(/\r\n|\r|\n/g, "<br>") : value;
  });
}

export function wrapEmailHtml(content: string): string {
  return `<!doctype html>
<html lang="nl"><head><meta charset="utf-8"></head>
<body style="margin:0;background:#f3f3f1;font-family:Arial,sans-serif;color:#111827;">
  <div style="max-width:640px;margin:32px auto;padding:0 16px;">
    <div style="background:#111827;padding:22px 28px;border-radius:16px 16px 0 0;color:#fff;font-size:18px;font-weight:bold;">Matis Coene</div>
    <div style="background:#fff;padding:28px;border:1px solid #e7e7e5;border-top:0;border-radius:0 0 16px 16px;line-height:1.65;overflow-wrap:anywhere;">
      <div style="font-size:15px;">${content}</div>
    </div>
    <p style="margin:16px 0;color:#6b7280;text-align:center;font-size:12px;">Matis Coene · matiscoene.com</p>
  </div>
</body></html>`;
}

export function renderEmailSubject(template: string, details: ContactDetails): string {
  return template
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(
      /\{\{(name|email|phone|subject|message|date)\}\}/g,
      (_token, key: keyof ContactDetails) => details[key].replace(/[\u0000-\u001f\u007f]+/g, " "),
    )
    .trim()
    .slice(0, 180);
}
