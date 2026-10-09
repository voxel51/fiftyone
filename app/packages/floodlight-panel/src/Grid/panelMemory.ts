import { usePanelId } from "@fiftyone/spaces";
import { useMemo } from "react";

interface Held {
  key: string;
  value: unknown;
  dispose?: (value: unknown) => void;
}

const panels = new Map<string, Map<string, Held>>();

/**
 * A value that outlives the grid's mount in its panel while `key` holds, so
 * leaving the grid (opening a sample's page) and returning restores it as it
 * was. A new key disposes the old value and creates a new one.
 */
export const panelValue = <T>(
  panel: string,
  name: string,
  key: string,
  create: () => T,
  dispose?: (value: T) => void,
): T => {
  let slots = panels.get(panel);
  if (!slots) {
    slots = new Map();
    panels.set(panel, slots);
  }
  const held = slots.get(name);
  if (held?.key === key) return held.value as T;
  held?.dispose?.(held.value);
  const value = create();
  slots.set(name, {
    key,
    value,
    dispose: dispose as Held["dispose"],
  });
  return value;
};

export default function usePanelMemo<T>(
  name: string,
  key: string,
  create: () => T,
  dispose?: (value: T) => void,
): T {
  const panel = usePanelId() ?? "grid";
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(
    () => panelValue(panel, name, key, create, dispose),
    [panel, name, key],
  );
}
