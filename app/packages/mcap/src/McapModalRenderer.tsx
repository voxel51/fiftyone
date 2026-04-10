import type { SampleRendererProps } from "@fiftyone/plugins";
import {
  BackgroundColor,
  Card,
  CardBackground,
  Divider,
  Heading,
  HeadingLevel,
  Justify,
  Orientation,
  Pill,
  Size,
  Spacing,
  Stack,
  Text,
  TextColor,
  TextVariant,
} from "@voxel51/voodo";
import React from "react";
import { getMcapRendererInfo } from "./renderer-utils";

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
  background: "rgba(17, 18, 22, 0.72)",
  borderRight: "1px solid rgba(255, 255, 255, 0.08)",
};

const RIGHT_SIDEBAR_STYLES: React.CSSProperties = {
  ...SIDEBAR_STYLES,
  borderRight: "none",
  borderLeft: "1px solid rgba(255, 255, 255, 0.08)",
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
  background:
    "radial-gradient(circle at top left, rgba(255, 157, 66, 0.12), transparent 32%), var(--fo-palette-background-level1)",
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
  gridTemplateRows: "minmax(0, 1fr) minmax(0, 1fr)",
  gap: "16px",
  flex: 1,
};

const CARD_STYLES: React.CSSProperties = {
  borderRadius: "8px",
};

const PANEL_CARD_STYLES: React.CSSProperties = {
  ...CARD_STYLES,
  height: "100%",
  padding: "18px",
  overflow: "hidden",
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

function PanelCard({
  label,
  title,
  pills,
  testId,
}: {
  label: string;
  title: string;
  pills: string[];
  testId: string;
}) {
  return (
    <Card
      data-testid={testId}
      background={CardBackground.Elevated}
      outlined
      style={PANEL_CARD_STYLES}
    >
      <Stack
        orientation={Orientation.Column}
        spacing={Spacing.Md}
        justify={Justify.Between}
        style={CENTER_CONTENT_STYLES}
      >
        <Stack orientation={Orientation.Column} spacing={Spacing.Sm}>
          <Text
            variant={TextVariant.Caption}
            color={TextColor.Secondary}
            style={SECTION_LABEL_STYLES}
          >
            {label}
          </Text>
          <Heading level={HeadingLevel.H4}>{title}</Heading>
        </Stack>
        <Stack
          orientation={Orientation.Row}
          spacing={Spacing.Xs}
          style={PANEL_META_ROW_STYLES}
        >
          {pills.map((pill) => (
            <MetadataPill key={pill}>{pill}</MetadataPill>
          ))}
        </Stack>
      </Stack>
    </Card>
  );
}

/** Renders the built-in modal shell for `.mcap` samples. */
export const McapModalRenderer = React.memo(({ ctx }: SampleRendererProps) => {
  const info = getMcapRendererInfo(ctx);

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

          <div style={PANEL_GRID_STYLES}>
            <PanelCard
              testId="mcap-shell-2d-panel"
              label="2D View"
              title={info.basename}
              pills={[info.mediaField, info.mediaExtension]}
            />
            <PanelCard
              testId="mcap-shell-3d-panel"
              label="3D View"
              title={info.datasetName}
              pills={["modal", info.basename]}
            />
          </div>
        </Stack>
      </section>

      <aside data-testid="mcap-shell-right" style={RIGHT_SIDEBAR_STYLES}>
        <Stack
          orientation={Orientation.Column}
          spacing={Spacing.Md}
          style={SIDEBAR_CONTENT_STYLES}
        >
          <InfoSection
            title="Sample"
            rows={[
              { label: "File", value: info.samplePath ?? "Not available" },
              { label: "Media", value: info.mediaPath ?? "Not available" },
            ]}
          />
          <InfoSection
            title="Media URL"
            rows={[{ label: "URL", value: info.mediaUrl ?? "Not available" }]}
          />
        </Stack>
      </aside>
    </div>
  );
});

McapModalRenderer.displayName = "McapModalRenderer";
