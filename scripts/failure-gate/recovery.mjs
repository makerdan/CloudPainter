import { registry, policy, readJson } from "./store.mjs";

export function recoveryPreview(root, candidatePath) {
  policy(root, false);
  const current = registry(root);
  const candidate = readJson(root, candidatePath);
  if (candidate.schemaVersion !== 1 || candidate.projectId !== current.projectId || !candidate.records || Array.isArray(candidate.records)) {
    throw new Error("Recovery identity mismatch");
  }
  const omitted = Object.keys(current.records).filter(id => !Object.hasOwn(candidate.records, id));
  const conflicts = Object.keys(candidate.records).filter(id => current.records[id] &&
    JSON.stringify(candidate.records[id]) !== JSON.stringify(current.records[id]));
  return {
    mode: "READ_ONLY_PREVIEW",
    omittedIds: omitted,
    conflictingIds: conflicts,
    candidateOnlyIds: Object.keys(candidate.records).filter(id => !current.records[id]),
    canOverwrite: false,
    disposition: "Never restore over the authoritative ledger or discard tombstones. Reconcile in an isolated copy, obtain specific recovery approval, and fence allocation first."
  };
}
