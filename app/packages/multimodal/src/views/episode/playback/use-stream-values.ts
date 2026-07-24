import {
  useStreamValue,
  useStreamValueSelector,
  useStreamValues,
  useStreamValuesSelector,
} from "@fiftyone/playback";
import { useEffect, useMemo, useRef, useState } from "react";
import { useDataStream, type DataStream } from "./data-stream-context";
import type { StreamSubscriptionOptions } from "../../../runtime";
import type {
  PointCloudRenderChannelPayload,
  PointCloudRenderPayload,
  PointCloudVisualization,
} from "../../../ir";
import { CANONICAL_POINT_CLOUD_SCALAR_COLOR_FIELDS } from "../../../visualization/scene-3d/point-cloud-color-policy";
import { normalizeIdentifierName } from "../../../visualization/scene-3d/utils";

/** One committed stream value plus its content and placement timestamps. */
export interface StreamPlaybackFrame<T = unknown> {
  readonly ageNs: bigint;
  readonly contentTimeNs: bigint;
  readonly frame: T;
  readonly requestedTimeNs: bigint;
}

/** Content identity without tick-relative placement metadata. */
export interface StreamContentFrame<T = unknown> {
  readonly contentTimeNs: bigint;
  readonly frame: T;
}

/**
 * Tile-side hook: subscribes to one episode stream and returns its current frame.
 *
 * Calling this hook tells the data stream that the stream has an active
 * consumer. The data stream includes it in batch fetches and excludes it
 * when the tile is closed (subscriber count drops to zero).
 *
 * Uses `useStreamValue` rather than `useStream` because activation is
 * per-stream through the data stream — all streams ride one engine-level
 * stream that stays subscribed for the modal's lifetime.
 *
 * Returns `null` until the first frame is committed for this stream.
 */
export function usePlaybackStreamValue<T = unknown>(stream: string): T | null {
  const dataStream = useDataStream();
  useStreamSubscription(stream, dataStream);
  const frame = useStreamValueSelector<StreamPlaybackFrame<T>, T | null>(
    stream,
    selectFrame,
  );
  return dataStream ? frame : null;
}

/**
 * Content-only playback frame for surfaces that need message identity but not
 * tick-relative age or placement time. Metadata-only stream commits do not
 * re-render the consumer.
 */
export function useStreamContentFrame<T = unknown>(
  stream: string,
): StreamContentFrame<T> | null {
  const dataStream = useDataStream();
  useStreamSubscription(stream, dataStream);
  const frame = useStreamValueSelector<
    StreamPlaybackFrame<T>,
    StreamContentFrame<T> | null
  >(stream, selectContentFrame, equalContentFrames);
  return dataStream ? frame : null;
}

/** Subscribes to one stream and returns its full placement-aware frame. */
export function useStreamPlaybackFrame<T = unknown>(
  stream: string,
): StreamPlaybackFrame<T> | null {
  const dataStream = useDataStream();
  useStreamSubscription(stream, dataStream);

  const value = useStreamValue<StreamPlaybackFrame<T> | null>(stream);
  return dataStream ? value : null;
}

/**
 * Tile-side hook: subscribes to several episode streams at once and returns
 * their current frames, index-aligned with `streams`. Used by tiles that
 * compose multiple sources into one view (e.g. the 3D tile fusing every
 * selected point cloud).
 *
 * Subscriptions are diffed, not torn down wholesale: deselecting one
 * stream must not drop the others' subscriber counts, since a stream
 * cache flushes itself when its last subscriber leaves.
 *
 * Pass a referentially stable array — a new identity re-derives the
 * combined atom and re-diffs the subscriptions.
 */
export function usePlaybackStreamValues<T = unknown>(
  streams: readonly string[],
): readonly (T | null)[] {
  const dataStream = useDataStream();
  const values = useStreamValuesSelector<StreamPlaybackFrame<T>, T | null>(
    streams,
    selectFrame,
  );
  useStreamSubscriptions(streams, dataStream);
  // Only the fallback's length matters; stream identity is intentionally
  // excluded so unavailable-stream renders keep the same array instance.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const emptyValues = useMemo(() => streams.map(() => null), [streams.length]);
  return dataStream ? values : emptyValues;
}

/**
 * Subscribes to several streams and returns their placement-aware frames,
 * index-aligned with `streams`.
 */
export function useStreamPlaybackFrames<T = unknown>(
  streams: readonly string[],
  subscriptionOptions?: readonly (StreamSubscriptionOptions | undefined)[],
): readonly (StreamPlaybackFrame<T> | null)[] {
  const dataStream = useDataStream();
  const values = useStreamValues<StreamPlaybackFrame<T> | null>(streams);
  // Only the fallback's length matters; stream identity is intentionally
  // excluded so unavailable-stream renders keep the same array instance.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const emptyValues = useMemo(() => streams.map(() => null), [streams.length]);
  useStreamSubscriptions(streams, dataStream, subscriptionOptions);

  return dataStream ? values : emptyValues;
}

