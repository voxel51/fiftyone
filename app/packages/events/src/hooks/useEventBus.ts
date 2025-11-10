import { atom, useAtomValue } from "jotai";
import { atomFamily } from "jotai/utils";
import { useMemo } from "react";
import { EventDispatcher } from "../dispatch";
import { EventGroup } from "../types";

const dispatcherFamily = atomFamily(<T extends EventGroup>(channelId: string) =>
  atom(() => new EventDispatcher<T>())
);

export const useEventBus = <T extends EventGroup>(
  { channelId } = { channelId: "default" }
) => {
  const dispatcher = useAtomValue(
    dispatcherFamily(channelId)
  ) as EventDispatcher<T>;

  return useMemo(
    // could return dispatcher directly, but this gives us flexibility to
    // e.g. inject a global observer here
    () =>
      ({
        on: dispatcher.on.bind(dispatcher),
        off: dispatcher.off.bind(dispatcher),
        dispatch: dispatcher.dispatch.bind(dispatcher),
      } as EventDispatcher<T>),
    [dispatcher]
  );
};
