import React from "react";
import { useBrowserStorage } from "@fiftyone/state";
import Sample from "../../../../Sample";
import { useGroupContext } from "../../../GroupContextProvider";
import { DynamicGroupCarousel } from "../carousel/DynamicGroupCarousel";
import { SwitchView } from "./SwitchView";
import { VideoLooker } from "./video-looker";

export const OrderedDynamicGroup = () => {
  const { lookerRefCallback, groupByFieldValue } = useGroupContext();
  const [shouldRenderVideoLooker, setShouldRenderVideoLooker] =
    useBrowserStorage("dynamic-groups-should-render-video-looker", false);

  if (!groupByFieldValue) {
    return null;
  }

  return (
    <>
      {shouldRenderVideoLooker ? (
        <VideoLooker />
      ) : (
        <>
          <DynamicGroupCarousel key={groupByFieldValue} />
          <Sample lookerRefCallback={lookerRefCallback} />
        </>
      )}

      <SwitchView
        shouldRenderVideoLooker={shouldRenderVideoLooker}
        setShouldRenderVideoLooker={setShouldRenderVideoLooker}
      />
    </>
  );
};
