import React from "react";

import { FIXED_COLORS } from "./colors";
import { Box } from "../components/utils";
import CheckboxGrid from "../components/CheckboxGrid";
import Tag from "../components/Tags/Tag";

export default {
  // component: ColorDemo,
  title: "colors",
};

export const CheckboxGridColors = () => (
  <Box style={{ width: 300 }}>
    <CheckboxGrid
      entries={FIXED_COLORS.map((color, i) => ({
        name: color,
        color,
        data: i,
        selected: true,
      }))}
    />
  </Box>
);

export const TagColors = () => (
  <div>
    {FIXED_COLORS.map((color, i) => (
      <div key={i}>
        <Tag name={color} color={color} />
      </div>
    ))}
  </div>
);
