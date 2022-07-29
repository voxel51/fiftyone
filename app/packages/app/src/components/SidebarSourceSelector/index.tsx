import { useRecoilState, atom } from "recoil";
import * as fos from "@fiftyone/state";
import React from "react";
import { useTheme } from "@fiftyone/components";
import styled from "styled-components";

import { LocationOn } from "@material-ui/icons";

export default function SidebarSourceSelector({
  id,
  groupMode,
  slice,
  children,
}) {
  const [hovering, _setHovering] = React.useState(false);

  const [current, setCurrent] = useRecoilState(fos.sidebarSource);
  const theme = useTheme();
  const timer = React.useRef();
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
        border: `solid 1px ${color}`,
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
  background: ${(theme) => theme.backgroundDark};
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
          <LocationOn
            style={{
              position: "relative",
              top: "5px",
            }}
          />
        )}
        {text}
      </h3>
    </InfoContainer>
  );
}
