import { type ThreeEvent } from "@react-three/fiber";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";

import { CLICK_DRAG_TOLERANCE_PX } from "../interaction/interaction";

type SceneHoverClearReason = "disabled" | "pointer" | "reconcile" | "unmount";

interface ActiveSceneHover<Target> {
  readonly hitKeys: Set<string>;
  target: Target;
}

interface SceneHoverLifecycle<Target> {
  readonly onPointerOut: (event: ThreeEvent<PointerEvent>) => void;
  readonly onPointerOver: (
    event: ThreeEvent<PointerEvent>,
    target: Target,
  ) => void;
  readonly reconcile: (
    resolveTarget: (key: string) => Target | null,
  ) => ReadonlySet<string>;
}

const pointerCursorOwners = new Set<symbol>();
const EMPTY_SCENE_HOVER_KEYS: ReadonlySet<string> = new Set();
let pointerCursorRestore = "";

function acquirePointerCursor(owner: symbol): void {
  if (typeof document === "undefined" || pointerCursorOwners.has(owner)) {
    return;
  }
  if (pointerCursorOwners.size === 0) {
    pointerCursorRestore = document.body.style.cursor;
    document.body.style.cursor = "pointer";
  }
  pointerCursorOwners.add(owner);
}

function releasePointerCursor(owner: symbol): void {
  if (typeof document === "undefined" || !pointerCursorOwners.delete(owner)) {
    return;
  }
  if (pointerCursorOwners.size === 0) {
    document.body.style.cursor = pointerCursorRestore;
    pointerCursorRestore = "";
  }
}

function hoverHitKey(event: ThreeEvent<PointerEvent>): string {
  const objectId = event.object?.uuid ?? "surface";
  return `${objectId}:${event.index ?? ""}:${event.instanceId ?? ""}`;
}

/**
 * Owns the shared scene-object hover lifecycle. Each ray hit is reference
 * counted under its logical target so compound and overlapping objects remain
 * hovered until their final hit leaves. Cursor ownership is shared across
 * hook instances for the same reason.
 */
export function useSceneHoverLifecycle<Target>({
  enabled,
  keyForTarget,
  onEnter,
  onLeave,
}: {
  readonly enabled: boolean;
  readonly keyForTarget: (target: Target) => string;
  readonly onEnter: (target: Target) => void;
  readonly onLeave: (target: Target, reason: SceneHoverClearReason) => void;
}): SceneHoverLifecycle<Target> {
  const activeHitsRef = useRef(new Map<string, string>());
  const activeTargetsRef = useRef(new Map<string, ActiveSceneHover<Target>>());
  const cursorOwnerRef = useRef(Symbol("scene-hover"));
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const keyForTargetRef = useRef(keyForTarget);
  keyForTargetRef.current = keyForTarget;
  const onEnterRef = useRef(onEnter);
  onEnterRef.current = onEnter;
  const onLeaveRef = useRef(onLeave);
  onLeaveRef.current = onLeave;

  const leaveHit = useCallback(
    (hitKey: string, reason: SceneHoverClearReason) => {
      const targetKey = activeHitsRef.current.get(hitKey);
      if (!targetKey) return;
      activeHitsRef.current.delete(hitKey);
      const active = activeTargetsRef.current.get(targetKey);
      if (!active) return;
      active.hitKeys.delete(hitKey);
      if (active.hitKeys.size > 0) return;
      activeTargetsRef.current.delete(targetKey);
      onLeaveRef.current(active.target, reason);
      if (activeTargetsRef.current.size === 0) {
        releasePointerCursor(cursorOwnerRef.current);
      }
    },
    [],
  );

  const clear = useCallback((reason: SceneHoverClearReason = "pointer") => {
    const activeTargets = Array.from(activeTargetsRef.current.values());
    activeHitsRef.current.clear();
    activeTargetsRef.current.clear();
    for (const active of activeTargets) {
      onLeaveRef.current(active.target, reason);
    }
    releasePointerCursor(cursorOwnerRef.current);
  }, []);

  const onPointerOver = useCallback(
    (event: ThreeEvent<PointerEvent>, target: Target) => {
      if (!enabledRef.current) return;
      const hitKey = hoverHitKey(event);
      const targetKey = keyForTargetRef.current(target);
      const previousTargetKey = activeHitsRef.current.get(hitKey);
      if (previousTargetKey === targetKey) {
        const active = activeTargetsRef.current.get(targetKey);
        if (active) active.target = target;
        return;
      }
      if (previousTargetKey) leaveHit(hitKey, "pointer");

      activeHitsRef.current.set(hitKey, targetKey);
      const active = activeTargetsRef.current.get(targetKey);
      if (active) {
        active.target = target;
        active.hitKeys.add(hitKey);
        return;
      }

      activeTargetsRef.current.set(targetKey, {
        hitKeys: new Set([hitKey]),
        target,
      });
      acquirePointerCursor(cursorOwnerRef.current);
      onEnterRef.current(target);
    },
    [leaveHit],
  );

  const onPointerOut = useCallback(
    (event: ThreeEvent<PointerEvent>) =>
      leaveHit(hoverHitKey(event), "pointer"),
    [leaveHit],
  );

  const reconcile = useCallback(
    (resolveTarget: (key: string) => Target | null) => {
      for (const [key, active] of activeTargetsRef.current) {
        const target = resolveTarget(key);
        if (target) {
          active.target = target;
          continue;
        }
        for (const hitKey of active.hitKeys) {
          activeHitsRef.current.delete(hitKey);
        }
        activeTargetsRef.current.delete(key);
        onLeaveRef.current(active.target, "reconcile");
      }
      if (activeTargetsRef.current.size === 0) {
        releasePointerCursor(cursorOwnerRef.current);
        return EMPTY_SCENE_HOVER_KEYS;
      }
      return new Set(activeTargetsRef.current.keys());
    },
    [],
  );

  // This layout effect clears active hover ownership before a disabled scene
  // can paint one more emphasized frame.
  useLayoutEffect(() => {
    if (!enabled) clear("disabled");
  }, [clear, enabled]);

  // This effect retires all host and cursor ownership on unmount.
  useEffect(() => () => clear("unmount"), [clear]);

  return useMemo(
    () => ({
      onPointerOut,
      onPointerOver,
      reconcile,
    }),
    [onPointerOut, onPointerOver, reconcile],
  );
}

/** Whether a fiber click represents a primary-button, non-drag selection. */
export function isScenePrimarySelection(
  event: ThreeEvent<MouseEvent>,
): boolean {
  return (
    event.nativeEvent.button === 0 && event.delta <= CLICK_DRAG_TOLERANCE_PX
  );
}
