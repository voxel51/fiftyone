import { atom } from "jotai";

export const activeSchemaTab = atom<"active" | "other">("active");

export const showSchemaManager = atom(false);

export const editingAnnotationFieldSchema = atom<null | string>();
