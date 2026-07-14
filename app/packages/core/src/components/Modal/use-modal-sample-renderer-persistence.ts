import {
  createSampleRendererRenderContext,
  getComponent,
  getMatchingSampleRenderer,
  isSampleRendererModalPersistent,
  PluginComponentType,
  SampleRendererProps,
  useActivePlugins,
} from "@fiftyone/plugins";
import * as fos from "@fiftyone/state";
import { useMemo } from "react";
import { useRecoilValue } from "recoil";

/**
 * Returns a stable subtree key when the current modal sample matches a
 * sample renderer that persists across sample navigation, and null
 * otherwise. Mirrors the matching pipeline in `ModalSampleRenderer` so the
 * two levels agree: a null result keeps today's remount-per-sample
 * behavior, a non-null result keys the looker subtree by renderer identity
 * so navigation between samples of the same renderer preserves the mounted
 * tree. Renderer changes (or a fall back to native/metadata rendering)
 * still change the key and remount.
 */
export function useModalSampleRendererPersistenceKey(): string | null {
  const dataset = fos.useCurrentDataset();
  const schema = fos.useModalSampleSchema();
  const sample = useRecoilValue(fos.modalSample);
  const modalMediaField = useRecoilValue(fos.selectedMediaField(true));
  const { isDisabled: isDatasetRendererDisabled } =
    fos.useGridCustomRendererFailover(dataset?.name);
  const activatorCtx = useMemo(() => ({ dataset, schema }), [dataset, schema]);
  const sampleRenderers = useActivePlugins(
    PluginComponentType.SampleRenderer,
    activatorCtx,
  );

  if (!dataset || isDatasetRendererDisabled) {
    return null;
  }

  const ctx = createSampleRendererRenderContext(
    sample,
    modalMediaField,
    dataset,
    schema,
    "modal",
  );
  const matchedRenderer = getMatchingSampleRenderer(sampleRenderers, ctx);
  if (
    !matchedRenderer ||
    !ctx.media.url ||
    !getComponent<SampleRendererProps>(matchedRenderer.name) ||
    !isSampleRendererModalPersistent(matchedRenderer)
  ) {
    return null;
  }

  return `renderer-${matchedRenderer.name}`;
}
