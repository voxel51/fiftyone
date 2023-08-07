import React, { Ref, RefObject, useLayoutEffect, useState } from "react";
import { useSpring } from "@react-spring/web";

import { PopoutDiv } from "../utils";

const Popout = ({
  children,
  style = {},
  modal,
  fixed,
  anchorRef,
}: PopoutPropsType) => {
  const [left, setLeft] = useState("auto");
  const show = useSpring({
    opacity: 1,
    from: {
      opacity: 0,
    },
    config: {
      duration: 100,
    },
  });
  useLayoutEffect(() => {
    const anchorElem = anchorRef?.current;
    if (anchorElem) {
      setLeft(`${anchorElem.getBoundingClientRect().left}px`);
    }
  }, [anchorRef]);

  const positionStyle = fixed ? { position: "fixed", left } : {};

  return (
    <PopoutDiv
      style={{
        ...show,
        ...style,
        zIndex: 100001,
        right: modal ? 0 : "unset",
        ...positionStyle,
      }}
    >
      {children}
    </PopoutDiv>
  );
};

export default React.memo(Popout);

type PopoutPropsType = {
  children;
  style: object;
  modal?: boolean;
  fixed?: boolean;
  anchorRef?: RefObject<HTMLDivElement>;
};
