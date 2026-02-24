import {
  ModalFileRendererContext,
  ModalFileRendererMatchContext,
  PluginComponentRegistration,
  matchesModalFileRenderer,
} from "@fiftyone/plugins";
import * as fos from "@fiftyone/state";
import { getMimeType } from "@fiftyone/utilities";

type StandardizedUrls = Record<string, string>;
type ModalFileRendererSelectionOptions = {
  isAnnotate?: boolean;
};

function getPathname(path: string) {
  try {
    return new URL(path).pathname;
  } catch {
    return path;
  }
}

/** Extracts a lowercase file extension from a path or URL. */
export function getFileExtension(path: string | null | undefined) {
  if (!path) {
    return null;
  }

  const pathname = getPathname(path).split(/[?#]/)[0];
  const fileName = pathname.split(/[/\\]/).pop() || "";
  const dotIndex = fileName.lastIndexOf(".");

  if (dotIndex < 0 || dotIndex === fileName.length - 1) {
    return null;
  }

  return fileName.slice(dotIndex + 1).toLowerCase();
}

/** Returns the currently selected modal media path, with filepath fallback. */
export function getSelectedModalMediaPath(
  sample: fos.ModalSample,
  selectedMediaField: string
) {
  const urls = fos.getStandardizedUrls(sample.urls) as StandardizedUrls;
  return urls?.[selectedMediaField] || urls?.filepath || sample.sample.filepath;
}

/** Builds matcher context and resolved URL for modal file renderer selection. */
export function getModalFileRendererContext(
  sample: fos.ModalSample,
  selectedMediaField: string,
  dataset: unknown,
  schema: unknown
): ModalFileRendererContext {
  const selectedMediaPath = getSelectedModalMediaPath(
    sample,
    selectedMediaField
  );

  return {
    sample,
    selectedMediaField,
    selectedMediaPath,
    selectedMediaUrl: selectedMediaPath
      ? fos.getSampleSrc(selectedMediaPath)
      : null,
    extension: getFileExtension(selectedMediaPath),
    mimeType: getMimeType(sample.sample),
    mediaType:
      (sample.sample.media_type as unknown as string) ??
      sample.sample._media_type ??
      null,
    dataset,
    schema,
  };
}

function sortByModalFileRendererPriority(
  panelA: PluginComponentRegistration,
  panelB: PluginComponentRegistration
) {
  const panelAPriority = panelA?.panelOptions?.priority || 0;
  const panelBPriority = panelB?.panelOptions?.priority || 0;

  if (panelAPriority !== panelBPriority) {
    return panelBPriority - panelAPriority;
  }

  if (panelA.name < panelB.name) return -1;
  if (panelA.name > panelB.name) return 1;
  return 0;
}

/** Returns the highest-priority modal renderer panel matching the context. */
export function getMatchingModalFileRendererPanel(
  panels: PluginComponentRegistration[],
  ctx: ModalFileRendererMatchContext,
  options: ModalFileRendererSelectionOptions = {}
) {
  return (
    panels
      .filter((panel) => {
        const surface = panel.panelOptions?.surfaces;
        if (surface !== "modal" && surface !== "grid modal") {
          return false;
        }

        const modalFileRenderer = panel.panelOptions?.modalFileRenderer;
        if (!modalFileRenderer) {
          return false;
        }

        if (
          options.isAnnotate &&
          modalFileRenderer.allowInAnnotateMode !== true
        ) {
          return false;
        }

        return matchesModalFileRenderer(modalFileRenderer, ctx);
      })
      .sort(sortByModalFileRendererPriority)
      .at(0) || null
  );
}
