import React from "react";
import DropdownCell from "./DropdownCell";
import { withKnobs, boolean } from "@storybook/addon-knobs";

export default {
  component: DropdownCell,
  title: "DropdownCell",
  decorators: [withKnobs],
};

export const standard = () => (
  <>
    <DropdownCell label="Example" expanded={boolean("Expanded", false)}>
      Example content
    </DropdownCell>
    <br />
  </>
);

export const stacking = () => (
  <>
    {[1, 2, 3].map((i) => (
      <DropdownCell
        label={"Example " + i}
        expanded={boolean("Expanded", false)}
      >
        Content for cell {i}
      </DropdownCell>
    ))}
    <br />
  </>
);
