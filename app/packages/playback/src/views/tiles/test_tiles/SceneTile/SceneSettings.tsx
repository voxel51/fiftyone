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

const CAMERAS = [
  { id: "perspective", data: { label: "Perspective" } },
  { id: "top", data: { label: "Top-down" } },
  { id: "iso", data: { label: "Isometric" } },
];

const SceneSettings: React.FC = () => (
  <div className={styles.root}>
    <Heading>3D Scene</Heading>

    <div className={styles.field}>
      <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
        Camera
      </Text>
      <Select options={CAMERAS} value="perspective" />
    </div>

    <Checkbox label="Show grid" defaultChecked />
    <Checkbox label="Show path" defaultChecked />
    <Checkbox label="Show axes" />
  </div>
);

export default SceneSettings;
