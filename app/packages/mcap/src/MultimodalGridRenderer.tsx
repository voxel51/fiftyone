import type { SampleRendererProps } from "@fiftyone/plugins";
import {
  Align,
  BackgroundColor,
  Card,
  CardBackground,
  Heading,
  HeadingLevel,
  Justify,
  Orientation,
  Pill,
  Size,
  Spinner,
  Spacing,
  Stack,
  Text,
  TextColor,
  TextVariant,
} from "@voxel51/voodo";
import React from "react";
import { fetchMultimodalBuffer } from "./api";
import { MultimodalImageBufferCache } from "./image-buffer-cache";
import {
  formatMultimodalDuration,
  formatMultimodalFileSize,
  getMultimodalGridPreviewStream,
} from "./scene-view-model";
import {
  getMultimodalRendererInfo,
  getMultimodalSceneParams,
} from "./renderer-utils";
import { useMultimodalWorkspace } from "./useMultimodalWorkspace";

const PREVIEW_FRAME_INTERVAL_MS = 250;
const PREVIEW_FETCH_WINDOW_NS = 3_000_000_000;
const PREVIEW_MAX_FRAMES = 12;

const ROOT_STYLES: React.CSSProperties = {
  width: "100%",
  height: "100%",
};

const CARD_STYLES: React.CSSProperties = {
  position: "relative",
  width: "100%",
  height: "100%",
  padding: "12px",
  borderRadius: "8px",
  overflow: "hidden",
};

const PREVIEW_LAYER_STYLES: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
};

const PREVIEW_IMAGE_STYLES: React.CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
};

const PREVIEW_SCRIM_STYLES: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  background:
    "linear-gradient(180deg, rgba(12, 15, 19, 0.12), rgba(12, 15, 19, 0.78))",
};

const PREVIEW_LOADING_STYLES: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const CONTENT_STYLES: React.CSSProperties = {
  position: "relative",
  zIndex: 1,
  minWidth: 0,
  height: "100%",
};

const SUMMARY_STYLES: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  justifyContent: "flex-end",
};

const HEADER_STYLES: React.CSSProperties = {
  minWidth: 0,
};

const TITLE_STYLES: React.CSSProperties = {
  minWidth: 0,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const HERO_SUMMARY_STYLES: React.CSSProperties = {
  display: "grid",
  gap: "14px",
};

const HERO_STATS_GRID_STYLES: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "12px",
};

const HERO_STAT_STYLES: React.CSSProperties = {
  minWidth: 0,
};

const HERO_STAT_LABEL_STYLES: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 600,
  lineHeight: 1.2,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "rgba(255, 255, 255, 0.56)",
};

const HERO_STAT_VALUE_STYLES: React.CSSProperties = {
  marginTop: "6px",
  fontSize: "30px",
  fontWeight: 700,
  lineHeight: 0.95,
  letterSpacing: "-0.04em",
  color: "rgba(255, 255, 255, 0.96)",
};

const STREAM_COUNT_STYLES: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "baseline",
  gap: "8px",
};

const STREAM_COUNT_VALUE_STYLES: React.CSSProperties = {
  fontSize: "18px",
  fontWeight: 700,
  lineHeight: 1,
  color: "rgba(255, 255, 255, 0.96)",
};

const STREAM_COUNT_LABEL_STYLES: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 600,
  lineHeight: 1.2,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "rgba(255, 255, 255, 0.56)",
};

const PREVIEW_SUMMARY_STYLES: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
  alignSelf: "flex-start",
  padding: "6px 10px",
  borderRadius: "999px",
  background: "rgba(10, 12, 15, 0.58)",
  border: "1px solid rgba(255, 255, 255, 0.1)",
  backdropFilter: "blur(8px)",
};

const PREVIEW_SUMMARY_VALUE_STYLES: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 600,
  lineHeight: 1,
  letterSpacing: "0.03em",
  color: "rgba(255, 255, 255, 0.95)",
};

const PREVIEW_SUMMARY_SEPARATOR_STYLES: React.CSSProperties = {
  fontSize: "11px",
  lineHeight: 1,
  color: "rgba(255, 255, 255, 0.42)",
};

function normalizePreviewError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error));
}

