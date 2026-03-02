import { isNativeMediaType } from "@fiftyone/looker/src/util";
import {
  getMatchingRenderClaimsPanel,
  getRawComponent,
  getRenderClaimsContext,
  PluginComponentType,
  RenderClaimsContext,
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
import { GridRenderClaimsLooker } from "./GridRenderClaimsLooker";

/**
 * Hook that wraps default looker creation with render claims support.
 */
export function useGridRenderClaimsLooker(
  createDefaultLooker: ReturnType<typeof fos.useCreateLooker>
) {
  const dataset = useRecoilValue(fos.dataset);
  const schema = useRecoilValue(
    fos.fieldSchema({ space: fos.State.SPACE.SAMPLE })
  );
  const selectedMediaField = useRecoilValue(fos.selectedMediaField(false));
  const panelCtx = useMemo(() => ({ schema, dataset }), [schema, dataset]);
  const panelPlugins = useActivePlugins(PluginComponentType.Panel, panelCtx);
  const RecoilBridge = useRecoilBridgeAcrossReactRoots_UNSTABLE();

  const shouldOverrideRender = useCallback(
    (result: { sample: fos.Sample }): boolean => {
      if (!dataset) {
        return false;
      }

      const ctx = getRenderClaimsContext(
        result,
        selectedMediaField,
        dataset,
        schema
      );

      const mediaType = ctx.mediaType ?? "unknown";
      if (isNativeMediaType(mediaType)) {
        return false;
      }

      const matchedPanel = getMatchingRenderClaimsPanel(panelPlugins, ctx, {
        surface: "grid",
      });

      return (
        !!matchedPanel &&
        !!ctx.selectedMediaUrl &&
        !!getRawComponent(matchedPanel.name)
      );
    },
    [dataset, schema, selectedMediaField, panelPlugins]
  );

  const createLookerWithPluginRenderer = useCallback(
    (result: { sample: fos.Sample }, id: ID, fontSize: number): fos.Lookers => {
      if (!dataset || !createDefaultLooker.current) {
        throw new Error("Dataset or createLooker not available");
      }

      const renderClaimsContext = getRenderClaimsContext(
        result,
        selectedMediaField,
        dataset,
        schema
      );

      const matchedPanel = getMatchingRenderClaimsPanel(
        panelPlugins,
        renderClaimsContext,
        { surface: "grid" }
      );

      const RawRenderer = matchedPanel
        ? getRawComponent(matchedPanel.name)
        : null;

      if (
        !matchedPanel ||
        !renderClaimsContext.selectedMediaUrl ||
        !RawRenderer
      ) {
        throw new Error(
          "createLooker called without a matching render claims panel. "
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
            "Failed to create fallback looker for render-claims renderer"
          );
        }
        return fallback;
      };

      return new GridRenderClaimsLooker({
        createFallbackLooker,
        pluginName: matchedPanel.name,
        Renderer: RawRenderer as React.ComponentType<{
          ctx: RenderClaimsContext;
          url: string;
        }>,
        RecoilBridge:
          RecoilBridge as React.ComponentType<React.PropsWithChildren>,
        ctx: renderClaimsContext,
        url: renderClaimsContext.selectedMediaUrl,
      }) as unknown as fos.Lookers;
    },
    [
      createDefaultLooker,
      dataset,
      schema,
      selectedMediaField,
      panelPlugins,
      RecoilBridge,
    ]
  );

  return { shouldOverrideRender, createLookerWithPluginRenderer };
}
