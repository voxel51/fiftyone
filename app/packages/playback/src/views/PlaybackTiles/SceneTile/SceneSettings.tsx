import { Checkbox } from "@voxel51/voodo";
import React from "react";
import styles from "../tile-settings.module.css";

const SceneSettings: React.FC = () => (
  <div className={styles.root}>
    <Checkbox label="Show grid" defaultChecked />
    <Checkbox label="Show path" defaultChecked />
    <Checkbox label="Show axes" />
  </div>
);

export default SceneSettings;
