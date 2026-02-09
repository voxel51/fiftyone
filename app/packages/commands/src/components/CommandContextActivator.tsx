import React, { useLayoutEffect } from "react";
import { useCommandContext } from "../hooks/useCommandContext";

export interface CommandContextActivatorProps {
  id: string;
  inheritContext?: boolean;
  children: React.ReactNode;
}

export const CommandContextActivator: React.FC<
  CommandContextActivatorProps
> = ({ id, inheritContext, children }) => {
  const { context, activate, deactivate } = useCommandContext(
    id,
    inheritContext
  );

  const [active, setActive] = React.useState(false);
  const lastContextRef = React.useRef(context);

  if (context !== lastContextRef.current) {
    lastContextRef.current = context;
    if (active) {
      setActive(false);
    }
  }

  useLayoutEffect(() => {
    if (context) {
      activate();
      setActive(true);
    }
    return () => {
      if (context) {
        setActive(false);
        deactivate();
      }
    };
  }, [activate, deactivate, context]);

  if (!context || !active) {
    return null;
  }

  return <>{children}</>;
};
