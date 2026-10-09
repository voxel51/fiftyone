import { defineParam } from "@fiftyone/location";

/**
 * `?subset=<id>`: the subset the grid is scoped to. An empty value is a link
 * to all samples, which is not the same as no param at all.
 */
export const subsetParam = defineParam<string | undefined>({
  key: "subset",
  parse: (raw) => raw,
  format: (id) => id || undefined,
  history: "replace",
  scope: "dataset",
});

/** `?subsetScope=segments`: a subset scoped to segments; episodes when absent. */
export const subsetScopeParam = defineParam<"episodes" | "segments">({
  key: "subsetScope",
  parse: (raw) => (raw === "segments" ? "segments" : "episodes"),
  format: (scope) => (scope === "segments" ? "segments" : undefined),
  history: "replace",
  scope: "dataset",
});
