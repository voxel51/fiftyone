/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { SampleTransitionContext } from "@fiftyone/core";
import { locationBridge } from "@fiftyone/location";
import { CloseSampleContext } from "@fiftyone/state";
import React, { useMemo } from "react";
import { readModal, writeModal } from "../location/modal";
import useModalFromLocation from "../location/useModalFromLocation";
import type { AppRoute } from "../location/routes";
import { AppSampleTransitionProvider } from "./context";
import { createSampleTransition } from "./transition";

// a close leaves the sample's URL first, and the session follows from it
const navigateAway = () => {
  const store = locationBridge.current<AppRoute>();
  if (!readModal(store)) return false;
  writeModal(store, null);
  return true;
};

// after the page in the tree, so a close the page begins holds its reset
const ModalFromLocation = () => {
  useModalFromLocation();
  return null;
};

/** The sample page's transition, and closing through the URL. */
export default function SamplePageProvider({
  children,
}: React.PropsWithChildren) {
  const transition = useMemo(createSampleTransition, []);

  return (
    <AppSampleTransitionProvider value={transition}>
      <SampleTransitionContext.Provider value={transition}>
        <CloseSampleContext.Provider value={navigateAway}>
          {children}
          <ModalFromLocation />
        </CloseSampleContext.Provider>
      </SampleTransitionContext.Provider>
    </AppSampleTransitionProvider>
  );
}
