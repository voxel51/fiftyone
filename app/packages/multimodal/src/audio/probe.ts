/**
 * Dev-only audio diagnostics.
 *
 * Audio playback is driven by a HEADLESS hook with no UI of its own, so a
 * silent stream has no visible failure surface: decode, graph construction,
 * and transport all fail the same way (nothing happens). This records each
 * stage boundary on `window.__foAudio` so a real browser session can be
 * inspected with `console.table(window.__foAudio)` — and so
 * `e2e-pw/scripts/probe-audio.mjs` can assert on it.
 *
 * Compiled out of production bundles by the `import.meta.env.DEV` guard.
 */
const MAX_ENTRIES = 200;

export function audioProbe(
  event: string,
  detail: Record<string, unknown>,
): void {
  if (!import.meta.env?.DEV || typeof window === "undefined") return;
  const target = window as unknown as {
    __foAudio?: Array<Record<string, unknown>>;
  };
  const entries = (target.__foAudio ??= []);
  entries.push({ event, ...detail });
  // Bounded: a long session with repeated seeks would otherwise grow this
  // without limit.
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
}
