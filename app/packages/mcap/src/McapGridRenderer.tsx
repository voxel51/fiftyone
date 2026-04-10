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
  formatMcapDuration,
  getMcapCompactStreamLabels,
  getMcapStreamCounts,
} from "./scene-view-model";
import { getMcapRendererInfo, getMcapSceneParams } from "./renderer-utils";
import { useMcapScene } from "./useMcapScene";

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

const SECTION_STYLES: React.CSSProperties = {
  minWidth: 0,
};

const HEADER_ROW_STYLES: React.CSSProperties = {
  minWidth: 0,
};

const TITLE_STYLES: React.CSSProperties = {
  minWidth: 0,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const LABEL_STYLES: React.CSSProperties = {
  textTransform: "uppercase",
};

const EXTENSION_STYLES: React.CSSProperties = {
  textTransform: "uppercase",
};

const DETAIL_ROW_STYLES: React.CSSProperties = {
  minWidth: 0,
  display: "grid",
  gridTemplateColumns: "68px minmax(0, 1fr)",
  columnGap: "8px",
  alignItems: "start",
};

const DETAIL_VALUE_STYLES: React.CSSProperties = {
  minWidth: 0,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const FOOTER_STYLES: React.CSSProperties = {
  minWidth: 0,
};

const DATASET_STYLES: React.CSSProperties = {
  minWidth: 0,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const BADGE_STYLES: React.CSSProperties = {
  textTransform: "uppercase",
};

const MODAL_PILL_STYLES: React.CSSProperties = {
  flexShrink: 0,
};

const PILL_ROW_STYLES: React.CSSProperties = {
  minWidth: 0,
  flexWrap: "wrap",
};

const STATE_STYLES: React.CSSProperties = {
  minWidth: 0,
  minHeight: 0,
  flex: 1,
};

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={DETAIL_ROW_STYLES}>
      <Text
        variant={TextVariant.Caption}
        color={TextColor.Secondary}
        style={LABEL_STYLES}
      >
        {label}
      </Text>
      <Text
        variant={TextVariant.Sm}
        color={TextColor.Primary}
        style={DETAIL_VALUE_STYLES}
        title={value}
      >
        {value}
      </Text>
    </div>
  );
}

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

function formatStreamCount(value: number, label: string) {
  return `${value} ${label}`;
}

/** Renders the built-in grid card for `.mcap` samples. */
export const McapGridRenderer = React.memo(({ ctx }: SampleRendererProps) => {
  const info = getMcapRendererInfo(ctx);
  const sceneParams = React.useMemo(() => getMcapSceneParams(ctx), [ctx]);
  const { scene, isLoading, error } = useMcapScene(sceneParams);
  const streamCounts = React.useMemo(() => {
    return getMcapStreamCounts(scene?.streams ?? []);
  }, [scene?.streams]);
  const compactLabels = React.useMemo(() => {
    return getMcapCompactStreamLabels(scene?.streams ?? []);
  }, [scene?.streams]);

  return (
    <div data-testid="mcap-grid-renderer" style={ROOT_STYLES}>
      <Card background={CardBackground.Elevated} outlined style={CARD_STYLES}>
        <Stack
          orientation={Orientation.Column}
          spacing={Spacing.Md}
          justify={Justify.Between}
          style={CONTENT_STYLES}
        >
          <Stack
            orientation={Orientation.Column}
            spacing={Spacing.Sm}
            style={SECTION_STYLES}
          >
            <Stack
              align={Align.Center}
              justify={Justify.Between}
              style={HEADER_ROW_STYLES}
            >
              <Pill
                size={Size.Xs}
                backgroundColor={BackgroundColor.Secondary}
                color={TextColor.Primary}
                style={BADGE_STYLES}
              >
                MCAP
              </Pill>
              <Text
                variant={TextVariant.Caption}
                color={TextColor.Secondary}
                style={EXTENSION_STYLES}
              >
                {info.mediaExtension}
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
              data-testid="mcap-grid-loading"
              orientation={Orientation.Column}
              spacing={Spacing.Sm}
              justify={Justify.Center}
              align={Align.Center}
              style={STATE_STYLES}
            >
              <Spinner size={Size.Sm} />
              <Text variant={TextVariant.Sm} color={TextColor.Secondary}>
                Loading inventory
              </Text>
            </Stack>
          )}

          {!isLoading && error && (
            <Stack
              data-testid="mcap-grid-error"
              orientation={Orientation.Column}
              spacing={Spacing.Sm}
              justify={Justify.Center}
              style={STATE_STYLES}
            >
              <Text variant={TextVariant.Sm} color={TextColor.Primary}>
                Inventory unavailable
              </Text>
              <Stack orientation={Orientation.Column} spacing={Spacing.Xs}>
                <DetailRow label="Field" value={info.mediaField} />
                <DetailRow
                  label="Path"
                  value={info.mediaPath ?? "Not available"}
                />
              </Stack>
            </Stack>
          )}

          {!isLoading && !error && scene && (
            <Stack
              data-testid="mcap-grid-summary"
              orientation={Orientation.Column}
              spacing={Spacing.Sm}
              style={STATE_STYLES}
            >
              <Stack
                orientation={Orientation.Row}
                spacing={Spacing.Xs}
                style={PILL_ROW_STYLES}
              >
                <SummaryPill>
                  {formatStreamCount(streamCounts.image, "image")}
                </SummaryPill>
                <SummaryPill>
                  {formatStreamCount(streamCounts.pointcloud, "pointcloud")}
                </SummaryPill>
                <SummaryPill>{formatMcapDuration(scene.timeRange)}</SummaryPill>
              </Stack>
              <Stack orientation={Orientation.Column} spacing={Spacing.Xs}>
                <DetailRow label="Field" value={info.mediaField} />
                <DetailRow
                  label="Streams"
                  value={`${streamCounts.total} supported`}
                />
                <DetailRow
                  label="Topics"
                  value={
                    compactLabels.length
                      ? compactLabels.join(", ")
                      : "No supported streams"
                  }
                />
              </Stack>
            </Stack>
          )}

          <Stack
            align={Align.Center}
            justify={Justify.Between}
            style={FOOTER_STYLES}
          >
            <Text
              variant={TextVariant.Sm}
              color={TextColor.Secondary}
              style={DATASET_STYLES}
              title={info.datasetName}
            >
              {info.datasetName}
            </Text>
            <Pill
              size={Size.Xs}
              backgroundColor={BackgroundColor.Muted}
              color={TextColor.Secondary}
              style={MODAL_PILL_STYLES}
            >
              Modal view
            </Pill>
          </Stack>
        </Stack>
      </Card>
    </div>
  );
});

McapGridRenderer.displayName = "McapGridRenderer";
