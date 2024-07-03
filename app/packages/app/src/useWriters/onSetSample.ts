import { setSample, setSampleMutation } from "@fiftyone/relay";
import { commitMutation } from "relay-runtime";
import type { RegisteredWriter } from "./registerWriter";

export const handleGroupId = (search: URLSearchParams, groupId: string) => {
  search.delete("sampleId");
  search.set("groupId", groupId);
};

export const handleSampleId = (search: URLSearchParams, sampleId: string) => {
  search.delete("groupId");
  search.set("sampleId", sampleId);
};

const onSetSample: RegisteredWriter<"sessionSampleId"> =
  ({ environment, router, subscription }) =>
  (data) => {
    const search = new URLSearchParams(router.history.location.search);
    if (data?.groupId) {
      handleGroupId(search, data.groupId);
    } else if (data?.id) {
      handleSampleId(search, data?.id);
    } else {
      search.delete("sampleId");
      search.delete("groupId");
    }

    let string = search.toString();
    if (string.length) {
      string = `?${string}`;
    }

    const pathname = router.history.location.pathname + string;
    router.history.push(pathname, router.history.location.state);
    commitMutation<setSampleMutation>(environment, {
      mutation: setSample,
      variables: {
        groupId: data?.groupId,
        sampleId: data?.id,
        subscription,
      },
    });
  };

export default onSetSample;
