import React from "react";
import ExternalLink from "./ExternalLink";

export default {
  component: ExternalLink,
  title: "ExternalLink",
};

export const standard = () => (
  <ExternalLink href="https://google.com/">Google</ExternalLink>
);
