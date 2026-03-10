import {
  createSampleRendererRenderContext,
  getMatchingSampleRenderer,
  getRawComponent,
  getSampleRendererComponent,
  PluginComponentType,
  useActivePlugins,
} from "@fiftyone/plugins";
import type { ID } from "@fiftyone/spotlight";
import * as fos from "@fiftyone/state";
import type React from "react";
import { useCallback } from "react";
import { useRecoilBridgeAcrossReactRoots_UNSTABLE } from "recoil";
import { GridSampleRendererItem } from "./GridSampleRendererItem";

/** Hook that wraps default grid media rendering with sample renderer support. */
export function useGridSampleRendererItem(
  createDefaultLooker: ReturnType<typeof fos.useCreateLooker>
) {
  const dataset = fos.useCurrentDataset();
  const schema = fos.useSampleSchema();

  const sampleRenderers = useActivePlugins(PluginComponentType.SampleRenderer);

  const selectedMediaField = fos.useSelectedMediaFieldGrid();

  const RecoilBridge = useRecoilBridgeAcrossReactRoots_UNSTABLE();

  const getResolvedRenderer = useCallback(
    (result: { sample: fos.Sample }) => {
      if (!dataset) {
        return null;
      }

      const ctx = createSampleRendererRenderContext(
        result,
        selectedMediaField,
        dataset,
        schema,
        "grid"
      );
      const matchedRenderer = getMatchingSampleRenderer(sampleRenderers, ctx);
      const canonicalRenderer = matchedRenderer
        ? getRawComponent(matchedRenderer.name)
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
          canonicalRenderer
        ),
      };
    },
    [dataset, schema, selectedMediaField, sampleRenderers]
  );

  const shouldOverrideRender = useCallback(
    (result: { sample: fos.Sample }): boolean =>
      Boolean(getResolvedRenderer(result)),
    [getResolvedRenderer]
  );

  const createItemWithSampleRenderer = useCallback(
    (result: { sample: fos.Sample }, id: ID, fontSize: number): fos.Lookers => {
      if (!dataset || !createDefaultLooker.current) {
        throw new Error("Dataset or createLooker not available");
      }

      const resolvedRenderer = getResolvedRenderer(result);

      if (!resolvedRenderer) {
        throw new Error(
          "createLooker called without a matching sample renderer."
        );
      }

      const createFallbackLooker = () => {
        const fallback = createDefaultLooker.current?.(
          {
            ...result,
            symbol: id,
            frameNumber: 0,
            frameRate: 0,
            urls: {},
          },
          { fontSize }
        ) as fos.Lookers;

        if (!fallback) {
          throw new Error(
            "Failed to create fallback looker for sample renderer"
          );
        }

        return fallback;
      };

      return new GridSampleRendererItem({
        createFallbackLooker,
        pluginName: resolvedRenderer.registration.name,
        Renderer: resolvedRenderer.Renderer,
        RecoilBridge:
          RecoilBridge as React.ComponentType<React.PropsWithChildren>,
        ctx: resolvedRenderer.ctx,
        symbol: id,
      }) as unknown as fos.Lookers;
    },
    [dataset, getResolvedRenderer, RecoilBridge]
  );

  return { shouldOverrideRender, createItemWithSampleRenderer };
}
