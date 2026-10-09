import * as fos from "@fiftyone/state";
import { useAssertedReverbValue, useReverbValue } from "@fiftyone/reverb";
import Option from "../FilterOption";
import * as state from "./state";

function FilterOption({
  color,
  modal,
  path,
}: {
  color: string;
  modal: boolean;
  path: string;
}) {
  const isFiltered = useReverbValue(fos.fieldIsFiltered({ modal, path }));
  const hasBounds = useReverbValue(state.hasBounds({ modal, path }));
  const field = useAssertedReverbValue(fos.field(path));

  if (!isFiltered || !hasBounds) {
    return null;
  }

  return (
    <Option
      color={color}
      excludeAtom={fos.numericExcludeAtom({ modal, path })}
      isMatchingAtom={fos.numericIsMatchingAtom({
        modal,
        path,
      })}
      valueName={field?.name ?? ""}
      path={path}
      modal={modal}
    />
  );
}

export default FilterOption;
