import { useRecoilValue, useSetRecoilState } from "recoil";
import { viewChangePending } from "../recoil";

/**
 * Whether a view change is in flight outside the router's knowledge — e.g.
 * a server-side operator that will apply a view when it finishes. Surfaces
 * the same pending treatment a `setView` round-trip gets, for exactly as
 * long: the router clears it when the resulting entry loads.
 */
export const useViewChangePending = (): boolean =>
  useRecoilValue(viewChangePending);

export const useSetViewChangePending = () =>
  useSetRecoilState(viewChangePending);
