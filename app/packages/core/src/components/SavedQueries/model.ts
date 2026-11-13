/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Pure rules for the Saved queries menu. A saved query is a saved view under
 * its product name: the same dataset record, slug rules and stage payload.
 */

import { toSlug } from "@fiftyone/utilities";

/**
 * A saved view record, as the saved views fragment reads it. The fragment's
 * generated type marks every field nullable; a stored saved view always has
 * an id, name, slug, and stages.
 */
export interface SavedQuery {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly description: string | null;
  readonly color: string | null;
  readonly viewStages: readonly string[];
}

/** The metadata a user writes for a query, as its form holds it. */
export interface SavedQueryDraft {
  readonly name: string;
  readonly description: string;
  readonly color: string;
}

/** Past this many saved queries, the list offers a search field. */
export const SEARCH_THRESHOLD = 6;

/** Case-insensitive match on the name, slug, or description. */
export function matchesSearch(query: SavedQuery, term: string): boolean {
  const needle = term.trim().toLowerCase();
  if (!needle) return true;
  return [query.name, query.slug, query.description ?? ""].some((value) =>
    value.toLowerCase().includes(needle),
  );
}

/**
 * Why a name cannot be saved, or null when it can. Names are unique by slug
 * within a dataset, so "Night Scenes" and "night-scenes" collide. `current`
 * is the slug of the query being renamed, which may keep its own slug.
 */
export function nameProblem(
  queries: readonly SavedQuery[],
  name: string,
  current?: string,
): string | null {
  if (!name.trim()) return null;
  const slug = toSlug(name);
  if (!slug) return "Use at least one letter or number";
  const clash = queries.find(
    (query) => query.slug === slug && query.slug !== current,
  );
  return clash ? `“${clash.name}” already uses this name` : null;
}

/** The parts of the working view a new saved query would capture. */
export interface DefinitionParts {
  /** Stages in the view bar. */
  readonly stages: number;
  /** Sidebar filters, compiled into stages when saved. */
  readonly filters: boolean;
  /** A grid sort, saved as a sort stage. */
  readonly sort: boolean;
  /** A similarity sort, saved as a similarity stage. */
  readonly similarity: boolean;
  /** Hidden fields, saved as an exclude-fields stage. */
  readonly fieldVisibility: boolean;
  /** Matches picked in a plot or by search, saved as their IDs. */
  readonly resultSelection: boolean;
  /** Tray-selected samples the user chose to include. */
  readonly selectedSamples: number;
  /** What one selected item is called, e.g. "sample" or "episode". */
  readonly selectionUnit?: { readonly one: string; readonly many: string };
}

const plural = (count: number, one: string, many = `${one}s`) =>
  `${count.toLocaleString()} ${count === 1 ? one : many}`;

/**
 * What a save would capture, in the order the server compiles it: stages,
 * then sidebar filters and the other transient state. Empty when it would
 * capture nothing; see {@link capturesAnything}.
 */
export function describeDefinition(parts: DefinitionParts): string {
  const items = [
    parts.stages > 0 ? plural(parts.stages, "stage") : null,
    parts.filters ? "filters" : null,
    parts.similarity ? "similarity sort" : parts.sort ? "sort" : null,
    parts.fieldVisibility ? "field visibility" : null,
    parts.resultSelection ? "selected results" : null,
    parts.selectedSamples > 0
      ? plural(
          parts.selectedSamples,
          `selected ${parts.selectionUnit?.one ?? "sample"}`,
          `selected ${parts.selectionUnit?.many ?? "samples"}`,
        )
      : null,
  ].filter((item): item is string => item !== null);
  return items.join(" · ");
}

/**
 * Whether a save would capture anything. The bare dataset, with no stages,
 * filters, or other state on it, is not a query.
 */
export function capturesAnything(parts: DefinitionParts): boolean {
  return parts.stages > 0 || capturesMoreThanStages(parts);
}

/**
 * Whether a save would capture more than the view bar's stages. With a query
 * loaded, stages alone are that query's own definition: saving them again
 * would only duplicate it.
 */
export function capturesMoreThanStages(parts: DefinitionParts): boolean {
  return (
    parts.filters ||
    parts.sort ||
    parts.similarity ||
    parts.fieldVisibility ||
    parts.resultSelection ||
    parts.selectedSamples > 0
  );
}

/**
 * The metadata to send for an edit. Unchanged fields keep their stored
 * values, so a description an SDK user left unset stays unset.
 */
export function editedInfo(
  query: SavedQuery,
  draft: SavedQueryDraft,
): { name: string; description: string | null; color: string | null } {
  const description = draft.description.trim();
  return {
    name: draft.name.trim(),
    description:
      description === (query.description ?? "").trim()
        ? query.description
        : description,
    color: draft.color === (query.color ?? "") ? query.color : draft.color,
  };
}

/** Whether an edit draft differs from the stored metadata. */
export function hasEdits(query: SavedQuery, draft: SavedQueryDraft): boolean {
  const next = editedInfo(query, draft);
  return (
    next.name !== query.name ||
    next.description !== query.description ||
    next.color !== query.color
  );
}

/**
 * The color a new query starts with: whichever palette color the dataset's
 * queries wear least, earliest in the palette on a tie, so a new query
 * stands apart in the list until the user picks another.
 */
export function leastUsedColor(
  queries: readonly SavedQuery[],
  palette: readonly string[],
): string {
  const uses = (color: string) =>
    queries.filter(
      (query) => query.color?.toLowerCase() === color.toLowerCase(),
    ).length;
  return palette.reduce((least, color) =>
    uses(color) < uses(least) ? color : least,
  );
}
