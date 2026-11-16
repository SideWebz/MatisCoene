const MIN_PROJECT_IMAGES = 7;
const MAX_PROJECT_IMAGES = 20;

const api = {
  async get(url) {
    const response = await fetch(url, { credentials: "same-origin" });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || "Request failed.");
    }
    return data;
  },

  async post(url, payload, isJson = true) {
    const requestBody = payload instanceof FormData ? payload : JSON.stringify(payload ?? {});
    const response = await fetch(url, {
      method: "POST",
      headers: isJson && !(payload instanceof FormData) ? { "Content-Type": "application/json" } : {},
      credentials: "same-origin",
      body: requestBody,
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || "Request failed.");
    }
    return data;
  },

  async del(url) {
    const response = await fetch(url, {
      method: "DELETE",
      credentials: "same-origin",
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || "Request failed.");
    }
    return data;
  },

  async put(url, payload, isJson = true) {
    const requestBody = payload instanceof FormData ? payload : JSON.stringify(payload ?? {});
    const response = await fetch(url, {
      method: "PUT",
      headers: isJson && !(payload instanceof FormData) ? { "Content-Type": "application/json" } : {},
      credentials: "same-origin",
      body: requestBody,
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || "Request failed.");
    }
    return data;
  },
};

function mergeFiles(existingFiles, incomingFiles) {
  const merged = [...existingFiles];
  const seen = new Set(merged.map((file) => `${file.name}-${file.size}-${file.lastModified}`));

  for (const file of incomingFiles) {
    const key = `${file.name}-${file.size}-${file.lastModified}`;
    if (!seen.has(key)) {
      merged.push(file);
      seen.add(key);
    }
  }

  return merged;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showToast(message, type = "success") {
  const container = document.querySelector(".toast-stack") || (() => {
    const node = document.createElement("div");
    node.className = "toast-stack";
    document.body.appendChild(node);
    return node;
  })();

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  window.setTimeout(() => {
    toast.remove();
  }, 2600);
}

function showAlert(message, type = "error") {
  const alert = document.getElementById("alertBox");
  if (!alert) {
    return;
  }

  alert.className = `form-alert show ${type === "success" ? "success" : "error"}`;
  alert.textContent = message;
}

function hideAlert() {
  const alert = document.getElementById("alertBox");
  if (alert) {
    alert.className = "form-alert";
    alert.textContent = "";
  }
}

function getCurrentPath() {
  return window.location.pathname;
}

function getProjectIdFromPath() {
  const segments = getCurrentPath().split("/").filter(Boolean);
  return Number(segments[2] ?? 0);
}

function getSidebarLinks(user) {
  const links = [
    { href: "/admin/projects", label: "Projects", icon: "grid-3x3-gap" },
    { href: "/admin/site-images", label: "Website images", icon: "images" },
    { href: "/admin/profile", label: "My account", icon: "person-circle" },
  ];

  if (user && user.role === "ADMIN") {
    links.splice(1, 0, { href: "/admin/users", label: "Users", icon: "people" });
  }

  return links;
}

function renderShell(user, title, content, actionMarkup = "") {
  const page = document.getElementById("app");
  if (!page) {
    return;
  }

  const navLinks = getSidebarLinks(user).map((link) => {
    const isActive = getCurrentPath() === link.href || (link.href === "/admin/projects" && getCurrentPath().startsWith("/admin/projects"));
    return `
      <a href="${link.href}" class="side-nav-item ${isActive ? "active" : ""}">
        <i class="bi bi-${link.icon}"></i>
        <span>${link.label}</span>
      </a>
    `;
  }).join("");

  page.innerHTML = `
    <div class="admin-layout">
      <aside class="admin-sidebar">
        <div class="brand-block">
          <div class="brand-mark">
            <img src="/assets/brand/MatisCoene_Logo.png" alt="Matis Coene logo" class="brand-mark-logo" />
          </div>
          <div>
            <div class="brand-name">Matis Coene</div>
            <div class="brand-subtitle">Backoffice</div>
          </div>
        </div>

        <nav class="side-nav" aria-label="Sidebar navigation">
          ${navLinks}
        </nav>

        <div class="admin-sidebar-footer">
          <div class="user-mini">
            <div class="user-avatar">${String(user?.username || "U").slice(0, 1).toUpperCase()}</div>
            <div class="user-meta">
              <span class="user-role">${user?.role || "USER"}</span>
              <span class="user-name">${user?.username || "Guest"}</span>
            </div>
          </div>
          <button class="logout-button" id="logoutButton" type="button">Logout</button>
        </div>
      </aside>

      <main class="admin-main">
        <header class="admin-header">
          <div>
            <p class="eyebrow">Overview</p>
            <h1>${escapeHtml(title)}</h1>
          </div>
          ${actionMarkup}
        </header>
        ${content}
      </main>
    </div>
  `;

  document.getElementById("logoutButton")?.addEventListener("click", async () => {
    try {
      await api.post("/api/auth/logout", {});
      window.location.href = "/admin/login";
    } catch (_error) {
      window.location.href = "/admin/login";
    }
  });
}

async function requireSession() {
  try {
    const session = await api.get("/api/session");
    return session.user;
  } catch (_error) {
    window.location.href = "/admin/login";
    return null;
  }
}

function openDeleteModal({ title, message, confirmLabel, onConfirm }) {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="confirmTitle">
      <h2 id="confirmTitle" class="confirmation-modal__title">${escapeHtml(title)}</h2>
      <p class="confirmation-modal__body">${escapeHtml(message)}</p>
      <div class="confirmation-modal__actions">
        <button type="button" class="secondary-action modal-cancel">Cancel</button>
        <button type="button" class="danger-action modal-confirm">${escapeHtml(confirmLabel)}</button>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);

  backdrop.querySelector(".modal-cancel").addEventListener("click", () => backdrop.remove());
  backdrop.querySelector(".modal-confirm").addEventListener("click", async () => {
    backdrop.remove();
    await onConfirm();
  });
}

