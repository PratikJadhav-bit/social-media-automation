import { configured } from "./configuration";
export function connectionSetup(origin: string) {
  return Object.fromEntries(
    ["instagram", "facebook", "youtube"].map((platform) => {
      const prefix = platform === "youtube" ? "GOOGLE" : "META";
      const missing = [`${prefix}_CLIENT_ID`, `${prefix}_CLIENT_SECRET`].filter(
        (key) => !configured(key),
      );
      if (!/^[a-f0-9]{64}$/i.test(process.env.TOKEN_ENCRYPTION_KEY || ""))
        missing.push("TOKEN_ENCRYPTION_KEY (64 hex characters)");
      let appOrigin = origin;
      try {
        appOrigin = new URL(process.env.APP_URL || origin).origin;
      } catch {
        missing.push("APP_URL (valid URL)");
      }
      return [
        platform,
        {
          ready: missing.length === 0,
          missing,
          redirectUri: `${appOrigin}/api/connect/callback`,
        },
      ];
    }),
  );
}
