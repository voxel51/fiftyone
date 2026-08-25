import { AnnotationTopBar } from "@fiftyone/annotation";
import { ErrorBoundary } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import React, { Suspense, useEffect, useMemo } from "react";
import { useRecoilValue, useSetRecoilState } from "recoil";
import styled from "styled-components";
import Group from "./Group";
import { Sample2D } from "./Sample2D";
import { Sample3d } from "./Sample3d";
import { useRetainedModalSample } from "./use-modal-sample-renderer-persistence";

const Root = styled.div`
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
`;

const ContentColumn = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  width: 100%;
  min-height: 0;
  position: relative;
  overflow: hidden;
`;

/**
 * The filename + media-facts bar for native image samples, in both Explore
 * and Annotate. Mounted above the `sample-canvas` element so the canvas box
 * is exactly the media region — e2e coordinates and screenshots map over the
 * media, and the bar's per-sample content stays out of canvas captures.
 * Video mounts the bar itself, inside its surface.
 */
const ImageTopBar = () => {
  const isGroup = useRecoilValue(fos.isGroup);
  const shouldRenderImavid = useRecoilValue(fos.shouldRenderImaVidLooker(true));

  // Gate before NonGroupImageTopBar reads the modal sample —
  // useRetainedModalSample resolves the non-group sample and throws for
  // group modals.
  if (isGroup || shouldRenderImavid) {
    return null;
  }

  return <NonGroupImageTopBar />;
};

const NonGroupImageTopBar = () => {
  const modalMediaField = useRecoilValue(fos.selectedMediaField(true));
  const { sample } = useRetainedModalSample();

  const selectedMedia = fos.resolveMediaFieldLooker({
    mediaField: modalMediaField,
    sample: sample.sample,
    urls: fos.getNormalizedUrls(sample.urls),
  });

  if (
    selectedMedia.nativeLookerType === null ||
    selectedMedia.nativeLookerType === "video" ||
    selectedMedia.isDirect3dSample
  ) {
    return null;
  }

  return <AnnotationTopBar sample={sample} />;
};

export const ModalSample = React.memo(() => {
  const isGroup = useRecoilValue(fos.isGroup);
  const is3DMediaType = useRecoilValue(fos.is3DDataset);
  const setIsTooltipLocked = useSetRecoilState(fos.isTooltipLocked);
  const setTooltipDetail = useSetRecoilState(fos.tooltipDetail);

  useEffect(() => {
    // reset tooltip state when modal is closed
    setIsTooltipLocked(false);

    return () => {
      setTooltipDetail(null);
    };
  }, []);

  return (
    <Root>
      <Suspense fallback={null}>
        <ImageTopBar />
      </Suspense>
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
    </Root>
  );
});

/** Routes a resolved non-group modal sample to its 2D or 3D surface. */
export const NonGroupModalSample = ({
  is3DMediaType,
}: {
  is3DMediaType: boolean;
}) => {
  const { sample } = useRetainedModalSample();
  const modalMediaField = useRecoilValue(fos.selectedMediaField(true));
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
