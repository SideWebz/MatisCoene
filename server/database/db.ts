import { DB } from "https://deno.land/x/sqlite@v3.9.1/mod.ts";
import { seedDatabase } from "./seed.ts";

export const DB_PATH = `${Deno.cwd()}/server/database/database.db`;
export const SCHEMA_PATH = `${Deno.cwd()}/server/database/schema.sql`;

function migrateSiteImagesTable(db: DB): void {
  const table = db.queryEntries<{ sql: string }>(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'site_images'",
  )[0];

  if (!table || table.sql.toLowerCase().includes("'about'")) {
    return;
  }

  db.execute("BEGIN");
  try {
    db.execute(`
      CREATE TABLE site_images_new (
        image_key TEXT PRIMARY KEY CHECK(image_key IN ('header', 'about', 'contact')),
        filename TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    db.execute(`
      INSERT INTO site_images_new (image_key, filename, updated_at)
      SELECT image_key, filename, updated_at FROM site_images
    `);
    db.execute("DROP TABLE site_images");
    db.execute("ALTER TABLE site_images_new RENAME TO site_images");
    db.execute("COMMIT");
  } catch (error) {
    db.execute("ROLLBACK");
    throw error;
  }
}

export async function initDatabase(): Promise<DB> {
  const db = new DB(DB_PATH);
  db.execute("PRAGMA foreign_keys = ON;");

  const schemaSql = await Deno.readTextFile(SCHEMA_PATH);
  db.execute(schemaSql);
  migrateSiteImagesTable(db);
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
