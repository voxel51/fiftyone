import {
  EditTemporalDetectionCommand,
  useAnnotationEventHandler,
} from "@fiftyone/annotation";
import { useCommandBus } from "@fiftyone/command-bus";
import { TemporalOverlay } from "@fiftyone/lighter";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SchemaIOComponent } from "../../../../../plugins/SchemaIO";
import { SchemaType } from "../../../../../plugins/SchemaIO/utils/types";
import { currentOverlay } from "./state";

interface SupportState {
  first?: number;
  last?: number;
}

const createInput = (name: string, readOnly?: boolean) => ({
  [name]: {
    type: "number",
    view: {
      name: "View",
      label: name,
      component: "FieldView",
      readOnly,
    },
    multipleOf: 1,
  },
});

const createStack = () => ({
  name: "HStackView",
  component: "GridView",
  orientation: "horizontal",
  gap: 1,
  align_x: "left",
  align_y: "top",
});

export interface SupportProps {
  readOnly?: boolean;
}

/**
 * Frame-range editor for `TemporalDetection`. Dispatches
 * `EditTemporalDetectionCommand` — the same path the timeline drag uses
 * — which mutates `overlay.label` via the typed setter so
 * `useTemporalDetectionDeltaSupplier` picks the change up on autosave.
 */
export default function Support({ readOnly = false }: SupportProps) {
  const overlay = useAtomValue(currentOverlay);
  const commandBus = useCommandBus();

  const [state, setState] = useState<SupportState>({});

  const syncFromOverlay = useCallback(() => {
    if (!(overlay instanceof TemporalOverlay)) return;
    const support = overlay.label?.support;
    if (!Array.isArray(support) || support.length !== 2) return;
    setState({ first: support[0], last: support[1] });
  }, [overlay]);

  useEffect(() => {
    syncFromOverlay();
  }, [syncFromOverlay]);

  // Refresh when something else (timeline drag, undo/redo) mutates the
  // same overlay's label. Filter by detection `_id` so concurrent edits
  // to other TDs don't churn this form.
  useAnnotationEventHandler(
    "annotation:labelEdit",
    useCallback(
      (payload) => {
        if (!(overlay instanceof TemporalOverlay)) return;
        const editedId = (payload.label as { _id?: string } | null)?._id;
        if (editedId && editedId !== overlay.label?._id) return;
        syncFromOverlay();
      },
      [overlay, syncFromOverlay]
    )
  );

  const schema: SchemaType = useMemo(
    () => ({
      type: "object",
      view: {
        component: "ObjectView",
      },
      properties: {
        range: {
          type: "object",
          view: createStack(),
          properties: {
            ...createInput("first", readOnly),
            ...createInput("last", readOnly),
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
        data={{ range: state }}
        onChange={(next: { range: SupportState }) => {
          if (readOnly || !(overlay instanceof TemporalOverlay)) return;

          const first = parseEndpoint(next.range.first);
          const last = parseEndpoint(next.range.last);
          if (first === null || last === null) return;
          if (last < first) return;

          if (state.first === first && state.last === last) {
            return;
          }

          const detectionId = overlay.label?._id;
          if (!detectionId) return;

          setState({ first, last });

          void commandBus.execute(
            new EditTemporalDetectionCommand(overlay.field, detectionId, {
              support: [first, last],
            })
          );
        }}
      />
    </div>
  );
}

const parseEndpoint = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number.parseInt(trimmed, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};
