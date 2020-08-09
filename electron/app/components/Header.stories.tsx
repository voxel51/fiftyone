import React from "react";
import Header from "./Header";

export default {
  component: Header,
  title: "Header",
  decorators: [withKnobs],
};

export const standard = () => <Header />;
