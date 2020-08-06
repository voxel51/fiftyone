import React from "react";
import Tag from "./Tag";

export default {
  component: Tag,
  title: "Tags/Tag",
};

export const standard = () => <Tag name="tag" />;

export const red = () => <Tag name="tag" color="red" />;

export const tooltip = () => <Tag name="hover over me" title="hi" />;

export const row = () => (
  <div>
    <Tag name="sunny" color="#499cef" />
    <Tag name="dog" color="#6d04ff" />
    <Tag name="outside" color="#3dbe04" />
  </div>
);
