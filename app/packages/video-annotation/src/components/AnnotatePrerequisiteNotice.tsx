import { MuiIconFont } from "@fiftyone/components";
import {
  Align,
  Orientation,
  Size,
  Spacing,
  Spinner,
  Stack,
  Text,
  TextColor,
  TextVariant,
} from "@voxel51/voodo";
import React from "react";
import type { AnnotateBlocker } from "../hooks/useAnnotatePrerequisites";

/** Inline docs link rendered within a notice description. */
const DocsLink: React.FC<{ href: string; children: React.ReactNode }> = ({
  href,
  children,
}) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    style={{ color: "var(--color-brand-accent)" }}
  >
    {children}
  </a>
);

const COPY: Record<
  AnnotateBlocker,
  { icon: string; title: string; description: React.ReactNode }
> = {
  metadata: {
    icon: "warning",
    title: "Computed metadata required",
    description: (
      <>
        This video&apos;s frame count is unknown.{" "}
        <DocsLink href="https://docs.voxel51.com/enterprise/getting_started.html#compute-metadata">
          Compute metadata
        </DocsLink>{" "}
        to annotate it or switch to Explore to view the sample.
      </>
    ),
  },
};

const center: React.CSSProperties = {
  width: "100%",
  height: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

/**
 * Media-region takeover shown when the video annotation surface can't mount
 * any media path because a prerequisite is missing (currently only computed
 * metadata) — an actionable prompt in the media region instead of a stream
 * that would throw.
 */
export const AnnotatePrerequisiteNotice: React.FC<{
  blocker: AnnotateBlocker;
}> = ({ blocker }) => {
  const copy = COPY[blocker];

  return (
    <div data-cy="video-annotate-prerequisite-notice" style={center}>
      <Stack
        orientation={Orientation.Column}
        align={Align.Center}
        spacing={Spacing.Md}
        style={{ maxWidth: 520, padding: 40, textAlign: "center" }}
      >
        {/* Match the schema-import empty state's icon treatment (a 48px
            MuiIconFont); the voodo `Icon` caps at 18px and reads as tiny here. */}
        <MuiIconFont
          name={copy.icon}
          sx={{ fontSize: 48, color: "var(--color-content-icon-warning)" }}
        />
        <Text variant={TextVariant.Xl}>{copy.title}</Text>
        <Text color={TextColor.Muted}>{copy.description}</Text>
      </Stack>
    </div>
  );
};

/** Shown while the decode strategy is resolving (frames / native-decode probe). */
export const AnnotatePrerequisiteChecking: React.FC = () => (
  <div data-cy="video-annotate-prerequisite-checking" style={center}>
    <Spinner size={Size.Lg} />
  </div>
);
