// Real (non-enterprise) scope definitions for restricted API tokens — this
// file just never existed upstream, it isn't a gated feature.

export const GRANULAR_SCOPES = [
  "documents.read",
  "documents.write",
  "links.read",
  "links.write",
  "datarooms.read",
  "datarooms.write",
  "analytics.read",
  "visitors.read",
] as const;

export const PRESET_SCOPES = ["apis.all", "apis.read"] as const;
