import React, { Suspense } from "react";
import { RecoilState, RecoilValueReadOnly, useRecoilState } from "recoil";
import styled from "styled-components";

import Input from "../Common/Input";

const StringInput = styled.input`
  width: 100%;
  background: ${({ theme }) => theme.backgroundDark};
  border: 1px solid #191c1f;
  border-radius: 2px;
  font-size: 14px;
  height: 2.5rem;
  font-weight: bold;
  padding: 0.5rem;
  margin-bottom: 0.5rem;

  &:focus {
    outline: none;
  }
`;

const Selected = styled.div`
  display: flex;
  justify-content: flex-start;
  margin: 0 -0.25rem;
  padding-bottom: 0.5rem;
  flex-wrap: wrap;
`;

const StringButton = styled.button`
    background: ${({ theme }) => theme.background};
    border: 2px solid #393C3F;
    background-color: #2D3034;
    border-radius: 11px;
    text-align: center
    vertical-align: middle;
    margin: 0.5rem 0.25rem 0;
    padding: 0 0.5rem;
    line-height: 20px;
    font-weight: bold;
    cursor: pointer;
    &:focus {
      outline: none;
    }
  `;

const StringFilterContainer = styled.div`
  position: relative;
  margin: 0.25rem 0;
`;

const NamedStringFilterContainer = styled.div`
  padding-bottom: 0.5rem;
  margin: 3px;
  font-weight: bold;
`;

const NamedStringFilterHeader = styled.div`
  display: flex;
  justify-content: space-between;
`;

type Props = {
  valuesAtom: RecoilValueReadOnly<string[]>;
  selectedValuesAtom: RecoilState<string[]>;
  searchAtom: RecoilState<string>;
  excludeAtom: RecoilState<boolean>;
  name: string;
  valueName: string;
  color: string;
};

const StringFilter = React.memo(
  React.forwardRef(({ name, searchAtom, ...stringFilterProps }: Props, ref) => {
    const [values, setValues] = useRecoilState(
      stringFilterProps.selectedValuesAtom
    );
    const [search, setSearch] = useRecoilState(searchAtom);

    return (
      <NamedStringFilterContainer ref={ref}>
        <NamedStringFilterHeader>
          {name}
          <div>
            {values.length > 0 ? (
              <a
                style={{ cursor: "pointer", textDecoration: "underline" }}
                onClick={() => setValues([])}
              >
                reset
              </a>
            ) : null}
          </div>
        </NamedStringFilterHeader>
        <StringFilterContainer>
          <Suspense
            fallback={
              <Input
                color={stringFilterProps.color}
                setter={() => {}}
                value={"Loading"}
                disabled={true}
              />
            }
          >
            <Input
              color={stringFilterProps.color}
              setter={(value) => setSearch(value)}
              value={search}
            />
          </Suspense>
        </StringFilterContainer>
      </NamedStringFilterContainer>
    );
  })
);

export default StringFilter;
