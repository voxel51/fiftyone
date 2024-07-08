import type { setSampleMutation } from "@fiftyone/relay";
import type { RegisteredWriter } from "./registerWriter";

import { setSample } from "@fiftyone/relay";
import { commitMutation } from "relay-runtime";

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
  (selector) => {
    const search = new URLSearchParams(router.location.search);
    if (selector?.groupId) {
      handleGroupId(search, selector.groupId);
    } else if (selector?.id) {
      handleSampleId(search, selector?.id);
    } else {
      search.delete("sampleId");
      search.delete("groupId");
    }

    let string = search.toString();
    if (string.length) {
      string = `?${string}`;
    }

    router.push(router.location.pathname + string, {
      ...router.location.state,
      modalSelector: selector,
    });
    commitMutation<setSampleMutation>(environment, {
      mutation: setSample,
      variables: {
        groupId: selector?.groupId,
        sampleId: selector?.id,
        subscription,
      },
    });
  };

export default onSetSample;
