import type { SampleRendererProps } from "@fiftyone/plugins";
import { useEffect, useMemo, useRef, useState } from "react";
import { ImageAnnotationsOverlay } from "../../../visualization/panels/ImageAnnotationsOverlay";
import { ImagePanel } from "../../../visualization/panels/image";
import { PointCloudPanel } from "../../../visualization/panels/point-cloud";
import type { McapGridPreviewFrame } from "../grid-preview";
import classes from "./GridRenderer.module.css";
import { McapLoadingAscii } from "./McapLoadingAscii";
import {
  MCAP_GRID_STREAM_AUTO,
  useRegisterMcapGridStreamTopics,
  useMcapGridSelectedStreamTopic,
} from "./mcap-grid-stream-state";
import { useMcapGridCameraPose } from "./mcap-grid-camera-state";
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
  const sampleId = useMemo(() => {
    const sample = ctx.sample.sample as { _id?: string; id?: string };
    return sample._id ?? sample.id;
  }, [ctx.sample.sample]);
  const [selectedStreamTopic] = useMcapGridSelectedStreamTopic(
    ctx.dataset.name,
  );
  const preview = useMcapGridPreview({
    selectedStreamTopic:
      selectedStreamTopic === MCAP_GRID_STREAM_AUTO
        ? null
        : selectedStreamTopic,
    source,
  });
  const registerStreamTopics = useRegisterMcapGridStreamTopics();
  const stableStreamTopics = useStableGridStreamTopics(preview.streamTopics);

  useEffect(() => {
    return registerStreamTopics({
      datasetName: ctx.dataset.name,
      sampleId,
      topics: stableStreamTopics.topics,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- registerStreamTopics is stable
  }, [ctx.dataset.name, sampleId, stableStreamTopics]);

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
          key={`${source?.sourceId ?? ""}:${preview.streamTopic ?? ""}`}
          frame={preview.frame}
        />
      ) : (
        <PreviewStatus
          error={preview.error}
          hasPreviewTopics={preview.hasPreviewTopics}
          status={preview.status}
        />
      )}
    </div>
  );
}

function useStableGridStreamTopics(topics: readonly string[]) {
  const previous = useRef({
    key: "",
    topics: [] as readonly string[],
  });

  return useMemo(() => {
    const normalizedTopics = Array.from(
      new Set(
        topics.map((topic) => topic.trim()).filter((topic) => topic.length > 0),
      ),
    ).sort((a, b) => a.localeCompare(b));
    const key = normalizedTopics.join("\0");

    if (previous.current.key !== key) {
      previous.current = { key, topics: normalizedTopics };
    }

    return previous.current;
  }, [topics]);
}

function PreviewFrame({ frame }: { readonly frame: McapGridPreviewFrame }) {
  return frame.kind === "point-cloud" ? (
    <PointCloudPreviewFrame frame={frame} />
  ) : (
    <ImagePreviewFrame frame={frame} />
  );
}

function PointCloudPreviewFrame({
  frame,
}: {
  readonly frame: Extract<McapGridPreviewFrame, { kind: "point-cloud" }>;
}) {
  const [cameraPose, setCameraPose] = useMcapGridCameraPose();
  const layers = useMemo(
    () => [{ frame: frame.pointCloud, id: "preview" }],
    [frame.pointCloud]
  );

  return (
    <PointCloudPanel
      cameraPose={cameraPose}
      className={classes.imagePanel}
      layers={layers}
      onCameraPoseChange={setCameraPose}
      showGizmo={false}
      showHud={false}
    />
  );
}

function ImagePreviewFrame({
  frame,
}: {
  readonly frame: Extract<McapGridPreviewFrame, { kind: "image" }>;
}) {
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
              : { width, height },
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
  hasPreviewTopics,
  status,
}: {
  readonly error: string | null;
  readonly hasPreviewTopics: boolean;
  readonly status: McapGridPreviewStatus;
}) {
  const loading = status === "loading";
  const message = previewStatusMessage(status, hasPreviewTopics);

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
  hasPreviewTopics: boolean,
): string | null {
  if (status === "loading") {
    return null;
  }

  if (status === "error") {
    return "Preview unavailable";
  }

  if (status === "unavailable") {
    return "No data available for this stream";
  }

  return hasPreviewTopics ? "No preview frames" : "No preview streams";
}
