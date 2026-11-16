const COLLAGE_IMAGE_COUNT = 7;

const projectsList = document.querySelector("#projects-list");
const projectsStatus = document.querySelector("#projects-status");

/* ---------- Lightbox ---------- */

function createLightbox() {
  const dialog = document.createElement("dialog");
  dialog.className = "lightbox";
  dialog.setAttribute("aria-label", "Fotoviewer");

  dialog.innerHTML = `
    <button type="button" class="lightbox__btn lightbox__btn--close" aria-label="Sluiten">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor"
           stroke-width="2" stroke-linecap="round" aria-hidden="true">
        <line x1="6" y1="6" x2="18" y2="18"></line>
        <line x1="18" y1="6" x2="6" y2="18"></line>
      </svg>
    </button>
    <button type="button" class="lightbox__btn lightbox__btn--prev" aria-label="Vorige foto">
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor"
           stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <polyline points="15 6 9 12 15 18"></polyline>
      </svg>
    </button>
    <button type="button" class="lightbox__btn lightbox__btn--next" aria-label="Volgende foto">
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor"
           stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <polyline points="9 6 15 12 9 18"></polyline>
      </svg>
    </button>
    <figure class="lightbox__figure">
      <img class="lightbox__image" alt="" />
      <figcaption class="lightbox__caption" aria-live="polite"></figcaption>
    </figure>
  `;

  const image = dialog.querySelector(".lightbox__image");
  const caption = dialog.querySelector(".lightbox__caption");
  const prevButton = dialog.querySelector(".lightbox__btn--prev");
  const nextButton = dialog.querySelector(".lightbox__btn--next");
  const closeButton = dialog.querySelector(".lightbox__btn--close");

  let urls = [];
  let title = "";
  let current = 0;

  function render() {
    image.src = urls[current];
    image.alt = `${title} - foto ${current + 1}`;
    caption.textContent = `${title} · ${current + 1} / ${urls.length}`;

    const hasMultiple = urls.length > 1;
    prevButton.hidden = !hasMultiple;
    nextButton.hidden = !hasMultiple;

    // buren alvast laden voor vlot bladeren
    [current - 1, current + 1].forEach((i) => {
      const url = urls[(i + urls.length) % urls.length];
      if (url) new Image().src = url;
    });
  }

  function go(step) {
    if (urls.length < 2) return;
    current = (current + step + urls.length) % urls.length;
    render();
  }

  function open(newUrls, startIndex, newTitle) {
    urls = newUrls;
    title = newTitle;
    current = startIndex;
    render();
    document.documentElement.classList.add("lightbox-open");
    dialog.showModal();
  }

  prevButton.addEventListener("click", () => go(-1));
  nextButton.addEventListener("click", () => go(1));
  closeButton.addEventListener("click", () => dialog.close());

  // klik naast foto en knoppen sluit de viewer
  dialog.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    if (!event.target.closest("button, img")) dialog.close();
  });

  dialog.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") go(-1);
    if (event.key === "ArrowRight") go(1);
  });

  // swipe op touch-toestellen
  let touchStartX = null;
  dialog.addEventListener("touchstart", (event) => {
    touchStartX = event.changedTouches[0].clientX;
  }, { passive: true });
  dialog.addEventListener("touchend", (event) => {
    if (touchStartX === null) return;
    const deltaX = event.changedTouches[0].clientX - touchStartX;
    touchStartX = null;
    if (Math.abs(deltaX) > 50) go(deltaX > 0 ? -1 : 1);
  }, { passive: true });

  dialog.addEventListener("close", () => {
    document.documentElement.classList.remove("lightbox-open");
    image.removeAttribute("src");
  });

  document.body.append(dialog);
  return { open };
}

const lightbox = createLightbox();

/* ---------- Galerij ---------- */

function createImagePlaceholder() {
  const placeholder = document.createElement("div");
  placeholder.className = "project-gallery__placeholder";
  placeholder.setAttribute("role", "img");
  placeholder.setAttribute("aria-label", "Afbeelding niet beschikbaar");
  placeholder.textContent = "Foto niet beschikbaar";
  return placeholder;
}

function createProjectGallery(project) {
  const gallery = document.createElement("div");
  gallery.className = "project-gallery";
  gallery.setAttribute("role", "group");
  gallery.setAttribute("aria-label", `Foto's van ${project.title}`);

  const images = Array.isArray(project.images) ? project.images : [];
  const urls = images
    .map((item) => item?.url)
    .filter((url) => typeof url === "string" && url.length > 0);

  for (let index = 0; index < COLLAGE_IMAGE_COUNT; index += 1) {
    const tile = document.createElement("div");
    tile.className = `project-gallery__tile project-gallery__tile--${index + 1}`;

    const imageUrl = urls[index];
    if (imageUrl) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "project-gallery__button";
      button.setAttribute("aria-label", `Open foto ${index + 1} van ${urls.length} van ${project.title}`);
      button.addEventListener("click", () => lightbox.open(urls, index, project.title));

      const image = document.createElement("img");
      image.className = "project-gallery__image";
      image.src = imageUrl;
      image.alt = `${project.title} - foto ${index + 1}`;
      image.loading = "lazy";
      image.decoding = "async";
      image.addEventListener("error", () => tile.replaceChildren(createImagePlaceholder()), { once: true });

      button.append(image);
      tile.append(button);

      // laatste tegel: toon hoeveel extra foto's er nog zijn
      if (index === COLLAGE_IMAGE_COUNT - 1 && urls.length > COLLAGE_IMAGE_COUNT) {
        const more = document.createElement("span");
        more.className = "project-gallery__more";
        more.textContent = `+${urls.length - COLLAGE_IMAGE_COUNT}`;
        tile.append(more);
      }
    } else {
      tile.append(createImagePlaceholder());
    }

    gallery.append(tile);
  }

  return gallery;
}

/* ---------- Projecten ---------- */

function createProject(project, index) {
  const article = document.createElement("article");
  article.className = "project-row";

  if (index % 2 === 1) {
    article.classList.add("project-row--reversed");
  }

  const gallery = createProjectGallery(project);
  const content = document.createElement("div");
  content.className = "project-row__content";

  if (index === 0) {
    const sectionTitle = document.createElement("h2");
    sectionTitle.className = "project-row__section-title";
    sectionTitle.textContent = "Projecten";
    content.append(sectionTitle);
  }

  const title = document.createElement("h3");
  title.className = "project-row__title";
  title.textContent = project.title;

  const description = document.createElement("p");
  description.className = "project-row__description";
  description.textContent = project.text;

  content.append(title, description);
  article.append(gallery, content);
  return article;
}

async function loadProjects() {
  if (!(projectsList instanceof HTMLElement) || !(projectsStatus instanceof HTMLElement)) {
    throw new Error("De projectensectie ontbreekt op de pagina.");
  }

  const response = await fetch("/api/public/projects");
  if (!response.ok) {
    throw new Error(`Projecten ophalen mislukt (${response.status}).`);
  }

  const data = await response.json();
  if (!Array.isArray(data.projects)) {
    throw new Error("De projectgegevens hebben een ongeldig formaat.");
  }

  if (data.projects.length === 0) {
    projectsStatus.textContent = "Er zijn momenteel geen projecten beschikbaar.";
    return;
  }

  projectsList.replaceChildren(...data.projects.map(createProject));
  projectsStatus.hidden = true;
}

loadProjects().catch((error) => {
  console.error(error);
  if (projectsStatus instanceof HTMLElement) {
    projectsStatus.textContent = "De projecten konden niet worden geladen. Probeer het later opnieuw.";
  }
});