import React, { useLayoutEffect } from "react";
import { useCommandContext } from "../hooks/useCommandContext";
import { KnownContexts } from "../context";

export interface CommandContextActivatorProps {
  id: string;
  parent?: string;
  propagate?: boolean;
  children: React.ReactNode;
}

const CommandContextActivatorImpl: React.FC<CommandContextActivatorProps> = ({
  id,
  parent,
  propagate = true,
  children,
}) => {
  const {
    context,
    activate,
    deactivate,
    Provider: ContextProvider,
  } = useCommandContext(id, parent, propagate);

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
      key={`${props.id}-${props.parent}-${props.propagate}`}
      {...props}
    />
  );
};
