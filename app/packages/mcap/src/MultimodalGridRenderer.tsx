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
import {
  formatMultimodalDuration,
  getMultimodalCompactStreamLabels,
  getMultimodalStreamCounts,
} from "./scene-view-model";
import {
  getMultimodalRendererInfo,
  getMultimodalSceneParams,
} from "./renderer-utils";
import { useMultimodalWorkspace } from "./useMultimodalWorkspace";

const ROOT_STYLES: React.CSSProperties = {
  width: "100%",
  height: "100%",
};

const CARD_STYLES: React.CSSProperties = {
  width: "100%",
  height: "100%",
  padding: "12px",
  borderRadius: "8px",
  overflow: "hidden",
};

const CONTENT_STYLES: React.CSSProperties = {
  minWidth: 0,
  height: "100%",
};

const TITLE_STYLES: React.CSSProperties = {
  minWidth: 0,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

function SummaryPill({ children }: React.PropsWithChildren) {
  return (
    <Pill
      size={Size.Xs}
      backgroundColor={BackgroundColor.Muted}
      color={TextColor.Secondary}
    >
      {children}
    </Pill>
  );
}

export const MultimodalGridRenderer = React.memo(
  ({ ctx }: SampleRendererProps) => {
    const info = getMultimodalRendererInfo(ctx);
    const params = React.useMemo(() => getMultimodalSceneParams(ctx), [ctx]);
    const { catalog, isLoading, error } = useMultimodalWorkspace(params);
    const streamCounts = React.useMemo(() => {
      return getMultimodalStreamCounts(catalog?.streams ?? []);
    }, [catalog?.streams]);
    const compactLabels = React.useMemo(() => {
      return getMultimodalCompactStreamLabels(catalog?.streams ?? []);
    }, [catalog?.streams]);

    return (
      <div data-testid="multimodal-grid-renderer" style={ROOT_STYLES}>
        <Card background={CardBackground.Elevated} outlined style={CARD_STYLES}>
          <Stack
            orientation={Orientation.Column}
            spacing={Spacing.Md}
            justify={Justify.Between}
            style={CONTENT_STYLES}
          >
            <Stack orientation={Orientation.Column} spacing={Spacing.Sm}>
              <Stack align={Align.Center} justify={Justify.Between}>
                <Pill
                  size={Size.Xs}
                  backgroundColor={BackgroundColor.Secondary}
                  color={TextColor.Primary}
                >
                  Multimodal
                </Pill>
                <Text variant={TextVariant.Caption} color={TextColor.Secondary}>
                  {info.mediaExtension.toUpperCase()}
                </Text>
              </Stack>
              <Heading
                level={HeadingLevel.H4}
                style={TITLE_STYLES}
                title={info.basename}
              >
                {info.basename}
              </Heading>
            </Stack>

            {isLoading && (
              <Stack
                data-testid="multimodal-grid-loading"
                orientation={Orientation.Column}
                spacing={Spacing.Sm}
                justify={Justify.Center}
                align={Align.Center}
                style={{ flex: 1 }}
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
                style={{ flex: 1 }}
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
              <Stack
                data-testid="multimodal-grid-summary"
                orientation={Orientation.Column}
                spacing={Spacing.Sm}
                style={{ flex: 1 }}
              >
                <Stack orientation={Orientation.Row} spacing={Spacing.Xs}>
                  <SummaryPill>{`${streamCounts.image} image`}</SummaryPill>
                  <SummaryPill>{`${streamCounts.threeD} 3d`}</SummaryPill>
                  <SummaryPill>
                    {formatMultimodalDuration(catalog.timeRange)}
                  </SummaryPill>
                </Stack>
                <Text variant={TextVariant.Sm} color={TextColor.Secondary}>
                  {`${catalog.streams.length} streams · ${catalog.frames.length} frames`}
                </Text>
                <Stack orientation={Orientation.Row} spacing={Spacing.Xs}>
                  {compactLabels.map((label) => (
                    <SummaryPill key={label}>{label}</SummaryPill>
                  ))}
                </Stack>
              </Stack>
            )}
          </Stack>
        </Card>
      </div>
    );
  }
);

MultimodalGridRenderer.displayName = "MultimodalGridRenderer";
