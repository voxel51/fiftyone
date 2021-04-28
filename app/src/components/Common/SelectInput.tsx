import React, { Suspense } from "react";
import { RecoilState, RecoilValueReadOnly, useRecoilState } from "recoil";
import { animated } from "react-spring";
import styled from "styled-components";
import { CircularProgress } from "@material-ui/core";

const ResultDiv = animated(styled.div`
  cursor: pointer;
  margin: 0.25rem 0.25rem;
  padding: 0.1rem 0.25rem;
  font-weight: bold;
  color: ${({ theme }) => theme.fontDark};
`);

const SearchResultsDiv = animated(styled.div`
  background-color: ${({ theme }) => theme.backgroundDark};
  border: 1px solid ${({ theme }) => theme.backgroundDarkBorder};
  border-radius: 2px;
  box-shadow: 0 2px 20px ${({ theme }) => theme.backgroundDark};
  box-sizing: border-box;
  margin-top: 2.5rem;
  position: fixed;
  width: auto;
  z-index: 801;
  max-height: 328px;
  overflow-y: scroll;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    width: 0px;
    background: transparent;
    display: none;
  }
  &::-webkit-scrollbar-thumb {
    width: 0px;
    display: none;
  }
`);

const SelectInputDiv = styled.div``;

interface SelectInputProps {
  choicesAtom?: RecoilValueReadOnly<{ hasMore: boolean; choices: string[] }>;
  onChange: (selections: string[]) => void;
  radio?: boolean;
  valueAtom: RecoilState<string>;
}

const SelectInputContainer = React.memo(
  ({
    valueAtom,
    choicesAtom = null,
    radio = false,
    onChange,
  }: SelectInputProps) => {
    const [value, setValue] = useRecoilState(valueAtom);

    return null;
  }
);

const Loading = () => {
  return <CircularProgress />;
};

const SelectInput = React.memo((props: SelectInputProps) => {
  return (
    <Suspense fallback={Loading}>
      <SelectInputContainer {...props} />
    </Suspense>
  );
});

export default SelectInput;
