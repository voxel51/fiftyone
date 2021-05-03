import React, { Suspense, useLayoutEffect } from "react";
import {
  RecoilState,
  RecoilValueReadOnly,
  useRecoilState,
  useRecoilValue,
} from "recoil";
import styled from "styled-components";

import Checkbox from "../Common/Checkbox";
import Input from "../Common/Input";
import { TabOption } from "../utils";
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

const format = (num) => {
  return num.toLocaleString("en", { useGrouping: true });
};

const SelectionString = ({ selected, excludeAtom }) => {
  const excluded = useRecoilValue(excludeAtom);
  return (
    <span>
      {format(selected.size)}{" "}
      {selected.size === 1
        ? excluded
          ? "exclusion"
          : "selection"
        : excluded
        ? "exclusions"
        : "selections"}
    </span>
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
  color: string;
}

const Wrapper = ({
  color,
  valuesAtom,
  selectedValuesAtom,
  searchAtom,
  excludeAtom,
}: WrapperProps) => {
  const [selected, setSelected] = useRecoilState(selectedValuesAtom);
  const { count, total, results } = useRecoilValue(valuesAtom);
  const search = useRecoilValue(searchAtom);
  const selectedSet = new Set(selected);

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
      <Footer>
        <SelectionString selected={selectedSet} excludeAtom={excludeAtom} />
        <span>
          {count !== total ? `${format(count)} of ` : null}
          {format(total)}
        </span>
      </Footer>
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
      }: Props,
      ref
    ) => {
      const [search, setSearch] = useRecoilState(searchAtom);
      const [selected, setSelected] = useRecoilState(selectedValuesAtom);
      const view = useRecoilValue(selectors.view);
      const datasetName = useRecoilValue(selectors.datasetName);

      useLayoutEffect(() => {
        setSearch("");
      }, [filterView(view), datasetName]);

      return (
        <NamedStringFilterContainer ref={ref}>
          <NamedStringFilterHeader>
            {name && <>{name}</>}
            <div>
              {selected.length > 0 ? (
                <a
                  style={{ cursor: "pointer", textDecoration: "underline" }}
                  onClick={() => {
                    setSelected([]);
                    setSearch("");
                  }}
                >
                  reset
                </a>
              ) : null}
            </div>
          </NamedStringFilterHeader>
          <StringFilterContainer>
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
            <Suspense fallback={"..."}>
              <Wrapper
                searchAtom={searchAtom}
                color={color}
                name={name}
                valuesAtom={valuesAtom}
                selectedValuesAtom={selectedValuesAtom}
                excludeAtom={excludeAtom}
              />
            </Suspense>
          </StringFilterContainer>
        </NamedStringFilterContainer>
      );
    }
  )
);

export default StringFilter;
