import { DB } from "https://deno.land/x/sqlite@v3.9.1/mod.ts";
import { seedDatabase } from "./seed.ts";

export const DB_PATH = `${Deno.cwd()}/server/database/database.db`;
export const SCHEMA_PATH = `${Deno.cwd()}/server/database/schema.sql`;

export async function initDatabase(): Promise<DB> {
  const db = new DB(DB_PATH);
  db.execute("PRAGMA foreign_keys = ON;");

  const schemaSql = await Deno.readTextFile(SCHEMA_PATH);
  db.execute(schemaSql);
  await seedDatabase(db);

  return db;
}

export function getDatabase(): DB {
  const globalWithDb = globalThis as typeof globalThis & {
    appDatabase?: DB;
  };

  if (!globalWithDb.appDatabase) {
    throw new Error("Database is not initialized.");
  }

  return globalWithDb.appDatabase;
}
