import { useSetAtom } from "jotai";
import { useCallback } from "react";
import { editing } from ".";

export default function useExit() {
  const setEditing = useSetAtom(editing);

  return useCallback(() => {
    setEditing(null);
  }, [setEditing]);
}
