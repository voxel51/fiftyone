// Local shim — `@voxel51/voodo`'s portal build does not emit a
// `dist/index.d.ts`, and `multimodal`'s tsconfig has `noImplicitAny`
// turned on, so the bare import errors. Declaring the module here lets
// us consume voodo's runtime API without type-checking it; the rest of
// `packages/playback` (where voodo is used at length) runs with looser
// tsconfig and doesn't need this shim.
//
// Drop when voodo's published build includes type declarations.

declare module "@voxel51/voodo";
