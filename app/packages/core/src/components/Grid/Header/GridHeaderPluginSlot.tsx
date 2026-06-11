import {
  PLUGIN_COMPONENT_SLOT,
  PluginComponentType,
  componentHasSlot,
  useActivePlugins,
} from "@fiftyone/plugins";
import * as fos from "@fiftyone/state";
import React, { useMemo } from "react";
import { RightDiv as GridHeaderSlotContainer } from "./Containers";

const SLOT = PLUGIN_COMPONENT_SLOT.GRID_HEADER_AFTER_RESOURCE_COUNT;

/** Renders plugin components registered for the grid header count-adjacent slot. */
const GridHeaderPluginSlot = () => {
  const dataset = fos.useCurrentDataset();
  const ctx = useMemo(
    () => ({
      dataset,
      slot: SLOT,
      surface: "grid",
    }),
    [dataset]
  );
  const components = useActivePlugins(
    PluginComponentType.Component,
    ctx
  ).filter((registration) => componentHasSlot(registration, SLOT));

  if (!components.length) {
    return null;
  }

  return (
    <>
      {components.map(({ component: Component, name }) => (
        <GridHeaderSlotContainer key={name}>
          <Component />
        </GridHeaderSlotContainer>
      ))}
    </>
  );
};

export default GridHeaderPluginSlot;