async function initLoginPage() {
  const form = document.getElementById("loginForm");
  const alertBox = document.getElementById("loginAlert");

  try {
    const session = await api.get("/api/session");
    if (session.user) {
      window.location.href = "/admin/projects";
    }
  } catch (_error) {
    // continue
  }

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;

    try {
      const response = await api.post("/api/auth/login", { username, password });
      if (response.user) {
        window.location.href = "/admin/projects";
      }
    } catch (error) {
      alertBox.hidden = false;
      alertBox.textContent = error.message;
    }
  });
}

function renderProjectCards(projects, filter) {
  const filteredProjects = projects.filter((project) => filter === "active" ? project.active : !project.active);

  if (!filteredProjects.length) {
    const emptyTitle = filter === "active" ? "No active projects" : "No inactive projects";
    const emptyText = filter === "active"
      ? "Create your first project to get started."
      : "Inactive projects will appear here as soon as they are paused.";

    return `
      <div class="empty-state">
        <div>
          <strong>${emptyTitle}</strong>
          <span>${emptyText}</span>
        </div>
      </div>
    `;
  }

  return `
    <div class="project-grid">
      ${filteredProjects.map((project) => {
        const image = project.images?.[0]?.url ? project.images[0].url : "";
        return `
          <article class="project-card">
            <div class="project-card__media">
              ${image ? `<img src="${image}" alt="${escapeHtml(project.title)}" />` : `<div class="project-card__media-placeholder">No photo</div>`}
            </div>
            <div class="project-card__body">
              <div class="project-card__meta">
                <span class="status-pill ${project.active ? "active" : "inactive"}">${project.active ? "Active" : "Inactive"}</span>
                <span class="text-muted small">#${project.position}</span>
              </div>
              <h3 class="project-card__title">${escapeHtml(project.title)}</h3>
              <p class="project-card__count">${project.image_count} photos</p>
            </div>
            <div class="project-card__footer">
              <div class="mini-actions">
                <button type="button" class="mini-action" data-project-action="move" data-direction="up" data-project-id="${project.id}" title="Move up"><i class="bi bi-arrow-up"></i></button>
                <button type="button" class="mini-action" data-project-action="move" data-direction="down" data-project-id="${project.id}" title="Move down"><i class="bi bi-arrow-down"></i></button>
              </div>
              <div class="mini-actions">
                <button type="button" class="mini-action primary" data-project-action="toggle" data-project-id="${project.id}">${project.active ? "Hide" : "Show"}</button>
                <a class="mini-action" href="/admin/projects/${project.id}/edit">Edit</a>
                <button type="button" class="mini-action danger" data-project-action="delete" data-project-id="${project.id}">Delete</button>
              </div>
            </div>
          </article>
        `;
      }).join("")}
    </div>
  `;
}

