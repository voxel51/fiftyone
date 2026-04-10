import type { SampleRendererProps } from "@fiftyone/plugins";
import {
  Align,
  BackgroundColor,
  Button,
  Card,
  CardBackground,
  Divider,
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
  Variant,
} from "@voxel51/voodo";
import React from "react";
import {
  formatMcapDuration,
  formatMcapTimeRange,
  getMcapActivePanelState,
  getMcapCompactStreamLabels,
  getMcapStreamCounts,
  getMcapStreamDisplayLabel,
} from "./scene-view-model";
import { getMcapRendererInfo, getMcapSceneParams } from "./renderer-utils";
import type {
  McapPanelPlan,
  McapSceneOpenResponse,
  McapStreamDescriptor,
} from "./types";
import { useMcapScene } from "./useMcapScene";

const SHELL_STYLES: React.CSSProperties = {
  width: "100%",
  height: "100%",
  minWidth: 0,
  minHeight: 0,
  display: "grid",
  gridTemplateColumns: "minmax(220px, 24%) minmax(0, 1fr) minmax(260px, 28%)",
  background: "var(--fo-palette-background-level2)",
};

const SIDEBAR_STYLES: React.CSSProperties = {
  minWidth: 0,
  minHeight: 0,
  padding: "20px",
  background: "var(--fo-palette-background-level2)",
  borderRight: "1px solid var(--fo-palette-background-level3)",
};

const RIGHT_SIDEBAR_STYLES: React.CSSProperties = {
  ...SIDEBAR_STYLES,
  borderRight: "none",
  borderLeft: "1px solid var(--fo-palette-background-level3)",
};

const SIDEBAR_CONTENT_STYLES: React.CSSProperties = {
  minWidth: 0,
  minHeight: 0,
  height: "100%",
};

const CENTER_STYLES: React.CSSProperties = {
  minWidth: 0,
  minHeight: 0,
  padding: "20px",
  background: "var(--fo-palette-background-level1)",
};

const CENTER_CONTENT_STYLES: React.CSSProperties = {
  minWidth: 0,
  minHeight: 0,
  height: "100%",
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

const SUBTITLE_STYLES: React.CSSProperties = {
  minWidth: 0,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const PANEL_GRID_STYLES: React.CSSProperties = {
  minWidth: 0,
  minHeight: 0,
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gridAutoRows: "minmax(220px, 1fr)",
  gap: "16px",
  flex: 1,
  overflow: "auto",
  alignContent: "start",
};

const CARD_STYLES: React.CSSProperties = {
  borderRadius: "8px",
};

const PANEL_CARD_STYLES: React.CSSProperties = {
  ...CARD_STYLES,
  height: "100%",
  padding: "18px",
  overflow: "hidden",
  cursor: "pointer",
};

const NAV_CARD_STYLES: React.CSSProperties = {
  ...CARD_STYLES,
  padding: "12px",
  cursor: "pointer",
};

const STATUS_CARD_STYLES: React.CSSProperties = {
  ...CARD_STYLES,
  minHeight: "220px",
  padding: "20px",
};

const SECTION_LABEL_STYLES: React.CSSProperties = {
  textTransform: "uppercase",
};

const INFO_LIST_STYLES: React.CSSProperties = {
  minWidth: 0,
};

const INFO_ROW_STYLES: React.CSSProperties = {
  minWidth: 0,
  display: "grid",
  gridTemplateColumns: "84px minmax(0, 1fr)",
  columnGap: "8px",
  alignItems: "start",
};

const INFO_VALUE_STYLES: React.CSSProperties = {
  minWidth: 0,
  wordBreak: "break-word",
};

const PANEL_META_ROW_STYLES: React.CSSProperties = {
  minWidth: 0,
  flexWrap: "wrap",
};

const CHIP_STYLES: React.CSSProperties = {
  maxWidth: "100%",
};

const STATUS_STYLES: React.CSSProperties = {
  minWidth: 0,
  minHeight: 0,
  flex: 1,
};

const NAV_LIST_STYLES: React.CSSProperties = {
  minWidth: 0,
};

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={INFO_ROW_STYLES}>
      <Text
        variant={TextVariant.Caption}
        color={TextColor.Secondary}
        style={SECTION_LABEL_STYLES}
      >
        {label}
      </Text>
      <Text
        variant={TextVariant.Sm}
        color={TextColor.Primary}
        style={INFO_VALUE_STYLES}
      >
        {value}
      </Text>
    </div>
  );
}

