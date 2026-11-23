import { getCurrentUser } from "./auth/session.ts";
import { initDatabase } from "./database/db.ts";
import { handleAuthRoutes } from "./routes/auth.ts";
import { handleEmailRoutes } from "./routes/email.ts";
import { handleProjectRoutes } from "./routes/projects.ts";
import { handlePublicRoutes } from "./routes/public.ts";
import { getPublicSiteImageUrls, handleSiteImageRoutes } from "./routes/site-images.ts";
import { handleUsersRoutes } from "./routes/users.ts";

const appRoot = Deno.cwd();
const portValue = Deno.env.get("PORT") ?? "4000";
const port = Number(portValue);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(`Invalid PORT value "${portValue}". Use a number between 1 and 65535.`);
}

function getContentType(filePath: string): string {
  const extension = filePath.split(".").pop()?.toLowerCase() ?? "";

  const types: Record<string, string> = {
    html: "text/html; charset=utf-8",
    js: "application/javascript; charset=utf-8",
    css: "text/css; charset=utf-8",
    json: "application/json; charset=utf-8",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    ico: "image/x-icon",
    svg: "image/svg+xml",
    txt: "text/plain; charset=utf-8",
    xml: "application/xml; charset=utf-8",
    webmanifest: "application/manifest+json; charset=utf-8",
  };

  return types[extension] ?? "application/octet-stream";
}

