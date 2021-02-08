import React from "react";
import { RecoilState, useRecoilState } from "recoil";
import { Checkbox, FormControlLabel } from "@material-ui/core";
import styled from "styled-components";

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
          <div style={{ lineHeight: "20px", fontSize: 14 }}>Filter true</div>
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
          <div style={{ lineHeight: "20px", fontSize: 14 }}>Filter false</div>
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
  noneAtom: RecoilState<boolean>;
  color: string;
  name?: string;
};

export const NamedBooleanFilter = React.memo(
  React.forwardRef(
    ({ name, noneAtom, ...booleanFilterProps }: NamedProps, ref) => {
      const [none, setNone] = useRecoilState(noneAtom);
      const [falseValue, setFalse] = useRecoilState(
        booleanFilterProps.falseAtom
      );
      const [trueValue, setTrue] = useRecoilState(booleanFilterProps.trueAtom);

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
              <BooleanFilter {...booleanFilterProps} />

              <FormControlLabel
                label={
                  <div style={{ lineHeight: "20px", fontSize: 14 }}>
                    Filter no value
                  </div>
                }
                control={
                  <Checkbox
                    checked={!none}
                    onChange={() => setNone(!none)}
                    style={{
                      padding: "0 5px",
                      color: booleanFilterProps.color,
                    }}
                  />
                }
              />
            </CheckboxContainer>
          </BooleanFilterContainer>
        </NamedBooleanFilterContainer>
      );
    }
  )
);

export default BooleanFilter;
