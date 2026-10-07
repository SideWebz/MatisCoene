import { getCurrentUser } from "./auth/session.ts";
import { initDatabase } from "./database/db.ts";
import { handleAuthRoutes } from "./routes/auth.ts";
import { handleProjectRoutes } from "./routes/projects.ts";
import { handlePublicRoutes } from "./routes/public.ts";
import { handleUsersRoutes } from "./routes/users.ts";

const appRoot = Deno.cwd();

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

function resolveRequestPath(pathname: string, baseDir: string): string {
  const normalized = pathname.replace(/^\/+/, "").replace(/\/+/g, "/");
  if (!normalized) {
    return `${baseDir}/index.html`;
  }
  return `${baseDir}/${normalized}`;
}

async function handleStaticResource(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  const pathname = url.pathname;

  if (pathname === "/") {
    return await serveFile(`${appRoot}/public/index.html`);
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

  return null;
}

const database = await initDatabase();
(globalThis as typeof globalThis & { appDatabase?: unknown }).appDatabase = database;

Deno.serve(async (request: Request) => {
  const url = new URL(request.url);
  const pathname = url.pathname;

  if (pathname.startsWith("/api/")) {
    const authResponse = await handleAuthRoutes(request);
    if (authResponse) {
      return authResponse;
    }

    const publicResponse = await handlePublicRoutes(request);
    if (publicResponse) {
      return publicResponse;
    }

    const projectResponse = await handleProjectRoutes(request);
    if (projectResponse) {
      return projectResponse;
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
