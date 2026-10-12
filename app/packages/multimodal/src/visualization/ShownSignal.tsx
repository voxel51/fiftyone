import { getEventBus } from "@fiftyone/events";
import { useEffect } from "react";

/** Primitive fields describing what a view shows. */
export type ShownDetail = Readonly<
  Record<string, boolean | number | string | null>
>;

/**
 * Test signal for browser automation: dispatches the `e2e:` bus event
 * `event` with `detail` after the commit that shows it, and again whenever
 * `detail` changes
 */
export function ShownSignal({
  detail,
  event,
}: {
  readonly detail: ShownDetail;
  readonly event: `e2e:${string}`;
}) {
  const key = JSON.stringify(detail);
  useEffect(() => {
    getEventBus<Record<string, ShownDetail>>().dispatch(
      event,
      JSON.parse(key) as ShownDetail,
    );
  }, [event, key]);
  return null;
}
