import React from "react";

export default function ColorSquare(props: ColorSquareProps) {
  const { color, styles = {} } = props;

  return (
    <div
      style={{
        width: 16,
        height: 16,
        backgroundColor: color,
        borderRadius: 2,
        ...styles,
      }}
    />
  );
}

type ColorSquareProps = {
  color: string;
  styles?: React.CSSProperties;
};
