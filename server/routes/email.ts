import nodemailer from "nodemailer";
import { getCurrentUser } from "../auth/session.ts";
import { getDatabase } from "../database/db.ts";
import {
  DEFAULT_EMAIL_SETTINGS,
  renderEmailSubject,
  renderEmailTemplate,
  type ContactDetails,
  type EmailSettings,
  wrapEmailHtml,
} from "../services/email-templates.ts";

const MAX_BODY_BYTES = 16_384;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX = 5;
const submissionsByIp = new Map<string, number[]>();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function getSettings(): EmailSettings {
  const db = getDatabase();
  const rows = db.queryEntries<{ setting_key: string; setting_value: string }>(
    "SELECT setting_key, setting_value FROM email_settings",
  );
  const stored = Object.fromEntries(rows.map((row) => [row.setting_key, row.setting_value]));
  return {
    inboxSubject: stored.inboxSubject ?? DEFAULT_EMAIL_SETTINGS.inboxSubject,
    inboxTemplate: stored.inboxTemplate ?? DEFAULT_EMAIL_SETTINGS.inboxTemplate,
    autoReplyEnabled: stored.autoReplyEnabled === undefined
      ? Deno.env.get("MAIL_AUTO_REPLY_ENABLED")?.toLowerCase() !== "false"
      : stored.autoReplyEnabled === "true",
    autoReplySubject: stored.autoReplySubject ?? DEFAULT_EMAIL_SETTINGS.autoReplySubject,
    autoReplyTemplate: stored.autoReplyTemplate ?? DEFAULT_EMAIL_SETTINGS.autoReplyTemplate,
  };
}

function validEmail(value: string): boolean {
  return value.length <= 254 &&
    /^[^\s<>(),;:"\[\]]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value);
}

function allowSubmission(ip: string): boolean {
  const now = Date.now();
  for (const [address, timestamps] of submissionsByIp) {
    const recent = timestamps.filter((timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS);
    if (recent.length === 0) {
      submissionsByIp.delete(address);
    } else {
      submissionsByIp.set(address, recent);
    }
  }

  const recent = submissionsByIp.get(ip) ?? [];
  if (recent.length >= RATE_LIMIT_MAX) {
    return false;
  }
  recent.push(now);
  submissionsByIp.set(ip, recent);
  return true;
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return null;
  }
  const reader = request.body?.getReader();
  if (!reader) {
    return null;
  }
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const payload: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return payload && typeof payload === "object" && !Array.isArray(payload)
      ? payload as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const cleaned = value.trim();
  if (!cleaned || cleaned.length > maxLength || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(cleaned)) {
    return null;
  }
  return cleaned;
}

function validateSettings(payload: Record<string, unknown>): EmailSettings | null {
  const inboxSubject = cleanText(payload.inboxSubject, 180);
  const inboxTemplate = cleanText(payload.inboxTemplate, 10_000);
  const autoReplySubject = cleanText(payload.autoReplySubject, 180);
  const autoReplyTemplate = cleanText(payload.autoReplyTemplate, 10_000);
  if (
    !inboxSubject || !inboxTemplate || !autoReplySubject || !autoReplyTemplate ||
    typeof payload.autoReplyEnabled !== "boolean"
  ) {
    return null;
  }
  return {
    inboxSubject: inboxSubject.replace(/[\r\n]+/g, " "),
    inboxTemplate,
    autoReplyEnabled: payload.autoReplyEnabled,
    autoReplySubject: autoReplySubject.replace(/[\r\n]+/g, " "),
    autoReplyTemplate,
  };
}

function saveSettings(settings: EmailSettings): void {
  const db = getDatabase();
  db.execute("BEGIN");
  try {
    for (const [key, value] of Object.entries(settings)) {
      db.query(
        `INSERT INTO email_settings (setting_key, setting_value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = CURRENT_TIMESTAMP`,
        [key, String(value)],
      );
    }
    db.execute("COMMIT");
  } catch (error) {
    db.execute("ROLLBACK");
    throw error;
  }
}

function createTransport() {
  const host = Deno.env.get("MAIL_HOST") ?? "smtp.gmail.com";
  const port = Number(Deno.env.get("MAIL_PORT") ?? "587");
  const encryption = (Deno.env.get("MAIL_ENCRYPTION") ?? "tls").toLowerCase();
  const username = Deno.env.get("MAIL_USERNAME") ?? "";
  const password = Deno.env.get("MAIL_PASSWORD") ?? "";
  const fromAddress = Deno.env.get("MAIL_FROM_ADDRESS") || username;

  if (!Number.isInteger(port) || port < 1 || port > 65535 || encryption !== "tls") {
    throw new Error("Invalid SMTP configuration.");
  }
  if (!host || !username || !password) {
    throw new Error("SMTP configuration is incomplete.");
  }
  if (!validEmail(fromAddress)) {
    throw new Error("Invalid sender configuration.");
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: false,
    requireTLS: true,
    auth: { user: username, pass: password },
    tls: { minVersion: "TLSv1.2" },
  });
}

