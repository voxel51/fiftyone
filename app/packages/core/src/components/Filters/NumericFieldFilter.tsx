import React, { useEffect } from "react";
import {
  RecoilValueReadOnly,
  SetterOrUpdater,
  useRecoilState,
  useRecoilValue,
  useSetRecoilState,
} from "recoil";
import styled from "styled-components";

import * as fos from "@fiftyone/state";

import RangeSlider from "../Common/RangeSlider";
import Checkbox from "../Common/Checkbox";
import { Button } from "../utils";
import { DATE_FIELD, DATE_TIME_FIELD, FLOAT_FIELD } from "@fiftyone/utilities";
import { formatDateTime } from "../../utils/generic";
import withSuspense from "./withSuspense";
import FieldLabelAndInfo from "../FieldLabelAndInfo";
import FilterOption from "./categoricalFilter/filterOption/FilterOption";

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
};

const NumericFieldFilter = ({
  defaultRange,
  modal,
  path,
  named = true,
}: Props) => {
  const color = useRecoilValue(fos.pathColor({ modal, path }));
  const name = path.split(".").slice(-1)[0];
  const excludeAtom = fos.numericExcludeAtom({
    path,
    modal,
    defaultRange,
  });
  const isMatchingAtom = fos.numericIsMatchingAtom({
    path,
    modal,
    defaultRange,
  });
  const onlyMatchAtom = fos.numericOnlyMatchAtom({
    path,
    modal,
    defaultRange,
  });
  const values = useRecoilValue(
    fos.rangeAtom({
      modal,
      path,
      defaultRange,
      withBounds: true,
    })
  );
  const setExcluded = excludeAtom ? useSetRecoilState(excludeAtom) : null;
  const setOnlyMatch = onlyMatchAtom ? useSetRecoilState(onlyMatchAtom) : null;
  const setIsMatching = isMatchingAtom
    ? useSetRecoilState(isMatchingAtom)
    : null;

  const setFilter = useSetRecoilState(fos.filter({ modal, path }));
  const bounds = useRecoilValue(fos.boundsAtom({ path, defaultRange }));
  const ftype = useRecoilValue(fos.fieldType({ path }));
  const field = useRecoilValue(fos.field(path));
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

  const hasNonfinites = !(
    nonfinites.length === 0 ||
    (nonfinites.length === 1 && nonfinites[0][0] === "none")
  );

  const hasNone = nonfinites.some((x) => x[0] === "none");
  const isSliderAtInitialPostion =
    bounds[0] === values[0] && bounds[1] === values[1];

  // if range is not in default position, nonfinites should not be shown, but they should be set to false
  useEffect(() => {
    if (!isSliderAtInitialPostion) {
      nonfinites.forEach(([_, { setValue }]) => {
        setValue(false);
      });
    }
  }, [isSliderAtInitialPostion, nonfinites]);

  // only show all four options the field is a nested ListField.
  // pass down nestedField as a prop to generate options
  const fieldPath = path.split(".").slice(0, -1).join(".");
  const fieldSchema = useRecoilValue(fos.field(fieldPath));
  const nestedField = fieldSchema?.ftype.includes("ListField")
    ? fieldSchema?.dbField?.toLowerCase()
    : undefined;

  // if the field is a keypoint label, there is no need to show match options
  const isKeyPoints = fieldSchema?.dbField === "keypoints";

  const initializeSettings = () => {
    setFilter([null, null]);
    setExcluded && setExcluded(false);
    setOnlyMatch && setOnlyMatch(true);
    setIsMatching && setIsMatching(!nestedField);
  };

  // we do not want to show nestedfield's index field
  // if confidence only has none value, we do not want to show it
  // but we want to show 'no results' fields with empty intfield/floatfield
  if (!field || (!hasBounds && !hasNonfinites && hasNone)) {
    return null;
  }

  return (
    <NamedRangeSliderContainer
      onClick={(e) => {
        e.stopPropagation();
      }}
    >
      {named && name && (
        <FieldLabelAndInfo
          nested
          field={field}
          color={color}
          template={({ label, hoverTarget }) => (
            <NamedRangeSliderHeader>
              <span ref={hoverTarget}>{label}</span>
            </NamedRangeSliderHeader>
          )}
        />
      )}

      <RangeSliderContainer
        onMouseDown={(event) => event.stopPropagation()}
        style={{ cursor: "default" }}
      >
        {!hasBounds && !named && !hasNonfinites && (
          <Checkbox
            key={"No results"}
            color={color}
            value={false}
            disabled={true}
            name={"No results"}
            setValue={() => {}}
          />
        )}
        {hasBounds && !one ? (
          <RangeSlider
            showBounds={false}
            fieldType={ftype}
            valueAtom={fos.rangeAtom({
              modal,
              path,
              defaultRange,
              withBounds: true,
            })}
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
                ? (v) => (v ? formatDateTime(v, timeZone) : null)
                : (v) => null
            }
            value={false}
          />
        ) : null}
        {((hasNone && isSliderAtInitialPostion) || !hasBounds) &&
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
        {isFiltered && hasBounds && (
          <FilterOption
            nestedField={nestedField}
            shouldNotShowExclude={false} // only boolean fields don't use exclude
            excludeAtom={excludeAtom}
            onlyMatchAtom={onlyMatchAtom}
            isMatchingAtom={isMatchingAtom}
            valueName={field?.name ?? ""}
            color={color}
            modal={modal}
            isKeyPointLabel={isKeyPoints}
          />
        )}
        {isFiltered && (
          <Button
            text={"Reset"}
            color={color}
            onClick={initializeSettings}
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

export default React.memo(withSuspense(NumericFieldFilter));
