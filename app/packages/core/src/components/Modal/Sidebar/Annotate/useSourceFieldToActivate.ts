import { getStageKwarg, isPatchesView, view } from "@fiftyone/state";
import { useRecoilValue } from "recoil";
import { useActiveSchemas, useLabelSchemasData } from "./redux/hooks";

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
 * Extracts the source field name from the view stages for stages with internal state
 */
export function getSourceFieldFromStages(
  stages: { _cls: string; kwargs: [string, unknown][] }[],
  helpers: { isPatches: boolean }
): string | undefined {
  for (const { cls, kwarg, guard } of STAGE_FIELD_EXTRACTORS) {
    if (guard && !guard(helpers)) continue;

    for (const stage of stages) {
      if (stage._cls === cls) {
        const value = getStageKwarg<string>(stage, kwarg);
        if (value != null) return value;
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
export default function useSourceFieldToActivate(): RequiredField | null {
  const isPatches = useRecoilValue(isPatchesView);
  const stages = useRecoilValue(view);

  // These reflect the schemas defined on the src dataset.
  const schemas = useLabelSchemasData();
  const active = useActiveSchemas();

  const sourceField = getSourceFieldFromStages(stages, { isPatches });
  if (!sourceField) return null;

  // Treat null as "still loading" so we don't surface a prompt mistakenly
  if (active == null || schemas == null) return null;

  if (active.includes(sourceField)) return null;

  const hasSchema =
    sourceField in schemas && !!schemas[sourceField]?.label_schema;

  return { field: sourceField, hasSchema };
}
