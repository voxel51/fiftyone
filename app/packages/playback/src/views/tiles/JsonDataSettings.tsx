import {
  Checkbox,
  Heading,
  Select,
  Text,
  TextColor,
  TextVariant,
} from "@voxel51/voodo";
import React from "react";
import styles from "./tile-settings.module.css";

const SOURCES = [
  { id: "gps", data: { label: "gps" } },
  { id: "imu", data: { label: "imu" } },
  { id: "metadata", data: { label: "metadata" } },
];

const JsonDataSettings: React.FC = () => (
  <div className={styles.root}>
    <Heading>JSON Data</Heading>

    <div className={styles.field}>
      <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
        Source
      </Text>
      <Select options={SOURCES} value="gps" />
    </div>

    <Checkbox label="Pretty-print" defaultChecked />
    <Checkbox label="Show types" />
  </div>
);

export default JsonDataSettings;
