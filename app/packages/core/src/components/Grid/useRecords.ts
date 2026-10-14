import { useMemo } from "react";
import BoundedMap from "./BoundedMap";

export type Records = Map<string, number> & { readonly revision?: number };

class NavigationRecords extends BoundedMap<string, number> {
  revision = 0;
  override clear() {
    super.clear();
    this.revision++;
  }
}

export default (clear: string) => {
  return useMemo(() => {
    clear;
    return new NavigationRecords(10_000);
  }, [clear]);
};
