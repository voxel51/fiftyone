import React from "react";
import { useSpring } from "@react-spring/web";

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

  return (
    <PopoutDiv style={{ ...show, ...style, zIndex: 100001 }}>
      {children}
    </PopoutDiv>
  );
};

export default React.memo(Popout);