async function initProjectListPage() {
  const user = await requireSession();
  if (!user) {
    return;
  }

  const data = await api.get("/api/projects");
  const allProjects = [...(data.projects || [])].sort((a, b) => Number(a.position) - Number(b.position));
  let activeFilter = "active";

  renderShell(user, "Projects", `
    <div class="page-section">
      <div class="toolbar">
        <div class="segmented-control" aria-label="Project filters">
          <button type="button" class="filter-pill active" data-project-filter="active">Active</button>
          <button type="button" class="filter-pill" data-project-filter="inactive">Inactive</button>
        </div>

        <a class="primary-action" href="/admin/projects/new"><i class="bi bi-plus-lg"></i> New project</a>
      </div>

      <div id="projectGrid">${renderProjectCards(allProjects, activeFilter)}</div>
    </div>
  `);

  const updateGrid = (filterValue) => {
    activeFilter = filterValue;
    document.querySelectorAll(".filter-pill").forEach((button) => {
      button.classList.toggle("active", button.dataset.projectFilter === filterValue);
    });
    document.getElementById("projectGrid").innerHTML = renderProjectCards(allProjects, filterValue);
    attachProjectActions();
  };

  const attachProjectActions = () => {
    document.querySelectorAll("[data-project-action='toggle']").forEach((button) => {
      button.addEventListener("click", async () => {
        const projectId = Number(button.dataset.projectId);
        try {
          await fetch(`/api/projects/${projectId}/toggle`, {
            method: "PATCH",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          }).then(async (response) => {
            const payload = await response.json();
            if (!response.ok) {
              throw new Error(payload.message || "Unable to update project status.");
            }
            return payload;
          });
          showToast("Project visibility updated.", "success");
          window.location.reload();
        } catch (error) {
          showToast(error.message || "Unable to update project status.", "error");
        }
      });
    });

    document.querySelectorAll("[data-project-action='delete']").forEach((button) => {
      button.addEventListener("click", () => {
        const projectId = Number(button.dataset.projectId);
        openDeleteModal({
          title: "Delete project?",
          message: "This will permanently delete the project and all of its photos.",
          confirmLabel: "Delete project",
          onConfirm: async () => {
            try {
              await api.del(`/api/projects/${projectId}`);
              showToast("Project deleted.", "success");
              window.location.reload();
            } catch (error) {
              showToast(error.message || "Unable to delete project.", "error");
            }
          },
        });
      });
    });

    document.querySelectorAll("[data-project-action='move']").forEach((button) => {
      button.addEventListener("click", async () => {
        const projectId = Number(button.dataset.projectId);
        const direction = button.dataset.direction;
        try {
          const visibleProjectIds = allProjects
            .filter((project) => activeFilter === "active" ? project.active : !project.active)
            .map((project) => project.id);
          const currentIndex = visibleProjectIds.indexOf(projectId);
          const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

          if (currentIndex === -1 || targetIndex < 0 || targetIndex >= visibleProjectIds.length) {
            throw new Error("Project cannot be moved further.");
          }

          const reorderedVisible = [...visibleProjectIds];
          const [movedItem] = reorderedVisible.splice(currentIndex, 1);
          reorderedVisible.splice(targetIndex, 0, movedItem);

          const finalOrder = [...reorderedVisible, ...allProjects.map((project) => project.id).filter((id) => !reorderedVisible.includes(id))];

          await api.put("/api/projects/reorder", { order: finalOrder });
          showToast("Project order updated.", "success");
          window.location.reload();
        } catch (error) {
          showToast(error.message || "Unable to reorder project.", "error");
        }
      });
    });
  };

  document.querySelectorAll(".filter-pill").forEach((button) => {
    button.addEventListener("click", () => updateGrid(button.dataset.projectFilter));
  });

  attachProjectActions();
}

