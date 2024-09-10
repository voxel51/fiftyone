import * as fos from "@fiftyone/state";
import React, { useEffect } from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import styled from "styled-components";
import { Sample2D } from "../../../Sample2D";
import { Sample3d } from "../../../Sample3d";
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
      <ElementsContainer>
        <>
          {isCarouselVisible && viewMode === "carousel" && (
            <DynamicGroupCarousel />
          )}
          {isBigLookerVisible && (
            <GroupSuspense>
              {parent !== "point_cloud" && parent !== "three_d" ? (
                <Sample2D />
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
