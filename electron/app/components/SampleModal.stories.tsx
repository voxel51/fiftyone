import React from "react";
import { boolean } from "@storybook/addon-knobs";
import SampleModal from "./SampleModal";

export default {
  component: SampleModal,
  title: "SampleModal",
};

const sample = {
  _id: { $oid: "5f2f59cd874cb94d62333bc0" },
  filepath: "/image.png",
  tags: ["test"],
  metadata: null,
  gt_weather: {
    _id: { $oid: "5f2f59cd874cb94d62333bb9" },
    _cls: "Classification",
    label: "sunny",
  },
  pred_weather: {
    _id: { $oid: "5f2f59cd874cb94d62333bba" },
    _cls: "Classification",
    label: "partly-sunny",
    confidence: 0.95,
    logits: [
      -0.42450900383484136,
      1.437420150701508,
      -1.1081977984572888,
      0.8531836498478511,
      -0.665449337614338,
    ],
  },
  gt_objects: {
    _cls: "Detections",
    detections: [
      {
        _id: { $oid: "5f2f59cd874cb94d62333bbb" },
        _cls: "Detection",
        label: "cat",
        bounding_box: [0.3, 0.3, 0.2, 0.2],
        attributes: {},
      },
      {
        _id: { $oid: "5f2f59cd874cb94d62333bbc" },
        _cls: "Detection",
        label: "dog",
        bounding_box: [0.6, 0.6, 0.2, 0.2],
        attributes: {},
      },
    ],
  },
  pred_objects: {
    _cls: "Detections",
    detections: [
      {
        _id: { $oid: "5f2f59cd874cb94d62333bbd" },
        _cls: "Detection",
        label: "cat",
        bounding_box: [0.33, 0.33, 0.2, 0.2],
        confidence: 0.9,
        attributes: {},
      },
      {
        _id: { $oid: "5f2f59cd874cb94d62333bbe" },
        _cls: "Detection",
        label: "dog",
        bounding_box: [0.65, 0.65, 0.2, 0.2],
        confidence: 0.9,
        attributes: {},
      },
    ],
  },
  caption: "This is a caption",
  frame_quality: 97,
  uniqueness: 58.123,
  custom_data: { this: ["is", "not", "visualizable"] },
  custom_raw_data: {
    $binary:
      "eJyb7BfqGxDJyFDGUK2eklqcXKRupaBuk2ahrqOgnpZfVFKUmBefX5SSChJ3S8wpTgWKF2ckFqQC+RrGOgrGmjoKtQpkA641Xp2h5WLP9hdwHi7Ob3xm/y2ZSXir/hN7kfyAZf48L+21vaeUV1qf3J//y7l9GvsB+7t1PxN1ex/ZL579a4J44137qY5hW7fVn90PAN9fPuY=",
    $type: "00",
  },
};

export const standard = () => (
  <SampleModal
    sample={sample}
    colorMap={{}}
    activeLabels={[]}
    onPrevious={boolean("has previous") ? () => {} : null}
    onNext={boolean("has next") ? () => {} : null}
  />
);
