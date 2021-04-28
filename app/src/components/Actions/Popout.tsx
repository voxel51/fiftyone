import React from "react";
import { useSpring } from "react-spring";
import { useWindowSize } from "../../utils/hooks";

import { PopoutDiv } from "../utils";

const Popout = ({ modal, children, style = {}, bounds }) => {
  const show = useSpring({
    opacity: 1,
    from: {
      opacity: 0,
    },
    config: {
      duration: 100,
    },
  });
  const { width } = useWindowSize();
  const position =
    modal && bounds
      ? {
          position: "fixed",
          right: width - bounds.right,
          top: bounds.bottom + 8,
        }
      : {};

  return (
    <PopoutDiv style={{ ...show, ...position, ...style }}>{children}</PopoutDiv>
  );
};

export default React.memo(Popout);
