import React, { useLayoutEffect } from "react";
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
  const {
    context,
    activate,
    deactivate,
    Provider: ContextProvider,
  } = useCommandContext(id, inheritContext);

  useLayoutEffect(() => {
    if (context) {
      activate();
    }
    return () => {
      if (context) {
        deactivate();
      }
    };
  }, [activate, deactivate, context]);

  if (!context) {
    return null;
  }

  return <ContextProvider value={context}>{children}</ContextProvider>;
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
