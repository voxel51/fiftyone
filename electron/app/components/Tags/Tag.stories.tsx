import React from "react";
import Tag from "./Tag";
import { boolean } from "@storybook/addon-knobs";

export default {
  component: Tag,
  title: "Tag",
};

const WrappedTag = (props) => (
  <Tag
    selected={boolean("Selected")}
    triangle={boolean("Triangle")}
    {...props}
  />
);

export const standard = () => <WrappedTag name="tag" />;

export const triangle = () => <WrappedTag name="tag" triangle />;

export const color = () => <WrappedTag name="tag" color="red" />;

export const grid = () => (
  <>
    <div style={{ lineHeight: 0 }}>
      <WrappedTag name="tag" color="#ff0000" />
      <WrappedTag name="tag" color="#00ff00" />
      <WrappedTag name="tag" color="#0000ff" />
    </div>
    <div style={{ lineHeight: 0 }}>
      <WrappedTag name="tag" color="#ff0000" />
      <WrappedTag name="tag" color="#00ff00" />
      <WrappedTag name="tag" color="#0000ff" />
    </div>
  </>
);
