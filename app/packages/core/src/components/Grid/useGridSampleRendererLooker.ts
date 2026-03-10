import {
  createSampleRendererRenderContext,
  getMatchingSampleRenderer,
  getRawComponent,
  getSampleRendererComponent,
  PluginComponentType,
  type SampleRendererProps,
  useActivePlugins,
} from "@fiftyone/plugins";
import type { ID } from "@fiftyone/spotlight";
import * as fos from "@fiftyone/state";
import type React from "react";
import { useCallback, useMemo } from "react";
import {
  useRecoilBridgeAcrossReactRoots_UNSTABLE,
  useRecoilValue,
} from "recoil";
import { GridSampleRendererLooker } from "./GridSampleRendererLooker";

/** Hook that wraps default grid media rendering with sample renderer support. */
export function useGridSampleRendererLooker(
  createDefaultLooker: ReturnType<typeof fos.useCreateLooker>
) {
  const dataset = useRecoilValue(fos.dataset);
  const schema = useRecoilValue(
    fos.fieldSchema({ space: fos.State.SPACE.SAMPLE })
  );
  const selectedMediaField = useRecoilValue(fos.selectedMediaField(false));
  const pluginCtx = useMemo(() => ({ schema, dataset }), [schema, dataset]);
  const sampleRenderers = useActivePlugins(
    PluginComponentType.SampleRenderer,
    pluginCtx
  );
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
          canonicalRenderer as React.ComponentType<SampleRendererProps>
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

  const createLookerWithSampleRenderer = useCallback(
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

      return new GridSampleRendererLooker({
        createFallbackLooker,
        pluginName: resolvedRenderer.registration.name,
        Renderer: resolvedRenderer.Renderer,
        RecoilBridge:
          RecoilBridge as React.ComponentType<React.PropsWithChildren>,
        ctx: resolvedRenderer.ctx,
        symbol: id,
      }) as unknown as fos.Lookers;
    },
    [createDefaultLooker, dataset, getResolvedRenderer, RecoilBridge]
  );

  return { shouldOverrideRender, createLookerWithSampleRenderer };
}
