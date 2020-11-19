import React from "react";
import StoryRouter from "storybook-react-router";

import HorizontalNav from "./HorizontalNav";

export default {
  component: HorizontalNav,
  title: "HorizontalNav",
  decorators: [StoryRouter()],
};

export const standard = () => (
  <HorizontalNav entries={["labels", "scalars", "tags"]} />
);
