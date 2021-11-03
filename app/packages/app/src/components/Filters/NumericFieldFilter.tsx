import React from "react";
import { animated } from "@react-spring/web";

import { NamedRangeSlider } from "./RangeSlider";
import { useExpand } from "./hooks";
import { boundsAtom, rangeAtom, noneAtom } from "./NumericFieldFilter.state";
import { countsAtom, noneCount } from "./atoms";
import CategoricalFilter from "./CategoricalFilter";

const NumericFieldFilter = ({ expanded, entry, modal }) => {
  const [ref, props] = useExpand(expanded);

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
          ref={ref}
        />
      )}
    </animated.div>
  );
};

export default React.memo(NumericFieldFilter);
