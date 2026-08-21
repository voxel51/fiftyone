/**
 * Copyright 2017-2026, Voxel51, Inc.
 */
import { AnnotationTopBar } from "@fiftyone/annotation";
import type { ModalSample } from "@fiftyone/state";
import { Size, Spinner } from "@voxel51/voodo";
import React, { useState } from "react";
import { LighterSampleRenderer } from "./LighterSampleRenderer";
import styles from "./ImageAnnotationSurface.module.css";

/**
 * Composition root for the image annotation surface: the shared annotation
 * top bar (filename + media facts + status slot) over the Lighter renderer,
 * with an opaque loading cover until the scene's initial viewport settles —
 * the same loading contract as the video surface, minus the timeline half.
 */
export const ImageAnnotationSurface: React.FC<{ sample: ModalSample }> = ({
  sample,
}) => {
  const [revealed, setRevealed] = useState(false);

  return (
    <div className={styles.root} data-cy="image-annotation-surface">
      <AnnotationTopBar sample={sample} />
      <div className={styles.content}>
        <LighterSampleRenderer sample={sample} onRevealChange={setRevealed} />
        {!revealed && (
          <div
            className={styles.cover}
            data-cy="image-annotate-prerequisite-checking"
          >
            <Spinner size={Size.Lg} />
          </div>
        )}
      </div>
    </div>
  );
};
