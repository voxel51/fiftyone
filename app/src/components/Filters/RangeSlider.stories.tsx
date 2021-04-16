import React from "react";
import RangeSlider, { NamedRangeSlider, Range } from "./RangeSlider";

import { atom } from "recoil";

const boundsAtom = atom<Range>({
  key: "boundsAtom",
  default: [0, 1],
});

const valueAtom = atom<Range>({
  key: "valueAtom",
  default: [0, 1],
});

const noneAtom = atom<boolean>({
  key: "noneAtom",
  default: true,
});

const hasNoneAtom = atom<boolean>({
  key: "hasNoneAtom",
  default: true,
});

export default {
  component: RangeSlider,
  title: "RangeSlider",
};

export const standard = () => (
  <RangeSlider {...{ valueAtom, boundsAtom, color: "#000000" }} />
);

export const named = () => {
  const props = {
    boundsAtom,
    valueAtom,
    noneAtom,
    hasNoneAtom,
    color: "pink",
    name: "Name",
    valueName: "Value Name",
  };
  return <NamedRangeSlider {...props} />;
};
