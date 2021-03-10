import React from "react";
import ReactDOM from "react-dom";
import { useSpring } from "react-spring";

import { PopoutDiv } from "../utils";
import { useWindowSize } from "../../utils/hooks";

const Popout = ({ modal, bounds, children, style = {} }) => {
  const show = useSpring({
    opacity: 1,
    from: {
      opacity: 0,
    },
    config: {
      duration: 100,
    },
  });
  const { height, width } = useWindowSize();

  if (modal) {
    console.log(bounds);
    return ReactDOM.createPortal(
      <PopoutDiv
        style={{
          ...show,
          ...style,
          bottom: height - bounds.top + 8,
          right: width - bounds.right,
          zIndex: 20000,
        }}
      >
        {children}
      </PopoutDiv>,
      document.body
    );
  }
  return <PopoutDiv style={{ ...show, ...style }}>{children}</PopoutDiv>;
};

export default React.memo(Popout);
