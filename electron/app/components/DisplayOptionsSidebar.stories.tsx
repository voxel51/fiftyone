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
  tags: {
    Test: 10035,
    Train: 435,
    Processed: 10035,
    Reviewed: 435,
  },
  labels: {
    Weather: 10035,
    Animal: 435,
    Person: 835,
  },
  scalars: {
    Mistakenness: 10035,
    Uniqueness: 435,
    Objects: 835,
  },
};

export const standard = () => <DisplayOptionsSidebar {...data} />;
