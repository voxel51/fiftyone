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
        } else if (payload?.id) {
          handleSampleId(search, payload?.id);
        } else {
          search.delete("sampleId");
          search.delete("groupId");
        }

        let string = search.toString();
        if (string.length) {
          string = `?${string}`;
        }

        const pathname = router.history.location.pathname + string;
        router.push(pathname, {
          groupId: payload.group_id || null,
          sampleId: payload.sample_id || null,
          ...router.location.state,
        });
        setter("sessionSampleId", {
          groupId: payload.group_id || null,
          id: payload.sample_id || null,
        });
      });
    },
    [router, setModalState, setter]
  );
};

export default useSetSample;
