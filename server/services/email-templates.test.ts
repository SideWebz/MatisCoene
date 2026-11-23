import {
  renderEmailSubject,
  renderEmailTemplate,
  type ContactDetails,
  sanitizeEmailTemplate,
} from "./email-templates.ts";

const example: ContactDetails = {
  name: `<img src=x onerror="alert(1)">`,
  email: "test@example.com",
  phone: "",
  subject: "Contact",
  message: "Eerste regel\nTweede regel",
  date: "23 november 2026",
};

Deno.test("email template escapes user input and preserves message line breaks", () => {
  const html = renderEmailTemplate("<p>{{name}}</p><p>{{message}}</p>", example);
  if (html.includes("<img") || !html.includes("&lt;img")) {
    throw new Error("User-provided markup was not escaped.");
  }
  if (!html.includes("Eerste regel<br>Tweede regel")) {
    throw new Error("Message line breaks were not formatted.");
  }
});

Deno.test("email template removes executable markup and attributes", () => {
  const html = sanitizeEmailTemplate('<p onclick="alert(1)">Safe</p><script>alert(1)</script>');
  if (html !== "<p>Safe</p>") {
    throw new Error(`Unexpected sanitized template: ${html}`);
  }
});

Deno.test("email subject templates cannot introduce header newlines", () => {
  const subject = renderEmailSubject("Hello {{name}}\r\n{{message}}", example);
  if (subject.includes("\r") || subject.includes("\n")) {
    throw new Error("Header injection was not prevented.");
  }
});
