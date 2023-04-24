import React from "react";
import { useGroupContext } from "../../GroupContextProvider";

export const NestedGroup = () => {
  const { lookerRefCallback } = useGroupContext();

  return <div>dynamic</div>;
};
