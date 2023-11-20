import { useRef } from "react";
import { RecoilState, useRecoilCallback } from "recoil";
import { Result } from "./Result";

export default function (
  modal: boolean,
  path: string,
  selectedAtom: RecoilState<(string | null)[]>
) {
  const selectedMap = useRef<Map<string | null, number | null>>(new Map());
  return {
    onSelect: useRecoilCallback(
      ({ snapshot, set }) =>
        async (value: string | null, d?: Result) => {
          const selected = new Set(await snapshot.getPromise(selectedAtom));
          if (d?.value === null) {
            value = null;
          }
          selectedMap.current.set(value, d?.count || null);
          selected.add(value);
          set(selectedAtom, [...selected].sort());
          return "";
        },
      [modal, path, selectedAtom, selectedMap]
    ),
    selectedMap,
  };
}
