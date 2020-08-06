import React from "react";
import ImageContainerHeader from "./ImageContainerHeader";
import { withKnobs, boolean } from "@storybook/addon-knobs";

export default {
  component: ImageContainerHeader,
  title: "ImageContainerHeader",
  decorators: [withKnobs],
};

export const standard = () => <ImageContainerHeader datasetName="example" />;
