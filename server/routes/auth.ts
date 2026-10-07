import { verifyPassword } from "../auth/password.ts";
import {
  createSession,
  createSessionCookie,
  clearSessionCookie,
  destroySession,
  getCurrentUser,
  getSessionIdFromRequest,
} from "../auth/session.ts";
import { getDatabase } from "../database/db.ts";

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}

export async function handleAuthRoutes(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  const db = getDatabase();

  if (request.method === "GET" && url.pathname === "/api/session") {
    const user = await getCurrentUser(request);
    if (!user) {
      return jsonResponse({ message: "Unauthorized" }, 401);
    }

    return jsonResponse({
      user: { id: user.id, username: user.username, role: user.role },
    });
  }

  if (request.method === "POST" && url.pathname === "/api/auth/login") {
    try {
      const payload = await request.json();
      const username = typeof payload?.username === "string" ? payload.username.trim() : "";
      const password = typeof payload?.password === "string" ? payload.password : "";

      if (!username || !password) {
        return jsonResponse({ message: "Username and password are required." }, 400);
      }

      const rows = db.queryEntries<{ id: number; username: string; password_hash: string; role: string }>(
        "SELECT id, username, password_hash, role FROM users WHERE username = ?",
        [username],
      );

      const user = rows[0];
      if (!user) {
        return jsonResponse({ message: "Invalid credentials." }, 401);
      }

      const validPassword = await verifyPassword(password, user.password_hash);
      if (!validPassword) {
        return jsonResponse({ message: "Invalid credentials." }, 401);
      }

      const sessionId = await createSession(user.id);
      return jsonResponse(
        {
          message: "Login successful.",
          user: { id: user.id, username: user.username, role: user.role },
        },
        200,
        { "Set-Cookie": createSessionCookie(sessionId) },
      );
    } catch (_error) {
      return jsonResponse({ message: "Invalid request body." }, 400);
    }
  }

  if (request.method === "POST" && url.pathname === "/api/auth/logout") {
    const sessionId = getSessionIdFromRequest(request);
    const user = await getCurrentUser(request);

    if (!user || !sessionId) {
      return jsonResponse({ message: "No active session." }, 401, { "Set-Cookie": clearSessionCookie() });
    }

    await destroySession(user.id, sessionId);
    return jsonResponse({ message: "Logged out." }, 200, { "Set-Cookie": clearSessionCookie() });
  }

  return null;
}
