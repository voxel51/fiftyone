import { Loading, LoadingDots } from "@fiftyone/components";
import * as foq from "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import { currentModalSample } from "@fiftyone/state";
import { PaginationItem } from "@mui/material";
import Pagination, { PaginationProps } from "@mui/material/Pagination";
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
import {
  PreloadedQuery,
  loadQuery,
  usePreloadedQuery,
  useRelayEnvironment,
} from "react-relay";
import {
  useRecoilCallback,
  useRecoilState,
  useRecoilTransaction_UNSTABLE,
  useRecoilValue,
  useSetRecoilState,
} from "recoil";
import styled from "styled-components";
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
  const dataset = useRecoilValue(fos.datasetName);
  const view = useRecoilValue(fos.dynamicGroupViewQuery);
  const cursor = useRecoilValue(fos.nestedGroupIndex);
  const environment = useRelayEnvironment();
  const loadDynamicGroupSamples = useCallback(
    (cursor?: number) => {
      return loadQuery<foq.paginateSamplesQuery>(
        environment,
        foq.paginateSamples,
        {
          after: cursor ? String(cursor) : null,
          dataset,
          filter: {},
          view,
        }
      );
    },
    [dataset, environment, view]
  );

  const queryRef = useMemo(
    () => loadDynamicGroupSamples(cursor),
    [loadDynamicGroupSamples, cursor]
  );

  return (
    <BarContainer data-cy="dynamic-group-pagination-bar">
      <Suspense
        fallback={
          <Loading>
            <LoadingDots text={""} />
          </Loading>
        }
      >
        <GroupElementsLinkBarImpl queryRef={queryRef} />
      </Suspense>
    </BarContainer>
  );
};

const GroupElementsLinkBarImpl = React.memo(
  ({ queryRef }: { queryRef: PreloadedQuery<foq.paginateSamplesQuery> }) => {
    const setCursor = useSetRecoilState(fos.nestedGroupIndex);
    const { orderBy } = useRecoilValue(fos.dynamicGroupParameters)!;

    const data = usePreloadedQuery(foq.paginateSamples, queryRef);

    const [
      dynamicGroupCurrentElementIndex,
      setDynamicGroupCurrentElementIndex,
    ] = useRecoilState(fos.dynamicGroupCurrentElementIndex);
    const deferred = useDeferredValue(dynamicGroupCurrentElementIndex);

    const dynamicGroupParameters = useRecoilValue(
      fos.dynamicGroupParameters
    ) as fos.State.DynamicGroupParameters;
    const groupField = useRecoilValue(fos.groupField);
    const setSample = useRecoilTransaction_UNSTABLE(
      ({ set, get }) =>
        (sample: fos.ModalSample) => {
          const current = get(fos.currentModalSample);
          const currentGroup = get(fos.groupByFieldValue);
          const nextGroup = String(
            getValue(sample.sample, dynamicGroupParameters.groupBy)
          );

          if (
            current &&
            current.id !== sample.id &&
            currentGroup === nextGroup
          ) {
            set(currentModalSample, { index: current.index, id: sample.id });
            set(fos.groupId, getValue(sample.sample, groupField)._id as string);
          }
        },
      [dynamicGroupParameters, groupField]
    );

    const groupByFieldValue = useRecoilValue(fos.groupByFieldValue);
    const mapRef = useMemo(
      () => new Map<number, fos.ModalSample>(),
      [groupByFieldValue]
    );

    const map = useMemo(() => {
      if (data?.samples?.edges?.length) {
        for (const { cursor, node } of data.samples.edges) {
          mapRef.set(Number(cursor), node as fos.ModalSample);
        }
      }
      return new Map(mapRef);
    }, [data, mapRef]);

    useEffect(() => {
      if (map.size === 0) {
        return;
      }
      const nextSample = map.get(deferred - 1);

      if (nextSample) {
        setSample(nextSample);
      } else {
        // load a couple of previous samples for extra padding so that previous is just as fast
        setCursor(deferred - 5);
      }
    }, [map, setCursor, deferred, setSample]);

    const elementsCount = useRecoilValue(fos.dynamicGroupsElementCount);

    const [isTextBoxEmpty, setIsTextBoxEmpty] = useState(false);
    const textBoxRef = useRef<HTMLInputElement>(null);

    const onPageChange = useCallback(
      async (
        e: React.ChangeEvent<HTMLInputElement>,
        newElementIndex: number
      ) => {
        if (newElementIndex === deferred) {
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

          if (newElementIndex === deferred) {
            setIsTextBoxEmpty(false);
          }
          setDynamicGroupCurrentElementIndex(newElementIndex);

          setTimeout(() => {
            textBoxRef.current?.focus();
          }, 100);
        }
      },
      [setDynamicGroupCurrentElementIndex, deferred, elementsCount]
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
      <>
        <Pagination
          count={elementsCount}
          siblingCount={1}
          boundaryCount={2}
          page={deferred}
          onChange={onPageChange as PaginationProps["onChange"]}
          shape="rounded"
          color="primary"
          classes={{
            root: style.noRipple,
          }}
          renderItem={(item) => {
            return (
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
            );
          }}
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
  }
);
