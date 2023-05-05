import * as foq from "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import { PaginationItem } from "@mui/material";
import Pagination, { PaginationProps } from "@mui/material/Pagination";
import React, {
  useCallback,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from "react";
import { PreloadedQuery, usePreloadedQuery, useQueryLoader } from "react-relay";
import { useRecoilCallback, useRecoilState, useRecoilValue } from "recoil";
import styled from "styled-components";
import { useGroupContext } from "../../GroupContextProvider";
import { GroupSuspense } from "../../GroupSuspense";
import style from "./GroupElementsLinkBar.module.css";
import { PaginationComponentWithTooltip } from "./PaginationComponentWithTooltip";

const BarContainer = styled.div`
  width: 100%;
  margin: 0.5em;
  display: flex;
  align-items: center;
  justify-content: center;

  & input::before {
    content: none;
  }
`;

export const GroupElementsLinkBar = () => {
  const { groupByFieldValue } = useGroupContext();

  const [queryRef, loadQuery] =
    useQueryLoader<foq.paginateDynamicGroupSamplesQuery>(
      foq.paginateDynamicGroupSamples
    );

  const loadDynamicGroupSamples = useRecoilCallback(
    ({ snapshot }) =>
      async (cursor?: number) => {
        const variables = {
          dataset: await snapshot.getPromise(fos.datasetName),
          filter: {},
          view: await snapshot.getPromise(
            fos.dynamicGroupViewQuery(groupByFieldValue!)
          ),
          cursor: cursor ? String(cursor) : null,
        };

        loadQuery(variables);
      },
    [loadQuery, groupByFieldValue]
  );

  useEffect(() => {
    if (!queryRef) {
      loadDynamicGroupSamples();
    }
  }, [queryRef, loadDynamicGroupSamples]);

  if (queryRef) {
    return (
      <GroupSuspense>
        <GroupElementsLinkBarImpl
          loadDynamicGroupSamples={loadDynamicGroupSamples}
          queryRef={queryRef}
        />
      </GroupSuspense>
    );
  }

  return null;
};

const GroupElementsLinkBarImpl: React.FC<{
  queryRef: PreloadedQuery<any>;
  loadDynamicGroupSamples: (cursor?: number) => Promise<void>;
}> = React.memo(({ queryRef, loadDynamicGroupSamples }) => {
  const { groupBy, orderBy } = useRecoilValue(fos.dynamicGroupParameters)!;
  const { groupByFieldValue } = useGroupContext();

  const atomFamilyKey = `${groupBy}-${orderBy}-${groupByFieldValue!}`;

  const [dynamicGroupSamplesStoreMap, setDynamicGroupSamplesStoreMap] =
    useRecoilState(fos.dynamicGroupSamplesStoreMap(atomFamilyKey));

  const data = usePreloadedQuery<foq.paginateDynamicGroupSamplesQuery>(
    foq.paginateDynamicGroupSamples,
    queryRef
  );

  const [dynamicGroupCurrentElementIndex, setDynamicGroupCurrentElementIndex] =
    useRecoilState(fos.dynamicGroupCurrentElementIndex(atomFamilyKey));

  const deferredDynamicGroupCurrentElementIndex = useDeferredValue(
    dynamicGroupCurrentElementIndex
  );

  const setSample = fos.useSetExpandedSample(false);

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

  useEffect(() => {
    if (dynamicGroupSamplesStoreMap.size === 0) {
      return;
    }

    const nextSample = dynamicGroupSamplesStoreMap.get(
      deferredDynamicGroupCurrentElementIndex - 1
    );

    if (nextSample) {
      setSample(nextSample);
    } else {
      // load a couple of previous samples for extra padding so that previous is just as fast
      loadDynamicGroupSamples(deferredDynamicGroupCurrentElementIndex - 5);
    }
  }, [
    dynamicGroupSamplesStoreMap,
    loadDynamicGroupSamples,
    deferredDynamicGroupCurrentElementIndex,
    setSample,
  ]);

  const elementsCount = useRecoilValue(
    fos.dynamicGroupsElementCount({ groupByValue: groupByFieldValue! })
  );

  const [isTextBoxEmpty, setIsTextBoxEmpty] = useState(false);
  const textBoxRef = useRef<HTMLInputElement>(null);

  const onPageChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>, newElementIndex: number) => {
      if (newElementIndex === deferredDynamicGroupCurrentElementIndex) {
        return;
      }

      setIsTextBoxEmpty(false);

      if (newElementIndex) {
        setDynamicGroupCurrentElementIndex(newElementIndex);
      } else {
        const newValue = e.target.value;

        if (newValue === "") {
          setIsTextBoxEmpty(true);
          return;
        }

        const newValueNum = Number(newValue);

        if (isNaN(newValueNum)) {
          setIsTextBoxEmpty(true);
          return;
        }

        if (newValueNum < 1) {
          newElementIndex = 1;
        } else if (newValueNum > elementsCount) {
          newElementIndex = elementsCount;
        } else {
          newElementIndex = newValueNum;
        }

        if (newElementIndex === deferredDynamicGroupCurrentElementIndex) {
          setIsTextBoxEmpty(false);
        }
        setDynamicGroupCurrentElementIndex(newElementIndex);

        setTimeout(() => {
          textBoxRef.current?.focus();
        }, 100);
      }
    },
    [
      setDynamicGroupCurrentElementIndex,
      deferredDynamicGroupCurrentElementIndex,
      elementsCount,
    ]
  );

  const keyNavigationHandler = useRecoilCallback(
    () => (e: KeyboardEvent) => {
      if (e.key === "<") {
        e.preventDefault();
        setDynamicGroupCurrentElementIndex((prev) =>
          prev <= 1 ? prev : prev - 1
        );
      } else if (e.key === ">") {
        e.preventDefault();
        setDynamicGroupCurrentElementIndex((prev) =>
          prev >= elementsCount ? prev : prev + 1
        );
      }
    },
    [elementsCount, setDynamicGroupCurrentElementIndex]
  );

  fos.useEventHandler(document, "keydown", keyNavigationHandler);

  return (
    <BarContainer>
      <Pagination
        count={elementsCount}
        siblingCount={1}
        boundaryCount={2}
        page={dynamicGroupCurrentElementIndex}
        onChange={onPageChange as PaginationProps["onChange"]}
        shape="rounded"
        color="primary"
        classes={{
          root: style.noRipple,
        }}
        renderItem={(item) => {
          return (
            <PaginationItem
              components={{ previous: ArrowBackIcon, next: ArrowForwardIcon }}
              component={PaginationComponentWithTooltip}
              atomFamilyKey={atomFamilyKey}
              // hack because page is not being forwarded as-is for some reason
              currentPage={item.page}
              isButton={item.type !== "page"}
              {...item}
            />
          );
        }}
      />

      {elementsCount >= 10 && (
        <input
          ref={textBoxRef}
          className={style.currentPageInput}
          value={isTextBoxEmpty ? "" : dynamicGroupCurrentElementIndex}
          onChange={onPageChange}
        />
      )}
    </BarContainer>
  );
});
