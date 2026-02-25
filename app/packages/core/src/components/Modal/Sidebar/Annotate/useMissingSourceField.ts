import { getStageKwarg, isPatchesView, view } from "@fiftyone/state";
import { useAtomValue } from "jotai";
import { useRecoilValue } from "recoil";
import { activeLabelSchemas, labelSchemasData } from "./state";

export interface RequiredField {
  field: string;
  hasSchema: boolean;
}

const STAGE_FIELD_EXTRACTORS: {
  cls: string;
  kwarg: string;
  guard?: (helpers: { isPatches: boolean }) => boolean;
}[] = [
  {
    cls: "fiftyone.core.stages.ToPatches",
    kwarg: "field",
    guard: ({ isPatches }) => isPatches,
  },
  // TODO: add entries for ToClips, ToFrames, etc.
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

  // These relfect the schemas defined on the src dataset.
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
