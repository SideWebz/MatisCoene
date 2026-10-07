import { getDatabase } from "../database/db.ts";

export interface AuthUser {
  id: number;
  username: string;
  role: "ADMIN" | "USER";
}

const SESSION_TTL_MS = 1000 * 60 * 60 * 8;

export function createSessionCookie(sessionId: string): string {
  return `session=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)};`;
}

export function clearSessionCookie(): string {
  return "session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0;";
}

export function getSessionIdFromRequest(request: Request): string | null {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const cookies = cookieHeader.split(";").map((cookie) => cookie.trim());

  for (const cookie of cookies) {
    const [name, value] = cookie.split("=");
    if (name === "session" && value) {
      return value;
    }
  }

  return null;
}

export async function getCurrentUser(request: Request): Promise<AuthUser | null> {
  const db = getDatabase();
  const sessionId = getSessionIdFromRequest(request);

  if (!sessionId) {
    return null;
  }

  const rows = db.queryEntries<{ user_id: number; username: string; role: string; expires_at: string }>(
    `SELECT users.id AS user_id, users.username, users.role, sessions.expires_at
     FROM sessions
     INNER JOIN users ON users.id = sessions.user_id
     WHERE sessions.id = ? AND sessions.expires_at > ?`,
    [sessionId, new Date().toISOString()],
  );

  const userRow = rows[0];
  if (!userRow) {
    return null;
  }

  return {
    id: Number(userRow.user_id),
    username: userRow.username,
    role: userRow.role as "ADMIN" | "USER",
  };
}

export async function createSession(userId: number): Promise<string> {
  const db = getDatabase();
  const sessionId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

  db.query(
    "INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
    [sessionId, userId, createdAt, expiresAt],
  );

  return sessionId;
}

export async function destroySession(userId: number, sessionId: string): Promise<void> {
  const db = getDatabase();
  db.query("DELETE FROM sessions WHERE user_id = ? AND id = ?", [userId, sessionId]);
}

export async function destroyAllSessionsForUser(userId: number): Promise<void> {
  const db = getDatabase();
  db.query("DELETE FROM sessions WHERE user_id = ?", [userId]);
}
