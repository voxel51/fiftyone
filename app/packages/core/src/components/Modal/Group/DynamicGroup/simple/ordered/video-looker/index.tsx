import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import * as foq from "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import { PreloadedQuery, usePreloadedQuery } from "react-relay";
import { useRecoilState, useRecoilValue } from "recoil";
import styled from "styled-components";
import { useGroupContext } from "../../../../GroupContextProvider";
import { GroupSuspense } from "../../../../GroupSuspense";
import { useDynamicGroupPaginatedSamples } from "../../../../useDynamicGroupPaginatedSamples";

const Container = styled.div`
  width: 100%;
  height: 100%;
`;

const DEFAULT_FRAME_RATE = 3;

const VideoLookerImpl: React.FC<{
  queryRef: PreloadedQuery<any>;
  loadDynamicGroupSamples: (cursor?: number) => Promise<void>;
}> = React.memo(({ queryRef, loadDynamicGroupSamples }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previousTimeRef = useRef<number>(0);
  const animationFrameIdRef = useRef<number>();

  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [frameRate, setFrameRate] = useState(DEFAULT_FRAME_RATE);
  const [isPlaying, setIsPlaying] = useState(true);

  const { groupBy, orderBy } = useRecoilValue(fos.dynamicGroupParameters)!;
  const { groupByFieldValue } = useGroupContext();

  const atomFamilyKey = `${groupBy}-${orderBy}-${groupByFieldValue!}`;

  const [dynamicGroupSamplesStoreMap, setDynamicGroupSamplesStoreMap] =
    useRecoilState(fos.dynamicGroupSamplesStoreMap(atomFamilyKey));

  // fetch a bunch of frames
  const data = usePreloadedQuery<foq.paginateDynamicGroupSamplesQuery>(
    foq.paginateDynamicGroupSamples,
    queryRef
  );

  /**
   * This effect is responsible for parsing gql response into a sample map
   */
  useEffect(() => {
    if (!data?.samples?.edges?.length) {
      return;
    }

    setDynamicGroupSamplesStoreMap((prev) => {
      const newMap = new Map(prev);

      for (const { cursor, node } of data.samples.edges) {
        newMap.set(Number(cursor), node as unknown as fos.SampleData);
      }

      return newMap;
    });
  }, [data, setDynamicGroupSamplesStoreMap]);

  const frameDuration = useMemo(() => 1000 / frameRate, [frameRate]);

  const drawFrameWrapper = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      const draw = (timestamp: number) => {
        const elapsedTime = timestamp - previousTimeRef.current;

        if (elapsedTime > frameDuration) {
          previousTimeRef.current = timestamp;

          const sample = dynamicGroupSamplesStoreMap.get(currentFrameIndex);
          const img = new Image();
          // todo: transform to url immediately after fetching, not here
          img.src = fos.getSampleSrc(sample?.urls[0].url);
          img.onload = () => {
            const canvasAspectRatio = ctx.canvas.width / ctx.canvas.height;
            const imageAspectRatio = img.width / img.height;
            let scaleFactor = 1;

            if (imageAspectRatio < canvasAspectRatio) {
              // fit image width to canvas width
              scaleFactor = ctx.canvas.width / img.width;
            } else {
              // fit image height to canvas height
              scaleFactor = ctx.canvas.height / img.height;
            }

            const scaledWidth = img.width * scaleFactor;
            const scaledHeight = img.height * scaleFactor;
            const x = (ctx.canvas.width - scaledWidth) / 2; // center the image horizontally
            const y = (ctx.canvas.height - scaledHeight) / 2; // center the image vertically

            ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
            ctx.drawImage(img, x, y, scaledWidth, scaledHeight);
          };

          // todo: if loop is on, modulo, or else stop animation
          if (currentFrameIndex === dynamicGroupSamplesStoreMap.size - 1) {
            setIsPlaying(false);
            setCurrentFrameIndex(0);
            previousTimeRef.current = 0;
          } else {
            setCurrentFrameIndex((prevFrameIndex) => prevFrameIndex + 1);
          }
        }

        if (isPlaying) {
          animationFrameIdRef.current = requestAnimationFrame(draw);
        }
      };

      animationFrameIdRef.current = requestAnimationFrame(draw);
    },
    [dynamicGroupSamplesStoreMap, currentFrameIndex, isPlaying, frameDuration]
  );

  useLayoutEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");

    if (!ctx || dynamicGroupSamplesStoreMap.size === 0) {
      return;
    }

    ctx.canvas.width = canvasRef.current?.parentElement?.clientWidth;
    ctx.canvas.height =
      canvasRef.current?.parentElement?.clientWidth /
      dynamicGroupSamplesStoreMap.get(currentFrameIndex)?.aspectRatio;

    if (isPlaying) {
      drawFrameWrapper(ctx);
    }

    return () => {
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }
    };
  }, [drawFrameWrapper, isPlaying]);

  const handlePlayPause = useCallback(() => {
    if (currentFrameIndex === dynamicGroupSamplesStoreMap.size - 1) {
      setCurrentFrameIndex(0);
    }
    setIsPlaying((prev) => !prev);
  }, [currentFrameIndex, dynamicGroupSamplesStoreMap]);

  return (
    <Container>
      <div>
        Current Frame: {currentFrameIndex} out of{" "}
        {dynamicGroupSamplesStoreMap.size}
      </div>
      <div>
        <button onClick={handlePlayPause}>
          {isPlaying ? "Pause" : "Play"}
        </button>
      </div>
      <canvas ref={canvasRef} />
    </Container>
  );
});

export const VideoLooker = () => {
  const [queryRef, loadPaginatedSamples] = useDynamicGroupPaginatedSamples();

  if (queryRef) {
    return (
      <GroupSuspense>
        <VideoLookerImpl
          loadDynamicGroupSamples={loadPaginatedSamples}
          queryRef={queryRef}
        />
      </GroupSuspense>
    );
  }

  return null;
};
