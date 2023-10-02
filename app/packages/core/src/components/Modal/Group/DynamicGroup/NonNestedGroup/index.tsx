import { Bar } from "@fiftyone/components";
import * as foq from "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import React, { useEffect, useRef } from "react";
import { PreloadedQuery } from "react-relay";
import { useRecoilState, useRecoilValue } from "recoil";
import styled from "styled-components";
import { ModalActionsRow } from "../../../../Actions";
import Sample from "../../../Sample";
import { Sample3d } from "../../../Sample3d";
import { useGroupContext } from "../../GroupContextProvider";
import { GroupSuspense } from "../../GroupSuspense";
import { DynamicGroupCarousel } from ".././carousel/DynamicGroupCarousel";
import { GroupElementsLinkBar } from "../pagination";

const RootContainer = styled.div`
  height: 100%;
  width: 100%;
`;

const ElementsContainer = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
`;

export const NonNestedDynamicGroup = ({
  queryRef,
}: {
  queryRef: PreloadedQuery<foq.paginateSamplesQuery>;
}) => {
  const { lookerRefCallback } = useGroupContext();
  const lookerRef = useRef<fos.Lookers>();
  const groupByFieldValue = useRecoilValue(fos.groupByFieldValue);

  const [isMainVisible, setIsMainVisible] = useRecoilState(
    fos.groupMediaIsMainVisibleSetting
  );
  const viewMode = useRecoilValue(fos.nonNestedDynamicGroupsViewMode);
  const isCarouselVisible = useRecoilValue(
    fos.groupMediaIsCarouselVisibleSetting
  );
  const parent = useRecoilValue(fos.parentMediaTypeSelector);

  const isViewModePagination = viewMode === "pagination";

  useEffect(() => {
    if (!isMainVisible && isViewModePagination) {
      setIsMainVisible(true);
    }
  }, [isMainVisible, isViewModePagination]);

  if (!groupByFieldValue) {
    return null;
  }

  return (
    <RootContainer>
      {/* weird conditional rendering of the bar because lookerControls messes up positioning of the bar in firefox in inexplicable ways */}
      {!isMainVisible && <UnorderedDynamicGroupBar lookerRef={lookerRef} />}
      <ElementsContainer>
        <>
          {isMainVisible && <UnorderedDynamicGroupBar lookerRef={lookerRef} />}
          {isCarouselVisible && !isViewModePagination && (
            <DynamicGroupCarousel key={groupByFieldValue} />
          )}
          {(isViewModePagination || isMainVisible) && (
            <GroupSuspense>
              {parent !== "point_cloud" ? (
                <Sample
                  lookerRefCallback={lookerRefCallback}
                  lookerRef={lookerRef}
                />
              ) : (
                <Sample3d />
              )}
            </GroupSuspense>
          )}
        </>
        {isViewModePagination && <GroupElementsLinkBar queryRef={queryRef} />}
      </ElementsContainer>
    </RootContainer>
  );
};

const UnorderedDynamicGroupBar = ({
  lookerRef,
}: {
  lookerRef: React.MutableRefObject<fos.Lookers | undefined>;
}) => {
  return (
    <Bar
      style={{
        position: "relative",
        display: "flex",
        justifyContent: "right",
        zIndex: 10000,
      }}
    >
      <ModalActionsRow isGroup lookerRef={lookerRef} />
    </Bar>
  );
};
