import type { setSampleMutation } from "@fiftyone/relay";
import type { RegisteredWriter } from "./registerWriter";

import { setSample } from "@fiftyone/relay";
import { env } from "@fiftyone/utilities";
import { commitMutation } from "relay-runtime";

export const handleGroup = (search: URLSearchParams, group?: string) => {
  group ? search.set("group", group) : search.delete("group");
};

export const handleGroupId = (search: URLSearchParams, groupId?: string) => {
  if (groupId) {
    search.delete("id");
    search.set("groupId", groupId);
  } else {
    search.delete("id");
  }
};

export const handleSampleId = (search: URLSearchParams, id?: string) => {
  if (id) {
    search.delete("groupId");
    search.set("id", id);
  } else {
    search.delete("groupId");
    search.delete("id");
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

    if (env().VITE_NO_STATE) return;

    commitMutation<setSampleMutation>(environment, {
      mutation: setSample,
      variables: {
        groupId: selector?.groupId,
        id: selector?.id,
        subscription,
      },
    });
  };

export default onSetSample;
