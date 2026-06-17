import {
  encodeEntityId,
  GEOMETRY_SIGNAL,
  type GeometrySignal,
  useActiveAnnotationSampleId,
  useAnnotationEngine,
  useEngineSelector,
  useSignalValue,
} from "@fiftyone/annotation";
import { usePushUndoable } from "@fiftyone/commands";
import { DetectionOverlay } from "@fiftyone/lighter";
import { useCurrentDatasetId } from "@fiftyone/state";
import type { LabelData } from "@fiftyone/utilities";
import { useEffect, useMemo, useState } from "react";
import { SchemaIOComponent } from "../../../../../plugins/SchemaIO";
import { SchemaType } from "../../../../../plugins/SchemaIO/utils/types";
import { useAnnotationContext } from "./useAnnotationContext";

const createInput = (name: string, readOnly?: boolean) => {
  return {
    [name]: {
      type: "number",
      view: {
        name: "View",
        label: name,
        component: "FieldView",
        readOnly,
      },
      // relative [0,1] coordinates — fine step, no snapping of stored values
      multipleOf: 0.0001,
    },
  };
};

const createStack = () => {
  return {
    name: "HStackView",
    component: "GridView",
    orientation: "horizontal",
    gap: 1,
    align_x: "left",
    align_y: "top",
  };
};

interface Coordinates {
  position: { x?: number; y?: number };
  dimensions: { width?: number; height?: number };
}

export interface PositionProps {
  readOnly?: boolean;
}

export default function Position({ readOnly = false }: PositionProps) {
  const [state, setState] = useState<Coordinates>({
    position: {},
    dimensions: {},
  });

  const { selected } = useAnnotationContext();
  const overlay = selected?.overlay;
  const engine = useAnnotationEngine();
  const sample = useActiveAnnotationSampleId();
  const dataset = useCurrentDatasetId() ?? "";
  const { createPushAndExec } = usePushUndoable();

  // committed baseline — the box's stored RELATIVE bounds, read reactively from
  // the engine so it re-syncs on EVERY committed change (drag-end, number input,
  // undo/redo); absolute pixels are arbitrary and drift through the round-trip.
  const committedBounds = useEngineSelector(engine, (e) =>
    overlay && sample
      ? (e.getLabel({
          sample,
          path: overlay.field,
          instanceId: overlay.id,
        })?.bounding_box as number[] | undefined)
      : undefined
  );

  useEffect(() => {
    if (!committedBounds || committedBounds.length !== 4) {
      return;
    }

    const [x, y, width, height] = committedBounds;
    setState({
      position: { x, y },
      dimensions: { width, height },
    });
  }, [committedBounds]);

  // LIVE geometry from the engine — the 2D scene publishes mid-drag relative
  // bounds; we render them directly, never touching Lighter. Render-only: the
  // committed write happens on drag-end through the bridge.
  const key = useMemo(
    () =>
      overlay && sample
        ? encodeEntityId(dataset, {
            sample,
            path: overlay.field,
            instanceId: overlay.id,
          })
        : null,
    [dataset, sample, overlay]
  );

  const live = useSignalValue<GeometrySignal | null>(
    engine,
    GEOMETRY_SIGNAL,
    key,
    null
  );

  useEffect(() => {
    if (!live || live.kind !== "2d") {
      return;
    }

    const { x, y, width, height } = live.bounds;
    setState({ position: { x, y }, dimensions: { width, height } });
  }, [live]);

  const schema: SchemaType = useMemo(
    () => ({
      type: "object",
      view: {
        component: "ObjectView",
      },
      properties: {
        position: {
          type: "object",
          view: createStack(),
          properties: {
            ...createInput("x", readOnly),
            ...createInput("y", readOnly),
          },
        },
        dimensions: {
          type: "object",
          view: createStack(),
          properties: {
            ...createInput("width", readOnly),
            ...createInput("height", readOnly),
          },
        },
      },
    }),
    [readOnly]
  );

  return (
    <div style={{ width: "100%" }}>
      <SchemaIOComponent
        key={overlay?.id}
        smartForm={true}
        schema={schema}
        data={state}
        onChange={(input: Coordinates) => {
          if (
            readOnly ||
            !(overlay instanceof DetectionOverlay) ||
            !overlay.hasValidBounds()
          ) {
            return;
          }

          const current = overlay.relativeBounds;
          const merged = {
            x: current.x,
            y: current.y,
            width: current.width,
            height: current.height,
            ...input.dimensions,
            ...input.position,
          };

          // immediate display of the typed value
          setState({
            position: { x: merged.x, y: merged.y },
            dimensions: { width: merged.width, height: merged.height },
          });

          // commit through the engine: it persists (autosave diffs the engine)
          // and the Lighter bridge read-half re-homes the overlay. A plain
          // overlay transform moves the box but never reaches the engine, so it
          // wouldn't persist.
          const ref = { path: overlay.field, instanceId: overlay.id };
          const next = [merged.x, merged.y, merged.width, merged.height];
          const previous = (engine.getLabel({ sample, ...ref })
            ?.bounding_box as number[] | undefined) ?? [
            current.x,
            current.y,
            current.width,
            current.height,
          ];
          const scoped = engine.scope(sample);

          createPushAndExec(
            `transform-${overlay.id}-${Date.now()}`,
            () =>
              scoped.updateLabel(ref, {
                bounding_box: next,
              } as Partial<LabelData>),
            () =>
              scoped.updateLabel(ref, {
                bounding_box: previous,
              } as Partial<LabelData>)
          );
        }}
      />
    </div>
  );
}
