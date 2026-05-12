import {
  Checkbox,
  Heading,
  Select,
  Text,
  TextColor,
  TextVariant,
} from "@voxel51/voodo";
import React from "react";
import styles from "../../tile-settings.module.css";

const SOURCES = [
  { id: "camera_front", data: { label: "camera_front" } },
  { id: "camera_left", data: { label: "camera_left" } },
  { id: "camera_right", data: { label: "camera_right" } },
];

const CameraSettings: React.FC = () => (
  <div className={styles.root}>
    <Heading>Camera</Heading>

    <div className={styles.field}>
      <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
        Source
      </Text>
      <Select options={SOURCES} value="camera_front" />
    </div>

    <Checkbox label="Show overlays" defaultChecked />
    <Checkbox label="Show bounding boxes" />
    <Checkbox label="Show track ids" />
  </div>
);

export default CameraSettings;
