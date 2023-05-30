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

const DEFAULT_FRAME_RATE = 30;

const VideoLookerImpl: React.FC<{
  queryRef: PreloadedQuery<any>;
  loadDynamicGroupSamples: (cursor?: number) => Promise<void>;
}> = React.memo(({ queryRef, loadDynamicGroupSamples }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previousTimeRef = useRef<number>(0);
  const animationFrameIdRef = useRef<number>(-1);
  const frameIndexRef = useRef<number>(0);

  const [frameRate, setFrameRate] = useState(DEFAULT_FRAME_RATE);
  const [isPlaying, setIsPlaying] = useState(false);

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

  const preloadImages = async (sampleMap) => {
    const imagePromises = Array.from(sampleMap.values()).map(async (sample) => {
      const img = new Image();
      img.src = fos.getSampleSrc(sample?.urls[0].url);
      await img.decode();
      return img;
    });

    const images = await Promise.all(imagePromises);
    return images;
  };

  const drawFrameWrapper = useCallback(
    (ctx: CanvasRenderingContext2D, images: HTMLImageElement[]) => {
      const draw = (timestamp: number) => {
        const elapsedTime = timestamp - previousTimeRef.current;

        if (elapsedTime > frameDuration) {
          previousTimeRef.current = timestamp;

          const img = images[frameIndexRef.current];

          if (img) {
            const canvasAspectRatio = ctx.canvas.width / ctx.canvas.height;
            const imageAspectRatio = img.width / img.height;
            let scaleFactor = 1;

            if (imageAspectRatio < canvasAspectRatio) {
              scaleFactor = ctx.canvas.width / img.width;
            } else {
              scaleFactor = ctx.canvas.height / img.height;
            }

            const scaledWidth = img.width * scaleFactor;
            const scaledHeight = img.height * scaleFactor;
            const x = (ctx.canvas.width - scaledWidth) / 2;
            const y = (ctx.canvas.height - scaledHeight) / 2;

            ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
            ctx.drawImage(img, x, y, scaledWidth, scaledHeight);
          }

          if (frameIndexRef.current === dynamicGroupSamplesStoreMap.size - 1) {
            setIsPlaying(false);
            previousTimeRef.current = 0;
          } else {
            frameIndexRef.current = frameIndexRef.current + 1;
          }
        }

        animationFrameIdRef.current = requestAnimationFrame(draw);
      };

      animationFrameIdRef.current = requestAnimationFrame(draw);
    },
    [dynamicGroupSamplesStoreMap, frameDuration]
  );

  const startPlayback = useCallback(
    async (ctx: CanvasRenderingContext2D) => {
      setIsPlaying(true);

      ctx.canvas.width = canvasRef.current?.parentElement?.clientWidth!;
      ctx.canvas.height =
        canvasRef.current?.parentElement?.clientWidth! /
        dynamicGroupSamplesStoreMap.get(0)?.aspectRatio!;

      const images = await preloadImages(dynamicGroupSamplesStoreMap);

      drawFrameWrapper(ctx, images);
    },
    [drawFrameWrapper, dynamicGroupSamplesStoreMap]
  );

  const stopPlayback = useCallback(() => {
    setIsPlaying(false);

    if (animationFrameIdRef.current) {
      cancelAnimationFrame(animationFrameIdRef.current);
    }
  }, []);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");

    if (!ctx || dynamicGroupSamplesStoreMap.size === 0) {
      return;
    }

    if (animationFrameIdRef.current === -1) {
      startPlayback(ctx);
    }

    return () => {
      stopPlayback();
    };
  }, [
    drawFrameWrapper,
    startPlayback,
    stopPlayback,
    dynamicGroupSamplesStoreMap,
    isPlaying,
  ]);

  const handlePlayPause = useCallback(() => {
    if (frameIndexRef.current === dynamicGroupSamplesStoreMap.size - 1) {
      frameIndexRef.current = 0;
      previousTimeRef.current = 0;
    }

    if (isPlaying) {
      stopPlayback();
    } else {
      startPlayback(canvasRef.current?.getContext("2d")!);
    }
  }, [startPlayback, stopPlayback, isPlaying, dynamicGroupSamplesStoreMap]);

  return (
    <Container>
      <div>
        Current Frame: {frameIndexRef.current + 1} out of{" "}
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
