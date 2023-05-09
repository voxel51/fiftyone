import { useSpring } from "@react-spring/web";
import React, { PropsWithChildren } from "react";
import PopoutDiv from "./PopoutDiv";

export type PopoutProps = PropsWithChildren<{
  style?: any;
  modal?: boolean;
}>;

function Popout({ children, style = {}, modal }: PopoutProps) {
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
      style={{ ...show, zIndex: 100001, right: modal ? 0 : "unset", ...style }}
    >
      {children}
    </PopoutDiv>
  );
}

export default React.memo(Popout);
