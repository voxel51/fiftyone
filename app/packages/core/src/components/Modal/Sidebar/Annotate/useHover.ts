import { useLighter } from "@fiftyone/lighter";
import { atom, getDefaultStore } from "jotai";
import { atomFamily } from "jotai/utils";
import { useEffect } from "react";

export const hovering = atomFamily((id: string) => atom(false));

export default function useHover() {
  const { scene } = useLighter();

  useEffect(() => {
    const store = getDefaultStore();

    scene?.on("overlay-hover", (event) => {
      store.set(hovering(event.detail.id), true);
    });

    scene?.on("overlay-unhover", (event) => {
      store.set(hovering(event.detail.id), false);
    });
  }, [scene]);
}
