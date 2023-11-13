import * as fos from "@fiftyone/state";
import {
  isMatchingAtom,
  stringExcludeAtom,
  stringSelectedValuesAtom,
} from "@fiftyone/state";
import React from "react";
import { constSelector, useRecoilValue } from "recoil";
import StringFilter from "./StringFilter";

const StringFieldFilter = ({
  path,
  modal,
  ...rest
}: {
  path: string;
  modal: boolean;
  name?: boolean;
  color: string;
  onFocus?: () => void;
  onBlur?: () => void;
  title: string;
}) => {
  const lightning = useRecoilValue(fos.isLightningPath(path));
  return (
    <StringFilter
      selectedValuesAtom={stringSelectedValuesAtom({ modal, path })}
      excludeAtom={stringExcludeAtom({ modal, path })}
      isMatchingAtom={isMatchingAtom({ modal, path })}
      resultsAtom={
        lightning
          ? constSelector({ count: null, results: [] })
          : fos.stringCountResults({
              modal,
              path,
              extended: false,
            })
      }
      path={path}
      modal={modal}
      {...rest}
    />
  );
};

export default React.memo(StringFieldFilter);
