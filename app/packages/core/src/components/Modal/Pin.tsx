import React from "react";

export default () => {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        height: "100%",
        paddingRight: 9,
      }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill={"var(--fo-palette-primary-plainColor)"}
        style={{
          height: 21,
          width: 21,
          display: "block",
          transform: "rotate(45deg)",
        }}
      >
        <path d="M16,12V4H17V2H7V4H8V12L6,14V16H11.2V22H12.8V16H18V14L16,12Z" />
      </svg>
    </div>
  );
};
