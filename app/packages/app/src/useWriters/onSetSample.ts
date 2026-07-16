/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { setSampleMutation } from "@fiftyone/relay";
import type { RegisteredWriter } from "./registerWriter";

import { setSample } from "@fiftyone/relay";
import { env } from "@fiftyone/utilities";
import type { IEnvironment } from "relay-runtime";
import { commitMutation } from "relay-runtime";

let lastSetSample = "";

/**
 * Commit `setSample` unless it exactly repeats the previous commit — the
 * writer and the history side-effect both fire on modal transitions, and the
 * session only needs to hear each change once.
 */
export const commitSetSampleIfChanged = (
  environment: IEnvironment,
  variables: { groupId?: string; id?: string; subscription: string },
) => {
  const key = JSON.stringify([
    variables.groupId ?? null,
    variables.id ?? null,
    variables.subscription,
  ]);
  if (key === lastSetSample) {
    return;
  }
  lastSetSample = key;
  commitMutation<setSampleMutation>(environment, {
    mutation: setSample,
    variables,
  });
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

    commitSetSampleIfChanged(environment, {
      groupId: selector?.groupId,
      id: selector?.id,
      subscription,
    });
  };

export default onSetSample;
