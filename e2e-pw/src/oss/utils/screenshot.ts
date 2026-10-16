import { expect, Locator } from "src/oss/fixtures";

/**
 * One capture of `target` compared exactly with the `name` baseline. Wait for
 * whatever draws the target (its paint or render event) before calling. With
 * an `inset` (0 included) it captures a page clip of the target's area, which
 * also works when `style` hides the target itself. With a `band` (even) it
 * captures only that many pixels through the target's middle; the middle is
 * the row a surface centered on its own pixel grid draws its center on,
 * which rounds down the page when the target's height is odd.
 */
export const expectScreenshot = async (
  target: Locator,
  name: string,
  options: { inset?: number; style?: string; band?: number } = {},
) => {
  const capture = {
    animations: "disabled" as const,
    style: options.style,
  };
  const { band } = options;
  const clipped = options.inset !== undefined || band !== undefined;
  const box = clipped ? await target.boundingBox() : null;
  const inset = options.inset ?? 0;
  expect(
    box
      ? await target.page().screenshot({
          ...capture,
          clip: {
            x: box.x + inset,
            width: box.width - 2 * inset,
            ...(band === undefined
              ? { y: box.y + inset, height: box.height - 2 * inset }
              : {
                  y: box.y + Math.ceil(box.height / 2) - band / 2,
                  height: band,
                }),
          },
        })
      : await target.screenshot(capture),
  ).toMatchSnapshot(name, { maxDiffPixelRatio: 0, threshold: 0 });
};
