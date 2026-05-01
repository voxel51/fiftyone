import { FeatureFlag, useFeature } from "@fiftyone/feature-flags";
import { useEffect } from "react";

/**
 * Describes a module that should be registered only after its feature flag
 * resolves enabled.
 */
type GatedDynamicImport = {
  featureFlag: FeatureFlag;
  registerModule: () => Promise<unknown>;
};

/**
 * Register feature-gated modules here.
 */
const GATED_DYNAMIC_IMPORTS: GatedDynamicImport[] = [
  {
    featureFlag: FeatureFlag.VFF_MULTIMODAL,
    registerModule: () => import("@fiftyone/multimodal/inject"),
  },
];

const moduleRegistrationPromises: Record<string, Promise<void> | undefined> =
  {};

/**
 * Registers each module at most once, while clearing failed attempts
 * so a later render can retry the dynamic import.
 */
const registerGatedModule = ({
  featureFlag,
  registerModule,
}: GatedDynamicImport) => {
  const moduleKey = featureFlag.toString();
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
      featureFlag,
      registerModule,
    }).catch((error) => {
      console.warn(`Failed to register module: ${featureFlag}`, error);
    });
  }, [featureFlag, registerModule, isEnabled, isResolved]);
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
export const GatedDynamicImports = () => {
  return (
    <>
      {GATED_DYNAMIC_IMPORTS.map((gatedImport) => (
        <GatedDynamicImportRegistration
          key={gatedImport.featureFlag}
          gatedImport={gatedImport}
        />
      ))}
    </>
  );
};
