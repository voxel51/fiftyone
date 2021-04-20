import React from "react";

import HorizontalNav from "./HorizontalNav";

export default {
  component: HorizontalNav,
  title: "HorizontalNav",
};

export const standard = () => (
  <HorizontalNav entries={["labels", "scalars", "tags"]} />
);
