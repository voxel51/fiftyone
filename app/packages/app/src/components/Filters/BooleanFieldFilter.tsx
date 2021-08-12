import React from "react";
import { animated } from "react-spring";

import CategoricalFilter from "./CategoricalFilter";
import { selectedValuesAtom } from "./BooleanFieldFilter.state";
import { useExpand } from "./hooks";
import { countsAtom } from "./atoms";

const BooleanFieldFilter = ({ expanded, entry, modal }) => {
  const [ref, props] = useExpand(expanded);

  return (
    <animated.div style={props}>
      <CategoricalFilter
        valueName={entry.path}
        color={entry.color}
        selectedValuesAtom={selectedValuesAtom({ path: entry.path, modal })}
        countsAtom={countsAtom({ path: entry.path, modal, filtered: false })}
        disableList={entry.disableList}
        path={entry.path}
        modal={modal}
        ref={ref}
      />
    </animated.div>
  );
};

export default React.memo(BooleanFieldFilter);
