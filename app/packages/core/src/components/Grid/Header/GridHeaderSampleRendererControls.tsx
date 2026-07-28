import {
  getSampleRendererGridSlotComponent,
  PluginComponentType,
  SAMPLE_RENDERER_GRID_SLOT,
  useActivePlugins,
} from "@fiftyone/plugins";
import * as fos from "@fiftyone/state";
import React, { useMemo } from "react";
import { RightDiv as GridHeaderControlContainer } from "./Containers";

type GridHeaderControl = {
  name: string;
  HeaderComponent: React.FunctionComponent;
};

const SLOT = SAMPLE_RENDERER_GRID_SLOT.HEADER_AFTER_RESOURCE_COUNT;

/** Renders grid header controls declared by active sample renderers. */
const GridHeaderSampleRendererControls = () => {
  const dataset = fos.useCurrentDataset();
  const schema = fos.useSampleSchema();
  const ctx = useMemo(
    () => ({
      dataset,
      schema,
    }),
    [dataset, schema],
  );
  const controls = useActivePlugins(PluginComponentType.SampleRenderer, ctx)
    .map((registration) => ({
      name: registration.name,
      HeaderComponent: getSampleRendererGridSlotComponent(registration, SLOT),
    }))
    .filter((control): control is GridHeaderControl =>
      Boolean(control.HeaderComponent),
    );

  if (!controls.length) {
    return null;
  }

  return (
    <>
      {controls.map(({ HeaderComponent, name }) => (
        <GridHeaderControlContainer key={name}>
          <HeaderComponent />
        </GridHeaderControlContainer>
      ))}
    </>
  );
};

export default GridHeaderSampleRendererControls;
