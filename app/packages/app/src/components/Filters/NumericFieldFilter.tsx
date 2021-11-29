import React from "react";
import {
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
import RangeSlider from "./RangeSlider";
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

export type Nonfinite = "nan" | "ninf" | "inf" | "none";

const NONFINITES = {
  nan: "nan",
  ninf: "-inf",
  inf: "inf",
  none: null,
};

const useNonfinites = ({
  fieldType,
  counts,
  ...rest
}: {
  counts: aggregationAtoms.NonfiniteCounts;
  fieldType: string;
  defaultRange?: [number, number];
  modal: boolean;
  path: string;
}): [Nonfinite, [boolean, SetterOrUpdater<boolean>]][] => {
  const [none, setNone] = useRecoilState(
    numericAtoms.nonfiniteAtom({ ...rest, key: "none" })
  );

  const nonfinite: [Nonfinite, [boolean, SetterOrUpdater<boolean>]][] =
    fieldType !== FLOAT_FIELD
      ? [["none", [none, setNone]]]
      : [
          [
            "inf",
            useRecoilState(numericAtoms.nonfiniteAtom({ ...rest, key: "inf" })),
          ],
          [
            "ninf",
            useRecoilState(
              numericAtoms.nonfiniteAtom({ ...rest, key: "ninf" })
            ),
          ],
          [
            "nan",
            useRecoilState(numericAtoms.nonfiniteAtom({ ...rest, key: "nan" })),
          ],
          ["none", [none, setNone]],
        ];

  return nonfinite.filter(([k]) => counts[k] > 0);
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
  const nonfiniteCounts = useRecoilValue(
    aggregationAtoms.nonfiniteCounts({ modal, path, extended: false })
  );
  const nonfinites = useNonfinites({
    modal,
    path,
    counts: nonfiniteCounts,
    defaultRange,
    fieldType: ftype,
  });
  const isFiltered = useRecoilValue(
    filterAtoms.fieldIsFiltered({ modal, path })
  );

  const noResults =
    !hasBounds && nonfinites.length === 1 && nonfinites[0][0] === "none";

  return (
    <NamedRangeSliderContainer>
      {named && name && (
        <NamedRangeSliderHeader>
          {name.replaceAll("_", " ")}
        </NamedRangeSliderHeader>
      )}
      <RangeSliderContainer>
        {hasBounds ? (
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
        ) : (
          <Checkbox
            key={"No finite results"}
            color={color}
            value={false}
            disabled={true}
            name={"No finite results"}
            setValue={() => {}}
          />
        )}
        {(hasDefaultRange ||
          nonfinites.some(([_, [v]]) => v !== nonfinites[0][1][0])) &&
          nonfinites.map(([key, [value, setValue]]) => (
            <Checkbox
              key={key}
              color={color}
              name={NONFINITES[key]}
              value={value}
              setValue={setValue}
              count={nonfiniteCounts[key]}
              forceColor={true}
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
