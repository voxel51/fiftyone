import { PluginComponentType, useActivePlugins } from "@fiftyone/plugins";
import * as fos from "@fiftyone/state";
import { useMemo, type ReactNode } from "react";

/**
 * Shows renderer-owned loading UI without reading the pending sample query.
 * Datasets whose renderer provides none keep the caller's `fallback`.
 */
export function ModalSamplePending({
  fallback,
}: {
  readonly fallback: ReactNode;
}) {
  const dataset = fos.useCurrentDataset();
  const sampleId = fos.useNullableModalSampleId();
  const mediaField = fos.useSelectedMediaFieldModal();
  const context = useMemo(() => ({ dataset }), [dataset]);
  const renderers = useActivePlugins(
    PluginComponentType.SampleRenderer,
    context,
  );
  const { isDisabled } = fos.useGridCustomRendererFailover(dataset?.name);
  const renderer = renderers
    .filter((entry) => entry.sampleRendererOptions.modal?.loadingComponent)
    .sort(
      (a, b) =>
        (b.sampleRendererOptions.priority ?? 0) -
          (a.sampleRendererOptions.priority ?? 0) ||
        a.name.localeCompare(b.name),
    )[0];
  const Pending = renderer?.sampleRendererOptions.modal?.loadingComponent;

  return dataset && Pending && !isDisabled ? (
    <Pending
      datasetId={dataset.datasetId}
      mediaField={mediaField}
      sampleId={sampleId}
    />
  ) : (
    <>{fallback}</>
  );
}
