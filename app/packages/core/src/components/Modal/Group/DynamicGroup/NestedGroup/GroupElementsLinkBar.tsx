import * as fos from "@fiftyone/state";
import Pagination, { PaginationProps } from "@mui/material/Pagination";
import React, { ChangeEventHandler, useCallback, useState } from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import styled from "styled-components";
import { useGroupContext } from "../../GroupContextProvider";
import style from "./GroupElementsLinkBar.module.css";

const BarContainer = styled.div`
  margin: 0.5em;
  display: flex;
  align-items: center;

  & input::before {
    content: none;
  }
`;

const IntraDynamicGroupElementLink = styled.button`
  color: var(--joy-palette-primary-plainColor);
  border: none;
  background: transparent;
  text-decoration: underline;
  cursor: pointer;

  &:hover {
    text-decoration: none;
  }
`;

export const GroupElementsLinkBar = () => {
  const { groupByFieldValue } = useGroupContext();
  // const { groupBy, orderBy } = useRecoilValue(fos.dynamicGroupParameters)!;
  // const { data, hasNext, loadNext } = usePaginationFragment(
  //   foq.paginateGroupPaginationFragment,
  //   useRecoilValue(fos.dynamicGroupPaginationFragment(groupByFieldValue!))
  // );

  const [dynamicGroupCurrentElementIndex, setDynamicGroupCurrentElementIndex] =
    useRecoilState(fos.dynamicGroupCurrentElementIndex);

  const elementsCount = useRecoilValue(
    fos.dynamicGroupsElementCount({ groupByValue: groupByFieldValue! })
  );

  const [isTextBoxEmpty, setIsTextBoxEmpty] = useState(false);

  const onPageChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>, newElementIndex: number) => {
      if (newElementIndex) {
        setIsTextBoxEmpty(false);
        setDynamicGroupCurrentElementIndex(newElementIndex);
      } else {
        setDynamicGroupCurrentElementIndex((prev) => {
          setIsTextBoxEmpty(false);
          const newValue = e.target.value;
          if (newValue === "") {
            setIsTextBoxEmpty(true);
            return prev;
          }
          const newValueNum = Number(newValue);
          if (isNaN(newValueNum)) {
            setIsTextBoxEmpty(true);
            return prev;
          }
          if (newValueNum < 1) {
            return 1;
          }
          if (newValueNum > elementsCount) {
            return elementsCount;
          }
          return newValueNum;
        });
      }
    },
    [setDynamicGroupCurrentElementIndex, elementsCount]
  );

  // const samples = useMemo(() => {
  //   if (!data) {
  //     return [];
  //   }

  //   const hasNext_ = hasNext;
  //   const groupByFieldValue_ = groupByFieldValue;

  //   debugger;
  //   return [];
  // }, [data, hasNext, groupByFieldValue]);

  return (
    <BarContainer>
      {/* note: pagination renders in contracted form when >= 10 elements */}
      <Pagination
        count={elementsCount}
        page={dynamicGroupCurrentElementIndex}
        onChange={onPageChange as PaginationProps["onChange"]}
        shape="rounded"
        color="primary"
        classes={{
          root: style.noRipple,
        }}
      />
      {/* if more than 10 elements, render text input to offer random access */}
      {elementsCount >= 10 && (
        // todo: use debounce
        <input
          className={style.currentPageInput}
          value={isTextBoxEmpty ? "" : dynamicGroupCurrentElementIndex}
          onChange={onPageChange as ChangeEventHandler<HTMLInputElement>}
        />
      )}
    </BarContainer>
  );
};
