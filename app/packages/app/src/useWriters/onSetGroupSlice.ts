/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { locationBridge } from "@fiftyone/location";
import { setGroupSlice, type setGroupSliceMutation } from "@fiftyone/relay";
import { env } from "@fiftyone/utilities";
import { commitMutation } from "relay-runtime";
import { sliceParam } from "../location/params";
import type { RegisteredWriter } from "./registerWriter";

const onSetGroupSlice: RegisteredWriter<"sessionGroupSlice"> =
  ({ environment, subscription }) =>
  (slice) => {
    locationBridge.current().write(sliceParam, slice);

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
