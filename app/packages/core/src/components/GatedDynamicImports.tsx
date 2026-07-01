/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { FeatureFlag, useFeature } from "@fiftyone/feature-flags";
import { useEffect } from "react";

/**
 * Describes a module that should be registered only after its feature flag
 * resolves enabled.
 */
export type GatedDynamicImport = {
  featureFlag: FeatureFlag;
  moduleKey: string;
  registerModule: () => Promise<unknown>;
};

const moduleRegistrationPromises: Record<string, Promise<void> | undefined> =
  {};

/**
 * Registers each module at most once, while clearing failed attempts
 * so a later render can retry the dynamic import.
 */
const registerGatedModule = ({
  moduleKey,
  registerModule,
}: Pick<GatedDynamicImport, "moduleKey" | "registerModule">) => {
  let moduleRegistrationPromise = moduleRegistrationPromises[moduleKey];

  if (!moduleRegistrationPromise) {
    moduleRegistrationPromise = registerModule()
      .then(() => undefined)
      .catch((error) => {
        moduleRegistrationPromises[moduleKey] = undefined;
        throw error;
      });
    moduleRegistrationPromises[moduleKey] = moduleRegistrationPromise;
  }

  return moduleRegistrationPromise;
};

/**
 * Watches a feature flag and registers the associated module once the flag has
 * resolved enabled.
 */
const useGatedDynamicImport = ({
  featureFlag,
  moduleKey,
  registerModule,
}: GatedDynamicImport) => {
  const { isEnabled, isResolved } = useFeature({
    feature: featureFlag,
  });

  useEffect(() => {
    if (!isEnabled || !isResolved) {
      return;
    }

    registerGatedModule({
      moduleKey,
      registerModule,
    }).catch((error) => {
      console.warn(`Failed to register module: ${moduleKey}`, error);
    });
  }, [featureFlag, moduleKey, registerModule, isEnabled, isResolved]);
};

const GatedDynamicImportRegistration = ({
  gatedImport,
}: {
  gatedImport: GatedDynamicImport;
}) => {
  useGatedDynamicImport(gatedImport);

  return null;
};

/**
 * Registers modules only if their feature flags are enabled.
 */
export const GatedDynamicImports = ({
  gatedImports,
}: {
  gatedImports: GatedDynamicImport[];
}) => {
  return (
    <>
      {gatedImports.map((gatedImport) => (
        <GatedDynamicImportRegistration
          key={gatedImport.moduleKey}
          gatedImport={gatedImport}
        />
      ))}
    </>
  );
};
