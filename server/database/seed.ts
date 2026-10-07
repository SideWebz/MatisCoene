import type { DB } from "https://deno.land/x/sqlite@v3.9.1/mod.ts";
import { hashPassword } from "../auth/password.ts";

export async function seedDatabase(db: DB): Promise<void> {
  const rows = db.queryEntries<{ count: number }>("SELECT COUNT(*) AS count FROM users");
  const userCount = Number(rows[0]?.count ?? 0);

  if (userCount > 0) {
    return;
  }

  const passwordHash = await hashPassword("admin");
  db.query("INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)", [
    "admin",
    passwordHash,
    "ADMIN",
  ]);
}