function logMailFailure(label: string, error: unknown): void {
  const details = error && typeof error === "object"
    ? error as { code?: unknown; responseCode?: unknown; command?: unknown }
    : {};
  console.error(label, {
    code: typeof details.code === "string" ? details.code : "UNKNOWN",
    responseCode: typeof details.responseCode === "number" ? details.responseCode : undefined,
    command: typeof details.command === "string" ? details.command : undefined,
  });
}

async function sendMail(options: {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}): Promise<void> {
  const transport = createTransport();
  try {
    await transport.sendMail({
      from: {
        address: Deno.env.get("MAIL_FROM_ADDRESS") || Deno.env.get("MAIL_USERNAME") || "",
        name: (Deno.env.get("MAIL_FROM_NAME") ?? "Matis Coene").replace(/[\r\n]+/g, " ").slice(0, 100),
      },
      to: options.to,
      replyTo: options.replyTo,
      subject: options.subject,
      html: options.html,
    });
  } finally {
    transport.close();
  }
}

async function handleContactSubmission(request: Request, ip: string): Promise<Response> {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return jsonResponse({ message: "Ongeldige aanvraag." }, 415);
  }
  const payload = await readJson(request);
  if (!payload) {
    return jsonResponse({ message: "Ongeldige aanvraag." }, 400);
  }
  if (typeof payload.website === "string" && payload.website.trim()) {
    return jsonResponse({ message: "Ongeldige aanvraag." }, 400);
  }
  if (!allowSubmission(ip)) {
    return jsonResponse({ message: "Te veel aanvragen. Probeer het later opnieuw." }, 429);
  }

  const name = cleanText(payload.name, 120);
  const email = cleanText(payload.email, 254);
  const phone = payload.phone === undefined || payload.phone === ""
    ? ""
    : cleanText(payload.phone, 60);
  const message = cleanText(payload.project ?? payload.message, 5000);
  if (!name || !email || !validEmail(email) || phone === null || !message) {
    return jsonResponse({ message: "Controleer je gegevens en probeer het opnieuw." }, 400);
  }

  const turnstileToken = cleanText(payload.turnstileToken, 2048);
  const turnstileSecret = Deno.env.get("TURNSTILE_SECRET_KEY") ?? "";
  if (!turnstileToken || !turnstileSecret) {
    return jsonResponse({ message: "Spamcontrole is momenteel niet beschikbaar." }, 503);
  }

  try {
    const verificationBody = new URLSearchParams({
      secret: turnstileSecret,
      response: turnstileToken,
      remoteip: ip,
    });
    const verificationResponse = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: verificationBody,
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!verificationResponse.ok) {
      console.error("Cloudflare Turnstile verification returned HTTP", verificationResponse.status);
      return jsonResponse({ message: "Spamcontrole is momenteel niet beschikbaar." }, 503);
    }
    const verification = await verificationResponse.json();
    if (verification?.success !== true) {
      return jsonResponse({ message: "Spamcontrole mislukt. Probeer het opnieuw." }, 400);
    }
  } catch (error) {
    console.error(
      "Cloudflare Turnstile verification failed.",
      error instanceof Error ? error.name : "UnknownError",
    );
    return jsonResponse({ message: "Spamcontrole is momenteel niet beschikbaar." }, 503);
  }

  const details: ContactDetails = {
    name,
    email,
    phone,
    subject: "Contactaanvraag",
    message,
    date: new Intl.DateTimeFormat("nl-BE", {
      dateStyle: "long",
      timeStyle: "short",
      timeZone: "Europe/Brussels",
    }).format(new Date()),
  };
  const settings = getSettings();
  const recipient = Deno.env.get("MAIL_TO_ADDRESS") ?? "vragen@matiscoene.be";

  try {
    if (!validEmail(recipient)) {
      throw new Error("Invalid recipient configuration.");
    }
    await sendMail({
      to: recipient,
      replyTo: email,
      subject: renderEmailSubject(settings.inboxSubject, details),
      html: wrapEmailHtml(renderEmailTemplate(settings.inboxTemplate, details)),
    });
  } catch (error) {
    logMailFailure("Contact email delivery failed.", error);
    return jsonResponse({ message: "E-mail verzenden is momenteel niet mogelijk." }, 503);
  }

  if (settings.autoReplyEnabled) {
    try {
      await sendMail({
        to: email,
        subject: renderEmailSubject(settings.autoReplySubject, details),
        html: wrapEmailHtml(renderEmailTemplate(settings.autoReplyTemplate, details)),
      });
    } catch (error) {
      logMailFailure("Automatic reply delivery failed.", error);
    }
  }

  return jsonResponse({ message: "Bericht succesvol verzonden." });
}

