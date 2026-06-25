import { EmptyState, IconName, Size, Spinner } from "@voxel51/voodo";
import React from "react";
import type { AnnotateBlocker } from "../hooks/useAnnotatePrerequisites";

const COPY: Record<
  AnnotateBlocker,
  { icon: IconName; title: string; description: string }
> = {
  metadata: {
    icon: IconName.Warning,
    title: "Computed metadata required",
    description:
      "This video's frame count is unknown. Run dataset.compute_metadata() " +
      "to annotate it, or switch to Explore to view the sample.",
  },
  frames: {
    icon: IconName.ImageSearch,
    title: "Frames not sampled",
    description:
      "This video's frames haven't been sampled to images, which annotation " +
      "requires. Run dataset.to_frames(sample_frames=True) to annotate it.",
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
      <EmptyState
        icon={copy.icon}
        title={copy.title}
        description={copy.description}
      />
    </div>
  );
};

/** Shown while a prerequisite (e.g. the sampled-frames probe) is resolving. */
export const AnnotatePrerequisiteChecking: React.FC = () => (
  <div data-cy="video-annotate-prerequisite-checking" style={center}>
    <Spinner size={Size.Lg} />
  </div>
);
