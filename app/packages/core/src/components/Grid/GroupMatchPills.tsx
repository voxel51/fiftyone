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
import { useEffect, useMemo } from "react";

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

/** Group ID to the names of its slices that matched, best match first. */
export type GroupMatches = ReadonlyMap<string, readonly string[]>;

/**
 * The matched slices a `SortBySimilarity` stage recorded in its state when
 * it searched a grouped collection, or null when no stage in `view` did.
 */
export const groupMatchesOf = (view: State.Stage[]): GroupMatches | null => {
  for (const stage of view) {
    if (stage._cls !== SORT_BY_SIMILARITY) continue;
    const state = Object.fromEntries(stage.kwargs)._state as
      | { group_matches?: Record<string, unknown> }
      | null
      | undefined;
    if (!state?.group_matches) continue;
    return new Map(
      Object.entries(state.group_matches).map(([groupId, slices]) => [
        groupId,
        Array.isArray(slices)
          ? slices.filter((slice): slice is string => typeof slice === "string")
          : [],
      ]),
    );
  }
  return null;
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
          style={{
            backgroundColor: colors[i],
            margin: spacing,
            paddingLeft: spacing,
            paddingRight: spacing,
          }}
          title={`Matched in slice ${slice}`}
        >
          {`match: ${slice}`}
        </div>
      ))}
    </div>
  );
}

/** Shows each tile's matched slices while a grouped similarity search is in
 * the view. */
export function useGroupMatchTileDecorator() {
  const grouped = fos.useIsGroupDataset();
  const groupField = fos.useCurrentDataset()?.groupField;
  const view = fos.useView();
  const matches = useMemo(
    () => (grouped ? groupMatchesOf(view) : null),
    [grouped, view],
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
