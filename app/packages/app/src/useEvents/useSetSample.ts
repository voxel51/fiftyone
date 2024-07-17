import { useSessionSetter, useSetModalState } from "@fiftyone/state";
import { useCallback } from "react";
import type { EventHandlerHook } from "./registerEvent";

export const handleGroupId = (search: URLSearchParams, groupId: string) => {
  search.delete("sampleId");
  search.set("groupId", groupId);
};

export const handleSampleId = (search: URLSearchParams, sampleId: string) => {
  search.delete("groupId");
  search.set("sampleId", sampleId);
};

const useSetSample: EventHandlerHook = ({ router }) => {
  const setModalState = useSetModalState();
  const setter = useSessionSetter();

  return useCallback(
    (payload) => {
      setModalState().then(() => {
        const search = new URLSearchParams(router.history.location.search);
        if (payload?.group_id) {
          handleGroupId(search, payload.group_id);
        } else if (payload?.sample_id) {
          handleSampleId(search, payload?.sample_id);
        } else {
          search.delete("sampleId");
          search.delete("groupId");
        }

        let string = search.toString();
        if (string.length) {
          string = `?${string}`;
        }

        const pathname = router.history.location.pathname + string;

        const selector =
          payload.group_id || payload.sample_id
            ? {
                groupId: payload.group_id as string,
                id: payload.sample_id as string,
              }
            : undefined;
        router.push(pathname, {
          event: "modal",
          modalSelector: selector,
          ...router.location.state,
        });
        setter("modalSelector", selector);
      });
    },
    [router, setModalState, setter]
  );
};

export default useSetSample;
