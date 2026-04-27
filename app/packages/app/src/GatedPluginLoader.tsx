import { FeatureFlag, useFeature } from "@fiftyone/feature-flags";
import React, { useEffect } from "react";

/**
 * Describes a plugin registration module that should be loaded only after its
 * owning feature flag resolves enabled.
 */
type GatedPluginRegistration = {
  featureFlag: FeatureFlag;
  importRegistration: () => Promise<unknown>;
};

/**
 * Declare gated plugin imports here
 */
const GATED_PLUGIN_REGISTRATIONS: GatedPluginRegistration[] = [
  {
    featureFlag: FeatureFlag.VFF_MULTIMODAL,
    importRegistration: () => import("@fiftyone/multimodal/inject"),
  },
];

const registrationPromises: Record<string, Promise<void> | undefined> = {};

/**
 * Loads each registration module at most once, while clearing failed attempts
 * so a later render can retry the dynamic import.
 */
const loadPluginRegistration = ({
  featureFlag,
  importRegistration,
}: GatedPluginRegistration,
) => {
  const registrationKey = featureFlag.toString();
  let featureRegistrationPromise = registrationPromises[registrationKey];

  if (!featureRegistrationPromise) {
    featureRegistrationPromise = importRegistration()
      .then(() => undefined)
      .catch((error) => {
        registrationPromises[registrationKey] = undefined;
        throw error;
      });
    registrationPromises[registrationKey] = featureRegistrationPromise;
  }

  return featureRegistrationPromise;
};

/**
 * Watches a feature flag and imports the associated plugin registration module
 * once the flag has resolved enabled.
 */
const useGatedPluginRegistration = ({
  featureFlag,
  importRegistration,
}: GatedPluginRegistration) => {
  const { isEnabled, isResolved } = useFeature({
    feature: featureFlag,
  });

  useEffect(() => {
    if (!isEnabled || !isResolved) {
      return;
    }

    loadPluginRegistration({
      featureFlag,
      importRegistration,
    }).catch((error) => {
      console.warn(`Failed to register plugin: ${featureFlag}`, error);
    });
  }, [featureFlag, importRegistration, isEnabled, isResolved]);
};

const GatedPluginRegistrationLoader = ({
  registration,
}: {
  registration: GatedPluginRegistration;
}) => {
  useGatedPluginRegistration(registration);

  return null;
};

/**
 * Mounts plugin registration modules for enabled feature flags.
*/
export const GatedPluginLoader = React.memo(() => {
  return (
    <>
      {GATED_PLUGIN_REGISTRATIONS.map((registration) => (
        <GatedPluginRegistrationLoader
          key={registration.featureFlag}
          registration={registration}
        />
      ))}
    </>
  );
});
