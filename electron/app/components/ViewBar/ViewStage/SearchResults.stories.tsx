import React from "react";
import SearchResults from "./SearchResults";

import "../../../app.global.css";

export default {
  component: SearchResults,
  title: "SearchResults",
};

export const standard = () => (
  <div style={{ margin: 10, width: 150 }}>
    <SearchResults results={["example"]} />
  </div>
);
