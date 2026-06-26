import * as fos from "@fiftyone/state";
import { useRecoilValue } from "recoil";
import { useMemoOne } from "use-memo-one";
import { v4 as uuid } from "uuid";
import InfiniteGrid from "./InfiniteGrid";
import { maxGridItemsSizeBytes } from "./recoil";
import useEscape from "./useEscape";
import useLabelVisibility from "./useLabelVisibility";
import useLookerCache from "./useLookerCache";
import type { Records } from "./useRecords";
import useRenderer from "./useRenderer";
import useScrollLocation from "./useScrollLocation";
import type useSpotlightPager from "./useSpotlightPager";

const MAX_INSTANCES = 200;

// Fixed-AR grid: the deterministic, random-access engine. Uniform row height makes the
// full virtual height (hence the full-length scrollbar + deep jumps) computable up
// front, which the measured Spotlight engine can't do — so auto-AR uses Spotlight.
export default function FixedGrid({
  reset,
  pageReset,
  records,
  pager,
}: {
  reset: string;
  pageReset: string;
  records: Records;
  pager: ReturnType<typeof useSpotlightPager>;
}) {
  const id = useMemoOne(() => uuid(), []);
  const { store, hydrateWindow, ensureSpineWindow, spineTotal } = pager;

  // divide by two, half for the hidden cache and half for max shown
  const maxBytes = useRecoilValue(maxGridItemsSizeBytes) / 2;
  const { onDispose, onSet } = useLabelVisibility();
  const cache = useLookerCache({
    maxHiddenItems: MAX_INSTANCES,
    maxHiddenItemsSizeBytes: maxBytes,
    reset,
    onSet,
    onDispose,
  });

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
