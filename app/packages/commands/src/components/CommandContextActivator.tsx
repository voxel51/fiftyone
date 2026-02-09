import React, { useLayoutEffect, useState } from "react";
import { useCommandContext } from "../hooks/useCommandContext";

export interface CommandContextActivatorProps {
  id: string;
  inheritContext?: boolean;
  children: React.ReactNode;
}

const CommandContextActivatorImpl: React.FC<CommandContextActivatorProps> = ({
  id,
  inheritContext,
  children,
}) => {
  const { context, activate, deactivate } = useCommandContext(
    id,
    inheritContext
  );
  const [active, setActive] = useState(false);

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

export const CommandContextActivator: React.FC<CommandContextActivatorProps> = (
  props
) => {
  // Use key to force remount (and state reset) when context ID changes
  return (
    <CommandContextActivatorImpl
      key={`${props.id}-${props.inheritContext}`}
      {...props}
    />
  );
};
