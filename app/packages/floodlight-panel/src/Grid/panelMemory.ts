import { usePanelId } from "@fiftyone/spaces";
import { useEffect, useMemo } from "react";

interface Held {
  key: string;
  value: unknown;
  dispose?: (value: unknown) => void;
}

/**
 * Unmounted panels whose values are held (a grid left for a sample's page,
 * or a closed panel); past this many, the least recently used go.
 */
export const MAX_IDLE_PANELS = 8;

const panels = new Map<string, Map<string, Held>>();
const mounts = new Map<string, number>();

const prune = () => {
  let idle = 0;
  for (const panel of panels.keys()) mounts.get(panel) || idle++;
  for (const [panel, slots] of panels) {
    if (idle <= MAX_IDLE_PANELS) return;
    if (mounts.get(panel)) continue;
    panels.delete(panel);
    idle--;
    for (const held of slots.values()) held.dispose?.(held.value);
  }
};

/** Marks `panel` in use until the returned release; idle panels are pruned. */
export const mountPanel = (panel: string) => {
  mounts.set(panel, (mounts.get(panel) ?? 0) + 1);
  return () => {
    const left = (mounts.get(panel) ?? 1) - 1;
    left ? mounts.set(panel, left) : mounts.delete(panel);
    prune();
  };
};

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
  const slots = panels.get(panel) ?? new Map<string, Held>();
  panels.delete(panel);
  panels.set(panel, slots);
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
  useEffect(() => mountPanel(panel), [panel]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(
    () => panelValue(panel, name, key, create, dispose),
    [panel, name, key],
  );
}
