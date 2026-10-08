import { ErrorBoundary } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import React, { Suspense, useEffect, useMemo } from "react";
import { useReverbValue, useSetReverbState } from "@fiftyone/reverb";
import styled from "styled-components";
import Group from "./Group";
import { Sample2D } from "./Sample2D";
import { Sample3d } from "./Sample3d";
import { useRetainedModalSample } from "./use-modal-sample-renderer-persistence";

const ContentColumn = styled.div`
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
`;

export const ModalSample = React.memo(() => {
  const isGroup = useReverbValue(fos.isGroup);
  const is3DMediaType = useReverbValue(fos.is3DDataset);
  const setIsTooltipLocked = useSetReverbState(fos.isTooltipLocked);
  const setTooltipDetail = useSetReverbState(fos.tooltipDetail);

  useEffect(() => {
    // reset tooltip state when modal is closed
    setIsTooltipLocked(false);

    return () => {
      setTooltipDetail(null);
    };
  }, []);

  return (
    <ContentColumn data-cy="sample-canvas">
      <ErrorBoundary onReset={() => {}}>
        <Suspense>
          {isGroup ? (
            <Group />
          ) : (
            <NonGroupModalSample is3DMediaType={is3DMediaType} />
          )}
        </Suspense>
      </ErrorBoundary>
    </ContentColumn>
  );
});

/** Routes a resolved non-group modal sample to its 2D or 3D surface. */
export const NonGroupModalSample = ({
  is3DMediaType,
}: {
  is3DMediaType: boolean;
}) => {
  const { sample } = useRetainedModalSample();
  const modalMediaField = useReverbValue(fos.selectedMediaField(true));
  const isDirect3dSampleUnknownMediaType = useMemo(() => {
    const selectedMedia = fos.resolveMediaFieldLooker({
      mediaField: modalMediaField,
      sample: sample.sample,
      urls: fos.getNormalizedUrls(sample.urls),
    });

    return (
      selectedMedia.isDirect3dSample ||
      (is3DMediaType && !selectedMedia.hasAlternateMediaPath)
    );
  }, [is3DMediaType, sample, modalMediaField]);

  return isDirect3dSampleUnknownMediaType ? <Sample3d /> : <Sample2D />;
};
