import { Bar } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import React, { useEffect, useRef } from "react";
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

export const NonNestedDynamicGroup = () => {
  const { lookerRefCallback } = useGroupContext();
  const lookerRef = useRef<fos.Lookers>();

  const [isBigLookerVisible, setIsBigLookerVisible] = useRecoilState(
    fos.groupMediaIsMainVisibleSetting
  );
  const viewMode = useRecoilValue(fos.dynamicGroupsViewMode(true));
  const isCarouselVisible = useRecoilValue(
    fos.groupMediaIsCarouselVisibleSetting
  );
  const parent = useRecoilValue(fos.parentMediaTypeSelector);

  useEffect(() => {
    if (!isBigLookerVisible && viewMode !== "carousel") {
      setIsBigLookerVisible(true);
    }
  }, [isBigLookerVisible, viewMode, setIsBigLookerVisible]);

  return (
    <RootContainer>
      {/* weird conditional rendering of the bar because lookerControls messes up positioning of the bar in firefox in inexplicable ways */}
      {!isBigLookerVisible && (
        <NonNestedDynamicGroupBar lookerRef={lookerRef} />
      )}
      <ElementsContainer>
        <>
          {isBigLookerVisible && (
            <NonNestedDynamicGroupBar lookerRef={lookerRef} />
          )}
          {isCarouselVisible && viewMode === "carousel" && (
            <DynamicGroupCarousel />
          )}
          {isBigLookerVisible && (
            <GroupSuspense>
              {parent !== "point_cloud" && parent !== "three_d" ? (
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
        {viewMode === "pagination" && <GroupElementsLinkBar />}
      </ElementsContainer>
    </RootContainer>
  );
};

const NonNestedDynamicGroupBar = ({
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
