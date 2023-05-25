import { useBrowserStorage } from "@fiftyone/state";
import Sample from "../../../../Sample";
import { useGroupContext } from "../../../GroupContextProvider";
import { DynamicGroupCarousel } from "../carousel/DynamicGroupCarousel";
import { SwitchView } from "./SwitchView";

export const OrderedDynamicGroup = () => {
  const { lookerRefCallback, groupByFieldValue } = useGroupContext();
  const [shouldRenderVideoLooker, setShouldRenderVideoLooker] =
    useBrowserStorage("dynamic-groups-should-render-video-looker", false);

  if (!groupByFieldValue) {
    return null;
  }

  return (
    <>
      <DynamicGroupCarousel key={groupByFieldValue} />
      <Sample lookerRefCallback={lookerRefCallback} />
      <SwitchView
        shouldRenderVideoLooker={shouldRenderVideoLooker}
        setShouldRenderVideoLooker={setShouldRenderVideoLooker}
      />
    </>
  );
};