function InfoSection({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; value: string }[];
}) {
  return (
    <Card
      background={CardBackground.Secondary}
      outlined
      style={{ ...CARD_STYLES, padding: "14px" }}
    >
      <Stack orientation={Orientation.Column} spacing={Spacing.Sm}>
        <Text variant={TextVariant.Caption} color={TextColor.Secondary}>
          {title}
        </Text>
        <Divider />
        <Stack
          orientation={Orientation.Column}
          spacing={Spacing.Sm}
          style={INFO_LIST_STYLES}
        >
          {rows.map((row) => (
            <InfoRow key={row.label} label={row.label} value={row.value} />
          ))}
        </Stack>
      </Stack>
    </Card>
  );
}

function MetadataPill({ children }: React.PropsWithChildren) {
  return (
    <Pill
      size={Size.Xs}
      backgroundColor={BackgroundColor.Muted}
      color={TextColor.Secondary}
      style={CHIP_STYLES}
    >
      {children}
    </Pill>
  );
}

function formatMessageCount(messageCount: number | null) {
  return messageCount === null
    ? "Unknown"
    : new Intl.NumberFormat().format(messageCount);
}

function getPanelTypeLabel(panelType: McapPanelPlan["panelType"]) {
  return panelType === "2d" ? "2D Panel" : "3D Panel";
}

function handleCardKeyDown(
  event: React.KeyboardEvent<HTMLElement>,
  onSelect: () => void
) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    onSelect();
  }
}

function PanelNavigationCard({
  isActive,
  panel,
  stream,
  onSelect,
}: {
  isActive: boolean;
  panel: McapPanelPlan;
  stream: McapStreamDescriptor | null;
  onSelect: () => void;
}) {
  const label = stream
    ? getMcapStreamDisplayLabel(stream)
    : panel.streamId || "Unknown stream";

  return (
    <Card
      data-testid={`mcap-panel-nav-${panel.panelId}`}
      background={isActive ? CardBackground.Elevated : CardBackground.Secondary}
      outlined
      style={NAV_CARD_STYLES}
      onClick={onSelect}
      onKeyDown={(event) => handleCardKeyDown(event, onSelect)}
      role="button"
      tabIndex={0}
    >
      <Stack orientation={Orientation.Column} spacing={Spacing.Sm}>
        <Stack align={Align.Center} justify={Justify.Between}>
          <Text variant={TextVariant.Caption} color={TextColor.Secondary}>
            {getPanelTypeLabel(panel.panelType)}
          </Text>
          {isActive && <MetadataPill>Active</MetadataPill>}
        </Stack>
        <Text
          variant={TextVariant.Sm}
          color={TextColor.Primary}
          title={stream?.topic ?? panel.streamId}
        >
          {label}
        </Text>
        <Stack
          orientation={Orientation.Row}
          spacing={Spacing.Xs}
          style={PANEL_META_ROW_STYLES}
        >
          <MetadataPill>{panel.contentType}</MetadataPill>
          {stream && <MetadataPill>{stream.role}</MetadataPill>}
        </Stack>
      </Stack>
    </Card>
  );
}

