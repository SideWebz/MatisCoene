export function isAcceptedTurnstileVerification(
  verification: unknown,
  expectedHostnames: readonly string[],
): boolean {
  if (!verification || typeof verification !== "object") {
    return false;
  }
  const result = verification as Record<string, unknown>;
  return result.success === true &&
    typeof result.hostname === "string" &&
    expectedHostnames.includes(result.hostname.toLowerCase());
}
