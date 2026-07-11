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
import { useMemo, useRef } from "react";
import { useRecoilValue, useRecoilValueLoadable, type Loadable } from "recoil";

/**
 * Returns a stable subtree key for a modal renderer that opts into persistence.
 * Renderer changes and native/metadata fallbacks still remount the subtree.
 */
export function useModalSampleRendererPersistenceKey(): string | null {
  return usePersistenceKey(useRecoilValueLoadable(fos.modalSample));
}

function usePersistenceKey(
  sampleLoadable: Loadable<fos.ModalSample>,
): string | null {
  const dataset = fos.useCurrentDataset();
  const schema = fos.useModalSampleSchema();
  const retainedKeyRef = useRef<string | null>(null);
  const modalMediaField = useRecoilValue(fos.selectedMediaField(true));
  const { isDisabled: isDatasetRendererDisabled } =
    fos.useGridCustomRendererFailover(dataset?.name);
  const activatorCtx = useMemo(() => ({ dataset, schema }), [dataset, schema]);
  const sampleRenderers = useActivePlugins(
    PluginComponentType.SampleRenderer,
    activatorCtx,
  );

  if (!dataset || isDatasetRendererDisabled) {
    retainedKeyRef.current = null;
    return null;
  }

  if (sampleLoadable.state === "loading") {
    return retainedKeyRef.current;
  }
  if (sampleLoadable.state === "hasError") {
    throw sampleLoadable.contents;
  }

  const sample = sampleLoadable.contents;

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
    retainedKeyRef.current = null;
    return null;
  }

  const key = `renderer-${matchedRenderer.name}`;
  retainedKeyRef.current = key;
  return key;
}

/**
 * Keeps the last settled sample while a persistent renderer's next sample
 * resolves. Non-persistent renderers retain their suspending lifecycle.
 */
export function useRetainedModalSample(): {
  persistenceKey: string | null;
  sample: fos.ModalSample;
  transitioning: boolean;
} {
  const sampleLoadable = useRecoilValueLoadable(fos.modalSample);
  const persistenceKey = usePersistenceKey(sampleLoadable);
  const retainedSampleRef = useRef<fos.ModalSample | null>(null);

  if (sampleLoadable.state === "hasValue") {
    retainedSampleRef.current = sampleLoadable.contents;
  }

  const retainedSample = retainedSampleRef.current;
  const transitioning =
    sampleLoadable.state === "loading" &&
    persistenceKey !== null &&
    retainedSample !== null;
  const sample = transitioning ? retainedSample : sampleLoadable.valueOrThrow();

  return { persistenceKey, sample, transitioning };
}
