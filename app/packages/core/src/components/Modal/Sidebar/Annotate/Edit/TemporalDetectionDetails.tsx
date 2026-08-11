import {
  type LabelRef,
  useActiveAnnotationSampleId,
  useAnnotationEngine,
  useEngineSelector,
} from "@fiftyone/annotation";
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
      // 1-indexed inclusive frame numbers — integer steps only
      multipleOf: 1,
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

interface Span {
  start?: number;
  stop?: number;
}

export interface TemporalDetectionDetailsProps {
  readOnly?: boolean;
}

/**
 * Editable start/stop frames for the selected TemporalDetection. A TD's
 * `support` span is owned by the label itself, not the attribute schema, so it
 * gets a dedicated editor injected alongside the generic form — mirroring
 * {@link Position} for bounding boxes. The span is read reactively from the
 * engine (so it re-syncs on number-input edits, undo/redo, and timeline drags)
 * and edits commit straight back through the engine, keeping the timeline
 * interval and persistence in step.
 */
export default function TemporalDetectionDetails({
  readOnly = false,
}: TemporalDetectionDetailsProps) {
  const [span, setSpan] = useState<Span>({});

  const { selected } = useAnnotationContext();
  const overlay = selected?.overlay;
  const engine = useAnnotationEngine();
  const sample = useActiveAnnotationSampleId();

  // address the TD by its engine ref — the anchor's full ref when opened from a
  // surface, falling back to the schema-field + overlay id (a TD is sample-level,
  // so there is no frame on the ref).
  const ref = useMemo<LabelRef | null>(
    () =>
      selected?.ref ??
      (overlay && sample
        ? { sample, path: overlay.field, instanceId: overlay.id }
        : null),
    [selected?.ref, overlay, sample],
  );

  // committed baseline — the stored `[start, stop]`, read reactively so the
  // inputs re-sync on every committed change (typed edit, undo/redo, the
  // timeline interval being dragged).
  const committedSupport = useEngineSelector(engine, (e) =>
    ref ? (e.getLabel(ref)?.support as number[] | undefined) : undefined,
  );

  useEffect(() => {
    if (!committedSupport || committedSupport.length !== 2) {
      return;
    }

    setSpan({ start: committedSupport[0], stop: committedSupport[1] });
  }, [committedSupport]);

  const schema: SchemaType = useMemo(
    () => ({
      type: "object",
      view: {
        component: "ObjectView",
      },
      properties: {
        support: {
          type: "object",
          view: createStack(),
          properties: {
            ...createInput("start", readOnly),
            ...createInput("stop", readOnly),
          },
        },
      },
    }),
    [readOnly],
  );

  return (
    <div style={{ width: "100%" }}>
      <SchemaIOComponent
        key={ref?.instanceId ?? overlay?.id}
        smartForm={true}
        schema={schema}
        data={{ support: span }}
        onChange={(input: { support?: Span }) => {
          if (readOnly || !ref) {
            return;
          }

          // current span from the engine (source of truth), falling back to
          // what's displayed; only the typed bound changes, the other holds.
          const stored = engine.getLabel(ref)?.support as number[] | undefined;
          const current =
            stored && stored.length === 2
              ? { start: stored[0], stop: stored[1] }
              : span;

          const merged = { ...current, ...input.support };

          if (
            typeof merged.start !== "number" ||
            typeof merged.stop !== "number"
          ) {
            return;
          }

          // immediate display of the typed value
          setSpan(merged);

          // commit through the engine: it persists (autosave diffs the engine)
          // and the timeline re-derives the interval. A bare updateLabel is one
          // implicit transaction, so the engine bridge pushes the single
          // value-based undo entry.
          engine.updateLabel(ref, {
            support: [merged.start, merged.stop],
          } as Partial<LabelData>);
        }}
      />
    </div>
  );
}
