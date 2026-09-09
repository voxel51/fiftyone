import {
  isEpisodeReadCancelledError,
  type ReadWorkUsage,
} from "../../../ports";
import { throwIfAborted } from "../../../utils/cancellation";
import { yieldToTask } from "../../../utils/task-yield";
import {
  isMcapBoundedReadCancelledError,
  McapBoundedReadCancelledError,
} from "./bounded-read-cancellation";

/** Cooperative decode cadence shared by every bounded MCAP grant consumer. */
export const MCAP_BOUNDED_GRANT_YIELD_INTERVAL = 32;
const MCAP_BOUNDED_GRANT_ABORT_MESSAGE =
  "MCAP bounded grant consumption aborted";

/** Consumes an admitted grant with uniform yields and cancellation accounting. */
export async function consumeMcapBoundedGrant<Item>({
  items,
  onItem,
  signal,
  usage,
}: {
  readonly items: readonly Item[];
  readonly onItem: (item: Item, index: number) => void | Promise<void>;
  readonly signal?: AbortSignal;
  readonly usage: () => ReadWorkUsage;
}): Promise<void> {
  try {
    await yieldToTask();
    throwIfAborted(signal, MCAP_BOUNDED_GRANT_ABORT_MESSAGE);
    for (const [index, item] of items.entries()) {
      if (index > 0 && index % MCAP_BOUNDED_GRANT_YIELD_INTERVAL === 0) {
        await yieldToTask();
      }
      throwIfAborted(signal, MCAP_BOUNDED_GRANT_ABORT_MESSAGE);
      await onItem(item, index);
      throwIfAborted(signal, MCAP_BOUNDED_GRANT_ABORT_MESSAGE);
    }
  } catch (error) {
    if (
      signal?.aborted ||
      isEpisodeReadCancelledError(error) ||
      isMcapBoundedReadCancelledError(error)
    ) {
      throw new McapBoundedReadCancelledError(usage());
    }
    throw error;
  }
}
