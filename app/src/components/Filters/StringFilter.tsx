import React, { Suspense, useLayoutEffect } from "react";
import {
  RecoilState,
  RecoilValueReadOnly,
  useRecoilState,
  useRecoilValue,
  useSetRecoilState,
} from "recoil";
import styled from "styled-components";

import Checkbox from "../Common/Checkbox";
import Input from "../Common/Input";
import { Button } from "../FieldsSidebar";
import { PopoutSectionTitle, TabOption } from "../utils";
import * as selectors from "../../recoil/selectors";
import { filterView } from "../../utils/view";

const StringFilterContainer = styled.div`
  background: ${({ theme }) => theme.backgroundDark};
  border: 1px solid #191c1f;
  border-radius: 2px;
  color: ${({ theme }) => theme.fontDark};
  margin-top: 0.25rem;
  padding: 0.25rem 0.5rem 0 0.5rem;
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

const Footer = styled.div`
  margin: 0 -0.5rem;
  padding: 0.25rem 0.5rem;
  font-weight: bold;
  display: flex;
  justify-content: space-between;
  text-decoration: none;
  color: ${({ theme }) => theme.font};

  & > span {
    display: flex;
    justify-content: space-between;
  }
`;

interface ExcludeOptionProps {
  excludeAtom: RecoilState<boolean>;
  valueName: string;
  color: string;
}

const ExcludeOption = ({
  excludeAtom,
  valueName,
  color,
}: ExcludeOptionProps) => {
  const [excluded, setExcluded] = useRecoilState(excludeAtom);
  return (
    <TabOption
      active={excluded ? "Exclude" : "Select"}
      color={color}
      options={[
        {
          text: "Select",
          title: `Select ${valueName}`,
          onClick: () => excluded && setExcluded(false),
        },
        {
          text: "Exclude",
          title: `Exclude ${valueName}`,
          onClick: () => !excluded && setExcluded(true),
        },
      ]}
    />
  );
};

interface WrapperProps {
  valuesAtom: RecoilValueReadOnly<{
    total: number;
    count: number;
    results: string[];
  }>;
  selectedValuesAtom: RecoilState<string[]>;
  searchAtom: RecoilState<string>;
  excludeAtom: RecoilState<boolean>;
  name: string;
  valueName: string;
  color: string;
}

const Wrapper = ({
  color,
  valuesAtom,
  selectedValuesAtom,
  searchAtom,
  excludeAtom,
  valueName,
}: WrapperProps) => {
  const [selected, setSelected] = useRecoilState(selectedValuesAtom);
  const { results } = useRecoilValue(valuesAtom);
  const search = useRecoilValue(searchAtom);
  const selectedSet = new Set(selected);
  const setExcluded = useSetRecoilState(excludeAtom);

  const allValues = [...new Set([...results, ...selected])]
    .sort()
    .filter((v) => v && v.includes(search));

  return (
    <>
      {allValues.map((value) => (
        <Checkbox
          key={value}
          color={color}
          value={selectedSet.has(value)}
          name={value}
          setValue={(checked: boolean) => {
            if (checked) {
              selectedSet.add(value);
            } else {
              selectedSet.delete(value);
            }
            setSelected([...selectedSet].sort());
          }}
        />
      ))}
      {Boolean(selectedSet.size) && (
        <>
          <PopoutSectionTitle />
          <ExcludeOption
            excludeAtom={excludeAtom}
            valueName={valueName}
            color={color}
          />
          <Button
            text={"Reset"}
            color={color}
            onClick={() => {
              setSelected([]);
              setExcluded(false);
            }}
            style={{
              margin: "0.25rem -0.5rem",
              paddingLeft: "2.5rem",
              height: "2rem",
              borderRadius: 0,
            }}
          ></Button>
        </>
      )}
    </>
  );
};

interface Props {
  valuesAtom: RecoilValueReadOnly<{
    total: number;
    count: number;
    results: string[];
  }>;
  selectedValuesAtom: RecoilState<string[]>;
  searchAtom: RecoilState<string>;
  excludeAtom: RecoilState<boolean>;
  totalAtom: RecoilValueReadOnly<number>;
  name?: string;
  valueName: string;
  color: string;
}

const StringFilter = React.memo(
  React.forwardRef(
    (
      {
        name,
        searchAtom,
        valueName,
        valuesAtom,
        color,
        selectedValuesAtom,
        excludeAtom,
        totalAtom,
      }: Props,
      ref
    ) => {
      const [search, setSearch] = useRecoilState(searchAtom);
      const [selected, setSelected] = useRecoilState(selectedValuesAtom);
      const view = useRecoilValue(selectors.view);
      const total = useRecoilValue(totalAtom);
      const datasetName = useRecoilValue(selectors.datasetName);

      useLayoutEffect(() => {
        setSearch("");
      }, [filterView(view), datasetName]);

      return (
        <NamedStringFilterContainer ref={ref}>
          <NamedStringFilterHeader>
            {name && <>{name}</>}
          </NamedStringFilterHeader>
          <StringFilterContainer>
            {total > 15 && (
              <Input
                color={color}
                setter={(value) => setSearch(value)}
                value={search}
                onEnter={() => {
                  const newSelected = new Set([...selected]);
                  newSelected.add(search);
                  setSelected([...newSelected].sort());
                  setSearch("");
                }}
                placeholder={`+ filter by ${valueName}`}
              />
            )}
            <Suspense fallback={"..."}>
              <Wrapper
                searchAtom={searchAtom}
                color={color}
                name={name}
                valuesAtom={valuesAtom}
                selectedValuesAtom={selectedValuesAtom}
                excludeAtom={excludeAtom}
                valueName={valueName}
              />
            </Suspense>
          </StringFilterContainer>
        </NamedStringFilterContainer>
      );
    }
  )
);

export default StringFilter;
