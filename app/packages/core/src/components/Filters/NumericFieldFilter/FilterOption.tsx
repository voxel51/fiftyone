import * as fos from "@fiftyone/state";
import React from "react";
import { useRecoilValue } from "recoil";
import Option from "../FilterOption";
import * as state from "./state";

function FilterOption({
  defaultRange,
  modal,
  path,
}: {
  defaultRange?: [number, number];
  modal: boolean;
  path: string;
}) {
  const isFiltered = useRecoilValue(fos.fieldIsFiltered({ modal, path }));
  const hasBounds = useRecoilValue(state.hasBounds({ defaultRange, path }));
  const field = fos.useAssertedRecoilValue(fos.field(path));

  if (!isFiltered || !hasBounds) {
    return null;
  }

  return (
    <Option
      excludeAtom={fos.numericExcludeAtom({ defaultRange, modal, path })}
      isMatchingAtom={fos.numericIsMatchingAtom({
        defaultRange,
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