function getPhotoPreviewMarkup(files, mode = "new") {
  return files.map((file, index) => `
    <div class="photo-tile">
      <button type="button" class="photo-remove" data-file-remove="${mode}-${index}" aria-label="Remove photo">×</button>
      <img src="${URL.createObjectURL(file)}" alt="${mode === "new" ? "New photo" : "Photo"} ${index + 1}" />
      <div class="photo-tile__label">
        <span>${mode === "new" ? "New" : "Current"}</span>
        <span>${index + 1}</span>
      </div>
    </div>
  `).join("");
}

async function initProjectNewPage() {
  const user = await requireSession();
  if (!user) {
    return;
  }

  let files = [];

  renderShell(user, "New project", `
    <div class="page-section">
      <div id="alertBox" class="form-alert"></div>
      <form id="projectForm" class="modern-form">
        <div class="form-panel form-grid">
          <div class="field-group">
            <label class="field-label" for="projectTitle">Project title</label>
            <input id="projectTitle" name="title" class="form-control" type="text" maxlength="200" required />
          </div>

          <div class="field-group">
            <label class="field-label" for="projectDescription">Project description</label>
            <textarea id="projectDescription" name="text" class="form-textarea" rows="6" required></textarea>
          </div>
        </div>

        <div class="form-panel">
          <div class="upload-header">
            <label class="field-label" for="projectFiles">Project photos</label>
            <span class="note">${MIN_PROJECT_IMAGES}-${MAX_PROJECT_IMAGES} required</span>
          </div>
          <label class="upload-zone" for="projectFiles">
            <input id="projectFiles" type="file" accept="image/*" multiple />
            <div class="upload-content">
              <div class="upload-icon">＋</div>
              <strong>Add project photos</strong>
              <small>Choose 7 to 20 images</small>
            </div>
          </label>
          <div id="projectPreview" class="photo-grid" style="margin-top: 16px;"></div>
        </div>

        <div class="sticky-actions">
          <a class="secondary-action" href="/admin/projects"><i class="bi bi-arrow-left"></i> Cancel</a>
          <button class="primary-action" type="submit"><i class="bi bi-check-lg"></i> Save project</button>
        </div>
      </form>
    </div>
  `);

  const fileInput = document.getElementById("projectFiles");
  const previewBox = document.getElementById("projectPreview");
  const form = document.getElementById("projectForm");

  const syncPreview = () => {
    previewBox.innerHTML = files.length ? getPhotoPreviewMarkup(files, "new") : "";
    previewBox.querySelectorAll("[data-file-remove]").forEach((button) => {
      button.addEventListener("click", () => {
        const key = button.dataset.fileRemove;
        const index = Number(key.split("-").pop());
        files = files.filter((_, itemIndex) => itemIndex !== index);
        fileInput.value = "";
        syncPreview();
      });
    });
  };

  fileInput.addEventListener("change", () => {
    files = mergeFiles(files, Array.from(fileInput.files || []));
    syncPreview();
    fileInput.value = "";
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    hideAlert();

    const title = document.getElementById("projectTitle").value.trim();
    const text = document.getElementById("projectDescription").value.trim();

    if (!title || !text) {
      showAlert("Title and description are required.", "error");
      return;
    }

    if (files.length < MIN_PROJECT_IMAGES || files.length > MAX_PROJECT_IMAGES) {
      showAlert(`Please choose between ${MIN_PROJECT_IMAGES} and ${MAX_PROJECT_IMAGES} photos.`, "error");
      return;
    }

    const formData = new FormData();
    formData.append("title", title);
    formData.append("text", text);
    files.forEach((file) => formData.append("files", file));

    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        credentials: "same-origin",
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Unable to create project.");
      }
      showToast("Project created.", "success");
      window.setTimeout(() => {
        window.location.href = "/admin/projects";
      }, 250);
    } catch (error) {
      showAlert(error.message || "Unable to create project.", "error");
    }
  });
}

