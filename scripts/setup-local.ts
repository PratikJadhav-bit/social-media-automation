import { ensureLocalConfiguration } from "./local-configuration";
try {
  const result = ensureLocalConfiguration();
  console.log(
    result.created || result.updated.length
      ? "Local configuration is ready with security keys. Existing settings and configured keys were preserved."
      : "Existing local configuration preserved.",
  );
} catch (e) {
  console.error(
    e instanceof Error
      ? e.message
      : "Local setup could not finish. Check .env and retry.",
  );
  process.exitCode = 1;
}