function PanelCard({
  isActive,
  panel,
  stream,
  onSelect,
}: {
  isActive: boolean;
  panel: McapPanelPlan;
  stream: McapStreamDescriptor | null;
  onSelect: () => void;
}) {
  const title = stream
    ? getMcapStreamDisplayLabel(stream)
    : panel.streamId || "Unknown stream";

  return (
    <Card
      data-testid={`mcap-panel-card-${panel.panelId}`}
      background={isActive ? CardBackground.Elevated : CardBackground.Secondary}
      outlined
      style={PANEL_CARD_STYLES}
      onClick={onSelect}
      onKeyDown={(event) => handleCardKeyDown(event, onSelect)}
      role="button"
      tabIndex={0}
    >
      <Stack
        orientation={Orientation.Column}
        spacing={Spacing.Md}
        justify={Justify.Between}
        style={CENTER_CONTENT_STYLES}
      >
        <Stack orientation={Orientation.Column} spacing={Spacing.Sm}>
          <Stack align={Align.Center} justify={Justify.Between}>
            <Text
              variant={TextVariant.Caption}
              color={TextColor.Secondary}
              style={SECTION_LABEL_STYLES}
            >
              {getPanelTypeLabel(panel.panelType)}
            </Text>
            {isActive && <MetadataPill>Selected</MetadataPill>}
          </Stack>
          <Heading
            level={HeadingLevel.H4}
            title={stream?.topic ?? panel.streamId}
          >
            {title}
          </Heading>
        </Stack>
        <Stack
          orientation={Orientation.Row}
          spacing={Spacing.Xs}
          style={PANEL_META_ROW_STYLES}
        >
          <MetadataPill>{panel.contentType}</MetadataPill>
          <MetadataPill>{panel.panelType}</MetadataPill>
          {stream && <MetadataPill>{stream.role}</MetadataPill>}
        </Stack>
        <Stack orientation={Orientation.Column} spacing={Spacing.Sm}>
          <InfoRow label="Topic" value={stream?.topic ?? panel.streamId} />
          <InfoRow
            label="Schema"
            value={stream?.schemaName ?? "Not available"}
          />
          <InfoRow
            label="Messages"
            value={formatMessageCount(stream?.messageCount ?? null)}
          />
          <InfoRow
            label="Range"
            value={
              stream ? formatMcapTimeRange(stream.timeRange) : "Not available"
            }
          />
        </Stack>
      </Stack>
    </Card>
  );
}

function StatusCard({
  actions,
  description,
  isLoading = false,
  testId,
  title,
}: {
  actions?: React.ReactNode;
  description: string;
  isLoading?: boolean;
  testId: string;
  title: string;
}) {
  return (
    <Card
      data-testid={testId}
      background={CardBackground.Secondary}
      outlined
      style={STATUS_CARD_STYLES}
    >
      <Stack
        orientation={Orientation.Column}
        spacing={Spacing.Md}
        justify={Justify.Center}
        align={Align.Center}
        style={STATUS_STYLES}
      >
        {isLoading && <Spinner size={Size.Md} />}
        <Stack
          orientation={Orientation.Column}
          spacing={Spacing.Xs}
          align={Align.Center}
        >
          <Heading level={HeadingLevel.H4}>{title}</Heading>
          <Text
            variant={TextVariant.Sm}
            color={TextColor.Secondary}
            style={{ textAlign: "center" }}
          >
            {description}
          </Text>
        </Stack>
        {actions}
      </Stack>
    </Card>
  );
}

function getSceneSummaryRows(data: McapSceneOpenResponse) {
  const streamCounts = getMcapStreamCounts(data.scene.streams);

  return [
    {
      label: "Duration",
      value: formatMcapDuration(data.scene.timeRange),
    },
    {
      label: "Streams",
      value: `${streamCounts.total} supported`,
    },
    {
      label: "Images",
      value: String(streamCounts.image),
    },
    {
      label: "3D",
      value: String(streamCounts.pointcloud),
    },
  ];
}

