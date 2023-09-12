import { StateForm } from "@fiftyone/relay";
import { atom } from "recoil";

/**
 * This atom can be set to parameterize view changes
 *
 * @see {@link [useToPatches](../hooks/useToPatches.ts)} for example usage
 */
export const viewStateForm_INTERNAL = atom<StateForm | null>({
  key: "viewStateForm_INTERNAL",
  default: null,
});
