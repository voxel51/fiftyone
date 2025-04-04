import React from "react";

export default function ColorSquare(props: { color: string }) {
  return (
    <div
      style={{
        width: 16,
        height: 16,
        backgroundColor: props.color,
        borderRadius: 2,
      }}
    />
  );
}
