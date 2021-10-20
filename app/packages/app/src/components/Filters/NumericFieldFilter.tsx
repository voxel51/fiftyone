import React from "react";
import { animated } from "react-spring";
import { useRecoilValue } from "recoil";

import * as selectors from "../../recoil/selectors";
import { NamedRangeSlider } from "./RangeSlider";
import { useExpand } from "./hooks";
import {
  boundsAtom,
  rangeAtom,
  otherAtom,
  otherCounts,
  otherFilteredCounts,
} from "./NumericFieldFilter.state";
import { countsAtom } from "./atoms";
import CategoricalFilter from "./CategoricalFilter";
import { LIST_FIELD } from "../../utils/labels";
import { FLOAT_FIELD } from "@fiftyone/looker/src/constants";

const NumericFieldFilter = ({ expanded, entry, modal }) => {
  const [ref, props] = useExpand(expanded);
  const type = useRecoilValue(selectors.fieldType(entry.path));
  const subType = useRecoilValue(selectors.subfieldType(entry.path));

  const otherAtoms = [type, subType].includes(FLOAT_FIELD)
    ? {
        none: otherAtom({ modal, path: entry.path, key: "none" }),
      }
    : {
        none: otherAtom({ modal, path: entry.path, key: "none" }),
        nan: otherAtom({ modal, path: entry.path, key: "nan" }),
        ninf: otherAtom({ modal, path: entry.path, key: "ninf" }),
        inf: otherAtom({ modal, path: entry.path, key: "inf" }),
      };

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
          otherCountsAtom={otherCounts({ modal, path: entry.path })}
          otherFilteredCountsAtom={otherFilteredCounts({
            modal,
            path: entry.path,
          })}
          valueAtom={rangeAtom({ modal, path: entry.path })}
          otherAtoms={otherAtoms}
          fieldType={type === LIST_FIELD ? subType : type}
          ref={ref}
        />
      )}
    </animated.div>
  );
};

export default React.memo(NumericFieldFilter);
