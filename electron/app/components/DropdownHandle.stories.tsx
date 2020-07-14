import React from "react";
import DropdownHandle from "./DropdownHandle";
import { withKnobs, boolean } from "@storybook/addon-knobs";

export default {
  component: DropdownHandle,
  title: "DropdownHandle",
  decorators: [withKnobs],
};

export const standard = () => (
  <DropdownHandle label="Example" expanded={boolean("Expanded", false)} />
);
