import type { BrandSettings } from "./types";
export function localParts(date: Date, timezone: string) {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(p.map((x) => [x.type, x.value]));
}
export function nextSlot(
  b: BrandSettings,
  after: number,
  occupied: number[] = [],
  jitter = 0,
) {
  if (b.times.length !== 2) throw Error("Exactly two daily slots required");
  for (
    let min = Math.ceil(after / 60000) * 60000;
    min < after + 16 * 86400000;
    min += 60000
  ) {
    const p = localParts(new Date(min), b.timezone);
    if (
      b.times.includes(`${p.hour}:${p.minute}`) &&
      !occupied.some((t) => Math.abs(t - min) < 10 * 60000)
    )
      return min + Math.max(0, Math.min(120, jitter)) * 1000;
  }
  throw Error("No available slot in 14-day calendar");
}
