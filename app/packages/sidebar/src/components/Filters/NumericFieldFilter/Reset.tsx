import * as fos from "@fiftyone/state";
import { useReverbCallback, useReverbValue } from "@fiftyone/reverb";
import { Size, TextAction } from "@voxel51/voodo";

const useReset = (options: { modal: boolean; path: string }) => {
  return useReverbCallback(
    ({ snapshot, set }) =>
      async () => {
        set(fos.rangeAtom({ ...options, withBounds: true }), [null, null]);
        set(fos.numericExcludeAtom(options), false);

        const listField = await snapshot.getPromise(
          fos.isListField(options.path),
        );
        (await snapshot.getPromise(fos.isSidebarFilterMode)) &&
          set(fos.numericIsMatchingAtom(options), !listField);
      },
    [options],
  );
};

function Reset({
  modal,
  path,
}: {
  color: string;
  modal: boolean;
  path: string;
}) {
  const hasVisibilitySetting = useReverbValue(
    fos.fieldHasVisibilitySetting({ modal, path }),
  );
  const isFiltered = useReverbValue(fos.fieldIsFiltered({ modal, path }));
  const reset = useReset({ modal, path });

  if (!isFiltered && !hasVisibilitySetting) {
    return null;
  }

  return (
    <TextAction
      size={Size.Sm}
      data-cy="button-Reset"
      onClick={reset}
      style={{ marginLeft: "auto" }}
    >
      Reset
    </TextAction>
  );
}

export default Reset;
