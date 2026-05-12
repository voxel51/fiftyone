import {
  Checkbox,
  Heading,
  Text,
  TextColor,
  TextVariant,
} from "@voxel51/voodo";
import React from "react";
import styles from "../../tile-settings.module.css";

const GraphSettings: React.FC = () => (
  <div className={styles.root}>
    <Heading>Graph</Heading>

    <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
      Series
    </Text>
    <Checkbox label="velocity" defaultChecked />
    <Checkbox label="accel" defaultChecked />

    <Checkbox label="Show playhead" defaultChecked />
    <Checkbox label="Smooth lines" />
  </div>
);

export default GraphSettings;
