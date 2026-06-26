import * as fos from "@fiftyone/state";
import { useMemoOne } from "use-memo-one";
import { v4 as uuid } from "uuid";
import InfiniteGrid from "./InfiniteGrid";
import type { LookerCache } from "./types";
import type { Records } from "./useRecords";
import useEscape from "./useEscape";
import useRenderer from "./useRenderer";
import useScrollLocation from "./useScrollLocation";
import type useSpotlightPager from "./useSpotlightPager";

// Fixed-AR grid: the deterministic, random-access engine. Uniform row height makes the
// full virtual height (hence the full-length scrollbar + deep jumps) computable up
// front, which the measured Spotlight engine can't do — so auto-AR uses Spotlight.
// The looker cache is owned by Grid.tsx and shared with the Spotlight engine.
export default function FixedGrid({
  reset,
  pageReset,
  records,
  pager,
  cache,
}: {
  reset: string;
  pageReset: string;
  records: Records;
  pager: ReturnType<typeof useSpotlightPager>;
  cache: LookerCache;
}) {
  const id = useMemoOne(() => uuid(), []);
  const { store, hydrateWindow, ensureSpineWindow, spineTotal } = pager;

  const { attachItem, releaseItem } = useRenderer({
    cache,
    id,
    records,
    store,
  });
  useScrollLocation(pageReset);

  const setSample = fos.useExpandSample(store);

  useEscape();

  return (
    <InfiniteGrid
      id={id}
      reset={reset}
      ensureSpineWindow={ensureSpineWindow}
      hydrateWindow={hydrateWindow}
      spineTotal={spineTotal}
      store={store}
      attachItem={attachItem}
      releaseItem={releaseItem}
      onItemClick={setSample}
    />
  );
}
