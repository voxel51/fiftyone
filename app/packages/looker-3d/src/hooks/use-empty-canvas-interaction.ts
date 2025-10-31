import { useThree } from "@react-three/fiber";
import { useCallback, useEffect, useRef } from "react";
import { useRecoilValue, useSetRecoilState } from "recoil";
import { CanvasInteractionSubscriptionPayload } from "../annotation/types";
import { emptyCanvasInteractionSubscriptionsAtom } from "../state";
import {
  createPlane,
  getPlaneIntersection,
  isButtonMatch,
  toNDC,
} from "../utils";

/**
 * Sets up event listeners for empty canvas interactions.
 * This hook should be called once in the Canvas tree (e.g., in AnnotationControls).
 * It reads subscriptions from Recoil state and invokes callbacks for each subscription.
 */
export function useEmptyCanvasInteractionListener() {
  const { gl, camera, raycaster, events } = useThree();
  const subscriptions = useRecoilValue(emptyCanvasInteractionSubscriptionsAtom);

  useEffect(() => {
    const el = (events.connected ?? gl.domElement) as HTMLCanvasElement;

    const handlePointerMove = (ev: PointerEvent) => {
      const ndc = toNDC(ev, el);
      subscriptions.forEach((subscription) => {
        if (!subscription.onPointerMove) return;
        const plane = createPlane(
          subscription.planeNormal,
          subscription.planeConstant
        );
        const pt = getPlaneIntersection(raycaster, camera, ndc, plane);
        if (pt) {
          subscription.onPointerMove(pt, ev);
        }
      });
    };

    const handlePointerDown = (ev: PointerEvent) => {
      subscriptions.forEach((subscription) => {
        if (!subscription.onPointerDown) return;
        if (!isButtonMatch(ev, subscription.button)) return;
        subscription.onPointerDown();
      });
    };

    const handlePointerUp = (ev: PointerEvent) => {
      const ndc = toNDC(ev, el);
      subscriptions.forEach((subscription) => {
        if (!subscription.onPointerUp) return;
        if (!isButtonMatch(ev, subscription.button)) return;
        const plane = createPlane(
          subscription.planeNormal,
          subscription.planeConstant
        );
        const pt = getPlaneIntersection(raycaster, camera, ndc, plane);
        if (pt) {
          subscription.onPointerUp(pt, ev);
        }
      });
    };

    el.addEventListener("pointermove", handlePointerMove, { passive: true });
    el.addEventListener("pointerdown", handlePointerDown, { passive: true });
    el.addEventListener("pointerup", handlePointerUp, { passive: true });

    return () => {
      el.removeEventListener("pointermove", handlePointerMove);
      el.removeEventListener("pointerdown", handlePointerDown);
      el.removeEventListener("pointerup", handlePointerUp);
    };
  }, [gl, camera, raycaster, events, subscriptions]);
}

/**
 * Registers a subscription for empty canvas interactions.
 * Returns an unsubscribe function to remove the subscription.
 *
 * @param payload - Subscription payload with plane parameters and callbacks
 * @returns Unsubscribe function
 */
export function useEmptyCanvasInteraction(
  payload: CanvasInteractionSubscriptionPayload
) {
  const setSubscriptions = useSetRecoilState(
    emptyCanvasInteractionSubscriptionsAtom
  );

  // Refs to avoid re-registering on callback changes
  const onPointerUpRef = useRef(payload.onPointerUp);
  const onPointerDownRef = useRef(payload.onPointerDown);
  const onPointerMoveRef = useRef(payload.onPointerMove);

  onPointerUpRef.current = payload.onPointerUp;
  onPointerDownRef.current = payload.onPointerDown;
  onPointerMoveRef.current = payload.onPointerMove;

  const planeNormalX = payload.planeNormal.x;
  const planeNormalY = payload.planeNormal.y;
  const planeNormalZ = payload.planeNormal.z;

  useEffect(() => {
    const subscription: CanvasInteractionSubscriptionPayload = {
      id: payload.id,
      planeNormal: payload.planeNormal.clone(),
      planeConstant: payload.planeConstant,
      button: payload.button ?? 0,
      onPointerUp: (pt, ev) => onPointerUpRef.current?.(pt, ev),
      onPointerDown: () => onPointerDownRef.current?.(),
      onPointerMove: (pt, ev) => onPointerMoveRef.current?.(pt, ev),
    };

    setSubscriptions((prev) => {
      const next = new Map(prev);
      next.set(payload.id, subscription);
      return next;
    });

    return () => {
      setSubscriptions((prev) => {
        const next = new Map(prev);
        next.delete(payload.id);
        return next;
      });
    };
  }, [
    payload.id,
    planeNormalX,
    planeNormalY,
    planeNormalZ,
    payload.planeConstant,
    payload.button,
    setSubscriptions,
  ]);

  return useCallback(() => {
    setSubscriptions((prev) => {
      const next = new Map(prev);
      next.delete(payload.id);
      return next;
    });
  }, [payload.id, setSubscriptions]);
}
