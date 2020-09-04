import React from "react";
import RangeSlider from "./RangeSlider";

import { atom } from "recoil";

const rangeAtomStory = atom<[number, number]>({
  key: "rangeAtomStory",
  default: [0, 1],
});

export default {
  component: RangeSlider,
  title: "RangeSlider",
};

export const standard = () => (
  <RangeSlider atom={rangeAtomStory} min={0} max={1} step={0.01} />
);
