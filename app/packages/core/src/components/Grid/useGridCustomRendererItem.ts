import {
  createSampleRendererRenderContext,
  getMatchingSampleRenderer,
  getComponent,
  getSampleRendererComponent,
  PluginComponentType,
  useActivePlugins,
} from "@fiftyone/plugins";
import type { SampleRendererSampleLike } from "@fiftyone/plugins";
import type { ID } from "@fiftyone/spotlight";
import * as fos from "@fiftyone/state";
import type React from "react";
import { useCallback } from "react";
import { useRecoilBridgeAcrossReactRoots_UNSTABLE } from "recoil";
import { GridCustomRendererItem } from "./GridCustomRendererItem";

type GridSampleResult = SampleRendererSampleLike;

/** Hook that wraps default grid media rendering with sample renderer support. */
export function useGridCustomRendererItem(
  createDefaultLooker: ReturnType<typeof fos.useCreateLooker>
) {
  const dataset = fos.useCurrentDataset();
  const schema = fos.useSampleSchema();

  const sampleRenderers = useActivePlugins(PluginComponentType.SampleRenderer);
  const { isDisabled: isDatasetRendererDisabled } =
    fos.useGridCustomRendererFailover(dataset?.name);

  const selectedMediaField = fos.useSelectedMediaFieldGrid();

  const RecoilBridge = useRecoilBridgeAcrossReactRoots_UNSTABLE();

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
        "grid"
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
          canonicalRenderer
        ),
      };
    },
    [
      dataset,
      isDatasetRendererDisabled,
      schema,
      selectedMediaField,
      sampleRenderers,
    ]
  );

  const createDefaultItem = useCallback(
    (result: GridSampleResult, id: ID, fontSize: number): fos.Lookers => {
      const looker = createDefaultLooker.current?.(
        {
          ...result,
          symbol: id,
        },
        { fontSize }
      ) as fos.Lookers;

      if (!looker) {
        throw new Error("Failed to create default looker");
      }

      return looker;
    },
    [createDefaultLooker]
  );

  const createItem = useCallback(
    (result: GridSampleResult, id: ID, fontSize: number): fos.Lookers => {
      const resolvedRenderer = getResolvedRenderer(result);

      if (!resolvedRenderer) {
        return createDefaultItem(result, id, fontSize);
      }

      try {
        return new GridCustomRendererItem({
          pluginName: resolvedRenderer.registration.name,
          Renderer: resolvedRenderer.Renderer,
          RecoilBridge:
            RecoilBridge as React.ComponentType<React.PropsWithChildren>,
          ctx: resolvedRenderer.ctx,
          symbol: id,
        }) as unknown as fos.Lookers;
      } catch (error) {
        console.error(
          "Failed to create plugin renderer, using default:",
          error
        );
        return createDefaultItem(result, id, fontSize);
      }
    },
    [createDefaultItem, getResolvedRenderer, RecoilBridge]
  );

  return { createItem };
}
