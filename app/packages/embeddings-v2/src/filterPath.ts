/**
 * The filter-atom path for the color-by field, in the vocabulary the
 * grid's CURRENT view understands.
 *
 * The App names the same data differently by view: from the root
 * dataset a patch attribute is `<field>.<list>.<leaf>`
 * (`ground_truth.detections.label`), but in a patches view each
 * document IS one patch, so the list segment vanishes
 * (`ground_truth.label`). The color-by endpoint always speaks root
 * paths, while the server resolves sidebar filters against the current
 * view's schema and silently drops any path it cannot resolve
 * (fiftyone.server.view `_iter_paths` consumers skip on
 * `get_field() -> None`). A legend filter keyed under a root path while
 * the grid shows patches therefore filters nothing, without error.
 */
export function gridFilterPath(
  path: string,
  patchesField: string | null | undefined,
  isPatchesView: boolean,
): string {
  if (!isPatchesView || !patchesField) return path;

  const prefix = `${patchesField}.`;
  if (!path.startsWith(prefix)) {
    // A patches view of some OTHER field: no root path of this run
    // resolves there either way, so pass through unchanged (the same
    // silent no-op as before, never a wrong filter)
    return path;
  }

  const rest = path.slice(prefix.length);
  const listEnd = rest.indexOf(".");
  // The bare list path (`ground_truth.detections`) has no leaf to
  // re-root; it is not a color-by choice, so leave it alone
  if (listEnd < 0) return path;

  return `${patchesField}.${rest.slice(listEnd + 1)}`;
}
