import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Command } from "../types";
import { getCommandRegistry } from "../registry";

// React hook for creating new commands
export const useNewCommand = (
  id: string,
  execFn: () => Promise<void>,
  isEnabledFn: () => boolean,
  undoFn?: () => Promise<void>,
  label?: string,
  description?: string
): {
  //command will be undefined if it can't be registered (currently only if the command id is already registered)
  isEnabled: boolean;
  setEnabledFn: (fn: () => boolean) => void;
} => {

  const [isEnabled, setIsEnabled] = useState<boolean>(isEnabledFn());
  const isEnabledFnRef = useRef<() => boolean>(isEnabledFn);

  // Create command instance, and unregister it on unmount
  useEffect(() => {
    let command: Command | undefined;
    try {
      command = getCommandRegistry().registerCommand(id, execFn, isEnabledFnRef.current, undoFn, label, description);
    }
    catch (error: unknown) {
      if (error instanceof Error) {
        console.error(error.message);
      }
    }
    return () => {
      if (command) {
        getCommandRegistry().unregisterCommand(id);
      }
    }
  }, [id, execFn, undoFn, label, description]);

  //subscribe to enablement updates
  useEffect(() => {
    const command = getCommandRegistry().getCommand(id);
    if (command) {
      return getCommandRegistry().getCommand(id)!.subscribe(() => {
        setIsEnabled(command.isEnabled());
      });
    }
    return () => { return; };
  });

  // Update the function reference
  useEffect(() => {
    isEnabledFnRef.current = isEnabledFn;
    setIsEnabled(isEnabledFn());
    //update the registered command too
    getCommandRegistry().getCommand(id)!.setEnablement(isEnabledFn);
  }, [isEnabledFn, id]);

  const setEnabledFn = useCallback((fn: () => boolean) => {
    isEnabledFnRef.current = fn;
    setIsEnabled(fn());
  }, []);

  return {
    isEnabled,
    setEnabledFn,
  };
}
