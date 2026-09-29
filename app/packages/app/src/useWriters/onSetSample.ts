/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { locationBridge } from "@fiftyone/location";
import { setSample, type setSampleMutation } from "@fiftyone/relay";
import { env } from "@fiftyone/utilities";
import { commitMutation } from "relay-runtime";
import { writeModal } from "../location/modal";
import type { RegisteredWriter } from "./registerWriter";

const onSetSample: RegisteredWriter<"modalSelector"> =
  ({ environment, subscription }) =>
  (selector) => {
    writeModal(locationBridge.current(), selector);

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
