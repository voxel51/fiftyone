/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { locationBridge } from "@fiftyone/location";
import { CloseSampleContext } from "@fiftyone/state";
import type React from "react";
import { readModal, writeModal } from "../location/modal";
import useModalFromLocation from "../location/useModalFromLocation";
import type { AppRoute } from "../location/routes";

// a close leaves the sample's URL first, and the session follows from it
const navigateAway = () => {
  const store = locationBridge.current<AppRoute>();
  if (!readModal(store)) return false;
  writeModal(store, null);
  return true;
};

const ModalFromLocation = () => {
  useModalFromLocation();
  return null;
};

/** Closing a sample through the URL, and the session following it. */
export default function SamplePageProvider({
  children,
}: React.PropsWithChildren) {
  return (
    <CloseSampleContext.Provider value={navigateAway}>
      {children}
      <ModalFromLocation />
    </CloseSampleContext.Provider>
  );
}
