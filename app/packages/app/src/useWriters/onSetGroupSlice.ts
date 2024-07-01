import { setGroupSlice, setGroupSliceMutation } from "@fiftyone/relay";
import { commitMutation } from "relay-runtime";
import type { RegisteredWriter } from "./registerWriter";

const onSetGroupSlice: RegisteredWriter<"sessionGroupSlice"> =
  ({ environment, router, subscription }) =>
  (slice) => {
    if (!slice) {
      throw new Error("slice not defined");
    }

    const search = new URLSearchParams(router.history.location.search);
    search.set("slice", slice);

    const string = `?${search.toString()}`;

    const pathname = router.history.location.pathname + string;
    router.history.push(pathname, router.history.location.state);

    commitMutation<setGroupSliceMutation>(environment, {
      mutation: setGroupSlice,
      variables: {
        slice: slice,
        subscription,
      },
    });
  };

export default onSetGroupSlice;
