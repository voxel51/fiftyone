import React from "react";
import DisplayOptionsSidebar from "./DisplayOptionsSidebar";
import { Box } from "./utils";

export default {
  component: DisplayOptionsSidebar,
  title: "DisplayOptionsSidebar",
};

const data = {
  tags: [
    { name: "Test", count: 10035, selected: true },
    { name: "Train", count: 435, selected: false },
    { name: "Processed", count: 10035 },
    { name: "Reviewed", count: 435 },
  ],
  labels: [
    { name: "Weather", count: 10035 },
    { name: "Animal", count: 435 },
    { name: "Person", count: 835 },
  ],
  scalars: [
    { name: "Mistakenness", count: 10035 },
    { name: "Uniqueness", count: 435 },
    { name: "Objects", count: 835 },
  ],
};

export const standard = () => <DisplayOptionsSidebar {...data} />;

export const empty = () => (
  <DisplayOptionsSidebar tags={[]} labels={[]} scalars={[]} />
);

export const unsupported = () => (
  <DisplayOptionsSidebar
    {...data}
    unsupported={[
      { name: "Array thing", count: 20 },
      { name: "Dict thing", count: 3000 },
    ]}
  />
);
