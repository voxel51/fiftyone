/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * A proof-of-concept keymap system for the keyboard-shortcuts design doc.
 *
 * It stands alongside `@fiftyone/commands` and touches none of it — no
 * migration. What it exists to demonstrate is the parts of the design that are
 * hard to evaluate on paper: that separating command *declaration* from handler
 * *binding* lets a settings pane list shortcuts for surfaces that aren't
 * mounted, that a real scope stack dissolves most apparent key collisions, and
 * that conflict-versus-shadowing is a distinction users can act on.
 */

export * from "./core/chords";
export * from "./core/conflicts";
export * from "./core/dismiss";
export * from "./core/layout";
export * from "./core/manifest";
export * from "./core/overrides";
export * from "./core/registry";
export * from "./core/scopes";
export * from "./core/textInput";
export * from "./react/state";
export * from "./react/useKeymap";
