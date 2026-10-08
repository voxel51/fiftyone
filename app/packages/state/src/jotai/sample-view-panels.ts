import { atom, type PrimitiveAtom } from "jotai";

/** One plugin panel currently open as a tile in the sample view. */
export interface SampleViewPanelTile {
  readonly id: string;
  readonly name: string;
}

export interface OpenSampleViewPanelOptions {
  /** Tile title; defaults to the panel name until the registration resolves. */
  readonly label?: string;
  /** Open another instance even when one is already on the canvas. */
  readonly allowDuplicate?: boolean;
  /** Focus the tile after opening (or the existing one). @default true */
  readonly focus?: boolean;
}

/**
 * What the sample view's tiling host lets operators do with plugin panels:
 * the tile-side counterpart of the grid's Spaces tree. Published while a
 * host is mounted, `null` otherwise.
 */
export interface SampleViewPanelsController {
  /** Open `name` as a tile; returns the tile id (the existing one when it is a singleton already shown). */
  open: (name: string, options?: OpenSampleViewPanelOptions) => string;
  /** Close by tile id or panel name. Returns whether a tile was closed. */
  close: (ref: { id?: string; name?: string }) => boolean;
  /** Panel tiles currently on the canvas, in tile-id order. */
  list: () => SampleViewPanelTile[];
}

// Typed through a variable: a bare `null` argument would select jotai's
// read-only `atom(read)` overload under this package's null-check settings.
const noController: SampleViewPanelsController | null = null;

export const sampleViewPanelsControllerAtom: PrimitiveAtom<SampleViewPanelsController | null> =
  atom(noController);
