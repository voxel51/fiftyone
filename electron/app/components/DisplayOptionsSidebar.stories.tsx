import React from "react";
import DisplayOptionsSidebar from "./DisplayOptionsSidebar";
import { Box } from "./utils";
import { withKnobs, boolean } from "@storybook/addon-knobs";

export default {
  component: DisplayOptionsSidebar,
  title: "DisplayOptionsSidebar",
  decorators: [withKnobs],
};

const data = {
  tags: [
    { name: "Test", data: [10035], selected: true },
    { name: "Train", data: [435], selected: false },
    { name: "Processed", data: [10035] },
    { name: "Reviewed", data: [435] },
  ],
  labels: [
    { name: "Weather", data: [10035] },
    { name: "Animal", data: [435] },
    { name: "Person", data: [835] },
  ],
  scalars: [
    { name: "Mistakenness", data: [10035] },
    { name: "Uniqueness", data: [435] },
    { name: "Objects", data: [835] },
  ],
};

export const standard = () => <DisplayOptionsSidebar {...data} />;
