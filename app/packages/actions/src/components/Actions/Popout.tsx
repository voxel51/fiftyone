import { getEventBus } from "@fiftyone/events";
import type { CSSProperties, ReactNode } from "react";
import React, { useEffect } from "react";
import styles from "./Popout.module.css";

/** e2e specs wait on an action popout mounting and unmounting */
type PopoutE2EEvents = {
  "e2e:actions:popout": { id: string; open: boolean };
};

/**
 * An action's panel, hung below its trigger: the action's container is its
 * positioned ancestor. In the viewer it aligns to the trigger's right edge.
 */
const Popout = ({
  children,
  modal,
  style,
  testId,
}: {
  children: ReactNode;
  modal?: boolean;
  style?: CSSProperties;
  testId?: string;
}) => {
  const id = testId ?? "popout";

  useEffect(() => {
    const bus = getEventBus<PopoutE2EEvents>();
    bus.dispatch("e2e:actions:popout", { id, open: true });
    return () => bus.dispatch("e2e:actions:popout", { id, open: false });
  }, [id]);

  return (
    <div
      className={[styles.popout, modal ? styles.end : styles.start].join(" ")}
      data-cy={id}
      style={style}
    >
      {children}
    </div>
  );
};

export default React.memo(Popout);
