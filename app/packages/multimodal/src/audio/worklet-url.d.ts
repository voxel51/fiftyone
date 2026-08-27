/**
 * Vite's `?worker&url` suffix: transpiles and bundles the target as a
 * separate module-format entry and yields its URL, which is what
 * `AudioWorklet.addModule()` needs. A plain `new URL(…, import.meta.url)`
 * would hand the raw `.ts` to the browser untranspiled.
 *
 * `multimodal` has no `vite-env.d.ts`, so the ambient declaration lives
 * here rather than pulling all of `vite/client` into this package.
 */
declare module "*?worker&url" {
  const url: string;
  export default url;
}
