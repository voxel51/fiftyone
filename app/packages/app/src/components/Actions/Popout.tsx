import React from "react";
import { useSpring } from "@react-spring/web";

import { PopoutDiv } from "../utils";

const Popout = ({ children, style = {}, modal }) => {
  const show = useSpring({
    opacity: 1,
    from: {
      opacity: 0,
    },
    config: {
      duration: 100,
    },
  });

  return (
    <PopoutDiv
      style={{ ...show, ...style, zIndex: 100001, right: modal ? 0 : "unset" }}
    >
      {children}
    </PopoutDiv>
  );
};

export default React.memo(Popout);
