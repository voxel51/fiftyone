import { Checkbox } from "@voxel51/voodo";
import React from "react";
import styles from "../tile-settings.module.css";

const LidarSettings: React.FC = () => (
  <div className={styles.root}>
    <Checkbox label="Color by height" defaultChecked />
    <Checkbox label="Show ground plane" />
    <Checkbox label="Show intensity overlay" />
    <Checkbox label="Cull behind sensor" defaultChecked />
  </div>
);

export default LidarSettings;
