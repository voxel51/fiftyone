import {
  Align,
  Icon,
  IconColor,
  IconName,
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
  { icon: IconName; title: string; description: React.ReactNode }
> = {
  metadata: {
    icon: IconName.Warning,
    title: "Computed metadata required",
    description: (
      <>
        This video's frame count is unknown.{" "}
        <DocsLink href="https://docs.voxel51.com/enterprise/getting_started.html#compute-metadata">
          Compute metadata
        </DocsLink>{" "}
        to annotate it or switch to Explore to view the sample.
      </>
    ),
  },
  frames: {
    icon: IconName.ImageSearch,
    title: "Frames not sampled",
    description: (
      <>
        This video's frames haven't been sampled to images, which annotation
        requires.{" "}
        <DocsLink href="https://docs.voxel51.com/user_guide/using_views.html#frame-views">
          Run dataset.to_frames(sample_frames=True) or populate filepaths to
          existing frame images
        </DocsLink>{" "}
        to annotate it.
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
 * its playback stream because a prerequisite is missing. Replaces the old
 * hard throw in `RegisterImaVidImage` (which crashed the whole modal) and the
 * silent blank when frames aren't sampled.
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
        <Icon name={copy.icon} size={Size.Xl} color={IconColor.Warning} />
        <Text variant={TextVariant.Xl}>{copy.title}</Text>
        <Text color={TextColor.Muted}>{copy.description}</Text>
      </Stack>
    </div>
  );
};

/** Shown while a prerequisite (e.g. the sampled-frames probe) is resolving. */
export const AnnotatePrerequisiteChecking: React.FC = () => (
  <div data-cy="video-annotate-prerequisite-checking" style={center}>
    <Spinner size={Size.Lg} />
  </div>
);
