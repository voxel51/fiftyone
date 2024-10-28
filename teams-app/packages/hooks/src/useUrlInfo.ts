import { hostState } from "@fiftyone/teams-state";
import { useMemo } from "react";
import { useRecoilValue } from "recoil";

// Hook
export function useURLInfo() {
  const host = useRecoilValue<string>(hostState);

  return useMemo(() => {
    return {
      host,
    };
  }, [host]);
}
