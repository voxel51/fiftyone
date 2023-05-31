import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import * as fos from "@fiftyone/state";
import { PreloadedQuery } from "react-relay";
import styled from "styled-components";
import { GroupSuspense } from "../../../../GroupSuspense";
import {
  useDynamicGroupPaginatedSamples,
  useDynamicGroupSamplesStoreMap,
} from "../../../../useDynamicGroupPaginatedSamples";

const Container = styled.div`
  width: 100%;
  height: 100%;
`;

const DEFAULT_FRAME_RATE = 10;

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

  const dynamicGroupSamplesStoreMap = useDynamicGroupSamplesStoreMap(queryRef);

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

  const stopPlayback = useCallback(() => {
    setIsPlaying(false);

    if (animationFrameIdRef.current) {
      cancelAnimationFrame(animationFrameIdRef.current);
    }
  }, [setIsPlaying]);

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
            stopPlayback();
            return;
          } else {
            frameIndexRef.current = frameIndexRef.current + 1;
          }
        }

        animationFrameIdRef.current = requestAnimationFrame(draw);
      };

      animationFrameIdRef.current = requestAnimationFrame(draw);
    },
    [dynamicGroupSamplesStoreMap, stopPlayback, frameDuration]
  );

  const startPlayback = useCallback(async () => {
    const ctx = canvasRef.current?.getContext("2d");

    if (!ctx) {
      return;
    }

    setIsPlaying(true);

    ctx.canvas.width = canvasRef.current?.parentElement?.clientWidth!;
    ctx.canvas.height =
      canvasRef.current?.parentElement?.clientWidth! /
      dynamicGroupSamplesStoreMap.get(0)?.aspectRatio!;

    const images = await preloadImages(dynamicGroupSamplesStoreMap);

    drawFrameWrapper(ctx, images);
  }, [setIsPlaying, drawFrameWrapper, dynamicGroupSamplesStoreMap]);

  useEffect(() => {
    if (dynamicGroupSamplesStoreMap.size === 0) {
      return;
    }

    if (animationFrameIdRef.current === -1) {
      startPlayback();
    }

    return () => {
      stopPlayback();
    };
  }, [startPlayback, stopPlayback, dynamicGroupSamplesStoreMap]);

  const handlePlayPause = useCallback(() => {
    if (frameIndexRef.current === dynamicGroupSamplesStoreMap.size - 1) {
      frameIndexRef.current = 0;
      previousTimeRef.current = 0;
    }

    if (isPlaying) {
      console.log("stopping playback");
      stopPlayback();
    } else {
      console.log("starting playback");
      startPlayback();
    }
  }, [startPlayback, stopPlayback, isPlaying, dynamicGroupSamplesStoreMap]);

  useEffect(() => {
    console.log("playback isplaying is ", isPlaying);
  }, [isPlaying]);

  return (
    <Container>
      <div>
        Current Frame: {frameIndexRef.current + 1} out of{" "}
        {dynamicGroupSamplesStoreMap.size}
      </div>
      <div>
        <button style={{ backgroundColor: "red" }} onClick={handlePlayPause}>
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
