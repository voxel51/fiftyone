import { useSpring } from "@react-spring/web";
import React, { ForwardedRef, PropsWithChildren } from "react";
import PopoutDiv from "./PopoutDiv";

export { PopoutDiv };

export type PopoutProps = PropsWithChildren<{
  style?: any;
  modal?: boolean;
}>;

function Popout(
  { children, style = {}, modal }: PopoutProps,
  ref: ForwardedRef<HTMLDivElement>
) {
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
      ref={ref}
      style={{ ...show, zIndex: 100001, right: modal ? 0 : "unset", ...style }}
    >
      {children}
    </PopoutDiv>
  );
}

export default React.memo(React.forwardRef(Popout));
