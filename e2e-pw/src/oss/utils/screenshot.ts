import { expect, Locator } from "src/oss/fixtures";

/**
 * One capture of `target` compared exactly with the `name` baseline. Wait for
 * whatever draws the target (its paint or render event) before calling. With
 * an `inset` (0 included) it captures a page clip of the target's area, which
 * also works when `style` hides the target itself.
 */
export const expectScreenshot = async (
  target: Locator,
  name: string,
  options: { inset?: number; style?: string } = {},
) => {
  const capture = {
    animations: "disabled" as const,
    style: options.style,
  };
  const box = options.inset === undefined ? null : await target.boundingBox();
  expect(
    box
      ? await target.page().screenshot({
          ...capture,
          clip: {
            x: box.x + options.inset,
            y: box.y + options.inset,
            width: box.width - 2 * options.inset,
            height: box.height - 2 * options.inset,
          },
        })
      : await target.screenshot(capture),
  ).toMatchSnapshot(name, { maxDiffPixelRatio: 0, threshold: 0 });
};