async function serveFile(filePath: string): Promise<Response> {
  try {
    const file = await Deno.readFile(filePath);
    return new Response(file, {
      headers: {
        "Content-Type": getContentType(filePath),
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

async function servePublicIndex(): Promise<Response> {
  const publicRoot = `${appRoot}/public`;
  const [template, head, header, main, footer] = await Promise.all([
    Deno.readTextFile(`${publicRoot}/index.html`),
    Deno.readTextFile(`${publicRoot}/sections/head.html`),
    Deno.readTextFile(`${publicRoot}/sections/header.html`),
    Deno.readTextFile(`${publicRoot}/sections/main.html`),
    Deno.readTextFile(`${publicRoot}/sections/footer.html`),
  ]);
  const images = getPublicSiteImageUrls();
  const sections = {
    head,
    header: header.replace("{headerImage}", images.header),
    main: main
      .replace("{aboutImage}", images.about)
      .replace("{contactImage}", images.contact),
    footer,
  };
  const html = template.replace(
    /\{(head|header|main|footer)\}/g,
    (_match, section: keyof typeof sections) => sections[section],
  );

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

async function servePublicLegalPage(
  slug: string,
  title: string,
  description: string,
  mainFile: string,
): Promise<Response> {
  const publicRoot = `${appRoot}/public`;
  const [template, baseHead, header, main, footer] = await Promise.all([
    Deno.readTextFile(`${publicRoot}/index.html`),
    Deno.readTextFile(`${publicRoot}/sections/head.html`),
    Deno.readTextFile(`${publicRoot}/sections/header.html`),
    Deno.readTextFile(`${publicRoot}/sections/${mainFile}`),
    Deno.readTextFile(`${publicRoot}/sections/footer.html`),
  ]);
  const canonical = `https://matiscoene.com/${slug}`;
  const head = baseHead
    .replace('<meta name="robots" content="index, follow" />', '<meta name="robots" content="index, follow" />')
    .replace('<link rel="canonical" href="https://matiscoene.com/" />', `<link rel="canonical" href="${canonical}" />`)
    .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
    .replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${description}" />`)
    .replace(/<meta property="og:title" content="[^"]*" \/>/, `<meta property="og:title" content="${title}" />`)
    .replace(/<meta property="og:description" content="[^"]*" \/>/, `<meta property="og:description" content="${description}" />`)
    .replace(/<meta property="og:url" content="[^"]*" \/>/, `<meta property="og:url" content="${canonical}" />`)
    .replace(/<meta name="twitter:title" content="[^"]*" \/>/, `<meta name="twitter:title" content="${title}" />`)
    .replace(/<meta name="twitter:description" content="[^"]*" \/>/, `<meta name="twitter:description" content="${description}" />`);
  const images = getPublicSiteImageUrls();
  const sections = {
    head,
    header: header.replace("{headerImage}", images.header),
    main,
    footer,
  };
  const html = template
    .replace("<html lang=\"en\">", '<html lang="nl">')
    .replace(
      /\{(head|header|main|footer)\}/g,
      (_match, section: keyof typeof sections) => sections[section],
    );

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function resolveRequestPath(pathname: string, baseDir: string): string {
  const normalized = pathname.replace(/^\/+/, "").replace(/\/+/g, "/");
  if (!normalized) {
    return `${baseDir}/index.html`;
  }
  return `${baseDir}/${normalized}`;
}

async function handleStaticResource(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  const pathname = url.pathname.replace(/\/+$/, "") || "/";

  if (pathname === "/" || pathname === "/index.html") {
    return await servePublicIndex();
  }

  const legalPages: Record<string, [string, string, string]> = {
    "/privacy-policy": ["Privacy Policy | Matis Coene", "Privacyverklaring van Matis Coene over gegevens uit het contactformulier.", "privacy-policy.html"],
    "/privacy-policy.html": ["Privacy Policy | Matis Coene", "Privacyverklaring van Matis Coene over gegevens uit het contactformulier.", "privacy-policy.html"],
    "/algemene-voorwaarden": ["Algemene Voorwaarden | Matis Coene", "Algemene voorwaarden voor het gebruik van de website en freelance diensten van Matis Coene.", "algemene-voorwaarden.html"],
    "/algemene-voorwaarden.html": ["Algemene Voorwaarden | Matis Coene", "Algemene voorwaarden voor het gebruik van de website en freelance diensten van Matis Coene.", "algemene-voorwaarden.html"],
    "/cookie-policy": ["Cookie Policy | Matis Coene", "Overzicht van cookies en andere opslag die gebruikt worden op matiscoene.com.", "cookie-policy.html"],
    "/cookie-policy.html": ["Cookie Policy | Matis Coene", "Overzicht van cookies en andere opslag die gebruikt worden op matiscoene.com.", "cookie-policy.html"],
  };
  const legalPage = legalPages[pathname];
  if (legalPage) {
    const slug = pathname.replace(/\.html$/, "").replace(/^\//, "");
    return await servePublicLegalPage(slug, legalPage[0], legalPage[1], legalPage[2]);
  }

  if (pathname.startsWith("/uploads/")) {
    const relativePath = pathname.slice("/uploads/".length);
    return await serveFile(`${appRoot}/uploads/${relativePath}`);
  }

  if (pathname.startsWith("/admin/")) {
    if (pathname === "/admin" || pathname === "/admin/") {
      return new Response(null, { status: 302, headers: { Location: "/admin/projects" } });
    }

    if (pathname === "/admin/login") {
      return await serveFile(`${appRoot}/admin/login.html`);
    }

    if (pathname === "/admin/profile") {
      return await serveFile(`${appRoot}/admin/profile.html`);
    }

    if (pathname === "/admin/site-images") {
      return await serveFile(`${appRoot}/admin/site-images/index.html`);
    }

    if (pathname === "/admin/email-settings") {
      return await serveFile(`${appRoot}/admin/email-settings/index.html`);
    }

    if (pathname === "/admin/projects") {
      return await serveFile(`${appRoot}/admin/projects/index.html`);
    }

    if (pathname === "/admin/projects/new") {
      return await serveFile(`${appRoot}/admin/projects/new.html`);
    }

    if (/^\/admin\/projects\/\d+\/edit$/.test(pathname)) {
      return await serveFile(`${appRoot}/admin/projects/edit.html`);
    }

    if (pathname === "/admin/users") {
      return await serveFile(`${appRoot}/admin/users/index.html`);
    }

    const relativePath = pathname.slice("/admin/".length);
    return await serveFile(`${appRoot}/admin/${relativePath}`);
  }

  const publicPath = resolveRequestPath(pathname, `${appRoot}/public`);
  return await serveFile(publicPath);
}

async function handleAdminAccess(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const user = await getCurrentUser(request);

  if (pathname === "/admin/login") {
    return null;
  }

  const isAdminAsset = /\/admin\/(?:css|js|images|img|fonts)\//.test(pathname) || /\.(?:css|js|png|jpg|jpeg|gif|svg|ico|webp)$/.test(pathname);
  if (isAdminAsset) {
    return null;
  }

  if (!user) {
    return new Response(null, { status: 302, headers: { Location: "/admin/login" } });
  }

  if (pathname === "/admin" || pathname === "/admin/") {
    return new Response(null, { status: 302, headers: { Location: "/admin/projects" } });
  }

  if (pathname === "/admin/users" && user.role !== "ADMIN") {
    return new Response("Access denied", { status: 403 });
  }

  if (pathname === "/admin/email-settings" && user.role !== "ADMIN") {
    return new Response("Access denied", { status: 403 });
  }

  return null;
}

const database = await initDatabase();
(globalThis as typeof globalThis & { appDatabase?: unknown }).appDatabase = database;

Deno.serve({ port }, async (request: Request, info) => {
  const url = new URL(request.url);
  const pathname = url.pathname;

  if (pathname.startsWith("/api/")) {
    const authResponse = await handleAuthRoutes(request);
    if (authResponse) {
      return authResponse;
    }

    const emailResponse = await handleEmailRoutes(
      request,
      info.remoteAddr.transport === "tcp" ? info.remoteAddr.hostname : "unknown",
    );
    if (emailResponse) {
      return emailResponse;
    }

    const publicResponse = await handlePublicRoutes(request);
    if (publicResponse) {
      return publicResponse;
    }

    const projectResponse = await handleProjectRoutes(request);
    if (projectResponse) {
      return projectResponse;
    }

    const siteImageResponse = await handleSiteImageRoutes(request);
    if (siteImageResponse) {
      return siteImageResponse;
    }

    const userResponse = await handleUsersRoutes(request);
    if (userResponse) {
      return userResponse;
    }

    return new Response(JSON.stringify({ message: "Not found." }), {
      status: 404,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }

  if (pathname.startsWith("/admin")) {
    const adminAccess = await handleAdminAccess(request);
    if (adminAccess) {
      return adminAccess;
    }
  }

  return await handleStaticResource(request) ?? new Response("Not found", { status: 404 });
});
