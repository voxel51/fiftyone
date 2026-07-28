import * as foq from "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import { modalSelector } from "@fiftyone/state";
import { PaginationItem } from "@mui/material";
import type { PaginationProps } from "@mui/material/Pagination";
import Pagination from "@mui/material/Pagination";
import { get as getValue } from "lodash";
import React, {
  Suspense,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { PreloadedQuery } from "react-relay";
import { usePreloadedQuery } from "react-relay";
import {
  useRecoilCallback,
  useRecoilState,
  useRecoilValue,
  useSetRecoilState,
} from "recoil";
import styled from "styled-components";
import { useDynamicGroupSamples } from "../useDynamicGroupSamples";
import { PaginationComponentWithTooltip } from "./PaginationComponentWithTooltip";
import style from "./index.module.css";

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

type OnPageChange = (
  e: React.ChangeEvent<HTMLInputElement>,
  newElementIndex?: number,
) => void;

/**
 * Inner component that owns the Relay data fetch and sample-navigation side
 * effect. Lives inside a Suspense boundary so it can suspend freely on each
 * new queryRef without unmounting the outer bar shell.
 */
const PaginationBarContent = ({
  queryRef,
  orderBy,
  deferred,
  elementsCount,
  setCursor,
  onPageChange,
  isTextBoxEmpty,
  textBoxRef,
  dynamicGroupCurrentElementIndex,
  isPaginationChangeRef,
}: {
  queryRef: PreloadedQuery<foq.paginateSamplesQuery>;
  orderBy: string | undefined;
  deferred: number;
  elementsCount: number;
  setCursor: (n: number) => void;
  onPageChange: OnPageChange;
  isTextBoxEmpty: boolean;
  textBoxRef: React.RefObject<HTMLInputElement>;
  dynamicGroupCurrentElementIndex: number;
  isPaginationChangeRef: React.RefObject<boolean>;
}) => {
  const data = usePreloadedQuery(foq.paginateSamples, queryRef);

  const dynamicGroupParameters = useRecoilValue(
    fos.dynamicGroupParameters,
  ) as fos.State.DynamicGroupParameters;
  const groupField = useRecoilValue(fos.groupField);
  const setSample = useRecoilCallback(
    ({ set, snapshot }) =>
      async (sample: fos.ModalSample) => {
        const current = await snapshot.getPromise(fos.modalSelector);

        if (current && current.id !== sample.id) {
          set(modalSelector, (current) => ({
            ...current,
            id: sample.id,
            groupId: groupField
              ? (getValue(sample.sample, groupField)._id as string)
              : null,
          }));
        }
      },
    [dynamicGroupParameters, groupField],
  );

  const groupByFieldValue = fos.useGroupByFieldValue();
  const mapRef = useMemo(() => {
    groupByFieldValue;
    return new Map<number, fos.ModalSample>();
  }, [groupByFieldValue]);

  const map = useMemo(() => {
    if (
      data.samples.__typename === "QueryTimeout" ||
      data.samples.__typename === "%other"
    ) {
      throw new Error("unexpected");
    }

    if (data?.samples?.edges?.length) {
      for (const { cursor, node } of data.samples.edges) {
        mapRef.set(Number(cursor), node as fos.ModalSample);
      }
    }
    return new Map(mapRef);
  }, [data, mapRef]);

  useEffect(() => {
    if (map.size === 0) return;
    if (!isPaginationChangeRef.current) return;
    isPaginationChangeRef.current = false;
    const nextSample = map.get(deferred - 1);
    if (nextSample) {
      setSample(nextSample);
    } else {
      // load a few previous samples for padding so navigating back is equally fast
      setCursor(deferred - 5);
    }
  }, [map, setCursor, deferred, setSample, isPaginationChangeRef]);

  return (
    <>
      <Pagination
        count={elementsCount}
        siblingCount={1}
        boundaryCount={2}
        page={deferred}
        onChange={onPageChange as PaginationProps["onChange"]}
        shape="rounded"
        color="primary"
        classes={{ root: style.noRipple }}
        renderItem={(item) => (
          <PaginationItem
            component={PaginationComponentWithTooltip}
            orderByValue={
              item.page >= 0 && orderBy
                ? map.get(item.page - 1)?.sample[orderBy]
                : undefined
            }
            // hack because page is not being forwarded as-is for some reason
            currentPage={item.page}
            isButton={item.type !== "page"}
            {...item}
          />
        )}
      />

      {elementsCount >= 10 && (
        <input
          data-cy="dynamic-group-pagination-bar-input"
          ref={textBoxRef}
          className={style.currentPageInput}
          value={isTextBoxEmpty ? "" : dynamicGroupCurrentElementIndex}
          onChange={onPageChange}
        />
      )}
    </>
  );
};

export const GroupElementsLinkBar = React.memo(() => {
  const setCursor = useSetRecoilState(fos.dynamicGroupIndex);
  const { orderBy } = useRecoilValue(fos.dynamicGroupParameters)!;
  const isPaginationChangeRef = useRef(false);
  const { queryRef } = useDynamicGroupSamples();
  const deferredQueryRef = useDeferredValue(queryRef);

  const [dynamicGroupCurrentElementIndex, setDynamicGroupCurrentElementIndex] =
    useRecoilState(fos.dynamicGroupCurrentElementIndex);
  const deferred = useDeferredValue(dynamicGroupCurrentElementIndex);

  const elementsCount = fos.useElementsCount(true);

  const [isTextBoxEmpty, setIsTextBoxEmpty] = useState(false);
  const textBoxRef = useRef<HTMLInputElement>(null);

  const onPageChange = useCallback<OnPageChange>(
    (e, newElementIndex) => {
      if (newElementIndex === deferred) return;

      setIsTextBoxEmpty(false);

      if (newElementIndex) {
        isPaginationChangeRef.current = true;
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

        if (newElementIndex === deferred) setIsTextBoxEmpty(false);
        isPaginationChangeRef.current = true;
        setDynamicGroupCurrentElementIndex(newElementIndex);

        setTimeout(() => {
          textBoxRef.current?.focus();
        }, 100);
      }
    },
    [setDynamicGroupCurrentElementIndex, deferred, elementsCount],
  );

  const keyNavigationHandler = useRecoilCallback(
    () => (e: KeyboardEvent) => {
      if (e.key === ",") {
        e.preventDefault();
        isPaginationChangeRef.current = true;
        setDynamicGroupCurrentElementIndex((prev) =>
          prev <= 1 ? prev : prev - 1,
        );
      } else if (e.key === ".") {
        e.preventDefault();
        isPaginationChangeRef.current = true;
        setDynamicGroupCurrentElementIndex((prev) =>
          prev >= elementsCount ? prev : prev + 1,
        );
      }
    },
    [elementsCount, setDynamicGroupCurrentElementIndex],
  );

  fos.useEventHandler(document, "keydown", keyNavigationHandler);

  if (!deferredQueryRef) return null;

  return (
    <BarContainer data-cy="dynamic-group-pagination-bar">
      <Suspense fallback={null}>
        <PaginationBarContent
          queryRef={deferredQueryRef}
          orderBy={orderBy}
          deferred={deferred}
          elementsCount={elementsCount}
          setCursor={setCursor}
          onPageChange={onPageChange}
          isTextBoxEmpty={isTextBoxEmpty}
          textBoxRef={textBoxRef}
          dynamicGroupCurrentElementIndex={dynamicGroupCurrentElementIndex}
          isPaginationChangeRef={isPaginationChangeRef}
        />
      </Suspense>
    </BarContainer>
  );
});
