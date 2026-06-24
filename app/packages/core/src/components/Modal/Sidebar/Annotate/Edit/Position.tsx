import {
  encodeEntityId,
  GEOMETRY_SIGNAL,
  type GeometrySignal,
  type LabelRef,
  useActiveAnnotationSampleId,
  useAnnotationEngine,
  useEngineSelector,
  useSignalValue,
} from "@fiftyone/annotation";
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

  // address the box by its engine ref — the anchor's full ref (carries the
  // video frame + track instanceId + frames.<field> path) when the form was
  // opened from a surface; falls back to the schema-field + overlay id, which is
  // already correct for an image / sample-level label. The engine is the source
  // of truth for geometry; the overlay is no longer read here.
  const ref = useMemo<LabelRef | null>(
    () =>
      selected?.ref ??
      (overlay && sample
        ? { sample, path: overlay.field, instanceId: overlay.id }
        : null),
    [selected?.ref, overlay, sample]
  );

  // committed baseline — the box's stored RELATIVE bounds, read reactively from
  // the engine so it re-syncs on EVERY committed change (drag-end, number input,
  // undo/redo, playhead move to another frame of the track); absolute pixels are
  // arbitrary and drift through the round-trip.
  const committedBounds = useEngineSelector(engine, (e) =>
    ref ? (e.getLabel(ref)?.bounding_box as number[] | undefined) : undefined
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
    () => (ref ? encodeEntityId(dataset, ref) : null),
    [dataset, ref]
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
        key={ref?.instanceId ?? overlay?.id}
        smartForm={true}
        schema={schema}
        data={state}
        onChange={(input: Coordinates) => {
          if (readOnly || !ref) {
            return;
          }

          // current bounds from the engine (source of truth), falling back to
          // what's displayed — never from the Lighter overlay, which a video
          // frame label doesn't carry for the current playhead.
          const stored = engine.getLabel(ref)?.bounding_box as
            | number[]
            | undefined;
          const current =
            stored && stored.length === 4
              ? {
                  x: stored[0],
                  y: stored[1],
                  width: stored[2],
                  height: stored[3],
                }
              : {
                  x: state.position.x,
                  y: state.position.y,
                  width: state.dimensions.width,
                  height: state.dimensions.height,
                };

          const merged = {
            ...current,
            ...input.dimensions,
            ...input.position,
          };

          if (
            [merged.x, merged.y, merged.width, merged.height].some(
              (v) => typeof v !== "number"
            )
          ) {
            return;
          }

          // immediate display of the typed value
          setState({
            position: { x: merged.x, y: merged.y },
            dimensions: { width: merged.width, height: merged.height },
          });

          // commit through the engine: it persists (autosave diffs the engine)
          // and the Lighter bridge read-half re-homes the overlay. A bare
          // updateLabel is one implicit transaction, so the engine bridge pushes
          // the single value-based undo entry — don't also push our own (that
          // double-counts the edit on the shared command stack).
          const next = [merged.x, merged.y, merged.width, merged.height];

          engine.updateLabel(ref, {
            bounding_box: next,
          } as Partial<LabelData>);
        }}
      />
    </div>
  );
}
