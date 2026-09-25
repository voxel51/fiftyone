import { addAfterEffect, useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useRef } from "react";
import { getEventBus } from "@fiftyone/events";

/** Primitive fields describing what one rendered frame drew. */
export type FrameRenderedDetail = Readonly<
  Record<string, boolean | number | string | null>
>;

/**
 * Test signal for browser automation: after each frame its R3F root renders,
 * dispatches the `e2e:` bus event `event` with `detail` as committed for that
 * frame. Mount it only when `isE2E()`, since it adds per-frame work.
 */
export function FrameRenderedSignal({
  detail,
  event,
}: {
  readonly detail: FrameRenderedDetail;
  readonly event: string;
}) {
  const detailRef = useRef(detail);
  const renderedRef = useRef(false);

  // This layout effect pairs the detail with the commit the next frame draws.
  useLayoutEffect(() => {
    detailRef.current = detail;
  });

  // Priority 0 leaves R3F's automatic render in place for this root.
  useFrame(() => {
    renderedRef.current = true;
  });

  // This effect dispatches after every root has rendered the frame.
  useEffect(
    () =>
      addAfterEffect(() => {
        if (!renderedRef.current) return;
        renderedRef.current = false;
        getEventBus<Record<string, FrameRenderedDetail>>().dispatch(
          event,
          detailRef.current,
        );
      }),
    [event],
  );

  return null;
}
