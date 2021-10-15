import React from "react";
import { animated } from "react-spring";
import { useRecoilValue } from "recoil";

import * as selectors from "../../recoil/selectors";
import { NamedRangeSlider } from "./RangeSlider";
import { useExpand } from "./hooks";
import { boundsAtom, rangeAtom, noneAtom } from "./NumericFieldFilter.state";
import { countsAtom, noneCount } from "./atoms";
import CategoricalFilter from "./CategoricalFilter";
import { LIST_FIELD } from "../../utils/labels";

const NumericFieldFilter = ({ expanded, entry, modal }) => {
  const [ref, props] = useExpand(expanded);
  const type = useRecoilValue(selectors.fieldType(entry.path));
  const subType = useRecoilValue(selectors.subfieldType(entry.path));

  return (
    <animated.div style={props}>
      {modal ? (
        <CategoricalFilter
          valueName={entry.path}
          color={entry.color}
          countsAtom={countsAtom({ modal, path: entry.path, filtered: false })}
          path={entry.path}
          modal={modal}
          disableItems={entry.disableList}
          ref={ref}
        />
      ) : (
        <NamedRangeSlider
          color={entry.color}
          boundsAtom={boundsAtom({ path: entry.path })}
          noneCountAtom={noneCount({ modal, path: entry.path })}
          valueAtom={rangeAtom({ modal, path: entry.path })}
          noneAtom={noneAtom({ modal, path: entry.path })}
          fieldType={type === LIST_FIELD ? subType : type}
          ref={ref}
        />
      )}
    </animated.div>
  );
};

export default React.memo(NumericFieldFilter);
