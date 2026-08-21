import { useTrackEvent } from "@fiftyone/analytics";
import type { SampleRendererSampleLike } from "@fiftyone/plugins";
import {
  createSampleRendererRenderContext,
  getComponent,
  getMatchingSampleRenderer,
  getSampleRendererComponent,
  PluginComponentType,
  useActivePlugins,
} from "@fiftyone/plugins";
import type { ID } from "@fiftyone/spotlight";
import * as fos from "@fiftyone/state";
import type React from "react";
import { useCallback, useMemo, useRef } from "react";
import {
  useRecoilBridgeAcrossReactRoots_UNSTABLE,
  useRecoilCallback,
} from "recoil";
import { GridCustomRendererItem } from "./GridCustomRendererItem";

type GridSampleResult = SampleRendererSampleLike;

/** Hook that wraps default grid media rendering with sample renderer support. */
export function useGridCustomRendererItem(
  createDefaultLooker: ReturnType<typeof fos.useCreateLooker>,
) {
  const dataset = fos.useCurrentDataset();
  const schema = fos.useSampleSchema();
  const trackEvent = useTrackEvent();

  const activatorCtx = useMemo(() => ({ dataset, schema }), [dataset, schema]);
  const sampleRenderers = useActivePlugins(
    PluginComponentType.SampleRenderer,
    activatorCtx,
  );
  const { isDisabled: isDatasetRendererDisabled } =
    fos.useGridCustomRendererFailover(dataset?.name);

  const selectedMediaField = fos.useSelectedMediaFieldGrid();

  const RecoilBridge = useRecoilBridgeAcrossReactRoots_UNSTABLE();
  const hasTrackedRendererUsageRef = useRef(false);

  // Synchronous, non-hook lookup so a GridCustomRendererItem instance can
  // reconcile its local `selected` flag against the true source of truth when
  // it's reattached from the cache (e.g. after scrolling out of and back into
  // the shown viewport) instead of trusting a value it hasn't been updated
  // with while offscreen.
  const isSampleSelected = useRecoilCallback(
    ({ snapshot }) =>
      (sampleId: string) =>
        snapshot.getLoadable(fos.selectedSamples).getValue().has(sampleId),
    [],
  );

  const getResolvedRenderer = useCallback(
    (result: GridSampleResult) => {
      if (!dataset || isDatasetRendererDisabled) {
        return null;
      }

      const ctx = createSampleRendererRenderContext(
        result,
        selectedMediaField,
        dataset,
        schema,
        "grid",
      );
      const matchedRenderer = getMatchingSampleRenderer(sampleRenderers, ctx);
      const canonicalRenderer = matchedRenderer
        ? getComponent(matchedRenderer.name)
        : null;

      if (!matchedRenderer || !ctx.media.url || !canonicalRenderer) {
        return null;
      }

      return {
        ctx,
        registration: matchedRenderer,
        Renderer: getSampleRendererComponent(
          matchedRenderer,
          "grid",
          canonicalRenderer,
        ),
      };
    },
    [
      dataset,
      isDatasetRendererDisabled,
      schema,
      selectedMediaField,
      sampleRenderers,
    ],
  );

  const createDefaultItem = useCallback(
    (result: GridSampleResult, id: ID, fontSize: number): fos.Lookers => {
      const looker = createDefaultLooker.current?.(
        {
          ...result,
          symbol: id,
        },
        { fontSize },
      ) as fos.Lookers;

      if (!looker) {
        throw new Error("Failed to create default looker");
      }

      return looker;
    },
    [createDefaultLooker],
  );

  const createItem = useCallback(
    (result: GridSampleResult, id: ID, fontSize: number): fos.Lookers => {
      const resolvedRenderer = getResolvedRenderer(result);

      if (!resolvedRenderer) {
        return createDefaultItem(result, id, fontSize);
      }

      try {
        const item = new GridCustomRendererItem({
          clickBehavior:
            resolvedRenderer.registration.sampleRendererOptions.grid
              ?.clickBehavior,
          pluginName: resolvedRenderer.registration.name,
          Renderer: resolvedRenderer.Renderer,
          RecoilBridge:
            RecoilBridge as React.ComponentType<React.PropsWithChildren>,
          ctx: resolvedRenderer.ctx,
          symbol: id,
          isSampleSelected,
        }) as unknown as fos.Lookers;

        // Track coarse-grained adoption once per active grid instance (rather
        // than once per tile)
        if (!hasTrackedRendererUsageRef.current) {
          hasTrackedRendererUsageRef.current = true;
          trackEvent("grid_custom_renderer_used");
        }

        return item;
      } catch (error) {
        console.error(
          "Failed to create plugin renderer, using default:",
          error,
        );
        return createDefaultItem(result, id, fontSize);
      }
    },
    [
      createDefaultItem,
      getResolvedRenderer,
      RecoilBridge,
      trackEvent,
      isSampleSelected,
    ],
  );

  return { createItem };
}
