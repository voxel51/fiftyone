import React, { useContext, useMemo } from "react";
import {
  RecoilState,
  RecoilValueReadOnly,
  selector,
  useRecoilState,
  useRecoilValue,
} from "recoil";
import { Checkbox, FormControlLabel } from "@material-ui/core";
import uuid from "uuid-v4";

import styled, { ThemeContext } from "styled-components";
import SelectInput from "../Common/SelectInput";

const BooleanFilterContainer = styled.div`
  position: relative;
  margin: 0.25rem 0;
`;

const NamedBooleanFilterContainer = styled.div`
  padding-bottom: 0.5rem;
  margin: 3px;
  font-weight: bold;
`;

const NamedBooleanFilterHeader = styled.div`
  display: flex;
  justify-content: space-between;
`;

const CheckboxContainer = styled.div`
  background: ${({ theme }) => theme.backgroundDark};
  box-shadow: 0 8px 15px 0 rgba(0, 0, 0, 0.43);
  border: 1px solid #191c1f;
  border-radius: 2px;
  color: ${({ theme }) => theme.fontDark};
  margin-top: 0.25rem;
`;

type Props = {
  trueAtom: RecoilState<boolean>;
  falseAtom: RecoilState<boolean>;
  color: string;
};

const BooleanFilter = React.memo(({ trueAtom, falseAtom, color }: Props) => {
  const [trueValue, setTrue] = useRecoilState(trueAtom);
  const [falseValue, setFalse] = useRecoilState(falseAtom);

  return (
    <>
      <FormControlLabel
        label={
          <div style={{ lineHeight: "20px", fontSize: 14 }}>
            Exclude <code style={{ color }}>True</code>
          </div>
        }
        control={
          <Checkbox
            checked={!trueValue}
            onChange={() => setTrue(!trueValue)}
            style={{
              padding: "0 5px",
              color,
            }}
          />
        }
      />
      <FormControlLabel
        label={
          <div style={{ lineHeight: "20px", fontSize: 14 }}>
            Exclude <code style={{ color }}>False</code>
          </div>
        }
        control={
          <Checkbox
            checked={!falseValue}
            onChange={() => setFalse(!falseValue)}
            style={{
              padding: "0 5px",
              color,
            }}
          />
        }
      />
    </>
  );
});

const isDefault = (falseValue: boolean, trueValue: boolean, none: boolean) => {
  return falseValue && trueValue && none;
};

type NamedProps = {
  trueAtom: RecoilState<boolean>;
  falseAtom: RecoilState<boolean>;
  hasNoneAtom: RecoilValueReadOnly<boolean>;
  noneAtom: RecoilState<boolean>;
  color: string;
  name?: string;
};

export const NamedBooleanFilter = React.memo(
  React.forwardRef(
    (
      { color, name, hasNoneAtom, noneAtom, falseAtom, trueAtom }: NamedProps,
      ref
    ) => {
      const [none, setNone] = useRecoilState(noneAtom);
      const [falseValue, setFalse] = useRecoilState(falseAtom);
      const [trueValue, setTrue] = useRecoilState(trueAtom);

      const [choicesAtom, valuesAtom] = useMemo(() => {
        return [
          selector({
            key: uuid(),
            get: ({ get }) => {
              const choices = ["False", "True"];
              if (get(hasNoneAtom)) {
                choices.push("None");
              }

              return {
                choices,
                hasMore: false,
              };
            },
          }),
          selector<string[]>({
            key: uuid(),
            get: ({ get }) => {
              const withTrue = get(trueAtom);
              const withFalse = get(falseAtom);
              let values: string[] = [];
              if (get(hasNoneAtom)) {
                const withNone = get(hasNoneAtom);
                if (!withTrue || !withFalse || !withNone) {
                  !withTrue && values.push("True");
                  !withFalse && values.push("False");
                  !withNone && values.push("None");
                }
              } else {
                if (!withTrue || !withFalse) {
                  !withTrue && values.push("True");
                  !withFalse && values.push("False");
                }
              }
              return values;
            },
            set: ({ set }, newValue) => {
              if (Array.isArray(newValue)) {
                if (newValue.includes("True")) {
                  set(trueAtom, true);
                }
                if (newValue.includes("False")) {
                  set(falseAtom, true);
                }
                if (newValue.includes("None")) {
                  set(noneAtom, true);
                }
              }
            },
          }),
        ];
      }, [hasNoneAtom, noneAtom, falseAtom, trueAtom]);

      return (
        <NamedBooleanFilterContainer ref={ref}>
          <NamedBooleanFilterHeader>
            {name}
            {!isDefault(falseValue, trueValue, none) ? (
              <a
                style={{ cursor: "pointer", textDecoration: "underline" }}
                onClick={() => {
                  setTrue(true);
                  setFalse(true);
                  setNone(true);
                }}
              >
                reset
              </a>
            ) : null}
          </NamedBooleanFilterHeader>

          <BooleanFilterContainer>
            <CheckboxContainer>
              <SelectInput
                color={color}
                choicesAtom={choicesAtom}
                valuesAtom={valuesAtom}
              />
            </CheckboxContainer>
          </BooleanFilterContainer>
        </NamedBooleanFilterContainer>
      );
    }
  )
);

export default BooleanFilter;
