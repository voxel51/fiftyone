/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Matrix layout: rows are one field's values, columns another's, and each
 * cell is a depth stack of the samples matching both. Two label fields
 * sorted by confidence read as a confusion matrix of stacks; clicking one
 * expands it into a grid of that cell's samples.
 */

import styles from "./Strips.module.css";

import { useReverbValue } from "@fiftyone/reverb";
import { useContext } from "react";
import { createPortal } from "react-dom";
import { gridZoom } from "../atoms";
import { useValueCounts } from "../categorical";
import ExpandedCell from "./ExpandedCell";
import { ExpanderContext, OverlayContext, useExpander } from "./expansion";
import MatrixBody from "./MatrixBody";
import StripsRoot from "./StripsRoot";
import { trackHeight } from "./StripTrack";

const Cells = ({
  colField,
  rowField,
}: {
  colField: string;
  rowField: string;
}) => {
  const rows = useValueCounts(rowField, "value");
  const cols = useValueCounts(colField, "value");
  const rowHeight = trackHeight(useReverbValue(gridZoom), 56, 8);
  const expander = useExpander();
  const overlay = useContext(OverlayContext);

  if (!rows.length || !cols.length) {
    return <div className={styles.none}>No values</div>;
  }

  return (
    <ExpanderContext.Provider value={expander}>
      <MatrixBody
        colField={colField}
        cols={cols}
        rowField={rowField}
        rowHeight={rowHeight}
        rows={rows}
      />
      {expander.expanded &&
        overlay &&
        createPortal(
          <ExpandedCell
            key={expander.expanded.cell}
            expansion={expander.expanded}
          />,
          overlay,
        )}
    </ExpanderContext.Provider>
  );
};

export default function Matrix({
  colField,
  rowField,
}: {
  colField: string;
  rowField: string;
}) {
  return (
    <StripsRoot>
      <Cells colField={colField} rowField={rowField} />
    </StripsRoot>
  );
}
