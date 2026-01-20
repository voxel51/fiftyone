import { atom, useAtom } from "jotai";

// the path of the primitive that is currently being edited
const activePrimitiveAtom = atom<string | null>(null);

export const useActivePrimitive = () => {
  return useAtom(activePrimitiveAtom);
};

export default useActivePrimitive;