function renderProjectEditForm(project) {
  return `
    <div class="page-section">
      <div id="alertBox" class="form-alert"></div>
      <form id="editProjectForm" class="modern-form">
        <div class="form-panel form-grid">
          <div class="field-group">
            <label class="field-label" for="projectTitle">Project title</label>
            <input id="projectTitle" name="title" class="form-control" type="text" value="${escapeHtml(project.title)}" maxlength="200" required />
          </div>

          <div class="field-group">
            <label class="field-label" for="projectDescription">Project description</label>
            <textarea id="projectDescription" name="text" class="form-textarea" rows="7" required>${escapeHtml(project.text)}</textarea>
          </div>
        </div>

        <div class="form-panel">
          <div class="upload-header">
            <label class="field-label">Project photos</label>
            <span class="note">${project.images.length} total</span>
          </div>
          <div id="photoGrid" class="photo-grid"></div>

          <div style="margin-top: 18px;">
            <label class="upload-zone" for="projectFiles">
              <input id="projectFiles" type="file" accept="image/*" multiple />
              <div class="upload-content">
                <div class="upload-icon">＋</div>
                <strong>Add more photos</strong>
                <small>Keep a minimum of 7 photos</small>
              </div>
            </label>
          </div>
        </div>

        <div class="sticky-actions">
          <a class="secondary-action" href="/admin/projects"><i class="bi bi-arrow-left"></i> Back</a>
          <button class="primary-action" type="submit"><i class="bi bi-check-lg"></i> Save changes</button>
        </div>
      </form>
    </div>
  `;
}

