import { getEventBus } from "@fiftyone/events";
import { useSpring } from "@react-spring/web";
import type { MutableRefObject, RefObject } from "react";
import React, { useEffect, useLayoutEffect, useState } from "react";
import { PopoutDiv } from "../utils";

/** e2e specs wait on an action popout mounting and unmounting */
type PopoutE2EEvents = {
  "e2e:actions:popout": { id: string; open: boolean };
};

const useAlign = (
  anchorRef: MutableRefObject<HTMLElement>,
  modal?: boolean,
) => {
  const [align, setAlign] = useState("auto");
  useLayoutEffect(() => {
    const anchorElem = anchorRef?.current;
    if (anchorElem) {
      let offset = anchorElem.getBoundingClientRect()[modal ? "right" : "left"];
      if (modal) {
        offset = window.innerWidth - offset;
      }
      setAlign(`${offset}px`);
    }
  }, [anchorRef, modal]);

  return modal ? { marginRight: align, left: 0, right: 0 } : { left: align };
};

const Popout = ({
  children,
  style = {},
  modal,
  fixed,
  anchorRef,
  testId,
}: PopoutPropsType) => {
  const show = useSpring({
    opacity: 1,
    from: {
      opacity: 0,
    },
    config: {
      duration: 100,
    },
  });
  const alignStyle = useAlign(anchorRef, modal);
  const id = testId ?? "popout";

  useEffect(() => {
    const bus = getEventBus<PopoutE2EEvents>();
    bus.dispatch("e2e:actions:popout", { id, open: true });
    return () => bus.dispatch("e2e:actions:popout", { id, open: false });
  }, [id]);

  const positionStyle = fixed ? { position: "fixed" } : {};

  return (
    <PopoutDiv
      style={{
        zIndex: 100001,
        ...show,
        ...style,
        ...alignStyle,
        ...positionStyle,
      }}
      data-cy={id}
    >
      {children}
    </PopoutDiv>
  );
};

export default React.memo(Popout);

type PopoutPropsType = {
  children: React.ReactNode;
  style?: React.CSSProperties;
  modal?: boolean;
  fixed?: boolean;
  anchorRef?: RefObject<HTMLElement> | null;
  testId?: string;
};
