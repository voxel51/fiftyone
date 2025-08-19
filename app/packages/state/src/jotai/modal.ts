import { atom } from "jotai";

export const ANNOTATE = "annotate";
export const EXPLORE = "explore";

export const modalMode = atom<"explore" | "annotate">("explore");
