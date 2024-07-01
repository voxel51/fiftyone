import { RegisteredWriter } from "./registerWriter";

const onSetSample: RegisteredWriter<"sessionSampleId"> =
  ({ router }) =>
  (data) => {
    const sampleId = data?.id;
    const search = new URLSearchParams(router.history.location.search);
    if (!sampleId) {
      search.delete("sampleId");
    } else {
      search.set("sampleId", sampleId);
    }

    let string = search.toString();

    if (string.length) {
      string = "?" + string;
    }

    const pathname = router.history.location.pathname + string;

    router.history.push(pathname, router.history.location.state);
  };

export default onSetSample;
