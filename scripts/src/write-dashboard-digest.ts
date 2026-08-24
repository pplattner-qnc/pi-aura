import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Write the full corrected digest to the stable dashboard path,
 * creating the parent directory if it does not exist.
 */
export function writeDashboardDigest(digest: unknown, dashboardPath: string): void {
  mkdirSync(dirname(dashboardPath), { recursive: true });
  writeFileSync(dashboardPath, JSON.stringify(digest, null, 2) + "\n", "utf8");
}
