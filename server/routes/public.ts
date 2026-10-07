import { getDatabase } from "../database/db.ts";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export async function handlePublicRoutes(request: Request): Promise<Response | null> {
  const url = new URL(request.url);

  if (request.method === "GET" && url.pathname === "/api/public/projects") {
    const db = getDatabase();
    const projects = db.queryEntries<{ id: number; title: string; text: string; active: number; position: number; created_at: string; updated_at: string }>(
      "SELECT id, title, text, active, position, created_at, updated_at FROM projects WHERE active = 1 ORDER BY position ASC, id ASC",
    );

    const payload = projects.map((project) => {
      const images = db.queryEntries<{ id: number; filename: string; position: number }>(
        "SELECT id, filename, position FROM project_images WHERE project_id = ? ORDER BY position ASC, id ASC",
        [project.id],
      );

      return {
        id: Number(project.id),
        title: project.title,
        text: project.text,
        active: Number(project.active) === 1,
        position: Number(project.position),
        images: images.map((image) => ({
          id: Number(image.id),
          filename: image.filename,
          position: Number(image.position),
          url: `/uploads/projects/${image.filename}`,
        })),
      };
    });

    return jsonResponse({ projects: payload });
  }

  return null;
}
