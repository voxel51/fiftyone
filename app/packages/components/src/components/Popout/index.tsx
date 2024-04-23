import { useSpring } from "@react-spring/web";
import React, { ForwardedRef, PropsWithChildren, CSSProperties } from "react";
import PopoutDiv from "./PopoutDiv";
import { ClickAwayListener } from "@mui/material";

export { PopoutDiv };

export type PopoutProps = PropsWithChildren<{
  style?: CSSProperties;
  modal?: boolean;
  onClose?: () => void;
}>;

function Popout(
  { children, style = {}, modal, onClose }: PopoutProps,
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
    <ClickAwayListener
      onClickAway={() => {
        if (onClose) onClose();
      }}
    >
      <PopoutDiv
        ref={ref}
        style={{
          ...show,
          zIndex: 100001,
          right: modal ? 0 : "unset",
          ...style,
        }}
      >
        {children}
      </PopoutDiv>
    </ClickAwayListener>
  );
}

export default React.memo(React.forwardRef(Popout));
