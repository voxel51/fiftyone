import { StateForm } from "@fiftyone/relay";
import { atom } from "recoil";

export const viewStateForm_INTERNAL = atom<StateForm | null>({
  key: "viewStateForm_INTERNAL",
  default: null,
});
