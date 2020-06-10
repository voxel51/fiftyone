import React from "react";

export default ({ prefix, name, val }) => {
  console.log(prefix, name, val);
  return <div className={`bubble active sample-${prefix}-${name}`}>{val}</div>;
};
