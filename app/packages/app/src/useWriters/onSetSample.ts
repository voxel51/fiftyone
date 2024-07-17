import type { setSampleMutation } from "@fiftyone/relay";
import type { RegisteredWriter } from "./registerWriter";

import { setSample } from "@fiftyone/relay";
import { commitMutation } from "relay-runtime";

export const handleGroup = (search: URLSearchParams, group?: string) => {
  group ? search.set("group", group) : search.delete("group");
};

export const handleGroupId = (search: URLSearchParams, groupId?: string) => {
  if (groupId) {
    search.delete("sampleId");
    search.set("groupId", groupId);
  } else {
    search.delete("sampleId");
  }
};

export const handleSampleId = (search: URLSearchParams, sampleId?: string) => {
  if (sampleId) {
    search.delete("groupId");
    search.set("sampleId", sampleId);
  } else {
    search.delete("groupId");
    search.delete("sampleId");
  }
};

const onSetSample: RegisteredWriter<"modalSelector"> =
  ({ environment, router, subscription }) =>
  (selector) => {
    const search = new URLSearchParams(router.location.search);

    handleGroupId(search, selector?.groupId);
    !selector?.groupId && handleSampleId(search, selector?.id);

    let string = search.toString();
    if (string.length) {
      string = `?${string}`;
    }

    router.push(router.location.pathname + string, {
      ...router.location.state,
      event: "modal",
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
