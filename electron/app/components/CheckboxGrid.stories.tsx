import React from "react";
import CheckboxGrid from "./CheckboxGrid";
import { withKnobs, boolean } from "@storybook/addon-knobs";

export default {
  component: CheckboxGrid,
  title: "CheckboxGrid",
  decorators: [withKnobs],
};

export const standard = () => (
  <CheckboxGrid
    entries={[
      { name: "Test", data: [100] },
      { name: "Train", data: [300] },
      { name: "Processed", data: [200] },
      { name: "Reviewed", data: [150] },
    ]}
  />
);
