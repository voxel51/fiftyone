import { useTheme } from "@fiftyone/components";
import {
  DetectionOverlay,
  UNDEFINED_LIGHTER_SCENE_ID,
  useLighter,
  useLighterEventHandler,
} from "@fiftyone/lighter";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useRef } from "react";
import styled from "styled-components";
import { currentOverlay } from "./state";

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

const MAX_PREVIEW_WIDTH = 256;

/**
 * Draws a {@link CanvasImageSource} to the preview canvas as a monochrome mask.
 */
function drawPreview(
  canvas: HTMLCanvasElement,
  source: CanvasImageSource,
  srcWidth: number,
  srcHeight: number,
  isDark: boolean
) {
  if (srcWidth === 0 || srcHeight === 0) return;

  const scale = Math.min(1, MAX_PREVIEW_WIDTH / srcWidth);
  const w = Math.round(srcWidth * scale);
  const h = Math.round(srcHeight * scale);

  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(source, 0, 0, w, h);

  const imageData = ctx.getImageData(0, 0, w, h);
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

  ctx.putImageData(imageData, 0, 0);
}

/**
 * Renders a monochrome mask preview in the sidebar.
 * Dark mode: black mask on white background.
 * Light mode: white mask on black background.
 *
 * Draws once on mount from the overlay's existing canvas/bitmap, then
 * updates via the afterSnapshot carried by paint-end events.
 */
export default function MaskPreview() {
  const overlay = useAtomValue(currentOverlay);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const theme = useTheme();
  const isDark = theme.themeMode === "dark";

  const { scene } = useLighter();
  const useEventHandler = useLighterEventHandler(
    scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID
  );

  // Initial draw from the overlay's decoded bitmap or editing canvas.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !(overlay instanceof DetectionOverlay)) return;

    const source = overlay.getMaskPreviewSource();
    if (!source) return;

    drawPreview(canvas, source, source.width, source.height, isDark);
  }, [overlay, isDark]);

  // On paint-end, use the afterSnapshot from the event payload directly —
  // it's already in memory, no decode needed.
  const handlePaintEnd = useCallback(
    (payload: {
      paintStrokeData?: { afterSnapshot?: { imageData: ImageData } };
    }) => {
      const canvas = canvasRef.current;
      const snapshot = payload.paintStrokeData?.afterSnapshot;
      if (!canvas || !snapshot) return;

      const { imageData } = snapshot;
      const tmp = new OffscreenCanvas(imageData.width, imageData.height);
      tmp.getContext("2d")!.putImageData(imageData, 0, 0);

      drawPreview(canvas, tmp, imageData.width, imageData.height, isDark);
    },
    [isDark]
  );

  useEventHandler("lighter:overlay-paint-end", handlePaintEnd);

  if (!(overlay instanceof DetectionOverlay) || !overlay.hasMask()) {
    return null;
  }

  const bg = isDark ? "#ffffff" : "#000000";

  return (
    <Container>
      <Label>Mask</Label>
      <CanvasContainer $bg={bg}>
        <StyledCanvas ref={canvasRef} />
      </CanvasContainer>
    </Container>
  );
}
