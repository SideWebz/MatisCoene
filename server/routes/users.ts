import { hashPassword, verifyPassword } from "../auth/password.ts";
import { getCurrentUser } from "../auth/session.ts";
import { getDatabase } from "../database/db.ts";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export async function handleUsersRoutes(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  const db = getDatabase();
  const currentUser = await getCurrentUser(request);

  if (request.method === "GET" && url.pathname === "/api/profile") {
    if (!currentUser) {
      return jsonResponse({ message: "Unauthorized." }, 401);
    }

    return jsonResponse({ user: { id: currentUser.id, username: currentUser.username, role: currentUser.role } });
  }

  if (request.method === "POST" && url.pathname === "/api/profile/password") {
    if (!currentUser) {
      return jsonResponse({ message: "Unauthorized." }, 401);
    }

    try {
      const payload = await request.json();
      const currentPassword = typeof payload?.currentPassword === "string" ? payload.currentPassword : "";
      const newPassword = typeof payload?.newPassword === "string" ? payload.newPassword : "";
      const confirmPassword = typeof payload?.confirmPassword === "string" ? payload.confirmPassword : "";

      if (!currentPassword || !newPassword || !confirmPassword) {
        return jsonResponse({ message: "All password fields are required." }, 400);
      }

      if (newPassword.length < 6) {
        return jsonResponse({ message: "New password must have at least 6 characters." }, 400);
      }

      if (newPassword !== confirmPassword) {
        return jsonResponse({ message: "New passwords do not match." }, 400);
      }

      const userRow = db.queryEntries<{ password_hash: string }>(
        "SELECT password_hash FROM users WHERE id = ?",
        [currentUser.id],
      )[0];

      if (!userRow) {
        return jsonResponse({ message: "User not found." }, 404);
      }

      const matchesCurrent = await verifyPassword(currentPassword, userRow.password_hash);
      if (!matchesCurrent) {
        return jsonResponse({ message: "Current password is incorrect." }, 401);
      }

      const newHash = await hashPassword(newPassword);
      db.query("UPDATE users SET password_hash = ? WHERE id = ?", [newHash, currentUser.id]);

      return jsonResponse({ message: "Password updated successfully." });
    } catch (_error) {
      return jsonResponse({ message: "Invalid request body." }, 400);
    }
  }

  if (request.method === "GET" && url.pathname === "/api/users") {
    if (!currentUser) {
      return jsonResponse({ message: "Unauthorized." }, 401);
    }

    if (currentUser.role !== "ADMIN") {
      return jsonResponse({ message: "Access denied." }, 403);
    }

    const rows = db.queryEntries<{ id: number; username: string; role: string; created_at: string }>(
      "SELECT id, username, role, created_at FROM users ORDER BY created_at ASC",
    );

    return jsonResponse({ users: rows.map((row) => ({ ...row, id: Number(row.id) })) });
  }

  if (request.method === "POST" && url.pathname === "/api/users") {
    if (!currentUser) {
      return jsonResponse({ message: "Unauthorized." }, 401);
    }

    if (currentUser.role !== "ADMIN") {
      return jsonResponse({ message: "Access denied." }, 403);
    }

    try {
      const payload = await request.json();
      const username = typeof payload?.username === "string" ? payload.username.trim() : "";
      const password = typeof payload?.password === "string" ? payload.password : "";
      const role = typeof payload?.role === "string" ? payload.role.toUpperCase() : "";

      if (!username || !password) {
        return jsonResponse({ message: "Username and password are required." }, 400);
      }

      if (!["ADMIN", "USER"].includes(role)) {
        return jsonResponse({ message: "Role must be ADMIN or USER." }, 400);
      }

      if (password.length < 6) {
        return jsonResponse({ message: "Password must contain at least 6 characters." }, 400);
      }

      const existing = db.queryEntries<{ id: number }>("SELECT id FROM users WHERE username = ?", [username]);
      if (existing.length > 0) {
        return jsonResponse({ message: "Username already exists." }, 409);
      }

      const passwordHash = await hashPassword(password);
      db.query("INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)", [
        username,
        passwordHash,
        role,
      ]);

      return jsonResponse({ message: "User created successfully." }, 201);
    } catch (_error) {
      return jsonResponse({ message: "Invalid request body." }, 400);
    }
  }

  if (request.method === "DELETE" && url.pathname.startsWith("/api/users/")) {
    if (!currentUser) {
      return jsonResponse({ message: "Unauthorized." }, 401);
    }

    if (currentUser.role !== "ADMIN") {
      return jsonResponse({ message: "Access denied." }, 403);
    }

    const userId = Number(url.pathname.split("/").pop());
    if (!Number.isFinite(userId) || userId <= 0) {
      return jsonResponse({ message: "Invalid user ID." }, 400);
    }

    if (userId === currentUser.id) {
      return jsonResponse({ message: "You cannot delete your own account." }, 400);
    }

    db.query("DELETE FROM users WHERE id = ?", [userId]);
    if (db.changes === 0) {
      return jsonResponse({ message: "User not found." }, 404);
    }

    return jsonResponse({ message: "User deleted." });
  }

  return null;
}
