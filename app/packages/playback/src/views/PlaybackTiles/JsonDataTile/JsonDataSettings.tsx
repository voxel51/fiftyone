import { Checkbox } from "@voxel51/voodo";
import React from "react";
import styles from "../tile-settings.module.css";

const JsonDataSettings: React.FC = () => (
  <div className={styles.root}>
    <Checkbox label="Pretty-print" defaultChecked />
    <Checkbox label="Show types" />
  </div>
);

export default JsonDataSettings;
