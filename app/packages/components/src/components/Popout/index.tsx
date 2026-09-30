import { useSpring } from "@react-spring/web";
import React, { ForwardedRef, PropsWithChildren, CSSProperties } from "react";
import PopoutDiv from "./PopoutDiv";
import { ClickAwayListener } from "@mui/material";

export { PopoutDiv };

export type PopoutProps = PropsWithChildren<{
  style?: CSSProperties;
  modal?: boolean;
  onClose?: () => void;
  popoutProps?: React.HTMLAttributes<HTMLDivElement>;
}>;

function Popout(
  { children, style = {}, modal, onClose, popoutProps = {} }: PopoutProps,
  ref: ForwardedRef<HTMLDivElement>,
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
        {...popoutProps}
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

/** @deprecated Removed from plugin environments in FiftyOne 2.0 and Voxel51 3.0. Use @voxel51/voodo instead. */
export default React.memo(React.forwardRef(Popout));
