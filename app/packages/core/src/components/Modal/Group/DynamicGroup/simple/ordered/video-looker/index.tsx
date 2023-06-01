import React, {
  startTransition,
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

const DEFAULT_FRAME_RATE = 30;

const FETCH_BATCH_SIZE = 50;

const VideoLookerImpl: React.FC<{
  queryRef: PreloadedQuery<any>;
  loadDynamicGroupSamples: (cursor?: number) => Promise<void>;
}> = React.memo(({ queryRef, loadDynamicGroupSamples }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previousTimeRef = useRef<number>(0);
  const animationFrameIdRef = useRef<number>(-1);
  const frameIndexRef = useRef<number>(0);

  const [frameRate, setFrameRate] = useState(DEFAULT_FRAME_RATE);
  const [seekValue, setSeekValue] = useState(0);
  const [totalSamples, setTotalSamples] = useState(120);
  const [isPlaying, setIsPlaying] = useState(false);

  const [isLoadingSamples, setIsLoadingSamples] = useState(false);

  const dynamicGroupSamplesStoreMap = useDynamicGroupSamplesStoreMap(queryRef);

  const preloadedImagesRef = useRef<HTMLImageElement[]>([]);

  const frameDuration = useMemo(() => 1000 / frameRate, [frameRate]);

  const setSample = fos.useSetExpandedSample(false);

  const preloadImages = useCallback(async (sampleMap) => {
    const imagePromises: Promise<HTMLImageElement>[] = Array.from(
      sampleMap.values()
    ).map(async (sample) => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.src = fos.getSampleSrc(sample?.urls[0].url);

        img.onload = () => resolve(img);
        img.onerror = reject;
      });
    });

    //   try {
    //     await img.decode();
    //   } catch (e) {
    //     console.log("error decoding ", img.src, e);
    //   }
    //   return img;
    // });

    try {
      const images = await Promise.all(imagePromises);
      preloadedImagesRef.current = images;
    } catch (e) {
      console.log("error decoding ", e);
    }
  }, []);

  useEffect(() => {
    preloadImages(dynamicGroupSamplesStoreMap);
  }, [preloadImages, dynamicGroupSamplesStoreMap]);

  const prefetchImages = useCallback(
    async (fromCursor: number) => {
      if (
        isLoadingSamples ||
        fromCursor < 0 ||
        fromCursor >= totalSamples - 1
      ) {
        return;
      }

      setIsLoadingSamples(true);
      const hasNext =
        dynamicGroupSamplesStoreMap.size < totalSamples &&
        fromCursor < totalSamples;
      if (hasNext) {
        console.log("prefetch some more samples from cursor", fromCursor);
        await loadDynamicGroupSamples(fromCursor);
      }

      setIsLoadingSamples(false);
    },
    [
      isLoadingSamples,
      setIsLoadingSamples,
      dynamicGroupSamplesStoreMap,
      loadDynamicGroupSamples,
      totalSamples,
    ]
  );

  const updateSample = useCallback(() => {
    const maybeSample = dynamicGroupSamplesStoreMap.get(frameIndexRef.current);

    if (maybeSample?.sample) {
      setSample(maybeSample);
    }
  }, [setSample, dynamicGroupSamplesStoreMap]);

  const stopPlayback = useCallback(() => {
    setIsPlaying(false);

    if (animationFrameIdRef.current) {
      cancelAnimationFrame(animationFrameIdRef.current);
    }
  }, []);

  const drawFrameWrapper = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      const draw = (timestamp: number) => {
        const elapsedTime = timestamp - previousTimeRef.current;

        if (elapsedTime > frameDuration) {
          previousTimeRef.current = timestamp;

          const img = preloadedImagesRef.current[frameIndexRef.current];

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

          if (frameIndexRef.current === totalSamples - 1) {
            stopPlayback();
            return;
          } else {
            frameIndexRef.current = frameIndexRef.current + 1;
            startTransition(() => {
              updateSample();
            });
          }
        }

        if (
          !isLoadingSamples &&
          frameIndexRef.current >=
            preloadedImagesRef.current.length - FETCH_BATCH_SIZE / 2
        ) {
          prefetchImages(preloadedImagesRef.current.length - 1);
        }

        animationFrameIdRef.current = requestAnimationFrame(draw);
      };

      animationFrameIdRef.current = requestAnimationFrame(draw);
    },
    [
      updateSample,
      stopPlayback,
      isLoadingSamples,
      prefetchImages,
      frameDuration,
      totalSamples,
    ]
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

    drawFrameWrapper(ctx);
  }, [setIsPlaying, drawFrameWrapper, dynamicGroupSamplesStoreMap]);

  useEffect(() => {
    if (dynamicGroupSamplesStoreMap.size === 0) {
      return;
    }

    if (animationFrameIdRef.current === -1) {
      startPlayback();
    }
  }, [startPlayback, stopPlayback, dynamicGroupSamplesStoreMap]);

  /**
   * This effect is used to stop the playback when the component unmounts.
   */
  useEffect(() => {
    return () => {
      stopPlayback();
    };
  }, [stopPlayback]);

  const handlePlayPause = useCallback(() => {
    if (frameIndexRef.current === dynamicGroupSamplesStoreMap.size - 1) {
      frameIndexRef.current = 0;
      previousTimeRef.current = 0;
    }

    if (isPlaying) {
      stopPlayback();
    } else {
      startPlayback();
    }
  }, [startPlayback, stopPlayback, isPlaying, dynamicGroupSamplesStoreMap]);

  /**
   * this effect is used to sync refs with state, where relevant
   */
  useEffect(() => {
    const intervalId = setInterval(() => {
      setSeekValue(frameIndexRef.current);
    }, 100);

    return () => {
      clearInterval(intervalId);
    };
  }, []);

  const handleSeekChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      stopPlayback();
      const newValue = parseInt(e.target.value);
      frameIndexRef.current = newValue;
      setSeekValue(newValue);

      if (
        !isLoadingSamples &&
        newValue >= dynamicGroupSamplesStoreMap.size - FETCH_BATCH_SIZE / 2 &&
        dynamicGroupSamplesStoreMap.size < totalSamples
      ) {
        prefetchImages(newValue - FETCH_BATCH_SIZE / 2);
      }
    },
    [
      stopPlayback,
      isLoadingSamples,
      dynamicGroupSamplesStoreMap,
      prefetchImages,
      totalSamples,
    ]
  );

  return (
    <Container>
      <div>
        <span>
          current frame index: {frameIndexRef.current + 1} / {totalSamples}
        </span>
        {isLoadingSamples && <span>loading more...</span>}
        <button style={{ backgroundColor: "red" }} onClick={handlePlayPause}>
          {isPlaying ? "Pause" : "Play"}
        </button>
      </div>
      <canvas ref={canvasRef} />
    </Container>
  );
});

export const VideoLooker = () => {
  const [queryRef, loadPaginatedSamples] =
    useDynamicGroupPaginatedSamples(FETCH_BATCH_SIZE);

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
