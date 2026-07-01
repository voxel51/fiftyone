import { useTheme } from "@fiftyone/components";
import {
  DetectionOverlay,
  UNDEFINED_LIGHTER_SCENE_ID,
  useLighter,
  useLighterEventHandler,
} from "@fiftyone/lighter";
import { useCallback, useEffect, useRef } from "react";
import styled from "styled-components";
import { useAnnotationContext } from "./useAnnotationContext";

const Container = styled.div`
  display: flex;
  flex-direction: column;
  row-gap: 0.25rem;
`;

const Label = styled.div`
  font-size: 0.75rem;
  color: ${({ theme }) => theme.text.secondary};
`;

const CanvasContainer = styled.div<{ $bg: string }>`
  background: ${({ $bg }) => $bg};
  border-radius: var(--radius-xs, 4px);
  padding: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const StyledCanvas = styled.canvas`
  display: block;
  width: 100%;
  height: auto;
`;

const PREVIEW_SIZE = 256;

/**
 * Draws a {@link CanvasImageSource} to the preview canvas as a monochrome mask.
 */
function drawPreview(
  canvas: HTMLCanvasElement,
  source: CanvasImageSource,
  srcWidth: number,
  srcHeight: number,
  isDark: boolean,
) {
  if (srcWidth === 0 || srcHeight === 0) return;

  canvas.width = PREVIEW_SIZE;
  canvas.height = PREVIEW_SIZE;

  const scale = Math.min(PREVIEW_SIZE / srcWidth, PREVIEW_SIZE / srcHeight);
  const drawW = Math.round(srcWidth * scale);
  const drawH = Math.round(srcHeight * scale);
  const offsetX = Math.floor((PREVIEW_SIZE - drawW) / 2);
  const offsetY = Math.floor((PREVIEW_SIZE - drawH) / 2);

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, PREVIEW_SIZE, PREVIEW_SIZE);
  ctx.drawImage(source, offsetX, offsetY, drawW, drawH);

  const imageData = ctx.getImageData(offsetX, offsetY, drawW, drawH);
  const pixels = imageData.data;
  const c = isDark ? 0 : 255;

  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] > 0) {
      pixels[i] = c;
      pixels[i + 1] = c;
      pixels[i + 2] = c;
      pixels[i + 3] = 255;
    }
  }

  ctx.putImageData(imageData, offsetX, offsetY);
}

/**
 * Renders a monochrome mask preview in the sidebar.
 * Dark mode: black mask on white background.
 * Light mode: white mask on black background.
 *
 * Draws once on mount from the overlay's existing canvas/bitmap, then
 * re-draws when:
 * - A paint stroke ends (brush/eraser/pen commit)
 * - The overlay finishes rendering (async mask decode completes)
 */
export default function MaskPreview() {
  const overlay = useAnnotationContext().selected?.overlay;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const theme = useTheme();
  const isDark = theme.themeMode === "dark";

  const { scene } = useLighter();
  const useEventHandler = useLighterEventHandler(
    scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID,
  );

  // Draws the preview from the overlay's current canvas or decoded bitmap.
  const drawFromOverlay = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !(overlay instanceof DetectionOverlay)) return;

    const source = overlay.getMaskPreviewSource();
    if (!source) return;

    drawPreview(canvas, source, source.width, source.height, isDark);
  }, [overlay, isDark]);

  // Initial draw (may be empty if the async decode hasn't completed yet).
  useEffect(drawFromOverlay, [drawFromOverlay]);

  // On paint-end, prefer the afterSnapshot from the event payload (already in
  // memory), fall back to the overlay's preview source.
  const handlePaintEnd = useCallback(
    (payload: {
      paintStrokeData?: { afterSnapshot?: { imageData: ImageData } };
    }) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const snapshot = payload.paintStrokeData?.afterSnapshot;
      if (snapshot) {
        const { imageData } = snapshot;
        const tmp = new OffscreenCanvas(imageData.width, imageData.height);
        tmp.getContext("2d")!.putImageData(imageData, 0, 0);
        drawPreview(canvas, tmp, imageData.width, imageData.height, isDark);
        return;
      }

      drawFromOverlay();
    },
    [isDark, drawFromOverlay],
  );

  useEventHandler("lighter:overlay-paint-end", handlePaintEnd);

  // Re-draw when the overlay finishes rendering (e.g. after async mask decode
  // completes for AI detections, or after the first pen polygon commit).
  useEventHandler("lighter:overlay-loaded", drawFromOverlay);

  if (!(overlay instanceof DetectionOverlay) || !overlay.hasMask()) {
    return null;
  }

  const bg = isDark ? "#ffffff" : "#000000";

  return (
    <Container data-cy="annotate-mask-preview">
      <Label>Mask</Label>
      <CanvasContainer $bg={bg}>
        <StyledCanvas ref={canvasRef} />
      </CanvasContainer>
    </Container>
  );
}
