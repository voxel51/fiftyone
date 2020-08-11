import React from "react";
import SearchResults from "./SearchResults";

export default {
  component: SearchResults,
  title: "ViewBar/ViewStage/SearchResults",
};

export const standard = () => (
  <div
    style={{
      padding: 10,
      margin: 10,
      width: 150,
      height: "auto",
      position: "relative",
      background: "pink",
    }}
  >
    I am the parent container
    <SearchResults results={["cat", "dog"]} />
  </div>
);
