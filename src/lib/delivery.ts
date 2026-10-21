import { configured } from "./configuration";
/** Legacy publishing remains testable, but the shipped workflow is manual. */
export function manualPosting() {
  return configured("DELIVERY_MODE") !== "automatic";
}
