/**
 * The slices that matched a similarity search on a grouped dataset, as
 * "match: <slice>" pills at each tile's top right. The grid keeps showing the
 * active slice, so a pill says why a group is in the results when another of
 * its slices is what matched.
 */

import { getAssignedColor } from "@fiftyone/looker/src/elements/common/util";
import { isValidColor } from "@fiftyone/looker/src/overlays/util";
import type { State } from "@fiftyone/state";
import * as fos from "@fiftyone/state";
import { useEffect, useMemo, useState } from "react";

import styles from "./GroupMatchPills.module.css";
import bubbles from "./GridTagBubbles.module.css";
import {
  registerTileDecorator,
  unregisterTileDecorator,
  type TileDecoratorSample,
} from "./tileDecorators";

const ID = "fiftyone:group-matches";

const SORT_BY_SIMILARITY = "fiftyone.core.stages.SortBySimilarity";

const DEFAULT_FONT_SIZE = 14;
const SPACING_COEFFICIENT = 0.1;

const lastSearchOf = (view: State.Stage[]): State.Stage | undefined =>
  [...view].reverse().find((stage) => stage._cls === SORT_BY_SIMILARITY);

/**
 * The matched slices the last `SortBySimilarity` stage in `view` recorded in
 * its state when it searched a grouped collection, or null when it did not.
 * A later search decides the results, so an earlier one's matches no longer
 * describe them.
 */
export const groupMatchesOf = (
  view: State.Stage[],
): fos.GroupMatches | null => {
  const search = lastSearchOf(view);
  if (!search) return null;
  const state = Object.fromEntries(search.kwargs)._state as
    | { group_matches?: Record<string, unknown> }
    | null
    | undefined;
  if (!state?.group_matches) return null;
  return new Map(
    Object.entries(state.group_matches).map(([groupId, slices]) => [
      groupId,
      Array.isArray(slices)
        ? slices.filter((slice): slice is string => typeof slice === "string")
        : [],
    ]),
  );
};

function GroupMatchPills({
  groupField,
  slices,
}: {
  groupField: string;
  slices: readonly string[];
}) {
  const options = fos.useLookerOptions(false);
  const fontSize = options.fontSize ?? DEFAULT_FONT_SIZE;
  const spacing = `${fontSize * SPACING_COEFFICIENT}px`;
  const colors = useMemo(
    () =>
      slices.map((slice) =>
        options.coloring
          ? getAssignedColor({
              coloring: options.coloring,
              path: groupField,
              value: slice,
              customizeColorSetting: options.customizeColorSetting ?? [],
              isValidColor,
            })
          : undefined,
      ),
    [groupField, slices, options.coloring, options.customizeColorSetting],
  );

  return (
    <div
      className={styles.pills}
      style={{ fontSize }}
      data-cy="group-match-pills"
    >
      {slices.map((slice, i) => (
        <div
          key={slice}
          className={bubbles.gridTagBubble}
          data-cy="group-match-pill"
          style={{
            backgroundColor: colors[i],
            margin: spacing,
            paddingLeft: spacing,
            paddingRight: spacing,
          }}
          title={`match: ${slice}`}
        >
          {`match: ${slice}`}
        </div>
      ))}
    </div>
  );
}

/**
 * Shows each tile's matched slices from the latest search: a grouped
 * similarity search in the view, or a search that ran without one and
 * published its matches. When the published matches are cleared, the view's
 * search describes the results again.
 */
export function useGroupMatchTileDecorator() {
  const grouped = fos.useIsGroupDataset();
  const groupField = fos.useCurrentDataset()?.groupField;
  const view = fos.useView();
  const published = fos.usePublishedGroupMatches();
  const searchKey = useMemo(() => {
    const search = lastSearchOf(view);
    return search ? JSON.stringify(search) : null;
  }, [view]);

  const [latest, setLatest] = useState({
    published,
    searchKey,
    source: published ? "published" : "view",
  });
  if (latest.published !== published || latest.searchKey !== searchKey) {
    let source = latest.source;
    if (searchKey !== latest.searchKey && searchKey !== null) source = "view";
    if (published !== latest.published && published) source = "published";
    setLatest({ published, searchKey, source });
  }

  const fromPublished = latest.source === "published" && published;
  const matches = useMemo(
    () => (grouped ? (fromPublished ? published : groupMatchesOf(view)) : null),
    [grouped, fromPublished, published, view],
  );

  useEffect(() => {
    if (!matches || !groupField) return undefined;
    registerTileDecorator({
      id: ID,
      render: (sample: TileDecoratorSample) => {
        const group = sample[groupField] as { _id?: string } | undefined;
        const slices = group?._id ? matches.get(group._id) : undefined;
        return slices?.length ? (
          <GroupMatchPills groupField={groupField} slices={slices} />
        ) : null;
      },
    });
    return () => unregisterTileDecorator(ID);
  }, [matches, groupField]);
}
