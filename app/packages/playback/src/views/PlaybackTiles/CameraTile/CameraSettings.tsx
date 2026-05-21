import { Checkbox } from "@voxel51/voodo";
import React from "react";
import styles from "../tile-settings.module.css";

const CameraSettings: React.FC = () => (
  <div className={styles.root}>
    <Checkbox label="Show overlays" defaultChecked />
    <Checkbox label="Show bounding boxes" />
    <Checkbox label="Show track ids" />
  </div>
);

export default CameraSettings;
