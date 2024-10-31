import { setGroupSlice, type setGroupSliceMutation } from "@fiftyone/relay";
import { env } from "@fiftyone/utilities";
import { commitMutation } from "relay-runtime";
import type { RegisteredWriter } from "./registerWriter";

const onSetGroupSlice: RegisteredWriter<"sessionGroupSlice"> =
  ({ environment, router, subscription }) =>
  (slice) => {
    const search = new URLSearchParams(router.history.location.search);
    slice ? search.set("slice", slice) : search.delete("slice");

    const string = `?${search.toString()}`;

    const pathname = router.history.location.pathname + string;

    router.push(pathname, {
      ...router.location.state,
      event: "slice",
      groupSlice: slice,
    });

    if (env().VITE_NO_STATE) return;
    commitMutation<setGroupSliceMutation>(environment, {
      mutation: setGroupSlice,
      variables: {
        slice,
        subscription,
      },
    });
  };

export default onSetGroupSlice;
