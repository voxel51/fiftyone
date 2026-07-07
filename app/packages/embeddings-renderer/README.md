# @fiftyone/embeddings-renderer

A high-performance Three.js renderer for embeddings scatter plots: one
`gl.POINTS` draw call over typed arrays in data space, custom GLSL for styling
and density compositing, and a pluggable camera adapter — the built-in adapter
is a planar orthographic camera with wheel zoom, pan, and a plain-drag lasso.

The core (`EmbeddingsChart`) is vanilla Three.js + DOM with no React
dependency; `EmbeddingsView` is a thin React wrapper. All rendering is
on-demand — there is no animation loop.

**Three.js loads lazily.** The package index is three.js-free at runtime;
`EmbeddingsView` dynamically imports the chart (and with it all WebGL code) on
first mount, so consumers pay nothing at startup. Imperative hosts that want
the chart eagerly import the `./chart` subpath. Note for bundling: this split
survives only in output formats that support code-splitting — a single-file UMD
build inlines it.

## API

```tsx
import { EmbeddingsView } from "@fiftyone/embeddings-renderer";

<EmbeddingsView
    points={points} // { id, x, y, z?, label }[]
    colors={colors} // Float32Array(n*3) rgb in [0,1]; omit for the default label palette
    visible={visible} // Uint8Array(n) 0/1; hidden points don't render or hit-test
    selected={selected} // number[] point indices; non-members dim
    settings={settings} // { mode: "density" | "alpha" | "opaque", gamma, glow, singleAlpha }
    onSelection={onLasso} // lasso results as point indices (empty = cleared)
    onPointClick={onClick} // plain click on a point (click-to-select)
    thumbUrl={(i) => url} // optional hover tooltip thumbnails
/>;
```

Or imperatively (eager three.js):

```ts
import { EmbeddingsChart } from "@fiftyone/embeddings-renderer/chart";

const chart = new EmbeddingsChart(container, callbacks, options);
// setData / setColors / setVisible / setSelected / setRenderSettings / destroy
```

Selection semantics: the lasso and the host both call `setSelected`; its only
visual effect is dimming non-members. External selections set via `setSelected`
do **not** echo back through `onSelection`. Visibility (`setVisible`) is a
separate mechanism: hidden points are excluded from rendering, hover, lasso,
and click hit-tests (view-stage subsetting, per the panel's protocol).

Cameras are an extension seam: hosts may supply a `CameraAdapterFactory`
(`zCamera` option/prop) to handle data whose points carry a `z` value. Without
one, `z` is ignored and the data renders flat with the planar camera.

## Checks

Strict TypeScript, package-local eslint, and dependency-cruiser layering rules
(the React-free core, the purity of `math.ts`/`columns.ts`, and the
core-three-only import boundary are machine-enforced):

```sh
yarn check          # check:lint + check:deps + check:types
yarn test           # vitest over the pure modules
```

## Provenance

Ported from the stress-tested prototype at `vis-examples/embeddings-demo`
(`src/embeddings`), which remains the experimentation test bed for new shaders
and rendering techniques. Additions over the prototype: the per-point `visible`
mask, click-to-pick, the pluggable camera seam, and the lazy three.js boundary.
The Playwright harness was intentionally not ported; the pure modules are
covered by vitest here.