export async function handleEmailRoutes(request: Request, ip: string): Promise<Response | null> {
  const url = new URL(request.url);

  if (request.method === "POST" && url.pathname === "/api/public/contact") {
    return await handleContactSubmission(request, ip);
  }

  if (!url.pathname.startsWith("/api/admin/email-settings")) {
    return null;
  }

  const user = await getCurrentUser(request);
  if (!user) {
    return jsonResponse({ message: "Unauthorized." }, 401);
  }
  if (user.role !== "ADMIN") {
    return jsonResponse({ message: "Access denied." }, 403);
  }

  if (request.method === "GET" && url.pathname === "/api/admin/email-settings") {
    return jsonResponse({ settings: getSettings() });
  }

  if (!["PUT", "POST"].includes(request.method)) {
    return jsonResponse({ message: "Method not allowed." }, 405);
  }
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin") {
    return jsonResponse({ message: "Invalid request origin." }, 403);
  }
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return jsonResponse({ message: "Invalid request." }, 415);
  }

  const payload = await readJson(request);
  if (!payload) {
    return jsonResponse({ message: "Invalid request body." }, 400);
  }
  const settings = validateSettings(payload);
  if (!settings) {
    return jsonResponse({ message: "Controleer de e-mailinstellingen en probeer opnieuw." }, 400);
  }

  if (url.pathname === "/api/admin/email-settings/preview" && request.method === "POST") {
    const details: ContactDetails = {
      name: "Voorbeeldnaam",
      email: "bezoeker@example.com",
      phone: "+32 123 45 67 89",
      subject: "Contactaanvraag",
      message: "Dit is een voorbeeldbericht.\nDe tweede regel blijft leesbaar.",
      date: new Intl.DateTimeFormat("nl-BE", {
        dateStyle: "long",
        timeStyle: "short",
        timeZone: "Europe/Brussels",
      }).format(new Date()),
    };
    const reply = url.searchParams.get("type") === "reply";
    return jsonResponse({
      subject: renderEmailSubject(
        reply ? settings.autoReplySubject : settings.inboxSubject,
        details,
      ),
      html: wrapEmailHtml(
        renderEmailTemplate(reply ? settings.autoReplyTemplate : settings.inboxTemplate, details),
      ),
    });
  }

  if (url.pathname !== "/api/admin/email-settings" || request.method !== "PUT") {
    return jsonResponse({ message: "Not found." }, 404);
  }

  saveSettings(settings);
  return jsonResponse({ message: "E-mailinstellingen opgeslagen." });
}
