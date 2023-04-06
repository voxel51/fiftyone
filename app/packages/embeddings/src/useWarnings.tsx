import { usePanelStatePartial } from "@fiftyone/spaces";

export function useWarnings() {
  const [state, _setState] = usePanelStatePartial(
    "warnings",
    { warnings: [] },
    true
  );
  const { warnings } = state;
  const hasWarnings = Array.isArray(warnings) && warnings.length > 0;
  const setState = (fn) => {
    _setState((s) => fn(s || { warnings: [] }));
  };

  return {
    hasWarnings,
    items: warnings,
    visible: hasWarnings && state.visible,
    count: Array.isArray(warnings) ? warnings.length : null,
    show() {
      setState((s) => ({ ...s, visible: true }));
    },
    hide() {
      setState((s) => ({ ...s, visible: false, userHidden: true }));
    },
    clear() {
      setState((s) => ({ ...s, warnings: null }));
    },
    add(msg) {
      setState((s) => ({
        ...s,
        visible: true,
        warnings: [...(s.warnings || []), msg],
      }));
    },
  };
}