function useMultimodalGridHoverPreview(
  catalog: ReturnType<typeof useMultimodalWorkspace>["catalog"],
  isHovered: boolean
) {
  const previewStream = React.useMemo(() => {
    return getMultimodalGridPreviewStream(catalog);
  }, [catalog]);
  const previewKey = React.useMemo(() => {
    if (!catalog || !previewStream) {
      return "";
    }

    return [
      catalog.sceneId,
      previewStream.streamId,
      previewStream.timeRange.startNs,
      previewStream.timeRange.endNs,
    ].join("::");
  }, [
    catalog?.sceneId,
    previewStream?.streamId,
    previewStream?.timeRange.endNs,
    previewStream?.timeRange.startNs,
  ]);
  const [frameSources, setFrameSources] = React.useState<string[]>([]);
  const [frameIndex, setFrameIndex] = React.useState(0);
  const [isPreviewLoading, setIsPreviewLoading] = React.useState(false);
  const [frameError, setFrameError] = React.useState<Error | null>(null);
  const cacheRef = React.useRef<MultimodalImageBufferCache | null>(null);

  React.useEffect(() => {
    return () => {
      cacheRef.current?.dispose();
      cacheRef.current = null;
    };
  }, []);

  React.useEffect(() => {
    cacheRef.current?.dispose();
    cacheRef.current = null;
    setFrameSources([]);
    setFrameIndex(0);
    setFrameError(null);
    setIsPreviewLoading(false);
  }, [previewKey]);

  React.useEffect(() => {
    if (isHovered) {
      return;
    }

    setIsPreviewLoading(false);
  }, [isHovered]);

  React.useEffect(() => {
    if (!catalog || !isHovered || !previewStream || frameSources.length) {
      return;
    }

    setFrameSources([]);
    setFrameIndex(0);
    setFrameError(null);

    const previewWindow = {
      startNs: previewStream.timeRange.startNs,
      endNs: Math.min(
        previewStream.timeRange.endNs,
        previewStream.timeRange.startNs + PREVIEW_FETCH_WINDOW_NS - 1
      ),
    };
    const cache = new MultimodalImageBufferCache({
      datasetId: catalog.datasetId,
      sampleId: catalog.sampleId,
      sceneId: catalog.sceneId,
      streamId: previewStream.streamId,
      schemaName: previewStream.schemaName,
      mediaField: catalog.mediaField,
      sourceKind: catalog.sourceKind,
      sceneRange: catalog.timeRange,
    });
    cacheRef.current?.dispose();
    cacheRef.current = cache;
    let isCurrent = true;

    setIsPreviewLoading(true);

    void fetchMultimodalBuffer({
      datasetId: catalog.datasetId,
      sampleId: catalog.sampleId,
      request: {
        mediaField: catalog.mediaField,
        sourceKind: catalog.sourceKind,
        streamIds: [previewStream.streamId],
        startTimeNs: previewWindow.startNs,
        endTimeNs: previewWindow.endNs,
        maxMessagesPerStream: PREVIEW_MAX_FRAMES,
      },
    })
      .then(async (response) => {
        const messages = response.streams[0]?.messages ?? [];
        if (!messages.length) {
          return [];
        }

        cache.primeMessages(messages, previewWindow);
        const decodedFrames = await Promise.allSettled(
          messages.map((message) => cache.decodeMessage(message))
        );

        return decodedFrames.flatMap((result) =>
          result.status === "fulfilled" ? [result.value] : []
        );
      })
      .then((decodedFrames) => {
        if (!isCurrent) {
          return;
        }

        setFrameSources(decodedFrames.map((frame) => frame.src));
        setFrameIndex(0);
        setFrameError(
          decodedFrames.length
            ? null
            : new Error("Hover preview frame unavailable")
        );
      })
      .catch((previewError) => {
        if (!isCurrent) {
          return;
        }

        setFrameSources([]);
        setFrameIndex(0);
        setFrameError(normalizePreviewError(previewError));
      })
      .finally(() => {
        if (!isCurrent) {
          return;
        }

        setIsPreviewLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [
    catalog?.datasetId,
    catalog?.mediaField,
    catalog?.sampleId,
    catalog?.sceneId,
    catalog?.sourceKind,
    catalog?.timeRange.endNs,
    catalog?.timeRange.startNs,
    isHovered,
    previewStream?.schemaName,
    previewStream?.streamId,
    previewStream?.timeRange.endNs,
    previewStream?.timeRange.startNs,
  ]);

  React.useEffect(() => {
    if (!isHovered || frameSources.length <= 1) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setFrameIndex((currentIndex) => (currentIndex + 1) % frameSources.length);
    }, PREVIEW_FRAME_INTERVAL_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [frameIndex, frameSources.length, isHovered]);

  return {
    frameSrc: frameSources[frameIndex] ?? null,
    isLoading:
      isHovered &&
      Boolean(previewStream) &&
      !frameSources.length &&
      isPreviewLoading,
    error: frameError,
  };
}

/** Compact grid renderer for multimodal samples. */
export const MultimodalGridRenderer = React.memo(
  ({ ctx }: SampleRendererProps) => {
    const info = getMultimodalRendererInfo(ctx);
    const params = React.useMemo(() => getMultimodalSceneParams(ctx), [ctx]);
    const { catalog, isLoading, error } = useMultimodalWorkspace(params);
    const [isHovered, setIsHovered] = React.useState(false);
    const hoverPreview = useMultimodalGridHoverPreview(catalog, isHovered);
    const formattedFileSize = React.useMemo(() => {
      return formatMultimodalFileSize(info.fileSizeBytes);
    }, [info.fileSizeBytes]);
    const formattedDuration = React.useMemo(() => {
      return catalog ? formatMultimodalDuration(catalog.timeRange) : "Unknown";
    }, [catalog]);
    const hasPreviewFrame = Boolean(hoverPreview.frameSrc);

    return (
      <div
        data-testid="multimodal-grid-renderer"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={ROOT_STYLES}
      >
        <Card background={CardBackground.Elevated} outlined style={CARD_STYLES}>
          {hoverPreview.frameSrc && (
            <div
              data-testid="multimodal-grid-preview-layer"
              style={PREVIEW_LAYER_STYLES}
            >
              <img
                alt="Multimodal hover preview"
                data-testid="multimodal-grid-hover-preview"
                src={hoverPreview.frameSrc}
                style={PREVIEW_IMAGE_STYLES}
              />
              <div style={PREVIEW_SCRIM_STYLES} />
            </div>
          )}

          {hoverPreview.isLoading && (
            <div
              data-testid="multimodal-grid-hover-preview-loading"
              style={PREVIEW_LOADING_STYLES}
            >
              <Spinner size={Size.Sm} />
            </div>
          )}

          <Stack
            orientation={Orientation.Column}
            spacing={Spacing.Md}
            justify={Justify.Between}
            style={CONTENT_STYLES}
          >
            {!hasPreviewFrame && (
              <Stack
                orientation={Orientation.Column}
                spacing={Spacing.Sm}
                style={HEADER_STYLES}
              >
                <Stack align={Align.Center} justify={Justify.Between}>
                  <Text
                    variant={TextVariant.Caption}
                    color={TextColor.Secondary}
                  >
                    {info.mediaExtension.toUpperCase()}
                  </Text>
                </Stack>
              </Stack>
            )}

            {isLoading && (
              <Stack
                data-testid="multimodal-grid-loading"
                orientation={Orientation.Column}
                spacing={Spacing.Sm}
              >
                <Spinner size={Size.Sm} />
                <Text variant={TextVariant.Sm} color={TextColor.Secondary}>
                  Loading workspace
                </Text>
              </Stack>
            )}

            {!isLoading && error && (
              <Stack
                data-testid="multimodal-grid-error"
                orientation={Orientation.Column}
                spacing={Spacing.Sm}
                // style={{ flex: 1 }}
              >
                <Text variant={TextVariant.Sm} color={TextColor.Primary}>
                  Workspace unavailable
                </Text>
                <Text variant={TextVariant.Caption} color={TextColor.Secondary}>
                  {info.mediaField}
                </Text>
              </Stack>
            )}

            {!isLoading && !error && catalog && (
              <div data-testid="multimodal-grid-summary" style={SUMMARY_STYLES}>
                {hasPreviewFrame ? (
                  <div style={PREVIEW_SUMMARY_STYLES}>
                    <span style={PREVIEW_SUMMARY_VALUE_STYLES}>
                      {formattedFileSize}
                    </span>
                    <span style={PREVIEW_SUMMARY_SEPARATOR_STYLES}>·</span>
                    <span style={PREVIEW_SUMMARY_VALUE_STYLES}>
                      {formattedDuration}
                    </span>
                  </div>
                ) : (
                  <div style={HERO_SUMMARY_STYLES}>
                    <div style={HERO_STATS_GRID_STYLES}>
                      <div
                        data-testid="multimodal-grid-stat-file-size"
                        style={HERO_STAT_STYLES}
                      >
                        <div style={HERO_STAT_LABEL_STYLES}>File size</div>
                        <div style={HERO_STAT_VALUE_STYLES}>
                          {formattedFileSize}
                        </div>
                      </div>

                      <div
                        data-testid="multimodal-grid-stat-duration"
                        style={HERO_STAT_STYLES}
                      >
                        <div style={HERO_STAT_LABEL_STYLES}>Duration</div>
                        <div style={HERO_STAT_VALUE_STYLES}>
                          {formattedDuration}
                        </div>
                      </div>
                    </div>

                    <div
                      data-testid="multimodal-grid-stat-streams"
                      style={STREAM_COUNT_STYLES}
                    >
                      <span style={STREAM_COUNT_VALUE_STYLES}>
                        {catalog.streams.length}
                      </span>
                      <span style={STREAM_COUNT_LABEL_STYLES}>Streams</span>
                    </div>
                  </div>
                )}

                {hoverPreview.error && !hoverPreview.frameSrc && (
                  <Text
                    variant={TextVariant.Caption}
                    color={TextColor.Secondary}
                  >
                    Preview unavailable
                  </Text>
                )}
              </div>
            )}
          </Stack>
        </Card>
      </div>
    );
  }
);

MultimodalGridRenderer.displayName = "MultimodalGridRenderer";
