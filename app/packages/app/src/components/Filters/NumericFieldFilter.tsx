import React from "react";
import { animated } from "react-spring";
import { useRecoilValue } from "recoil";

import * as selectors from "../../recoil/selectors";
import { NamedRangeSlider } from "./RangeSlider";
import { FRAME_NUMBER_FIELD, INT_FIELD } from "../../utils/labels";
import { useExpand } from "./hooks";
import { boundsAtom, rangeAtom, noneAtom } from "./NumericFieldFilter.state";
import { noneCount } from "./atoms";

const NumericFieldFilter = ({ expanded, entry, modal }) => {
  const [ref, props] = useExpand(expanded);
  const type = useRecoilValue(selectors.fieldType(entry.path));
  return (
    <animated.div style={props}>
      <NamedRangeSlider
        color={entry.color}
        boundsAtom={boundsAtom({ path: entry.path })}
        noneCountAtom={noneCount({ modal, path: entry.path })}
        valueAtom={rangeAtom({ modal, path: entry.path })}
        noneAtom={noneAtom({ modal, path: entry.path })}
        int={[INT_FIELD, FRAME_NUMBER_FIELD].includes(type)}
        ref={ref}
      />
    </animated.div>
  );
};

export default React.memo(NumericFieldFilter);
