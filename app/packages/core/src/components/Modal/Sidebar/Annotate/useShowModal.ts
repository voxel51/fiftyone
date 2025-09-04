import { useSetAtom } from "jotai";
import { useCallback } from "react";
import { showModal } from "./state";

export default function useShowModal() {
  const show = useSetAtom(showModal);

  return useCallback(() => {
    show(true);
  }, [show]);
}