/**
 * Point-cloud specialization that swaps worker-projected color data over the
 * current immutable geometry payload. Channel changes never rebuild XYZ.
 */
export function usePointCloudPlaybackFrames(
  streams: readonly string[],
  colorBy: readonly string[],
): readonly (StreamPlaybackFrame<PointCloudVisualization> | null)[] {
  const subscriptionOptions = useMemo(
    () =>
      streams.map((_, index) => ({
        pointCloudColorBy: colorBy[index] ?? "auto",
      })),
    [colorBy, streams],
  );
  const frames = useStreamPlaybackFrames<PointCloudVisualization>(
    streams,
    subscriptionOptions,
  );
  const dataStream = useDataStream();
  const [channels, setChannels] = useState<
    ReadonlyMap<string, PointCloudRenderChannelPayload>
  >(() => new Map());
  const colorSignature = colorBy.join("|");

  // This effect projects a missing color channel for each committed geometry
  // frame and caches the replacement independently from playback ownership.
  useEffect(() => {
    const readPointCloudChannel = dataStream?.readPointCloudChannel;
    if (!readPointCloudChannel) return undefined;
    let cancelled = false;
    frames.forEach((playbackFrame, index) => {
      const payload = playbackFrame?.frame.renderPayload;
      const activeColorBy = colorBy[index] ?? "auto";
      const stream = streams[index];
      if (
        !playbackFrame ||
        !payload ||
        !stream ||
        pointCloudPayloadHasActiveChannel(payload, activeColorBy)
      ) {
        return;
      }
      const samplePlanKey = payload.samplePlanKey;
      if (!samplePlanKey) return;
      const key = pointCloudChannelKey(
        dataStream.sourceKey,
        stream,
        playbackFrame.contentTimeNs,
        samplePlanKey,
        activeColorBy,
      );
      if (channels.has(key)) return;

      void readPointCloudChannel({
        activeColorBy,
        capacity: payload.capacity,
        sampledPointCount: payload.sampledPointCount,
        samplePlanKey,
        sourceIndices: payload.sourceIndices,
        stream,
        timestampNs: playbackFrame.contentTimeNs,
      })
        .then((channel) => {
          if (cancelled || channel.samplePlanKey !== samplePlanKey) return;
          setChannels((current) => {
            if (current.get(key) === channel) return current;
            const next = new Map(current);
            next.set(key, channel);
            while (next.size > 64) {
              const oldest = next.keys().next().value;
              if (oldest === undefined) break;
              next.delete(oldest);
            }
            return next;
          });
        })
        .catch(() => undefined);
    });
    return () => {
      cancelled = true;
    };
    // colorSignature captures the supported option content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channels, colorSignature, dataStream, frames, streams]);

  return useMemo(
    () =>
      frames.map((playbackFrame, index) => {
        const payload = playbackFrame?.frame.renderPayload;
        const samplePlanKey = payload?.samplePlanKey;
        const stream = streams[index];
        const activeColorBy = colorBy[index] ?? "auto";
        if (!playbackFrame || !payload || !samplePlanKey || !stream) {
          return playbackFrame;
        }
        const channel = channels.get(
          pointCloudChannelKey(
            dataStream?.sourceKey ?? "",
            stream,
            playbackFrame.contentTimeNs,
            samplePlanKey,
            activeColorBy,
          ),
        );
        if (!channel) return playbackFrame;
        return {
          ...playbackFrame,
          frame: applyPointCloudRenderChannel(playbackFrame.frame, channel),
        };
      }),
    [channels, colorBy, dataStream?.sourceKey, frames, streams],
  );
}

function useStreamSubscription(
  stream: string,
  dataStream: DataStream | null,
): void {
  // This effect owns the active-consumer lease for one stream.
  useEffect(() => {
    if (!stream || !dataStream) return undefined;
    return dataStream.subscribeToStream(stream);
  }, [dataStream, stream]);
}

function useStreamSubscriptions(
  streams: readonly string[],
  dataStream: DataStream | null,
  options?: readonly (StreamSubscriptionOptions | undefined)[],
): void {
  const subscriptionsRef = useRef<
    Map<string, { readonly key: string; readonly unsubscribe: () => void }>
  >(new Map());
  const streamRef = useRef<DataStream | null>(null);
  const optionsSignature = streams
    .map(
      (stream, index) =>
        `${stream}:${options?.[index]?.pointCloudColorBy ?? ""}`,
    )
    .join("|");

  // This effect diffs stream leases and resets them when the stream changes.
  useEffect(() => {
    const subscriptions = subscriptionsRef.current;

    if (streamRef.current !== dataStream) {
      for (const subscription of subscriptions.values()) {
        subscription.unsubscribe();
      }
      subscriptions.clear();
      streamRef.current = dataStream;
    }
    if (!dataStream) return;

    const streamSet = new Set(streams);
    for (const [stream, subscription] of subscriptions) {
      const index = streams.indexOf(stream);
      const key = streamSubscriptionOptionsKey(options?.[index]);
      if (!streamSet.has(stream) || subscription.key !== key) {
        subscription.unsubscribe();
        subscriptions.delete(stream);
      }
    }
    for (let index = 0; index < streams.length; index++) {
      const stream = streams[index];
      if (stream && !subscriptions.has(stream)) {
        const streamOptions = options?.[index];
        subscriptions.set(stream, {
          key: streamSubscriptionOptionsKey(streamOptions),
          unsubscribe: dataStream.subscribeToStream(stream, streamOptions),
        });
      }
    }
    // optionsSignature captures the supported option content without requiring
    // callers to memoize their small descriptor arrays.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataStream, optionsSignature, streams]);

  // This effect releases every remaining stream lease on unmount.
  useEffect(
    () => () => {
      for (const subscription of subscriptionsRef.current.values()) {
        subscription.unsubscribe();
      }
      subscriptionsRef.current.clear();
    },
    [],
  );
}

function streamSubscriptionOptionsKey(
  options: StreamSubscriptionOptions | undefined,
): string {
  return options?.pointCloudColorBy ?? "";
}

const CANONICAL_AUTO_SCALAR_FIELDS = new Set<string>(
  CANONICAL_POINT_CLOUD_SCALAR_COLOR_FIELDS,
);

function pointCloudPayloadHasActiveChannel(
  payload: PointCloudRenderPayload,
  colorBy: string,
): boolean {
  const normalized = normalizeIdentifierName(colorBy);
  if (normalized === "height" || normalized === "uniform") return true;
  if (normalized === "rgb") return payload.colors !== undefined;
  if (normalized === "auto") {
    return (
      payload.colors !== undefined ||
      payload.scalarFields.some((field) =>
        CANONICAL_AUTO_SCALAR_FIELDS.has(normalizeIdentifierName(field.name)),
      )
    );
  }
  return payload.scalarFields.some(
    (field) => normalizeIdentifierName(field.name) === normalized,
  );
}

function pointCloudChannelKey(
  sourceKey: string,
  stream: string,
  contentTimeNs: bigint,
  samplePlanKey: string,
  activeColorBy: string,
): string {
  return [sourceKey, stream, contentTimeNs, samplePlanKey, activeColorBy].join(
    "\0",
  );
}

/** Replaces color data only when it belongs to the frame's geometry plan. */
export function applyPointCloudRenderChannel(
  frame: PointCloudVisualization,
  channel: PointCloudRenderChannelPayload,
): PointCloudVisualization {
  const payload = frame.renderPayload;
  if (!payload || payload.samplePlanKey !== channel.samplePlanKey) return frame;
  const colors = channel.kind === "rgb" ? channel.colors : undefined;
  const scalarFields = channel.kind === "scalar" ? [channel.scalarField] : [];
  const componentCount = payload.sampledPointCount * 3;
  const {
    colors: _previousFrameColors,
    scalarFields: _previousFrameScalarFields,
    ...frameWithoutChannel
  } = frame;
  const { colors: _previousPayloadColors, ...payloadWithoutChannel } = payload;
  return {
    ...frameWithoutChannel,
    ...(colors ? { colors: colors.subarray(0, componentCount) } : {}),
    renderPayload: {
      ...payloadWithoutChannel,
      ...(colors ? { colors } : {}),
      scalarFields,
    },
    scalarFields: scalarFields.map((field) => ({
      name: field.name,
      values: field.values.subarray(0, payload.sampledPointCount),
    })),
  };
}

function selectFrame<T>(value: StreamPlaybackFrame<T> | null): T | null {
  return value?.frame ?? null;
}

function selectContentFrame<T>(
  value: StreamPlaybackFrame<T> | null,
): StreamContentFrame<T> | null {
  return value
    ? { contentTimeNs: value.contentTimeNs, frame: value.frame }
    : null;
}

function equalContentFrames<T>(
  left: StreamContentFrame<T> | null,
  right: StreamContentFrame<T> | null,
): boolean {
  return (
    left === right ||
    (!!left &&
      !!right &&
      left.contentTimeNs === right.contentTimeNs &&
      left.frame === right.frame)
  );
}