async function initProjectEditPage() {
  const user = await requireSession();
  if (!user) {
    return;
  }

  const projectId = getProjectIdFromPath();
  if (!Number.isFinite(projectId) || projectId <= 0) {
    window.location.href = "/admin/projects";
    return;
  }

  const projectData = await api.get(`/api/projects/${projectId}`);
  const project = projectData.project;

  let newFiles = [];
  const removedIds = new Set();
  let order = project.images.map((image) => image.id);

  renderShell(user, "Edit project", renderProjectEditForm(project));

  const fileInput = document.getElementById("projectFiles");
  const photoGrid = document.getElementById("photoGrid");

  const renderPhotoGrid = () => {
    const visibleExisting = project.images.filter((image) => !removedIds.has(image.id));
    const tiles = [
      ...visibleExisting.map((image, index) => ({
        kind: "existing",
        id: image.id,
        url: image.url,
        alt: `${escapeHtml(project.title)} image ${index + 1}`,
        label: `Photo ${index + 1}`,
        meta: "Current",
      })),
      ...newFiles.map((file, index) => ({
        kind: "new",
        id: `new-${index}`,
        url: URL.createObjectURL(file),
        alt: `New photo ${index + 1}`,
        label: `New ${index + 1}`,
        meta: "New",
      })),
    ];

    photoGrid.innerHTML = tiles.map((tile) => `
      <div class="photo-tile" data-photo-id="${tile.id}" draggable="true">
        <button type="button" class="photo-remove" data-remove-existing="${tile.id}" aria-label="Remove photo">×</button>
        <img src="${tile.url}" alt="${tile.alt}" />
        <div class="photo-tile__label">
          <span>${tile.label}</span>
          <span>${tile.meta}</span>
        </div>
      </div>
    `).join("");

    photoGrid.querySelectorAll("[data-remove-existing]").forEach((button) => {
      button.addEventListener("click", () => {
        const value = String(button.dataset.removeExisting);
        if (value.startsWith("new-")) {
          const index = Number(value.split("-").pop());
          newFiles = newFiles.filter((_, itemIndex) => itemIndex !== index);
          renderPhotoGrid();
          return;
        }

        const imageId = Number(value);
        removedIds.add(imageId);
        renderPhotoGrid();
      });
    });
  };

  const appendNewFiles = (selectedFiles) => {
    const remainingExisting = project.images.filter((image) => !removedIds.has(image.id)).length;
    const currentTotal = remainingExisting + newFiles.length;
    const remainingCapacity = MAX_PROJECT_IMAGES - currentTotal;

    if (remainingCapacity <= 0) {
      showAlert(`You already have ${MAX_PROJECT_IMAGES} photos. Remove one before adding another.`, "error");
      fileInput.value = "";
      return;
    }

    const filesToAdd = Array.from(selectedFiles).slice(0, remainingCapacity);
    if (filesToAdd.length < selectedFiles.length) {
      showAlert(`You can add up to ${remainingCapacity} more photo${remainingCapacity === 1 ? "" : "s"}.`, "error");
    }

    newFiles = mergeFiles(newFiles, filesToAdd);
    renderPhotoGrid();
  };

  fileInput.addEventListener("change", () => {
    appendNewFiles(fileInput.files || []);
    fileInput.value = "";
  });

  renderPhotoGrid();

  document.getElementById("editProjectForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    hideAlert();

    const title = document.getElementById("projectTitle").value.trim();
    const text = document.getElementById("projectDescription").value.trim();
    const remainingExisting = project.images.filter((image) => !removedIds.has(image.id));
    const totalPhotos = remainingExisting.length + newFiles.length;

    if (!title || !text) {
      showAlert("Title and description are required.", "error");
      return;
    }

    if (totalPhotos < MIN_PROJECT_IMAGES || totalPhotos > MAX_PROJECT_IMAGES) {
      showAlert(`After editing, a project must contain between ${MIN_PROJECT_IMAGES} and ${MAX_PROJECT_IMAGES} photos.`, "error");
      return;
    }

    const formData = new FormData();
    formData.append("title", title);
    formData.append("text", text);
    formData.append("remove_ids", Array.from(removedIds).join(","));
    newFiles.forEach((file) => formData.append("files", file));

    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: "PUT",
        credentials: "same-origin",
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Unable to update project.");
      }

      const currentOrder = order.filter((imageId) => !removedIds.has(imageId));
      if (currentOrder.length) {
        await fetch(`/api/projects/${projectId}/images/reorder`, {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order: currentOrder }),
        }).then(async (reorderResponse) => {
          const reorderData = await reorderResponse.json();
          if (!reorderResponse.ok) {
            throw new Error(reorderData.message || "Unable to reorder project images.");
          }
        });
      }

      showToast("Project updated.", "success");
      window.setTimeout(() => {
        window.location.href = "/admin/projects";
      }, 250);
    } catch (error) {
      showAlert(error.message || "Unable to update project.", "error");
    }
  });
}

