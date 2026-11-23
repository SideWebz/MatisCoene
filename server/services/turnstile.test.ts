import { isAcceptedTurnstileVerification } from "./turnstile.ts";

const expectedHostnames = ["matiscoene.be", "matiscoene.sidewebz.be"];

Deno.test("accepts only successful Turnstile responses for an allowed hostname", () => {
  if (
    !isAcceptedTurnstileVerification(
      { success: true, hostname: "matiscoene.be" },
      expectedHostnames,
    )
  ) {
    throw new Error("A valid Turnstile response was rejected.");
  }
});

Deno.test("rejects unsuccessful or wrong-hostname Turnstile responses", () => {
  const invalidResponses = [
    { success: false, hostname: "matiscoene.be" },
    { success: true, hostname: "attacker.example" },
    { success: true },
    null,
  ];
  if (invalidResponses.some((response) => isAcceptedTurnstileVerification(response, expectedHostnames))) {
    throw new Error("An invalid Turnstile response was accepted.");
  }
});
