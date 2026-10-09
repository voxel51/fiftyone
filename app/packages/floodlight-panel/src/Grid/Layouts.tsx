/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import Grid from "./Grid";
import usePanelLayout from "./layout";
import Lanes from "./Strips/Lanes";
import Matrix from "./Strips/Matrix";

/** Renders the layout chosen in this panel's header. */
export default function Layouts() {
  const { colField, laneField, layout, rowField } = usePanelLayout();

  if (layout === "lanes") return <Lanes path={laneField} />;
  if (layout === "matrix") {
    return <Matrix colField={colField} rowField={rowField} />;
  }

  return <Grid layout={layout} />;
}
