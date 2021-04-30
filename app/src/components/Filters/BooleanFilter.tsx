import React from "react";
import {
  RecoilState,
  RecoilValueReadOnly,
  useRecoilState,
  useRecoilValue,
} from "recoil";
import styled from "styled-components";

import Checkbox from "../Common/Checkbox";

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
  border: 1px solid #191c1f;
  border-radius: 2px;
  color: ${({ theme }) => theme.fontDark};
  margin-top: 0.25rem;
  padding: 0.25rem 0.5rem 0 0.5rem;
`;

const isDefault = (falseValue: boolean, trueValue: boolean, none: boolean) => {
  return !falseValue && !trueValue && !none;
};

type NamedProps = {
  trueAtom: RecoilState<boolean>;
  falseAtom: RecoilState<boolean>;
  hasNoneAtom: RecoilValueReadOnly<boolean>;
  noneAtom: RecoilState<boolean>;
  color: string;
  name?: string;
};

const NamedBooleanFilter = React.memo(
  React.forwardRef(
    (
      { color, name, hasNoneAtom, noneAtom, falseAtom, trueAtom }: NamedProps,
      ref
    ) => {
      const [none, setNone] = useRecoilState(noneAtom);
      const [falseValue, setFalse] = useRecoilState(falseAtom);
      const [trueValue, setTrue] = useRecoilState(trueAtom);
      const hasNone = useRecoilValue(hasNoneAtom);

      return (
        <NamedBooleanFilterContainer ref={ref}>
          <NamedBooleanFilterHeader>
            {name}
            {!isDefault(falseValue, trueValue, none) ? (
              <a
                style={{ cursor: "pointer", textDecoration: "underline" }}
                onClick={() => {
                  setTrue(false);
                  setFalse(false);
                  setNone(false);
                }}
              >
                reset
              </a>
            ) : null}
          </NamedBooleanFilterHeader>

          <BooleanFilterContainer>
            <CheckboxContainer>
              <Checkbox
                color={color}
                name={"True"}
                value={trueValue}
                setValue={setTrue}
              />
              <Checkbox
                color={color}
                name={"False"}
                value={falseValue}
                setValue={setFalse}
              />
              {hasNone && (
                <Checkbox
                  color={color}
                  name={"None"}
                  value={none}
                  setValue={setNone}
                />
              )}
            </CheckboxContainer>
          </BooleanFilterContainer>
        </NamedBooleanFilterContainer>
      );
    }
  )
);

export default NamedBooleanFilter;
