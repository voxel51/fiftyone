import { useRef } from "react";
import { RecoilState, useRecoilCallback } from "recoil";
import { isObjectIdField } from "../state";
import { categoricalSearchResults } from "./state";

export default function (
  modal: boolean,
  path: string,
  selectedAtom: RecoilState<(string | null)[]>
) {
  const ref = useRef<Map<string | null, number | null>>(new Map());
  return {
    selected: ref,
    onSelect: useRecoilCallback(
      ({ snapshot, set }) =>
        async (value: string) => {
          const objectId = await snapshot.getPromise(isObjectIdField(path));
          const results = objectId
            ? null
            : await snapshot.getPromise(
                categoricalSearchResults({ path, modal })
              );
          const found = results?.values
            ?.map(({ value: v }) => String(v))
            .indexOf(value);

          const selected = new Set(await snapshot.getPromise(selectedAtom));
          ref.current.set(
            value,
            found !== undefined && found >= 0
              ? results?.values[found].count || null
              : null
          );
          selected.add(value);
          set(selectedAtom, [...selected].sort());

          return "";
        },
      [modal, path, selectedAtom, ref]
    ),
  };
}
