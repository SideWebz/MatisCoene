import { getCurrentUser } from "../auth/session.ts";
import { getDatabase } from "../database/db.ts";
import { removeUploadedSiteImage, saveUploadedSiteImage } from "../utils/uploads.ts";

const defaultSiteImages = {
  header: "/assets/images/matis-coene-header.JPG",
  about: "/assets/images/matis-coene-about.JPG",
  contact: "/assets/images/matis-coene-contact.JPG",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export function getPublicSiteImageUrls(): typeof defaultSiteImages {
  const db = getDatabase();
  const images = { ...defaultSiteImages };
  const rows = db.queryEntries<{ image_key: keyof typeof images; filename: string }>(
    "SELECT image_key, filename FROM site_images",
  );

  for (const row of rows) {
    images[row.image_key] = `/uploads/site/${encodeURIComponent(row.filename)}`;
  }

  return images;
}

export async function handleSiteImageRoutes(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/site-images") {
    return null;
  }

  const currentUser = await getCurrentUser(request);
  if (!currentUser) {
    return jsonResponse({ message: "Unauthorized." }, 401);
  }

  if (request.method === "GET") {
    return jsonResponse({ images: getPublicSiteImageUrls() });
  }

  if (request.method !== "POST") {
    return null;
  }

  let savedFilename: string | null = null;
  let imageWasUpdated = false;
  try {
    const formData = await request.formData();
    const imageKey = formData.get("image");
    const file = formData.get("file");

    if (imageKey !== "header" && imageKey !== "about" && imageKey !== "contact") {
      return jsonResponse({ message: "Choose a valid website image." }, 400);
    }
    if (!(file instanceof File)) {
      return jsonResponse({ message: "Choose an image to upload." }, 400);
    }

    const savedImage = await saveUploadedSiteImage(file);
    savedFilename = savedImage.filename;

    const db = getDatabase();
    const previous = db.queryEntries<{ filename: string }>(
      "SELECT filename FROM site_images WHERE image_key = ?",
      [imageKey],
    )[0]?.filename;

    db.query(
      `INSERT INTO site_images (image_key, filename, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(image_key) DO UPDATE SET filename = excluded.filename, updated_at = excluded.updated_at`,
      [imageKey, savedFilename, new Date().toISOString()],
    );
    imageWasUpdated = true;

    if (previous) {
      try {
        await removeUploadedSiteImage(previous);
      } catch (error) {
        console.error("Website image was updated, but the previous file could not be removed.", error);
        return jsonResponse({
          message: "Image updated, but the previous image could not be removed.",
          image: `/uploads/site/${encodeURIComponent(savedFilename)}`,
          warning: true,
        });
      }
    }

    return jsonResponse({
      message: "Website image updated successfully.",
      image: `/uploads/site/${encodeURIComponent(savedFilename)}`,
    });
  } catch (error) {
    if (savedFilename && !imageWasUpdated) {
      await removeUploadedSiteImage(savedFilename);
    }
    const message = error instanceof Error ? error.message : "Unable to update website image.";
    return jsonResponse({ message }, 400);
  }
}
