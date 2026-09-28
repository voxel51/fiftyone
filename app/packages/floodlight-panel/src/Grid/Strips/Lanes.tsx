/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Lanes layout: one horizontal strip per value of a categorical field,
 * stacked in a vertically scrolling column.
 */

import styles from "./Strips.module.css";

import { useReverbValue, useReverbValueLoadable } from "@fiftyone/reverb";
import * as fos from "@fiftyone/state";
import { useContext, useMemo, useRef } from "react";
import { gridZoom } from "../atoms";
import { type CountValuesData, toValueCounts } from "../categorical";
import { useLaneHeights } from "../layout";
import { StripsContext } from "./context";
import LaneListRail from "./LaneListRail";
import LaneRows from "./LaneRows";
import StripsRoot from "./StripsRoot";
import { trackHeight } from "./StripTrack";

/**
 * Suspends only for a path's first counts: a later reload keeps the lanes on
 * screen, since suspending would hide every strip and tear down its instance.
 */
const useLaneValues = (path: string) => {
  const loadable = useReverbValueLoadable(fos.countValues(path));
  const last = useRef<{ data: CountValuesData; path: string }>();
  if (loadable.state === "hasValue") {
    last.current = { data: loadable.contents as CountValuesData, path };
  }
  const data =
    loadable.state === "loading" && last.current?.path === path
      ? last.current.data
      : loadable.getValue();

  return useMemo(() => toValueCounts(data as CountValuesData, "count"), [data]);
};

const LaneList = ({ path }: { path: string }) => {
  const values = useLaneValues(path);
  const height = trackHeight(useReverbValue(gridZoom), 64, 16);
  const { heights, setHeight } = useLaneHeights();
  const root = useContext(StripsContext)?.root ?? null;

  if (!values.length) {
    return <div className={styles.none}>No values</div>;
  }

  return (
    <>
      <LaneRows
        defaultHeight={height}
        heights={heights}
        onResize={setHeight}
        path={path}
        railed
        values={values}
      />
      <LaneListRail root={root} values={values} />
    </>
  );
};

export default function Lanes({ path }: { path: string }) {
  return (
    <StripsRoot>
      <LaneList path={path} />
    </StripsRoot>
  );
}
