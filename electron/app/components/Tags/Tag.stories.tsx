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

export const grid = () => (
  <>
    <div style={{ lineHeight: 0 }}>
      <Tag name="tag" color="#ff0000" selected={boolean("Selected")}></Tag>
      <Tag name="tag" color="#00ff00" selected={boolean("Selected")}></Tag>
      <Tag name="tag" color="#0000ff" selected={boolean("Selected")}></Tag>
    </div>
    <div style={{ lineHeight: 0 }}>
      <Tag name="tag" color="#ff0000" selected={boolean("Selected")}></Tag>
      <Tag name="tag" color="#00ff00" selected={boolean("Selected")}></Tag>
      <Tag name="tag" color="#0000ff" selected={boolean("Selected")}></Tag>
    </div>
  </>
);