async function initUsersPage() {
  const user = await requireSession();
  if (!user || user.role !== "ADMIN") {
    window.location.href = "/admin/login";
    return;
  }

  const data = await api.get("/api/users");

  renderShell(user, "Users", `
    <div class="page-section">
      <div class="toolbar">
        <div>
          <h2 class="h5 mb-0">User management</h2>
        </div>
        <button class="primary-action" id="showCreateUserButton" type="button"><i class="bi bi-person-plus"></i> Add user</button>
      </div>

      <div id="alertBox" class="form-alert"></div>

      <div id="createUserFormWrapper" style="display: none; margin-bottom: 24px;">
        <form id="createUserForm" class="form-panel">
          <div class="form-grid">
            <div class="field-group">
              <label class="field-label">Username</label>
              <input id="newUsername" class="form-control" required />
            </div>
            <div class="field-group">
              <label class="field-label">Password</label>
              <input id="newPassword" type="password" class="form-control" required />
            </div>
            <div class="field-group">
              <label class="field-label">Role</label>
              <select id="newRole" class="form-select">
                <option value="USER">USER</option>
                <option value="ADMIN">ADMIN</option>
              </select>
            </div>
          </div>
          <div class="sticky-actions">
            <button class="primary-action" type="submit">Save user</button>
          </div>
        </form>
      </div>

      <div class="table-responsive">
        <table class="table table-hover align-middle mb-0">
          <thead class="table-light">
            <tr>
              <th>ID</th>
              <th>Username</th>
              <th>Role</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${data.users.map((userItem) => `
              <tr>
                <td>${userItem.id}</td>
                <td>${escapeHtml(userItem.username)}</td>
                <td><span class="status-pill ${userItem.role === "ADMIN" ? "active" : "inactive"}">${userItem.role}</span></td>
                <td>${new Date(userItem.created_at).toLocaleString()}</td>
                <td>
                  ${userItem.id !== user.id ? `<button type="button" class="mini-action danger" data-user-delete="${userItem.id}">Delete</button>` : '<span class="text-muted">Current</span>'}
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `);

  document.getElementById("showCreateUserButton").addEventListener("click", () => {
    const wrapper = document.getElementById("createUserFormWrapper");
    wrapper.style.display = wrapper.style.display === "none" ? "block" : "none";
  });

  document.getElementById("createUserForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const username = document.getElementById("newUsername").value.trim();
    const password = document.getElementById("newPassword").value;
    const role = document.getElementById("newRole").value;

    try {
      await api.post("/api/users", { username, password, role });
      window.location.reload();
    } catch (error) {
      showAlert(error.message, "error");
    }
  });

  document.querySelectorAll("[data-user-delete]").forEach((button) => {
    button.addEventListener("click", async () => {
      const userId = Number(button.dataset.userDelete);
      openDeleteModal({
        title: "Delete user?",
        message: "This user will be permanently removed from the system.",
        confirmLabel: "Delete user",
        onConfirm: async () => {
          try {
            await api.del(`/api/users/${userId}`);
            window.location.reload();
          } catch (error) {
            showAlert(error.message, "error");
          }
        },
      });
    });
  });
}

async function initProfilePage() {
  const user = await requireSession();
  if (!user) {
    return;
  }

  renderShell(user, "My account", `
    <div class="page-section">
      <div id="alertBox" class="form-alert"></div>
      <form id="passwordForm" class="modern-form">
        <div class="form-panel form-grid">
          <div class="field-group">
            <label class="field-label" for="currentPassword">Current password</label>
            <input id="currentPassword" type="password" class="form-control" required />
          </div>
          <div class="field-group">
            <label class="field-label" for="newPassword">New password</label>
            <input id="newPassword" type="password" class="form-control" required />
          </div>
          <div class="field-group">
            <label class="field-label" for="confirmPassword">Confirm new password</label>
            <input id="confirmPassword" type="password" class="form-control" required />
          </div>
        </div>
        <div class="sticky-actions">
          <button class="primary-action" type="submit"><i class="bi bi-lock"></i> Update password</button>
        </div>
      </form>
    </div>
  `);

  document.getElementById("passwordForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    hideAlert();

    const currentPassword = document.getElementById("currentPassword").value;
    const newPassword = document.getElementById("newPassword").value;
    const confirmPassword = document.getElementById("confirmPassword").value;

    try {
      await api.post("/api/profile/password", { currentPassword, newPassword, confirmPassword });
      document.getElementById("passwordForm").reset();
      showAlert("Password updated successfully.", "success");
    } catch (error) {
      showAlert(error.message, "error");
    }
  });
}

async function initSiteImagesPage() {
  const user = await requireSession();
  if (!user) {
    return;
  }

  const data = await api.get("/api/site-images");
  const imageTypes = [
    { key: "header", title: "Header image", description: "The image shown in the website header." },
    { key: "about", title: "About Me image", description: "The image shown in the About Me section." },
    { key: "contact", title: "Contact image", description: "The image shown beside the contact section." },
  ];

  renderShell(user, "Website images", `
    <div class="page-section">
      <div class="site-image-grid">
        ${imageTypes.map(({ key, title, description }) => `
          <section class="form-panel site-image-card" aria-labelledby="${key}ImageTitle">
            <h2 id="${key}ImageTitle" class="h5 mb-2">${title}</h2>
            <p class="text-muted mb-3">${description}</p>
            <img class="site-image-preview" data-site-image-preview="${key}" src="${escapeHtml(data.images[key])}" alt="Current ${title.toLowerCase()}" />
            <form class="modern-form site-image-form" data-site-image-form="${key}">
              <div class="field-group">
                <label class="field-label" for="${key}ImageFile">Choose a new image</label>
                <input id="${key}ImageFile" class="form-control" type="file" accept="image/png,image/jpeg,image/gif,image/webp" required />
                <small class="text-muted">PNG, JPG, GIF or WEBP. Maximum 5MB.</small>
              </div>
              <div class="sticky-actions">
                <button class="primary-action" type="submit"><i class="bi bi-check-lg"></i> Save image</button>
              </div>
            </form>
          </section>
        `).join("")}
      </div>
    </div>
  `);

  imageTypes.forEach(({ key }) => {
    const form = document.querySelector(`[data-site-image-form="${key}"]`);
    const input = form.querySelector('input[type="file"]');
    const preview = document.querySelector(`[data-site-image-preview="${key}"]`);
    let previewUrl = null;

    input.addEventListener("change", () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        previewUrl = null;
      }

      const file = input.files[0];
      if (file) {
        previewUrl = URL.createObjectURL(file);
        preview.src = previewUrl;
      }
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const file = input.files[0];
      if (!file) {
        return;
      }

      const formData = new FormData();
      formData.append("image", key);
      formData.append("file", file);

      try {
        const result = await api.post("/api/site-images", formData, false);
        preview.src = result.image;
        input.value = "";
        if (previewUrl) {
          URL.revokeObjectURL(previewUrl);
          previewUrl = null;
        }
        const imageTitle = imageTypes.find((imageType) => imageType.key === key)?.title ?? "Website";
        showToast(result.message || `${imageTitle} updated.`, result.warning ? "error" : "success");
      } catch (error) {
        showToast(error.message || "Unable to update website image.", "error");
      }
    });
  });
}

async function initPage() {
  const path = getCurrentPath();

  if (path === "/admin/login") {
    initLoginPage();
    return;
  }

  if (path === "/admin") {
    window.location.href = "/admin/projects";
    return;
  }

  if (path === "/admin/projects") {
    initProjectListPage();
    return;
  }

  if (path === "/admin/projects/new") {
    initProjectNewPage();
    return;
  }

  if (/^\/admin\/projects\/\d+\/edit$/.test(path)) {
    initProjectEditPage();
    return;
  }

  if (path === "/admin/users") {
    initUsersPage();
    return;
  }

  if (path === "/admin/profile") {
    initProfilePage();
    return;
  }

  if (path === "/admin/site-images") {
    initSiteImagesPage();
    return;
  }
}

window.addEventListener("DOMContentLoaded", initPage);
