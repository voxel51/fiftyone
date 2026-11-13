import { EventUtils } from "src/shared/event-utils";

/**
 * Run `action` and resolve once the action popout `id` (its `data-cy`) has
 * mounted (`open`) or unmounted
 */
export const afterPopout = <T>(
  eventUtils: EventUtils,
  id: string,
  open: boolean,
  action: () => Promise<T>,
): Promise<T> =>
  eventUtils.after("e2e:actions:popout", action, (e) => {
    const detail = e.detail as { id: string; open: boolean };
    return detail.id === id && detail.open === open;
  });
