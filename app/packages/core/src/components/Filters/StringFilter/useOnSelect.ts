import { RecoilState, useRecoilCallback } from "recoil";
import { Result } from "./Result";

export default function (
  modal: boolean,
  path: string,
  selectedAtom: RecoilState<(string | null)[]>
) {
  return useRecoilCallback(
    ({ snapshot, set }) =>
      async (value: string | null, d?: Result) => {
        const selected = new Set(await snapshot.getPromise(selectedAtom));
        if (d?.value === null) {
          value = null;
        }
        selected.add(value);
        set(selectedAtom, [...selected].sort());
        return "";
      },
    [modal, path, selectedAtom]
  );
}
