import React, { Suspense, useLayoutEffect, useState } from "react";
import ReactDOM from "react-dom";
import {
  RecoilState,
  RecoilValueReadOnly,
  useRecoilCallback,
  useRecoilState,
  useRecoilValue,
  useSetRecoilState,
} from "recoil";
import styled from "styled-components";

import Checkbox from "../Common/Checkbox";
import Input from "../Common/Input";
import Results, { ResultsContainer } from "../Common/Results";
import { Button } from "../FieldsSidebar";
import { PopoutSectionTitle, TabOption } from "../utils";
import * as selectors from "../../recoil/selectors";
import { filterView } from "../../utils/view";
import { LIST_LIMIT } from "./StringFieldFilter";

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
  excludeAtom,
  valueName,
}: WrapperProps) => {
  const [selected, setSelected] = useRecoilState(selectedValuesAtom);
  const { total, results } = useRecoilValue(valuesAtom);
  const selectedSet = new Set(selected);
  const setExcluded = useSetRecoilState(excludeAtom);

  let allValues = selected;

  if (total <= LIST_LIMIT) {
    allValues = [...allValues, ...results];
  }

  return (
    <>
      {[...new Set(allValues)].sort().map((value) => (
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

const useOnSelect = (selectedAtom: RecoilState<string[]>) => {
  return useRecoilCallback(({ snapshot, set }) => async (value: string) => {
    const selected = new Set(await snapshot.getPromise(selectedAtom));
    selected.add(value);
    set(selectedAtom, [...selected].sort());
  });
};

interface ResultsWrapperProps {
  valuesAtom: RecoilValueReadOnly<{
    total: number;
    count: number;
    results: string[];
  }>;
  color: string;
  shown: boolean;
  onSelect: (value: string) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

const ResultsWrapper = ({
  valuesAtom,
  color,
  shown,
  onSelect,
  onMouseEnter,
  onMouseLeave,
}: ResultsWrapperProps) => {
  const { results } = useRecoilValue(valuesAtom);

  return (
    <>
      {shown && (
        <ResultsContainer
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
        >
          <Suspense fallback={"..."}>
            <Results
              onSelect={onSelect}
              results={results}
              active={null}
              highlight={color}
            />
          </Suspense>
        </ResultsContainer>
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
      const [focused, setFocused] = useState(false);
      const [hovering, setHovering] = useState(false);

      const onSelect = useOnSelect(selectedValuesAtom);

      useLayoutEffect(() => {
        setSearch("");
      }, [filterView(view), datasetName]);

      return (
        <NamedStringFilterContainer ref={ref}>
          <NamedStringFilterHeader>
            {name && <>{name}</>}
          </NamedStringFilterHeader>
          <StringFilterContainer>
            {total > LIST_LIMIT && (
              <>
                <Input
                  key={"input"}
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
                  onFocus={() => setFocused(true)}
                  onBlur={() => !hovering && setFocused(false)}
                />
                <ResultsWrapper
                  key={"results"}
                  valuesAtom={valuesAtom}
                  color={color}
                  shown={focused || hovering}
                  onSelect={onSelect}
                  onMouseEnter={() => setHovering(true)}
                  onMouseLeave={() => setHovering(false)}
                />
              </>
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
