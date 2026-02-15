import type { RegisteredWriter } from "./registerWriter";

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
  ({ router }) =>
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
  };

export default onSetSample;
