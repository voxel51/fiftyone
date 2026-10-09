/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { ArrowLeftStrokeIcon } from "@voxel51/voodo";
import Breadcrumb from "./components/Breadcrumb";
import Fullscreen from "./components/Fullscreen";
import HeaderAction from "./components/HeaderAction";
import ModeSwitch from "./components/ModeSwitch";
import SampleTools from "./components/SampleTools";
import SidebarToggle from "./components/SidebarToggle";
import Stepper from "./components/Stepper";
import ViewTools from "./components/ViewTools";
import { useCloseViewer, useViewerFullscreen, useViewerSample } from "./hooks";
import type { ViewerHeaderProps } from "./types";
import styles from "./ViewerHeader.module.css";

/**
 * The sample page's header: where the sample is and stepping from it on the
 * left; acting on it, viewing it, and the Inspect/Annotate switch with the
 * sidebar it drives on the right. Fullscreen leaves only a way back out.
 */
const ViewerHeader = ({
  datasetName,
  lookerRef,
  mode,
  stepper,
  utilities,
}: ViewerHeaderProps) => {
  const close = useCloseViewer();
  const { hasNext, hasPrevious, id, position, slice } = useViewerSample();
  const { fullscreen } = useViewerFullscreen();

  if (fullscreen) {
    return (
      <div className={styles.fullscreenExit}>
        <Fullscreen />
      </div>
    );
  }

  return (
    <header className={styles.header} data-cy="sample-page-header">
      <div className={styles.left}>
        <HeaderAction
          data-cy="viewer-header-back"
          icon={ArrowLeftStrokeIcon}
          label="Back to dataset"
          tooltip="Back to dataset (esc)"
          onClick={close}
        />
        <Breadcrumb
          dataset={datasetName}
          onDataset={close}
          sample={id}
          slice={slice}
        />
        <Stepper
          hasNext={hasNext}
          hasPrevious={hasPrevious}
          position={position}
          stepper={stepper}
        />
      </div>
      <div className={styles.right}>
        <SampleTools lookerRef={lookerRef} />
        <div className={styles.separator} />
        <ViewTools utilities={utilities} />
        <div className={styles.modeCluster}>
          {mode && <ModeSwitch {...mode} />}
          <SidebarToggle />
        </div>
      </div>
    </header>
  );
};

export default ViewerHeader;
