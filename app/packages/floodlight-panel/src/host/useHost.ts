import { type RefObject, useEffect, useRef, useState } from "react";
import {
  type Anchor,
  createHost,
  type CrossAxis,
  type Host,
  type HostStatus,
  type Instance,
} from "./createHost";

export interface UseHostOptions<K, I extends Instance> {
  ref: RefObject<HTMLElement>;
  axis: CrossAxis;
  build: (anchor: Anchor<K> | undefined) => I;
  onAnchor?: (anchor: Anchor<K>) => void;
  onDispose?: (instance: I) => void;
  settle?: number;
}

/**
 * Binds a host to an element for the component's lifetime. `build` and the
 * callbacks may change identity every render; the host always calls the
 * latest ones. Callers decide when to `rebuild`.
 */
export default function useHost<K, I extends Instance>(
  options: UseHostOptions<K, I>,
) {
  const latest = useRef(options);
  latest.current = options;

  const { axis, ref, settle } = options;
  const [host, setHost] = useState<Host<K, I>>();
  const [state, setState] = useState<{ status: HostStatus; instance?: I }>({
    status: "building",
  });

  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;

    const created = createHost<K, I>({
      axis,
      element,
      settle,
      build: (anchor) => latest.current.build(anchor),
      onAnchor: (anchor) => latest.current.onAnchor?.(anchor),
      onDispose: (instance) => latest.current.onDispose?.(instance),
      onStatus: (status, instance) => setState({ instance, status }),
    });
    setHost(created);

    return () => {
      created.destroy();
      setHost(undefined);
    };
  }, [axis, ref, settle]);

  return { host, ...state };
}
