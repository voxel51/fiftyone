import React from "react";
import { useSpring } from "react-spring";

import { PopoutDiv } from "../utils";

const Popout = ({ modal, children, style = {} }) => {
  const show = useSpring({
    opacity: 1,
    from: {
      opacity: 0,
    },
    config: {
      duration: 100,
    },
  });
  const position = modal ? { bottom: "2.5rem", right: 0 } : {};
  return (
    <PopoutDiv style={{ ...show, ...position, ...style }}>{children}</PopoutDiv>
  );
};

export default React.memo(Popout);
