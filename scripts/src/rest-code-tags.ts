// rest-code-tags — curated, non-user-facing code-side tags that augment
// the OpenAPI tags for search purposes.
//
// CODE_TAGS is a hand-curated map with two sections:
//   byOp:      per-operationId → string[] (e.g. capacity ops)
//   byTagGroup: per-OpenAPI-tag → string[] (e.g. all "Capacity" ops)
//
// resolveCodeTags(op) merges by-op + by-group tags for an operation.
// Code-tags appear in `search` rationale but NOT in `rest describe` output
// (describe stays spec-faithful).
//
// A code-tag referencing an unknown operationId → loud build error.
// A byTagGroup key not in the spec tags → loud build error.

import type { OpMeta } from "@pi-aura/shared/openapi/loader";

export interface CodeTags {
  byOp: Record<string, string[]>;
  byTagGroup: Record<string, string[]>;
}

// ---------------------------------------------------------------------------
// Curated code-side tags
// ---------------------------------------------------------------------------

export const CODE_TAGS: CodeTags = {
  byOp: {
    updateTaskMemberCapacity: ["capacity", "self-serve"],
    getTaskMemberCapacity: ["capacity"],
    getMyCapacity: ["capacity", "self-serve"],
    getCapacityOverview: ["capacity"],
    updateCapacitySettings: ["capacity", "admin-only"],
    readCapacity: ["capacity"],
    // Notifications
    listNotifications: ["notifications"],
    markNotificationRead: ["notifications"],
    // Self-serve examples
    createArtifact: ["self-serve"],
    updateArtifact: ["self-serve"],
    // Admin-only examples
    deleteTask: ["admin-only"],
    archiveTask: ["admin-only"],
  },

  byTagGroup: {
    Capacity: ["capacity"],
    Notifications: ["notifications"],
  },
};

// ---------------------------------------------------------------------------
// resolveCodeTags — merge by-op + by-group for an operation
// ---------------------------------------------------------------------------

/**
 * Merge code-side tags for an operation: by-op (operationId-specific) +
 * by-group (OpenAPI tag group). Returns a deduplicated array.
 */
export function resolveCodeTags(op: OpMeta): string[] {
  const tags = new Set<string>();

  // by-op tags
  const opTags = CODE_TAGS.byOp[op.operationId];
  if (opTags) {
    for (const t of opTags) tags.add(t);
  }

  // by-group tags (from the op's OpenAPI tags)
  for (const specTag of op.tags) {
    const groupTags = CODE_TAGS.byTagGroup[specTag];
    if (groupTags) {
      for (const t of groupTags) tags.add(t);
    }
  }

  return [...tags];
}
