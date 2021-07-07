import React from "react";
import { animated } from "react-spring";

import CategoricalFilter from "./CategoricalFilter";
import { useExpand } from "./hooks";
import {
  selectedValuesModalAtom,
  selectedValuesAtom,
  excludeAtom,
  excludeModalAtom,
} from "./StringFieldFilter.state";
import { countsAtom } from "./utils";

const StringFieldFilter = ({ expanded, entry, modal }) => {
  const [ref, props] = useExpand(expanded);

  return (
    <animated.div style={props}>
      <CategoricalFilter
        valueName={entry.path}
        color={entry.color}
        selectedValuesAtom={
          modal
            ? selectedValuesModalAtom(entry.path)
            : selectedValuesAtom(entry.path)
        }
        excludeAtom={
          modal ? excludeAtom(entry.path) : excludeModalAtom(entry.path)
        }
        countsAtom={countsAtom({ modal, path: entry.path })}
        path={entry.path}
        modal={modal}
        ref={ref}
      />
    </animated.div>
  );
};

export default React.memo(StringFieldFilter);
