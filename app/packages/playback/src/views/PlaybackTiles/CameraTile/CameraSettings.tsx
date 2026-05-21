import { Checkbox } from "@voxel51/voodo";
import React from "react";
import styles from "../tile-settings.module.css";

/**
 * Decorative camera settings for the demo. The production MCAP tiles
 * use `McapCameraSettings`, which sources its dropdown options from
 * the scene inventory; demo tiles take their stream id via prop so
 * there's nothing to pick here.
 */
const CameraSettings: React.FC = () => (
  <div className={styles.root}>
    <Checkbox label="Show overlays" defaultChecked />
    <Checkbox label="Show bounding boxes" />
    <Checkbox label="Show track ids" />
  </div>
);

export default CameraSettings;
