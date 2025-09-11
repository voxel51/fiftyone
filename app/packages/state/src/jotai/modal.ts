import { atomWithStorage } from "jotai/utils";

export const ANNOTATE = "annotate";
export const EXPLORE = "explore";

export const modalMode = atomWithStorage<"explore" | "annotate">(
  "modalMode",
  "explore"
);
