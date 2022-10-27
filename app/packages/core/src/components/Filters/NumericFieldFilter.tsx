import React from "react";
import {
  RecoilValueReadOnly,
  SetterOrUpdater,
  useRecoilState,
  useRecoilValue,
  useSetRecoilState,
} from "recoil";
import styled from "styled-components";

import * as fos from "@fiftyone/state";

import ExcludeOption from "./Exclude";
import RangeSlider from "../Common/RangeSlider";
import Checkbox from "../Common/Checkbox";
import { Button } from "../utils";
import { DATE_FIELD, DATE_TIME_FIELD, FLOAT_FIELD } from "@fiftyone/utilities";
import { formatDateTime } from "../../utils/generic";

const NamedRangeSliderContainer = styled.div`
  margin: 3px;
  font-weight: bold;
`;

const NamedRangeSliderHeader = styled.div`
  display: flex;
  justify-content: space-between;
`;

const RangeSliderContainer = styled.div`
  background: ${({ theme }) => theme.background.level2};
  border: 1px solid var(--joy-palette-divider);
  border-radius: 2px;
  color: ${({ theme }) => theme.text.secondary};
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
    fos.nonfiniteCounts({
      modal: params.modal,
      path: params.path,
      extended: false,
    })
  );

  return (key: fos.Nonfinite): [fos.Nonfinite, NonfiniteState] => {
    const [value, setValue] = useRecoilState(
      fos.nonfiniteAtom({ ...params, key })
    );

    return [
      key,
      {
        count: counts[key],
        setValue,
        value,
        subcountAtom: fos.nonfiniteCount({
          ...params,
          extended: true,
          key,
        }),
      },
    ];
  };
};

const FLOAT_NONFINITES: fos.Nonfinite[] = ["inf", "ninf", "nan"];

const useNonfinites = ({
  fieldType,
  ...rest
}: {
  fieldType: string;
  defaultRange?: [number, number];
  modal: boolean;
  path: string;
}): [fos.Nonfinite, NonfiniteState][] => {
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
  const color = useRecoilValue(fos.pathColor({ modal, path }));
  const name = path.split(".").slice(-1)[0];

  const setFilter = useSetRecoilState(fos.filter({ modal, path }));
  const bounds = useRecoilValue(fos.boundsAtom({ path, defaultRange }));

  const ftype = useRecoilValue(fos.fieldType({ path }));
  const hasDefaultRange = useRecoilValue(
    fos.isDefaultRange({ modal, path, defaultRange })
  );
  const hasBounds = bounds.every((b) => b !== null);
  const nonfinites = useNonfinites({
    modal,
    path,
    defaultRange,
    fieldType: ftype,
  });

  const isFiltered = useRecoilValue(fos.fieldIsFiltered({ modal, path }));

  const bounded = useRecoilValue(
    fos.boundedCount({ modal, path, extended: false })
  );

  const one = bounds[0] === bounds[1];
  const timeZone = useRecoilValue(fos.timeZone);

  if (!hasBounds && nonfinites.length === 1 && nonfinites[0][0] === "none")
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
            valueAtom={fos.rangeAtom({ modal, path, defaultRange })}
            boundsAtom={fos.boundsAtom({
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
            subcountAtom={fos.boundedCount({
              modal,
              path,
              extended: true,
            })}
            formatter={
              [DATE_TIME_FIELD, DATE_FIELD].includes(ftype)
                ? (v) => formatDateTime(v, timeZone)
                : null
            }
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
              disabled={one && nonfinites.length === 1 && !(one && hasBounds)}
              {...props}
            />
          ))}
        {isFiltered && nonfinites.length > 0 && hasBounds && (
          <ExcludeOption
            excludeAtom={fos.excludeAtom({
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
