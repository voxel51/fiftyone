import { useAtomValue } from "jotai";
import React from "react";
import { currentField } from "./state";

export default function PrimitiveEdit() {
  const field = useAtomValue(currentField);
  console.log("field", field);
  return (
    <div>
      <h1>Primitive Edit</h1>
    </div>
  );
}
