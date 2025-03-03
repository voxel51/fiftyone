import { useTheme } from "@fiftyone/components";
import type { ImageLooker } from "@fiftyone/looker";
import * as fos from "@fiftyone/state";
import React, { useMemo } from "react";
import { useRecoilCallback, useRecoilValue } from "recoil";
import { ImaVidLookerReact } from "./ImaVidLooker";
import { VideoLookerReact } from "./VideoLooker";
import useLooker from "./use-looker";
import { useImageModalSelectiveRendering } from "./use-modal-selective-rendering";

export const useShowOverlays = () => {
  return useRecoilCallback(({ set }) => async (event: CustomEvent) => {
    set(fos.showOverlays, event.detail);
  });
};

export const useClearSelectedLabels = () => {
  return useRecoilCallback(
    ({ set }) =>
      async () =>
        set(fos.selectedLabels, []),
    []
  );
};

interface LookerProps {
  sample: fos.ModalSample;
}

const ModalLookerNoTimeline = React.memo((props: LookerProps) => {
  const { id, ref, looker } = useLooker<ImageLooker>(props);
  const theme = useTheme();
  useImageModalSelectiveRendering(id, looker);

  return (
    <div
      ref={ref}
      id={id}
      data-cy="modal-looker-container"
      style={{
        width: "100%",
        height: "100%",
        background: theme.background.level2,
        position: "relative",
      }}
    />
  );
});

export const ModalLooker = React.memo(
  ({ sample: propsSampleData }: LookerProps) => {
    const modalSampleData = useRecoilValue(fos.modalSample);

    const sample = useMemo(() => {
      if (propsSampleData) {
        return {
          ...modalSampleData,
          ...propsSampleData,
        };
      }

      return modalSampleData;
    }, [propsSampleData, modalSampleData]);

    const shouldRenderImavid = useRecoilValue(
      fos.shouldRenderImaVidLooker(true)
    );
    const video = useRecoilValue(fos.isVideoDataset);

    const modalMediaField = useRecoilValue(fos.selectedMediaField(true));

    if (shouldRenderImavid) {
      return <ImaVidLookerReact sample={sample} key={modalMediaField} />;
    }

    if (video) {
      return <VideoLookerReact sample={sample} />;
    }

    return <ModalLookerNoTimeline sample={sample} />;
  }
);
