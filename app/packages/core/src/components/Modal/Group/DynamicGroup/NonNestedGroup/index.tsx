import * as fos from "@fiftyone/state";
import { useEffect } from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import styled from "styled-components";
import { Sample2D } from "../../../Sample2D";
import { Sample3d } from "../../../Sample3d";
import { GroupSuspense } from "../../GroupSuspense";
import { DynamicGroupCarousel } from ".././carousel/DynamicGroupCarousel";
import { GroupElementsLinkBar } from "../pagination";
import { is3d } from "@fiftyone/utilities";

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
    fos.groupMediaIsMain2DViewerVisibleSetting
  );
  const viewMode = useRecoilValue(fos.dynamicGroupsViewMode(true));
  const isCarouselVisible = useRecoilValue(
    fos.groupMediaIsCarouselVisibleSetting
  );
  const parent = useRecoilValue(fos.parentMediaTypeSelector);
  const isAnnotateMode = fos.useModalMode() === fos.ModalMode.ANNOTATE;

  // This effect ensures the main 2D viewer stays visible outside carousel mode (skipped in annotate mode)
  useEffect(() => {
    if (!isBigLookerVisible && viewMode !== "carousel" && !isAnnotateMode) {
      setIsBigLookerVisible(true);
    }
  }, [isBigLookerVisible, viewMode, setIsBigLookerVisible, isAnnotateMode]);

  return (
    <RootContainer>
      <ElementsContainer>
        <>
          {isCarouselVisible && viewMode === "carousel" && (
            <DynamicGroupCarousel />
          )}
          {isBigLookerVisible && (
            <GroupSuspense>
              {!is3d(parent) ? <Sample2D /> : <Sample3d />}
            </GroupSuspense>
          )}
        </>
        {viewMode === "pagination" && <GroupElementsLinkBar />}
      </ElementsContainer>
    </RootContainer>
  );
};
