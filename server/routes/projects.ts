import { getCurrentUser } from "../auth/session.ts";
import { getDatabase } from "../database/db.ts";
import {
  MAX_PROJECT_IMAGES,
  MIN_PROJECT_IMAGES,
  removeProjectImageFiles,
  removeUploadedProjectImage,
  saveUploadedProjectImage,
} from "../utils/uploads.ts";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function getProjectImageCount(db: ReturnType<typeof getDatabase>, projectId: number): number {
  const rows = db.queryEntries<{ count: number }>("SELECT COUNT(*) AS count FROM project_images WHERE project_id = ?", [projectId]);
  return Number(rows[0]?.count ?? 0);
}

function mapProjectRow(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    title: String(row.title),
    text: String(row.text),
    active: Number(row.active) === 1,
    position: Number(row.position),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    image_count: Number(row.image_count ?? 0),
  };
}

async function loadProjectById(projectId: number) {
  const db = getDatabase();
  const projectRows = db.queryEntries<{ id: number; title: string; text: string; active: number; position: number; created_at: string; updated_at: string; image_count: number }>(
    `SELECT p.id, p.title, p.text, p.active, p.position, p.created_at, p.updated_at,
            (SELECT COUNT(*) FROM project_images pi WHERE pi.project_id = p.id) AS image_count
     FROM projects p
     WHERE p.id = ?`,
    [projectId],
  );

  if (!projectRows[0]) {
    return null;
  }

  const project = mapProjectRow(projectRows[0]);
  const images = db.queryEntries<{ id: number; filename: string; position: number }>(
    "SELECT id, filename, position FROM project_images WHERE project_id = ? ORDER BY position ASC, id ASC",
    [project.id],
  );

  return {
    ...project,
    images: images.map((image) => ({
      id: Number(image.id),
      filename: image.filename,
      position: Number(image.position),
      url: `/uploads/projects/${image.filename}`,
    })),
  };
}

async function reorderProjectPositions(projects: { id: number; position: number }[]): Promise<void> {
  const db = getDatabase();
  for (const project of projects) {
    db.query("UPDATE projects SET position = ? WHERE id = ?", [project.position, project.id]);
  }
}

