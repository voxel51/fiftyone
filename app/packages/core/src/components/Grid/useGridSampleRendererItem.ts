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
import { useCallback, useRef } from "react";
import { useRecoilBridgeAcrossReactRoots_UNSTABLE } from "recoil";
import { GridSampleRendererItem } from "./GridSampleRendererItem";

type GridSampleResult = SampleRendererSampleLike;

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
    ({ sample, urls }: GridSampleResult) => {
      if (!dataset) {
        return null;
      }

      const ctx = createSampleRendererRenderContext(
        { sample, urls },
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
    [dataset, schema, selectedMediaField, sampleRenderers]
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
        return new GridSampleRendererItem({
          createFallbackRenderer: () => createDefaultItem(result, id, fontSize),
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

  // `showItem` must stay stable even as the sample renderer hook refreshes.
  const ref = useRef({ createItem });
  ref.current = { createItem };
  return ref;
}