/** Renders the built-in modal shell for `.mcap` samples. */
export const McapModalRenderer = React.memo(({ ctx }: SampleRendererProps) => {
  const info = getMcapRendererInfo(ctx);
  const sceneParams = React.useMemo(() => getMcapSceneParams(ctx), [ctx]);
  const { data, scene, playbackPlan, isLoading, error, refetch } =
    useMcapScene(sceneParams);
  const [activePanelId, setActivePanelId] = React.useState<string | null>(null);

  React.useEffect(() => {
    setActivePanelId(data?.playbackPlan.panels[0]?.panelId ?? null);
  }, [data?.scene.sceneId]);

  const activePanelState = React.useMemo(() => {
    if (!data) {
      return {
        activePanelId: null,
        panel: null,
        stream: null,
      };
    }

    return getMcapActivePanelState(data, activePanelId);
  }, [activePanelId, data]);

  const sceneSummaryRows = React.useMemo(() => {
    return data ? getSceneSummaryRows(data) : [];
  }, [data]);

  const sceneTopicLabels = React.useMemo(() => {
    return scene ? getMcapCompactStreamLabels(scene.streams) : [];
  }, [scene]);

  const activePanelRows = React.useMemo(() => {
    if (!activePanelState.panel) {
      return [];
    }

    return [
      {
        label: "Panel",
        value: getPanelTypeLabel(activePanelState.panel.panelType),
      },
      {
        label: "Content",
        value: activePanelState.panel.contentType,
      },
      {
        label: "Stream",
        value:
          activePanelState.stream?.topic ?? activePanelState.panel.streamId,
      },
    ];
  }, [activePanelState.panel, activePanelState.stream]);

  const activeStreamRows = React.useMemo(() => {
    if (!activePanelState.stream) {
      return [];
    }

    return [
      {
        label: "Topic",
        value: activePanelState.stream.topic,
      },
      {
        label: "Role",
        value: activePanelState.stream.role,
      },
      {
        label: "Schema",
        value: activePanelState.stream.schemaName,
      },
      {
        label: "Encoding",
        value: activePanelState.stream.messageEncoding,
      },
      {
        label: "Messages",
        value: formatMessageCount(activePanelState.stream.messageCount),
      },
      {
        label: "Range",
        value: formatMcapTimeRange(activePanelState.stream.timeRange),
      },
    ];
  }, [activePanelState.stream]);

  const fallbackSceneRows = React.useMemo(() => {
    if (!scene) {
      return [];
    }

    return [
      {
        label: "Scene",
        value: data?.scene.sceneId ?? "Not available",
      },
      {
        label: "Duration",
        value: formatMcapDuration(scene.timeRange),
      },
      {
        label: "Streams",
        value: `${scene.streams.length} supported`,
      },
      {
        label: "Topics",
        value: sceneTopicLabels.length
          ? sceneTopicLabels.join(", ")
          : "No supported streams",
      },
    ];
  }, [data?.scene.sceneId, scene, sceneTopicLabels]);

  return (
    <div data-testid="mcap-shell-root" style={SHELL_STYLES}>
      <aside data-testid="mcap-shell-left" style={SIDEBAR_STYLES}>
        <Stack
          orientation={Orientation.Column}
          spacing={Spacing.Md}
          style={SIDEBAR_CONTENT_STYLES}
        >
          <InfoSection
            title="Dataset"
            rows={[
              { label: "Name", value: info.datasetName },
              { label: "Surface", value: info.surface },
            ]}
          />
          <InfoSection
            title="Source"
            rows={[
              { label: "Field", value: info.mediaField },
              { label: "Type", value: info.mediaExtension.toUpperCase() },
            ]}
          />
          {data && <InfoSection title="Scene" rows={sceneSummaryRows} />}
          {playbackPlan && playbackPlan.panels.length > 0 && (
            <Card
              background={CardBackground.Secondary}
              outlined
              style={{ ...CARD_STYLES, padding: "14px" }}
            >
              <Stack orientation={Orientation.Column} spacing={Spacing.Sm}>
                <Text variant={TextVariant.Caption} color={TextColor.Secondary}>
                  Panels
                </Text>
                <Divider />
                <Stack
                  data-testid="mcap-panel-nav"
                  orientation={Orientation.Column}
                  spacing={Spacing.Sm}
                  style={NAV_LIST_STYLES}
                >
                  {playbackPlan.panels.map((panel) => {
                    const stream =
                      scene?.streams.find((candidate) => {
                        return candidate.streamId === panel.streamId;
                      }) ?? null;

                    return (
                      <PanelNavigationCard
                        key={panel.panelId}
                        isActive={
                          panel.panelId === activePanelState.activePanelId
                        }
                        panel={panel}
                        stream={stream}
                        onSelect={() => setActivePanelId(panel.panelId)}
                      />
                    );
                  })}
                </Stack>
              </Stack>
            </Card>
          )}
        </Stack>
      </aside>

      <section data-testid="mcap-shell-center" style={CENTER_STYLES}>
        <Stack
          orientation={Orientation.Column}
          spacing={Spacing.Lg}
          style={CENTER_CONTENT_STYLES}
        >
          <Stack
            orientation={Orientation.Column}
            spacing={Spacing.Sm}
            style={HEADER_STYLES}
          >
            <Pill
              size={Size.Xs}
              backgroundColor={BackgroundColor.Secondary}
              color={TextColor.Primary}
              style={SECTION_LABEL_STYLES}
            >
              MCAP
            </Pill>
            <Heading
              level={HeadingLevel.H2}
              style={TITLE_STYLES}
              title={info.basename}
            >
              {info.basename}
            </Heading>
            <Text
              variant={TextVariant.Sm}
              color={TextColor.Secondary}
              style={SUBTITLE_STYLES}
              title={info.mediaPath ?? ""}
            >
              {info.mediaPath ?? "Not available"}
            </Text>
          </Stack>

          {isLoading && (
            <StatusCard
              testId="mcap-shell-loading"
              title="Loading scene"
              description="Inspecting supported streams and panel layout."
              isLoading
            />
          )}

          {!isLoading && error && (
            <StatusCard
              testId="mcap-shell-error"
              title="Scene unavailable"
              description={error.message}
              actions={
                <Button
                  size={Size.Sm}
                  variant={Variant.Secondary}
                  onClick={() => void refetch()}
                >
                  Retry
                </Button>
              }
            />
          )}

          {!isLoading &&
            !error &&
            playbackPlan &&
            playbackPlan.panels.length === 0 && (
              <StatusCard
                testId="mcap-shell-empty"
                title="No supported streams"
                description="This MCAP opened successfully, but it does not contain supported CompressedImage or PointCloud2 streams."
              />
            )}

          {!isLoading &&
            !error &&
            playbackPlan &&
            playbackPlan.panels.length > 0 && (
              <div data-testid="mcap-shell-panels" style={PANEL_GRID_STYLES}>
                {playbackPlan.panels.map((panel) => {
                  const stream =
                    scene?.streams.find((candidate) => {
                      return candidate.streamId === panel.streamId;
                    }) ?? null;

                  return (
                    <PanelCard
                      key={panel.panelId}
                      isActive={
                        panel.panelId === activePanelState.activePanelId
                      }
                      panel={panel}
                      stream={stream}
                      onSelect={() => setActivePanelId(panel.panelId)}
                    />
                  );
                })}
              </div>
            )}
        </Stack>
      </section>

      <aside data-testid="mcap-shell-right" style={RIGHT_SIDEBAR_STYLES}>
        <Stack
          orientation={Orientation.Column}
          spacing={Spacing.Md}
          style={SIDEBAR_CONTENT_STYLES}
        >
          {activePanelRows.length > 0 && (
            <InfoSection title="Active Panel" rows={activePanelRows} />
          )}
          {activeStreamRows.length > 0 ? (
            <InfoSection title="Stream" rows={activeStreamRows} />
          ) : (
            fallbackSceneRows.length > 0 && (
              <InfoSection title="Scene" rows={fallbackSceneRows} />
            )
          )}
          <InfoSection
            title="Sample"
            rows={[
              { label: "File", value: info.samplePath ?? "Not available" },
              { label: "Media", value: info.mediaPath ?? "Not available" },
              { label: "URL", value: info.mediaUrl ?? "Not available" },
            ]}
          />
        </Stack>
      </aside>
    </div>
  );
});

McapModalRenderer.displayName = "McapModalRenderer";