export async function handleProjectRoutes(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  const db = getDatabase();
  const currentUser = await getCurrentUser(request);

  if (!currentUser) {
    return jsonResponse({ message: "Unauthorized." }, 401);
  }

  if (request.method === "GET" && url.pathname === "/api/projects") {
    const rows = db.queryEntries<{ id: number; title: string; text: string; active: number; position: number; created_at: string; updated_at: string }>(
      "SELECT id, title, text, active, position, created_at, updated_at FROM projects ORDER BY position ASC, id ASC",
    );

    const payload = await Promise.all(
      rows.map(async (row) => {
        const images = db.queryEntries<{ id: number; filename: string; position: number }>(
          "SELECT id, filename, position FROM project_images WHERE project_id = ? ORDER BY position ASC, id ASC",
          [row.id],
        );

        return {
          id: Number(row.id),
          title: row.title,
          text: row.text,
          active: Number(row.active) === 1,
          position: Number(row.position),
          created_at: row.created_at,
          updated_at: row.updated_at,
          image_count: images.length,
          images: images.map((image) => ({
            id: Number(image.id),
            filename: image.filename,
            position: Number(image.position),
            url: `/uploads/projects/${image.filename}`,
          })),
        };
      }),
    );

    return jsonResponse({ projects: payload });
  }

  if (request.method === "GET" && url.pathname.startsWith("/api/projects/")) {
    const match = url.pathname.match(/^\/api\/projects\/(\d+)$/);
    if (!match) {
      return null;
    }

    const projectId = Number(match[1]);
    const project = await loadProjectById(projectId);
    if (!project) {
      return jsonResponse({ message: "Project not found." }, 404);
    }

    return jsonResponse({ project });
  }

  if (request.method === "POST" && url.pathname === "/api/projects") {
    try {
      const formData = await request.formData();
      const title = String(formData.get("title") ?? "").trim();
      const text = String(formData.get("text") ?? "").trim();
      const uploadedFiles = Array.from(formData.getAll("files")).filter((value): value is File => value instanceof File);

      if (!title || !text) {
        return jsonResponse({ message: "Title and text are required." }, 400);
      }

      if (uploadedFiles.length < MIN_PROJECT_IMAGES || uploadedFiles.length > MAX_PROJECT_IMAGES) {
        return jsonResponse({
          message: `Please select between ${MIN_PROJECT_IMAGES} and ${MAX_PROJECT_IMAGES} images.`,
        }, 400);
      }

      const savedImages: { filename: string; path: string }[] = [];
      for (const file of uploadedFiles) {
        const validation = await saveUploadedProjectImage(file);
        savedImages.push(validation);
      }

      db.execute("BEGIN");
      try {
        const projectPositionResult = db.queryEntries<{ next_position: number }>(
          "SELECT COALESCE(MAX(position), 0) + 1 AS next_position FROM projects",
        );
        const nextPosition = Number(projectPositionResult[0]?.next_position ?? 1);

        db.query(
          "INSERT INTO projects (title, text, active, position) VALUES (?, ?, 1, ?)",
          [title, text, nextPosition],
        );

        const projectId = Number(db.lastInsertRowId ?? 0);

        if (!projectId) {
          throw new Error("Project could not be created.");
        }

        savedImages.forEach((image, index) => {
          db.query(
            "INSERT INTO project_images (project_id, filename, position) VALUES (?, ?, ?)",
            [projectId, image.filename, index + 1],
          );
        });

        db.execute("COMMIT");
      } catch (error) {
        db.execute("ROLLBACK");
        for (const image of savedImages) {
          await removeUploadedProjectImage(image.filename);
        }
        throw error;
      }

      return jsonResponse({ message: "Project created successfully." }, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to create project.";
      return jsonResponse({ message }, 400);
    }
  }

  if (request.method === "DELETE" && url.pathname.startsWith("/api/projects/")) {
    const match = url.pathname.match(/^\/api\/projects\/(\d+)$/);
    if (!match) {
      return null;
    }

    const projectId = Number(match[1]);
    const project = await loadProjectById(projectId);
    if (!project) {
      return jsonResponse({ message: "Project not found." }, 404);
    }

    await removeProjectImageFiles(projectId, db);
    db.query("DELETE FROM projects WHERE id = ?", [projectId]);

    return jsonResponse({ message: "Project deleted." });
  }

  if (request.method === "PATCH" && url.pathname.startsWith("/api/projects/") && url.pathname.endsWith("/toggle")) {
    const match = url.pathname.match(/^\/api\/projects\/(\d+)\/toggle$/);
    if (!match) {
      return null;
    }

    const projectId = Number(match[1]);
    const project = await loadProjectById(projectId);
    if (!project) {
      return jsonResponse({ message: "Project not found." }, 404);
    }

    const nextActive = project.active ? 0 : 1;
    db.query("UPDATE projects SET active = ?, updated_at = ? WHERE id = ?", [nextActive ? 1 : 0, new Date().toISOString(), projectId]);
    return jsonResponse({ message: "Project status updated.", active: nextActive === 1 });
  }

  if (request.method === "PUT" && url.pathname === "/api/projects/reorder") {
    try {
      const body = await request.json().catch(() => ({}));
      const order = Array.isArray(body?.order) ? body.order.map(Number) : [];

      if (!order.length) {
        return jsonResponse({ message: "No project order was provided." }, 400);
      }

      const rows = db.queryEntries<{ id: number }>("SELECT id FROM projects ORDER BY position ASC, id ASC");
      const validIds = new Set(rows.map((row) => Number(row.id)));
      const hasInvalidIds = order.some((id) => !validIds.has(id));
      if (hasInvalidIds) {
        return jsonResponse({ message: "One or more project IDs are invalid." }, 400);
      }

      const normalizedOrder = [...order];
      for (const existingId of rows.map((row) => Number(row.id))) {
        if (!normalizedOrder.includes(existingId)) {
          normalizedOrder.push(existingId);
        }
      }

      for (let index = 0; index < normalizedOrder.length; index += 1) {
        db.query("UPDATE projects SET position = ? WHERE id = ?", [index + 1, normalizedOrder[index]]);
      }

      return jsonResponse({ message: "Project order updated." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to reorder projects.";
      return jsonResponse({ message }, 400);
    }
  }

  if (request.method === "PATCH" && url.pathname.startsWith("/api/projects/") && url.pathname.endsWith("/position")) {
    const match = url.pathname.match(/^\/api\/projects\/(\d+)\/position$/);
    if (!match) {
      return null;
    }

    const projectId = Number(match[1]);
    const body = await request.json().catch(() => ({}));
    const direction = body?.direction === "down" ? "down" : "up";

    const projects = db.queryEntries<{ id: number; position: number }>(
      "SELECT id, position FROM projects ORDER BY position ASC, id ASC",
    );

    const index = projects.findIndex((project) => Number(project.id) === projectId);
    if (index === -1) {
      return jsonResponse({ message: "Project not found." }, 404);
    }

    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= projects.length) {
      return jsonResponse({ message: "Project cannot be moved further." }, 400);
    }

    const currentProject = projects[index];
    const neighborProject = projects[targetIndex];
    const currentPosition = Number(currentProject.position);
    const neighborPosition = Number(neighborProject.position);

    db.query("UPDATE projects SET position = ? WHERE id = ?", [neighborPosition, projectId]);
    db.query("UPDATE projects SET position = ? WHERE id = ?", [currentPosition, neighborProject.id]);

    return jsonResponse({ message: "Project order updated." });
  }

  if (request.method === "PATCH" && url.pathname.startsWith("/api/projects/") && url.pathname.endsWith("/images/reorder")) {
    const match = url.pathname.match(/^\/api\/projects\/(\d+)\/images\/reorder$/);
    if (!match) {
      return null;
    }

    const projectId = Number(match[1]);
    const project = await loadProjectById(projectId);
    if (!project) {
      return jsonResponse({ message: "Project not found." }, 404);
    }

    const payload = await request.json().catch(() => ({}));
    const order = Array.isArray(payload?.order) ? payload.order.map(Number) : [];
    if (!order.length) {
      return jsonResponse({ message: "No image order was provided." }, 400);
    }

    const validIds = project.images.map((image) => image.id);
    const invalid = order.some((id: number) => !validIds.includes(id));
    if (invalid) {
      return jsonResponse({ message: "One or more image IDs are invalid." }, 400);
    }

    for (let i = 0; i < order.length; i += 1) {
      db.query("UPDATE project_images SET position = ? WHERE id = ? AND project_id = ?", [i + 1, order[i], projectId]);
    }

    return jsonResponse({ message: "Image order updated." });
  }

  if (request.method === "DELETE" && url.pathname.match(/^\/api\/projects\/\d+\/images\/\d+$/)) {
    const match = url.pathname.match(/^\/api\/projects\/(\d+)\/images\/(\d+)$/);
    if (!match) {
      return null;
    }

    const projectId = Number(match[1]);
    const imageId = Number(match[2]);
    const project = await loadProjectById(projectId);
    if (!project) {
      return jsonResponse({ message: "Project not found." }, 404);
    }

    const image = project.images.find((item) => item.id === imageId);
    if (!image) {
      return jsonResponse({ message: "Image not found." }, 404);
    }

    const remaining = project.images.filter((item) => item.id !== imageId);
    if (remaining.length < MIN_PROJECT_IMAGES) {
      return jsonResponse({ message: `A project must retain at least ${MIN_PROJECT_IMAGES} images.` }, 400);
    }

    await removeUploadedProjectImage(image.filename);
    db.query("DELETE FROM project_images WHERE id = ? AND project_id = ?", [imageId, projectId]);

    const imageRows = db.queryEntries<{ id: number; position: number }>(
      "SELECT id, position FROM project_images WHERE project_id = ? ORDER BY position ASC, id ASC",
      [projectId],
    );

    for (let i = 0; i < imageRows.length; i += 1) {
      db.query("UPDATE project_images SET position = ? WHERE id = ?", [i + 1, imageRows[i].id]);
    }

    return jsonResponse({ message: "Image deleted." });
  }

  if (request.method === "POST" && url.pathname.startsWith("/api/projects/") && url.pathname.endsWith("/images")) {
    const match = url.pathname.match(/^\/api\/projects\/(\d+)\/images$/);
    if (!match) {
      return null;
    }

    const projectId = Number(match[1]);
    const project = await loadProjectById(projectId);
    if (!project) {
      return jsonResponse({ message: "Project not found." }, 404);
    }

    const formData = await request.formData();
    const uploadedFiles = Array.from(formData.getAll("files")).filter((value): value is File => value instanceof File);
    const combined = project.images.length + uploadedFiles.length;

    if (combined > MAX_PROJECT_IMAGES) {
      return jsonResponse({ message: `A project can have at most ${MAX_PROJECT_IMAGES} images.` }, 400);
    }

    const saved: { filename: string }[] = [];
    for (const file of uploadedFiles) {
      const savedFile = await saveUploadedProjectImage(file);
      saved.push({ filename: savedFile.filename });
    }

    const nextPosition = project.images.length + 1;
    for (let index = 0; index < saved.length; index += 1) {
      db.query("INSERT INTO project_images (project_id, filename, position) VALUES (?, ?, ?)", [projectId, saved[index].filename, nextPosition + index]);
    }

    return jsonResponse({ message: "Images added successfully." });
  }

  if (request.method === "PUT" && url.pathname.startsWith("/api/projects/")) {
    const match = url.pathname.match(/^\/api\/projects\/(\d+)$/);
    if (!match) {
      return null;
    }

    const projectId = Number(match[1]);
    const project = await loadProjectById(projectId);
    if (!project) {
      return jsonResponse({ message: "Project not found." }, 404);
    }

    try {
      const formData = await request.formData();
      const title = formData.get("title");
      const text = formData.get("text");
      const removeIdsRaw = String(formData.get("remove_ids") ?? "");
      const files = Array.from(formData.getAll("files")).filter((value): value is File => value instanceof File);

      const removeIds = removeIdsRaw
        .split(",")
        .map((id) => Number(id.trim()))
        .filter((id) => Number.isFinite(id));

      const imagesAfterRemoval = project.images.filter((image) => !removeIds.includes(image.id));
      const totalAfterChanges = imagesAfterRemoval.length + files.length;
      if (totalAfterChanges < MIN_PROJECT_IMAGES || totalAfterChanges > MAX_PROJECT_IMAGES) {
        return jsonResponse({
          message: `After editing, a project must contain between ${MIN_PROJECT_IMAGES} and ${MAX_PROJECT_IMAGES} images.`,
        }, 400);
      }

      for (const imageId of removeIds) {
        const image = project.images.find((item) => item.id === imageId);
        if (image) {
          await removeUploadedProjectImage(image.filename);
          db.query("DELETE FROM project_images WHERE id = ? AND project_id = ?", [imageId, projectId]);
        }
      }

      const savedImages: { filename: string }[] = [];
      for (const file of files) {
        const savedFile = await saveUploadedProjectImage(file);
        savedImages.push({ filename: savedFile.filename });
      }

      const currentImages = db.queryEntries<{ id: number; filename: string; position: number }>(
        "SELECT id, filename, position FROM project_images WHERE project_id = ? ORDER BY position ASC, id ASC",
        [projectId],
      );
      const lastPosition = currentImages.length;

      for (let index = 0; index < savedImages.length; index += 1) {
        db.query("INSERT INTO project_images (project_id, filename, position) VALUES (?, ?, ?)", [projectId, savedImages[index].filename, lastPosition + index + 1]);
      }

      const updates: string[] = [];
      const values: Array<string | number | null | Uint8Array> = [];

      if (title !== null) {
        updates.push("title = ?");
        values.push(String(title).trim());
      }

      if (text !== null) {
        updates.push("text = ?");
        values.push(String(text).trim());
      }

      if (updates.length > 0) {
        values.push(new Date().toISOString());
        values.push(projectId);
        db.query(`UPDATE projects SET ${updates.join(", ")}, updated_at = ? WHERE id = ?`, values);
      }

      return jsonResponse({ message: "Project updated successfully." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update project.";
      return jsonResponse({ message }, 400);
    }
  }

  return null;
}
