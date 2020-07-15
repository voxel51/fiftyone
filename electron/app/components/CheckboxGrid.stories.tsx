import React from "react";
import CheckboxGrid from "./CheckboxGrid";
import { Box } from "./utils";
import { withKnobs, boolean } from "@storybook/addon-knobs";

export default {
  component: CheckboxGrid,
  title: "CheckboxGrid",
  decorators: [withKnobs],
};

const entries = [
  { name: "Test", data: [100] },
  { name: "Train", data: [300] },
  { name: "Processed", data: [200] },
  { name: "Reviewed", data: [150] },
];

export const standard = () => <CheckboxGrid entries={entries} />;

export const contained = () => (
  <Box style={{ width: 300 }}>
    <CheckboxGrid entries={entries} />
  </Box>
);
