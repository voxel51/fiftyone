import React from "react";
import {
  RecoilValueReadOnly,
  SetterOrUpdater,
  useRecoilState,
  useRecoilValue,
  useSetRecoilState,
} from "recoil";
import styled from "styled-components";

import * as aggregationAtoms from "../../recoil/aggregations";
import * as schemaAtoms from "../../recoil/schema";
import * as colorAtoms from "../../recoil/color";
import * as filterAtoms from "../../recoil/filters";

import * as numericAtoms from "./numericState";
import ExcludeOption from "./Exclude";
import RangeSlider from "../Common/RangeSlider";
import Checkbox from "../Common/Checkbox";
import { Button } from "../utils";
import { FLOAT_FIELD } from "../../recoil/constants";

const NamedRangeSliderContainer = styled.div`
  margin: 3px;
  font-weight: bold;
`;

const NamedRangeSliderHeader = styled.div`
  display: flex;
  justify-content: space-between;
`;

const RangeSliderContainer = styled.div`
  background: ${({ theme }) => theme.backgroundDark};
  border: 1px solid #191c1f;
  border-radius: 2px;
  color: ${({ theme }) => theme.fontDark};
  margin-top: 0.25rem;
  padding: 0.25rem 0.5rem 0 0.5rem;
`;

const NONFINITES = {
  nan: "nan",
  ninf: "-inf",
  inf: "inf",
  none: null,
};

interface NonfiniteState {
  value: boolean;
  setValue: SetterOrUpdater<boolean>;
  count: number;
  subcountAtom: RecoilValueReadOnly<number>;
}

const getNonfiniteGetter = (params: {
  modal: boolean;
  path: string;
  defaultRange?: [number, number];
}) => {
  const counts = useRecoilValue(
    aggregationAtoms.nonfiniteCounts({
      modal: params.modal,
      path: params.path,
      extended: false,
    })
  );

  return (
    key: aggregationAtoms.Nonfinite
  ): [aggregationAtoms.Nonfinite, NonfiniteState] => {
    const [value, setValue] = useRecoilState(
      numericAtoms.nonfiniteAtom({ ...params, key: "inf" })
    );

    return [
      key,
      {
        count: counts[key],
        setValue,
        value,
        subcountAtom: aggregationAtoms.nonfiniteCount({
          ...params,
          extended: true,
          key,
        }),
      },
    ];
  };
};

const FLOAT_NONFINITES: aggregationAtoms.Nonfinite[] = ["inf", "ninf", "nan"];

const useNonfinites = ({
  fieldType,
  ...rest
}: {
  fieldType: string;
  defaultRange?: [number, number];
  modal: boolean;
  path: string;
}): [aggregationAtoms.Nonfinite, NonfiniteState][] => {
  const get = getNonfiniteGetter(rest);
  const data = [get("none")];

  if (fieldType === FLOAT_FIELD) {
    FLOAT_NONFINITES.forEach((key) => data.push(get(key)));
  }

  return data.filter(([_, { count }]) => count > 0);
};

type Props = {
  defaultRange?: [number, number];
  modal: boolean;
  path: string;
  named?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
  title: string;
};

const NumericFieldFilter = ({
  defaultRange,
  modal,
  path,
  named = true,
  title,
}: Props) => {
  const color = useRecoilValue(colorAtoms.pathColor({ modal, path }));
  const name = path.split(".").slice(-1)[0];

  const setFilter = useSetRecoilState(filterAtoms.filter({ modal, path }));
  const bounds = useRecoilValue(
    numericAtoms.boundsAtom({ path, defaultRange })
  );
  const ftype = useRecoilValue(schemaAtoms.fieldType({ path }));
  const hasDefaultRange = useRecoilValue(
    numericAtoms.isDefaultRange({ modal, path, defaultRange })
  );
  const hasBounds = bounds.every((b) => b !== null);
  const nonfinites = useNonfinites({
    modal,
    path,
    defaultRange,
    fieldType: ftype,
  });
  const isFiltered = useRecoilValue(
    filterAtoms.fieldIsFiltered({ modal, path })
  );
  const bounded = useRecoilValue(
    aggregationAtoms.boundedCount({ modal, path, extended: false })
  );
  const one = bounds[0] === bounds[1];

  if (!hasBounds && nonfinites.length === 2 && nonfinites[0][0] === "none")
    return null;

  return (
    <NamedRangeSliderContainer title={title}>
      {named && name && (
        <NamedRangeSliderHeader>
          {name.replaceAll("_", " ")}
        </NamedRangeSliderHeader>
      )}
      <RangeSliderContainer
        onMouseDown={(event) => event.stopPropagation()}
        style={{ cursor: "default" }}
      >
        {hasBounds && !one ? (
          <RangeSlider
            showBounds={false}
            fieldType={ftype}
            valueAtom={numericAtoms.rangeAtom({ modal, path, defaultRange })}
            boundsAtom={numericAtoms.boundsAtom({
              path,
              defaultRange,
            })}
            color={color}
          />
        ) : hasBounds ? (
          <Checkbox
            key={bounds[0]}
            color={color}
            disabled={true}
            name={bounds[0]}
            setValue={() => {}}
            count={bounded}
            subcountAtom={aggregationAtoms.boundedCount({
              modal,
              path,
              extended: true,
            })}
            value={false}
          />
        ) : null}
        {(hasDefaultRange ||
          nonfinites.some(
            ([_, { value: v }]) => v !== nonfinites[0][1].value
          ) ||
          !hasBounds) &&
          nonfinites.map(([key, props]) => (
            <Checkbox
              key={key}
              color={color}
              name={NONFINITES[key]}
              forceColor={true}
              disabled={one && nonfinites.length === 1}
              {...props}
            />
          ))}
        {isFiltered && nonfinites.length > 0 && hasBounds && (
          <ExcludeOption
            excludeAtom={numericAtoms.excludeAtom({
              path,
              modal,
              defaultRange,
            })}
            valueName={""}
            color={color}
          />
        )}
        {isFiltered && (
          <Button
            text={"Reset"}
            color={color}
            onClick={() => setFilter(null)}
            style={{
              margin: "0.25rem -0.5rem",
              height: "2rem",
              borderRadius: 0,
              textAlign: "center",
            }}
          ></Button>
        )}
      </RangeSliderContainer>
    </NamedRangeSliderContainer>
  );
};

export default React.memo(NumericFieldFilter);
