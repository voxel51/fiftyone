import React from "react";
import DropdownTag from "./DropdownTag";

export default {
  component: DropdownTag,
  title: "Tags/DropdownTag",
};

export const standard = () => (
  <DropdownTag
    name="menu"
    menuItems={[
      { name: "Option 1" },
      { name: "Option 2" },
      { name: "Option 3" },
    ]}
  />
);
