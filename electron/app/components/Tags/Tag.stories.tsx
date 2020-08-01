import React from "react";
import Tag from "./Tag";
import { boolean } from "@storybook/addon-knobs";

export default {
  component: Tag,
  title: "Tag",
};

export const standard = () => (
  <Tag name="tag" selected={boolean("Selected")}></Tag>
);

export const color = () => (
  <Tag name="tag" color="red" selected={boolean("Selected")}></Tag>
);
