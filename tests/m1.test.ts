import { expect, test } from "vitest";
import { defaults } from "../src/lib/types";
import { encrypt, decrypt } from "../src/lib/security";
test("manual review and safe cadence are default", () => {
  expect(defaults.autoApprove).toBe(false);
  expect(defaults.times).toHaveLength(2);
});
test("tokens are authenticated ciphertext", () => {
  process.env.TOKEN_ENCRYPTION_KEY = "a".repeat(64);
  const v = encrypt({ token: "secret" });
  expect(v).not.toContain("secret");
  expect(decrypt(v)).toEqual({ token: "secret" });
  expect(() => decrypt(v + "x")).toThrow();
});
