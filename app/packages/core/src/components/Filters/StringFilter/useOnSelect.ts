import { SelectorValidationError } from "@fiftyone/components";
import { isObjectIdField, snackbarErrors } from "@fiftyone/state";
import { isObjectIdString } from "@fiftyone/utilities";
import { type ReverbState, useReverbCallback } from "@fiftyone/reverb";
import type { Result } from "./Result";

export default function (
  modal: boolean,
  path: string,
  selectedAtom: ReverbState<(string | null)[]>,
) {
  return useReverbCallback(
    ({ snapshot, set }) =>
      async (value: string | null, d?: Result) => {
        const isObjectId = await snapshot.getPromise(isObjectIdField(path));
        if (isObjectId && (value === null || !isObjectIdString(value))) {
          set(snackbarErrors, [
            `${value} is not a 24 character hexadecimal string`,
          ]);
          throw new SelectorValidationError();
        }

        const selected = new Set(await snapshot.getPromise(selectedAtom));
        if (d?.value === null) {
          value = null;
        }
        selected.add(value);
        set(selectedAtom, [...selected].sort());

        return "";
      },
    [modal, path, selectedAtom],
  );
}
