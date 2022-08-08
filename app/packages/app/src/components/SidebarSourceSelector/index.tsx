import { useRecoilState } from "recoil";
import * as fos from "@fiftyone/state";
import React from "react";
import { useTheme } from "@fiftyone/components";
import styled from "styled-components";

export default function SidebarSourceSelector({
  id,
  groupMode,
  slice,
  children,
}) {
  const [hovering, _setHovering] = React.useState(false);

  const [current, setCurrent] = useRecoilState(fos.sidebarSource);
  const theme = useTheme();
  const timer = React.useRef<number>();
  const setHovering = (state) => {
    if (timer.current) {
      clearTimeout(timer.current);
    }
    _setHovering(state);
  };
  function handleClick() {
    setCurrent(id);
  }
  React.useEffect(() => {
    if (timer.current) {
      clearTimeout(timer.current);
    }
    setHovering(true);
    timer.current = setTimeout(() => setHovering(false), 2000);
  }, [slice]);
  const isCurrent = current === id;
  const color = isCurrent ? theme.brand : theme.button;

  if (!groupMode) return children;

  return (
    <div
      style={{
        border: `3px solid ${theme.backgroundDarkBorder}`,
        borderRadius: 2,
        boxShadow: `0 2px 20px ${theme.backgroundDark}`,
        height: "100%",
      }}
      onClick={handleClick}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <Info hovering={hovering} current={isCurrent} text={slice} />

      {children}
    </div>
  );
}

const InfoContainer = styled.header`
  background: ${({ theme }) => theme.backgroundDark};
  padding: 0.5rem;
  position: absolute;
  height: 50px;
  z-index: 10001;
  width: 100%;
`;

export function Info({ text, hovering, current, inSidebar }) {
  const theme = useTheme();
  if (!inSidebar && !hovering) return null;

  return (
    <InfoContainer style={{ opacity: current ? 1 : 0.5 }}>
      <h3
        style={{
          cursor: inSidebar || current ? undefined : "pointer",
          textAlign: inSidebar ? "left" : "center",
          marginTop: "5px",
          color: current ? theme.brand : undefined,
        }}
      >
        {current && (
          <svg
            style={{
              position: "relative",
              top: "5px",
              width: 24,
            }}
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill={theme.brand}
          >
            <path d="M16,12V4H17V2H7V4H8V12L6,14V16H11.2V22H12.8V16H18V14L16,12Z" />
          </svg>
        )}
        {text}
      </h3>
    </InfoContainer>
  );
}
