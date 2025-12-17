import { atom } from "jotai";
import { atomFamily } from "jotai/utils";

export const currentField = atom<null | string>();

export const schemaData = atom({});

export const fieldSchemaData = atomFamily((field) => {
  return atom((get) => get(schemaData)[field]);
});
