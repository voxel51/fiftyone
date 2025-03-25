import type { Renderer } from "./Renderer";

export const RENDERERS: (typeof Renderer<unknown, unknown>)[] = [];

export default function registerRenderer<C, D>(
  renderer: typeof Renderer<C, D>
) {
  RENDERERS.push(renderer);
}
