const encoder = new TextEncoder();

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: 150000,
      hash: "SHA-256",
    },
    keyMaterial,
    256,
  );

  const saltHex = Array.from(salt, (byte) => byte.toString(16).padStart(2, "0")).join("");
  const hashHex = Array.from(new Uint8Array(derivedBits), (byte) => byte.toString(16).padStart(2, "0")).join("");

  return `${saltHex}:${hashHex}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const separatorIndex = storedHash.indexOf(":");
  if (separatorIndex === -1) {
    return false;
  }

  const saltHex = storedHash.slice(0, separatorIndex);
  const expectedHashHex = storedHash.slice(separatorIndex + 1);
  const salt = new Uint8Array(
    saltHex.match(/.{1,2}/g)?.map((segment) => Number.parseInt(segment, 16)) ?? [],
  );

  if (salt.length === 0) {
    return false;
  }

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: 150000,
      hash: "SHA-256",
    },
    keyMaterial,
    256,
  );

  const hashHex = Array.from(new Uint8Array(derivedBits), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return hashHex === expectedHashHex;
}
