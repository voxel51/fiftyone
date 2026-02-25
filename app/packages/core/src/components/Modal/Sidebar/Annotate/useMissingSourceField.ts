import { getStageKwarg, isPatchesView, view } from "@fiftyone/state";
import { useAtomValue } from "jotai";
import { useRecoilValue } from "recoil";
import { activeLabelSchemas, labelSchemasData } from "./state";

/**
 * Describes a field that needs to be activated in the annotation schema
 * before annotation can work in the current view.
 */
export interface RequiredField {
  /** The field path (e.g. "ground_truth") */
  field: string;
  /** Whether the field already has a configured label_schema (just needs activation) */
  hasSchema: boolean;
}

// ---------------------------------------------------------------------------
// View stage → field extractors
//
// Each generated view type has its own stage class and kwarg layout.
// Add new extractors here as more generated view types support annotation.
// ---------------------------------------------------------------------------

const STAGE_FIELD_EXTRACTORS: {
  cls: string;
  kwarg: string;
  /** Optional guard — return false to skip this extractor for the current view */
  guard?: (helpers: { isPatches: boolean }) => boolean;
}[] = [
  {
    cls: "fiftyone.core.stages.ToPatches",
    kwarg: "field",
    guard: ({ isPatches }) => isPatches,
  },
  // Future: add entries for ToClips, ToFrames, ToEvaluationPatches, etc.
];

/**
 * Extracts the source field name from the view stages for the current
 * generated view type.
 */
export function getSourceFieldFromStages(
  stages: { _cls: string; kwargs: [string, unknown][] }[],
  helpers: { isPatches: boolean }
): string | undefined {
  for (const { cls, kwarg, guard } of STAGE_FIELD_EXTRACTORS) {
    if (guard && !guard(helpers)) continue;

    for (const stage of stages) {
      if (stage._cls === cls) {
        return getStageKwarg<string>(stage, kwarg);
      }
    }
  }
  return undefined;
}

/**
 * Hook that detects when the user is in a generated view (patches, etc.) and
 * the source field that defines the view is not in the active annotation
 * schemas.
 *
 * Returns a {@link RequiredField} when the user needs to add the field,
 * or `null` when no action is needed.
 */
export default function useMissingSourceField(): RequiredField | null {
  const isPatches = useRecoilValue(isPatchesView);
  const stages = useRecoilValue(view);
  const schemas = useAtomValue(labelSchemasData);
  const active = useAtomValue(activeLabelSchemas);

  const sourceField = getSourceFieldFromStages(stages, { isPatches });
  if (!sourceField) return null;

  const isActive = active?.includes(sourceField) ?? false;
  if (isActive) return null;

  const hasSchema =
    schemas != null &&
    sourceField in schemas &&
    !!schemas[sourceField]?.label_schema;

  return { field: sourceField, hasSchema };
}
