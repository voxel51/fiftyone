import type { SampleRendererProps } from "@fiftyone/plugins";
import { useState } from "react";
import { ImageAnnotationsOverlay } from "../../../visualization/panels/ImageAnnotationsOverlay";
import { ImagePanel } from "../../../visualization/panels/image";
import type { McapGridPreviewFrame } from "../grid-preview";
import classes from "./GridRenderer.module.css";
import { McapLoadingAscii } from "./McapLoadingAscii";
import {
  useMcapGridPreview,
  type McapGridPreviewStatus,
} from "./use-mcap-grid-preview";
import { useStableMcapSource } from "./use-stable-mcap-source";

const IMAGE_FIT = "cover";
const GRID_ANNOTATION_STROKE_WIDTH = 1;

/**
 * Grid renderer for MCAP-backed multimodal samples. Shows one camera
 * preview frame and plays the stream while hovered.
 */
export function GridRenderer({ ctx }: SampleRendererProps) {
  const source = useStableMcapSource(ctx);
  const preview = useMcapGridPreview({ source });

  return (
    <div
      className={classes.root}
      onPointerEnter={preview.play}
      onPointerLeave={preview.pause}
    >
      {preview.frame ? (
        <PreviewFrame
          // Image dimensions are per camera stream; remount to drop stale
          // dimensions when the source or selected topic changes.
          key={`${source?.sourceId ?? ""}:${preview.imageTopic ?? ""}`}
          frame={preview.frame}
        />
      ) : (
        <PreviewStatus
          error={preview.error}
          hasImageTopics={preview.hasImageTopics}
          status={preview.status}
        />
      )}
    </div>
  );
}

function PreviewFrame({ frame }: { readonly frame: McapGridPreviewFrame }) {
  const [imageDims, setImageDims] = useState<{
    width: number;
    height: number;
  } | null>(null);

  return (
    <>
      <ImagePanel
        className={classes.imagePanel}
        fit={IMAGE_FIT}
        frame={frame.image}
        onImageLoaded={(width, height) =>
          setImageDims((prev) =>
            prev?.width === width && prev?.height === height
              ? prev
              : { width, height }
          )
        }
      />
      {imageDims && frame.annotations ? (
        <div className={classes.annotationLayer}>
          <ImageAnnotationsOverlay
            annotations={[frame.annotations]}
            fit={IMAGE_FIT}
            imageHeight={imageDims.height}
            imageWidth={imageDims.width}
            strokeWidth={GRID_ANNOTATION_STROKE_WIDTH}
          />
        </div>
      ) : null}
    </>
  );
}

function PreviewStatus({
  error,
  hasImageTopics,
  status,
}: {
  readonly error: string | null;
  readonly hasImageTopics: boolean;
  readonly status: McapGridPreviewStatus;
}) {
  const loading = status === "loading";
  const message = previewStatusMessage(status, hasImageTopics);

  return (
    <div className={classes.status}>
      <div className={classes.statusTitle}>
        {loading ? <McapLoadingAscii /> : null}
        {message ? <span>{message}</span> : null}
      </div>
      {error ? <div className={classes.error}>{error}</div> : null}
    </div>
  );
}

function previewStatusMessage(
  status: McapGridPreviewStatus,
  hasImageTopics: boolean
): string | null {
  if (status === "loading") {
    return null;
  }

  if (status === "error") {
    return "Preview unavailable";
  }

  return hasImageTopics ? "No preview frames" : "No camera streams";
}
