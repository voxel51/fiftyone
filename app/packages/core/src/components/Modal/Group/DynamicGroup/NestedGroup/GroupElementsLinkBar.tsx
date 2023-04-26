import * as foq from "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import Pagination, { PaginationProps } from "@mui/material/Pagination";
import React, {
  ChangeEventHandler,
  useCallback,
  useEffect,
  useState,
} from "react";
import { usePaginationFragment } from "react-relay";
import { useRecoilState, useRecoilValue } from "recoil";
import styled from "styled-components";
import { useGroupContext } from "../../GroupContextProvider";
import style from "./GroupElementsLinkBar.module.css";

const BarContainer = styled.div`
  margin: 0.5em;
  display: flex;
  align-items: center;
  justify-content: center;

  & input::before {
    content: none;
  }
`;

export const GroupElementsLinkBar = React.memo(() => {
  const { groupBy, orderBy } = useRecoilValue(fos.dynamicGroupParameters)!;
  const { groupByFieldValue } = useGroupContext();

  const atomFamilyKey = `${groupBy}-${orderBy}-${groupByFieldValue!}`;

  const [dynamicGroupSamplesStoreMap, setDynamicGroupSamplesStoreMap] =
    useRecoilState(fos.dynamicGroupSamplesStoreMap(atomFamilyKey));

  // const { groupBy, orderBy } = useRecoilValue(fos.dynamicGroupParameters)!;
  const { data, hasNext, loadNext } = usePaginationFragment(
    foq.paginateGroupPaginationFragment,
    useRecoilValue(
      fos.dynamicGroupPaginationFragment({
        fieldOrExpression: groupByFieldValue!,
      })
    )
  );

  useEffect(() => {
    if (!data?.samples?.edges?.length) {
      return;
    }

    setDynamicGroupSamplesStoreMap((prev) => {
      const newMap = new Map(prev);

      for (const { cursor, node } of data.samples.edges) {
        newMap.set(Number(cursor), node as unknown as fos.SampleData);
      }

      return newMap;
    });
  }, [data, setDynamicGroupSamplesStoreMap]);

  const setSample = fos.useSetExpandedSample(false);

  const [dynamicGroupCurrentElementIndex, setDynamicGroupCurrentElementIndex] =
    useRecoilState(fos.dynamicGroupCurrentElementIndex(atomFamilyKey));

  const elementsCount = useRecoilValue(
    fos.dynamicGroupsElementCount({ groupByValue: groupByFieldValue! })
  );

  const [isTextBoxEmpty, setIsTextBoxEmpty] = useState(false);

  const handleChange = useCallback(
    (newElementIndex: number) => {
      // subtract 1 because the index is 1-based
      const nextSample = dynamicGroupSamplesStoreMap.get(newElementIndex - 1);
      if (nextSample) {
        setSample(nextSample);
      } else {
        // todo: load
        // loadNext(1);
        throw new Error("Not implemented");
      }
    },
    [setSample, dynamicGroupSamplesStoreMap]
  );

  const onPageChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>, newElementIndex: number) => {
      if (newElementIndex === dynamicGroupCurrentElementIndex) {
        return;
      }

      if (newElementIndex) {
        setIsTextBoxEmpty(false);
        setDynamicGroupCurrentElementIndex(newElementIndex);
        handleChange(newElementIndex);
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
        handleChange(newElementIndex);
      }
    },
    [
      setDynamicGroupCurrentElementIndex,
      handleChange,
      dynamicGroupCurrentElementIndex,
      elementsCount,
    ]
  );

  return (
    <BarContainer>
      {/* note: pagination renders in contracted form when >= 10 elements */}
      <Pagination
        count={elementsCount}
        siblingCount={2}
        boundaryCount={2}
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
});
