import type {
  SelectionBoundary,
  SelectionProvenance,
  SelectionRange,
} from "./types";

/** Constraints add track origins, so their pins belong to a distinct scope. */
export function savedSegmentPinScope(boundary: SelectionBoundary) {
  if (!boundary.subsetId || boundary.subsetScope !== "segments")
    return undefined;
  return boundary.provider
    ? `${boundary.subsetId}:${JSON.stringify(boundary.provider)}`
    : boundary.subsetId;
}

function sourceLabel(source: SelectionProvenance): string {
  const name = source.label || source.source;
  switch (source.provider) {
    case "events":
      return `Event: ${name}`;
    case "temporal-tags":
      return `Temporal tag: ${name}`;
    case "embeddings":
      return `Embeddings: ${name}${source.model ? ` (${source.model})` : ""}`;
    case "clips":
      return `Clip: ${name}`;
    default:
      return name || "Saved segment";
  }
}

/** One saved range stays one mark, even when several sources explain it. */
export function savedSegmentSource(range: SelectionRange) {
  const labels = [...new Set(range.provenance.map(sourceLabel))].sort();
  const sources = range.provenance.map(({ provider, source, label, model }) =>
    JSON.stringify([provider, source, label, model]),
  );
  return {
    key: JSON.stringify([...new Set(sources)].sort()),
    label: labels.join(" · ") || "Saved segment",
  };
}
