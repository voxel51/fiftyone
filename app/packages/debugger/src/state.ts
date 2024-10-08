import { usePanels, usePanelState, useSpaceNodes, useSpaces } from "@fiftyone/spaces";
import {
  atom,
  useRecoilState,
  isRecoilValue,
  useRecoilValue,
  useRecoilCallback,
} from "recoil";
import { useState } from "react";

const atoms = {
  logs: atom({
    key: "logs",
    default: [],
  }),
  currentCommand: atom({
    key: "currentCommand",
    default: "",
  }),
  panelToInspect: atom({
    key: "panelToInspect",
    default: "state",
  }),
};

// Define Recoil atoms
export const myAtom = atom({
  key: "my-atom",
  default: 42,
});

export function evaluateInContext(expression, context) {
  try {
    const contextKeys = Object.keys(context);
    const contextValues = Object.values(context);

    const func = new Function(...contextKeys, `return ${expression};`);
    return func(...contextValues);
  } catch (error) {
    throw new Error(`Evaluation Error: ${error.message}`);
  }
}
function resolveValue(value) {
  // if value is an atom
  if (isRecoilValue(value)) {
    return useRecoilValue(value);
  }
  return value;
}
export function getAutoCompleteSuggestions(input, context) {
  const parts = input.split(".");

  if (parts.length === 2 && parts[0] in context) {
    const query = parts[1];
    return Object.keys(context[parts[0]]).filter((key) =>
      key.startsWith(query)
    );
  }

  if (parts.length === 1) {
    return Object.keys(context).filter((key) => key.startsWith(parts[0]));
  }

  return [];
}

import * as fos from "@fiftyone/state";
import { FIFTYONE_GRID_SPACES_ID } from "@fiftyone/state/src/constants";
import { useGlobalExecutionContext } from "@fiftyone/operators";

function useConsoleContext() {
  const ctx = useGlobalExecutionContext();
  const panels = usePanels();
  const spaces = useSpaces(FIFTYONE_GRID_SPACES_ID);
  const [currentPanelId, setCurrentPanel] = useRecoilState(atoms.panelToInspect);
  const [panel] = usePanelState(null, currentPanelId);
  return {
    fos,
    panels,
    spaces,
    panel,
    setCurrentPanel,
    ctx
  };
}

export function useConsole() {
  const consoleContext = useConsoleContext();

  const [logs, setLogs] = useState([]);
  const resolveValue = useRecoilCallback(({ snapshot }) => async (value) => {
    if (isRecoilValue(value)) {
      return snapshot.getPromise(value);
    }
    return value;
  });

  const handleCommand = async (command) => {
    try {
      // Create a new function to evaluate the command in the context of the `state` object
      const rawResult = evaluateInContext(command, consoleContext);
      const result = await resolveValue(rawResult);

      // Log the command and the result
      setLogs((prevLogs) => [
        ...prevLogs,
        { type: "command", text: command },
        { type: "response", text: JSON.stringify(result, null, 2) },
      ]);
    } catch (error) {
      // If there's an error, log it as an error response
      setLogs((prevLogs) => [
        ...prevLogs,
        { type: "command", text: command },
        { type: "error", text: `Error: ${error.message}` },
      ]);
    }
  };

  return {
    logs,
    handleCommand,
    getAutoCompleteSuggestions: (input) => {
      return getAutoCompleteSuggestions(input, consoleContext);
    },
  };
}

export function usePanelStateInspector() {
  const [panelToInspect, setPanelToInspect] = useRecoilState(
    atoms.panelToInspect
  );
  const panelState = usePanelState(panelToInspect);
  const panels = usePanels();
  return {
    panelState,
    setPanelToInspect,
    panels,
  };
}
