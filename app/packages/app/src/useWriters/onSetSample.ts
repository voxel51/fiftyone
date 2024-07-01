import type { RegisteredWriter } from "./registerWriter";

const handleGroupId = (search: URLSearchParams, groupId: string) => {
  search.delete("sampleId");
  search.set("groupId", groupId);
};

const handleSampleId = (search: URLSearchParams, sampleId: string) => {
  search.delete("groupId");
  search.set("sampleId", sampleId);
};

const onSetSample: RegisteredWriter<"sessionSampleId"> =
  ({ router }) =>
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
  };

export default onSetSample;
