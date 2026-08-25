import { useEffect, useState } from "react";

/**
 * Latches true the first time `open` is true, and stays true.
 *
 * Content behind a drawer shouldn't do mount-time work until the drawer is
 * actually revealed, but must not be discarded when it closes again — losing a
 * draft or refetching on every reopen. Mount on first open; stay mounted.
 */
export default function useMountedOnceOpen(open: boolean): boolean {
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);
  return mounted;
}
