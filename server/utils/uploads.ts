export const MAX_PROJECT_IMAGES = 20;
export const MIN_PROJECT_IMAGES = 7;
export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export function validateUploadedImage(file: File): { valid: true } | { valid: false; message: string } {
  if (!(file instanceof File)) {
    return { valid: false, message: "Invalid upload." };
  }

  if (file.size <= 0) {
    return { valid: false, message: "The file is empty." };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { valid: false, message: "Each image must be smaller than 5MB." };
  }

  const mimeType = file.type.toLowerCase();
  if (!allowedMimeTypes.has(mimeType)) {
    return { valid: false, message: "Only PNG, JPG, GIF and WEBP files are allowed." };
  }

  const extension = getSafeExtensionFromMime(mimeType);
  if (!extension) {
    return { valid: false, message: "Unsupported image type." };
  }

  return { valid: true };
}

export function getSafeExtensionFromMime(mimeType: string): string | null {
  const lookup: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
  };
  return lookup[mimeType.toLowerCase()] ?? null;
}

export function sanitizeFilename(name: string): string {
  const base = (name || "upload")
    .replace(/\\/g, "/")
    .split("/").pop() ?? "upload";
  const safeBase = base
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);

  return safeBase || "upload";
}

export async function saveUploadedProjectImage(file: File): Promise<{ filename: string; path: string }> {
  const validation = validateUploadedImage(file);
  if (!validation.valid) {
    throw new Error(validation.message);
  }

  const extension = getSafeExtensionFromMime(file.type.toLowerCase());
  const filename = `matiscoene-${crypto.randomUUID()}.${extension}`;
  const uploadDir = `${Deno.cwd()}/uploads/projects`;
  await Deno.mkdir(uploadDir, { recursive: true });
  const targetPath = `${uploadDir}/${filename}`;

  const bytes = new Uint8Array(await file.arrayBuffer());
  await Deno.writeFile(targetPath, bytes);

  return { filename, path: targetPath };
}

export async function saveUploadedSiteImage(file: File): Promise<{ filename: string; path: string }> {
  const validation = validateUploadedImage(file);
  if (!validation.valid) {
    throw new Error(validation.message);
  }

  const extension = getSafeExtensionFromMime(file.type.toLowerCase());
  const filename = `matiscoene-${crypto.randomUUID()}.${extension}`;
  const uploadDir = `${Deno.cwd()}/uploads/site`;
  await Deno.mkdir(uploadDir, { recursive: true });
  const targetPath = `${uploadDir}/${filename}`;

  const bytes = new Uint8Array(await file.arrayBuffer());
  await Deno.writeFile(targetPath, bytes);

  return { filename, path: targetPath };
}

export async function removeUploadedSiteImage(filename: string): Promise<void> {
  if (!/^(?:matiscoene-)?[a-f0-9-]+\.(?:jpg|png|webp|gif)$/i.test(filename)) {
    return;
  }

  try {
    await Deno.remove(`${Deno.cwd()}/uploads/site/${filename}`);
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) {
      throw error;
    }
  }
}

export async function removeUploadedProjectImage(filename: string): Promise<void> {
  if (!filename || filename.includes("../") || filename.includes("..\\")) {
    return;
  }

  const filePath = `${Deno.cwd()}/uploads/projects/${filename}`;
  try {
    await Deno.remove(filePath);
  } catch (_error) {
    // file may already be gone, ignore
  }
}

import type { DB } from "https://deno.land/x/sqlite@v3.9.1/mod.ts";

export async function removeProjectImageFiles(projectId: number, db: DB): Promise<void> {
  const rows = db.queryEntries<{ filename: string }>(
    "SELECT filename FROM project_images WHERE project_id = ? ORDER BY position ASC",
    [projectId],
  );

  for (const row of rows) {
    await removeUploadedProjectImage(row.filename);
  }
}
