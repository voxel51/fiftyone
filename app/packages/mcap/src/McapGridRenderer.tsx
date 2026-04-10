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
  Spacing,
  Stack,
  Text,
  TextColor,
  TextVariant,
} from "@voxel51/voodo";
import React from "react";
import { getMcapRendererInfo } from "./renderer-utils";

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
  background:
    "linear-gradient(180deg, var(--fo-palette-background-level2) 0%, rgba(22, 22, 24, 0.96) 100%)",
};

const CONTENT_STYLES: React.CSSProperties = {
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

/** Renders the built-in grid card for `.mcap` samples. */
export const McapGridRenderer = React.memo(({ ctx }: SampleRendererProps) => {
  const info = getMcapRendererInfo(ctx);

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

            <Stack orientation={Orientation.Column} spacing={Spacing.Xs}>
              <DetailRow label="Field" value={info.mediaField} />
              <DetailRow
                label="Path"
                value={info.mediaPath ?? "Not available"}
              />
            </Stack>
          </Stack>

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
