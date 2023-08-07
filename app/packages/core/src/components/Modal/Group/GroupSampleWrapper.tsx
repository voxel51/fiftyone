import classNames from "classnames";
import React, {
  MouseEventHandler,
  MutableRefObject,
  useCallback,
  useRef,
  useState,
} from "react";
import { GroupSampleBar } from "../Bars";
import { groupSample, groupSampleActive } from "./Group.module.css";

export const GroupSampleWrapper: React.FC<
  React.PropsWithChildren<{
    sampleId: string;
    pinned: boolean;
    onClick: MouseEventHandler;
    onMouseEnter: MouseEventHandler;
    onMouseLeave: MouseEventHandler;
  }>
> = ({ children, onClick, pinned, sampleId, onMouseEnter, onMouseLeave }) => {
  const [hovering, setHovering] = useState(false);

  const timeout: MutableRefObject<number | null> = useRef<number>(null);
  const clear = useCallback(() => {
    if (hoveringRef.current) return;
    timeout.current && window.clearTimeout(timeout.current);
    setHovering(false);
  }, []);
  const update = useCallback(() => {
    !hovering && setHovering(true);
    timeout.current && window.clearTimeout(timeout.current);
    timeout.current = window.setTimeout(clear, 3000);

    return () => {
      timeout.current && clearTimeout(timeout.current);
    };
  }, [clear, hovering]);
  const hoveringRef = useRef(false);

  return (
    <div
      data-cy="group-sample-wrapper"
      className={
        pinned ? classNames(groupSample, groupSampleActive) : groupSample
      }
      onMouseEnter={(e) => {
        update();
        onMouseEnter(e);
      }}
      onMouseMove={update}
      onMouseLeave={(e) => {
        clear();
        onMouseLeave(e);
      }}
      onClickCapture={onClick}
    >
      {children}
      {hovering && (
        <GroupSampleBar
          hoveringRef={hoveringRef}
          sampleId={sampleId}
          pinned={pinned}
        />
      )}
    </div>
  );
};
