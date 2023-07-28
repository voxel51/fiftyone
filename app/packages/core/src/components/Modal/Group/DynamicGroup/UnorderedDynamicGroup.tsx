import { Bar } from "@fiftyone/components";
import { AbstractLooker } from "@fiftyone/looker";
import * as fos from "@fiftyone/state";
import React, { useRef } from "react";
import { useRecoilValue } from "recoil";
import styled from "styled-components";
import { ModalActionsRow } from "../../../Actions";
import Sample from "../../Sample";
import { Sample3d } from "../../Sample3d";
import { useGroupContext } from "../GroupContextProvider";
import { GroupSuspense } from "../GroupSuspense";
import { DynamicGroupCarousel } from "./carousel/DynamicGroupCarousel";

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

export const UnorderedDynamicGroup = () => {
  const { lookerRefCallback } = useGroupContext();
  const lookerRef = useRef<AbstractLooker>();
  const groupByFieldValue = useRecoilValue(fos.groupByFieldValue);

  const isMainVisible = useRecoilValue(fos.groupMediaIsMainVisibleSetting);
  const isCarouselVisible = useRecoilValue(
    fos.groupMediaIsCarouselVisibleSetting
  );
  const parent = useRecoilValue(fos.parentMediaTypeSelector);

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
          {isCarouselVisible && (
            <DynamicGroupCarousel key={groupByFieldValue} />
          )}
          {isMainVisible && (
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
      </ElementsContainer>
    </RootContainer>
  );
};

const UnorderedDynamicGroupBar = ({
  lookerRef,
}: {
  lookerRef: React.MutableRefObject<AbstractLooker | undefined>;
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
