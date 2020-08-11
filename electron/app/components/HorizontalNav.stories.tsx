import React from "react";
import StoryRouter from "storybook-react-router";

import HorizontalNav from "./HorizontalNav";

export default {
  component: HorizontalNav,
  title: "HorizontalNav",
  decorators: [StoryRouter()],
};

export const standard = () => (
  <HorizontalNav
    entries={[
      { name: "Link 1", path: "/1" },
      { name: "Link 2", path: "/2" },
      { name: "Link 3", path: "/3" },
    ]}
    currentPath="/1"
  />
);
