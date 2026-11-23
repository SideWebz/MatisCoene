const contactForm = document.querySelector(".contact-form");
const captchaContainer = document.getElementById("contact-turnstile");
const captchaStatus = document.getElementById("contact-captcha-status");
const contactSubmitButton = contactForm?.querySelector('button[type="submit"]');
let turnstileToken = "";
let turnstileWidgetId = null;

function showContactNotice(message, type) {
  document.querySelector(".contact-notice")?.remove();

  const notice = document.createElement("div");
  notice.className = `contact-notice${type === "error" ? " contact-notice--error" : ""}`;
  notice.setAttribute("role", type === "error" ? "alert" : "status");
  notice.setAttribute("aria-live", type === "error" ? "assertive" : "polite");

  const text = document.createElement("span");
  text.className = "contact-notice__message";
  text.textContent = message;

  const close = document.createElement("button");
  close.className = "contact-notice__close";
  close.type = "button";
  close.setAttribute("aria-label", "Melding sluiten");
  close.textContent = "×";
  close.addEventListener("click", () => notice.remove());

  notice.append(text, close);
  document.body.append(notice);
  window.setTimeout(() => notice.remove(), 6000);
}

contactForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!(contactForm instanceof HTMLFormElement)) return;

  const submitButton = contactForm.querySelector('button[type="submit"]');
  if (!(submitButton instanceof HTMLButtonElement) || submitButton.disabled) return;
  if (!turnstileToken) {
    showContactNotice("Bevestig eerst dat je geen robot bent.", "error");
    return;
  }

  const originalLabel = submitButton.textContent;
  submitButton.disabled = true;
  submitButton.setAttribute("aria-busy", "true");

  const formData = new FormData(contactForm);
  const payload = Object.fromEntries(formData.entries());
  payload.project = payload.project || "";
  payload["cf-turnstile-response"] = turnstileToken;

  try {
    const response = await fetch(contactForm.action, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.message || "Er ging iets mis bij het verzenden. Probeer het later opnieuw.");
    }

    contactForm.reset();
    turnstileToken = "";
    window.turnstile?.reset(turnstileWidgetId);
    submitButton.disabled = true;
    showContactNotice(
      "Bericht succesvol verzonden! We nemen zo snel mogelijk contact met je op.",
      "success",
    );
  } catch (_error) {
    turnstileToken = "";
    window.turnstile?.reset(turnstileWidgetId);
    submitButton.disabled = true;
    showContactNotice("Er ging iets mis bij het verzenden. Probeer het later opnieuw.", "error");
  } finally {
    if (turnstileToken) submitButton.disabled = false;
    submitButton.removeAttribute("aria-busy");
    submitButton.textContent = originalLabel;
  }
});

async function loadTurnstile() {
  if (!(captchaContainer instanceof HTMLElement) || !(contactSubmitButton instanceof HTMLButtonElement)) {
    return;
  }

  contactSubmitButton.disabled = true;
  try {
    const configResponse = await fetch("/api/public/turnstile-config");
    if (!configResponse.ok) throw new Error("Turnstile is not configured.");
    const { siteKey } = await configResponse.json();
    if (typeof siteKey !== "string" || !siteKey) throw new Error("Turnstile is not configured.");

    await new Promise((resolve, reject) => {
      if (window.turnstile) {
        resolve();
        return;
      }
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error("Turnstile could not be loaded."));
      document.head.append(script);
    });

    turnstileWidgetId = window.turnstile.render(captchaContainer, {
      sitekey: siteKey,
      callback: (token) => {
        turnstileToken = token;
        contactSubmitButton.disabled = false;
        if (captchaStatus) captchaStatus.textContent = "";
      },
      "expired-callback": () => {
        turnstileToken = "";
        contactSubmitButton.disabled = true;
      },
      "error-callback": () => {
        turnstileToken = "";
        contactSubmitButton.disabled = true;
        if (captchaStatus) captchaStatus.textContent = "Spambeveiliging kon niet laden. Vernieuw de pagina en probeer opnieuw.";
      },
    });
  } catch (_error) {
    if (captchaStatus) {
      captchaStatus.textContent = "Het contactformulier is tijdelijk niet beschikbaar. Probeer het later opnieuw.";
    }
  }
}

loadTurnstile();
