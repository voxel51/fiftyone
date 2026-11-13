import type { SampleRendererLoadingProps } from "@fiftyone/plugins";
import { Spinner, Text } from "@voxel51/voodo";
import { useLayoutEffect, useRef } from "react";
import { useModalThumbnail } from "./modal-thumbnail";
import {
  loadingPanes,
  useLoadingLayout,
  type LoadingLayout,
} from "./loading-layout";
import styles from "../shell/ModalRenderer.module.css";

/** A first-paint scaffold whose dependencies never load the playback renderer. */
export function EpisodeModalLoading(
  props: SampleRendererLoadingProps & {
    fileName?: string;
    layout?: LoadingLayout;
    viewportOnly?: boolean;
  },
) {
  const thumbnail = useModalThumbnail(props);
  const planned = useLoadingLayout(props);
  const layout = props.layout ?? planned;
  const panes = loadingPanes(layout.layout);
  const posterPane =
    panes.find((pane) => pane.id === layout.posterTileId) ??
    panes.find((pane) => pane.id.startsWith("image-")) ??
    panes.find((pane) => pane.id.startsWith("3d-"));
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // This effect copies the owned snapshot before the loading pane paints.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || thumbnail?.kind !== "canvas") return;
    canvas.width = thumbnail.canvas.width;
    canvas.height = thumbnail.canvas.height;
    canvas.getContext("2d")?.drawImage(thumbnail.canvas, 0, 0);
  }, [thumbnail]);

  const preview =
    thumbnail?.kind === "image" ? (
      <img
        className={styles.posterImage}
        style={{ objectFit: "contain" }}
        src={thumbnail.url}
        alt="Destination sample preview"
      />
    ) : thumbnail?.kind === "canvas" ? (
      <canvas
        className={styles.posterImage}
        style={{ objectFit: "contain" }}
        ref={canvasRef}
        role="img"
        aria-label="Destination sample preview"
      />
    ) : (
      <Spinner size="lg" />
    );
  const mosaic = (
    <div className={styles.loadingMosaic}>
      {panes.length ? (
        panes.map((pane) => (
          <div
            key={pane.id}
            className={styles.loadingPane}
            data-loading-pane={pane.id}
            style={{
              left: `calc(${pane.left}% + 2px)`,
              top: `calc(${pane.top}% + 2px)`,
              width: `calc(${pane.width}% - 4px)`,
              height: `calc(${pane.height}% - 4px)`,
            }}
          >
            <div className={styles.loadingPaneHeader}>
              <Text variant="body-tertiary" color="text-secondary">
                {layout.titles[pane.id] ?? "Preparing viewer"}
              </Text>
            </div>
            <div
              className={styles.loadingPaneBody}
              data-episode-destination-poster={
                pane.id === posterPane?.id ? "" : undefined
              }
            >
              {pane.id === posterPane?.id ? (
                preview
              ) : (
                <div className={styles.loadingPaneSkeleton} />
              )}
            </div>
          </div>
        ))
      ) : (
        <div
          className={styles.loadingUnknown}
          data-episode-destination-poster=""
        >
          {preview}
        </div>
      )}
    </div>
  );
  return (
    <div
      className={
        props.viewportOnly ? styles.loadingViewport : styles.loadingShell
      }
      data-testid="episode-modal-loading"
      role="status"
      aria-label="Loading sample"
    >
      {props.viewportOnly ? (
        mosaic
      ) : (
        <>
          <div className={styles.preparingHeader}>
            <Text variant="body-tertiary" className={styles.preparingFileName}>
              {props.fileName ?? "Loading sample…"}
            </Text>
            <Text variant="body-tertiary" color="text-secondary">
              Preparing viewer
            </Text>
          </div>
          <div className={styles.loadingBody}>
            {layout.leftOpen ? (
              <div
                className={styles.loadingSidebar}
                style={{ width: layout.leftWidth }}
              >
                <div className={styles.loadingPaneSkeleton} />
              </div>
            ) : null}
            {mosaic}
          </div>
          <div
            className={styles.preparingTimeline}
            style={{ height: layout.tracksOpen ? 240 : 50.5 }}
          />
        </>
      )}
    </div>
  );
}
