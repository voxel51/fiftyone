import { useEffect, useState } from "react";
import { useOperatorExecutor } from "@fiftyone/operators";

export function useCurrentFiles(currentPath) {
  const executor = useOperatorExecutor("list_files");
  const files = executor.result?.files || [];

  useEffect(() => {
    executor.execute({ path: currentPath });
  }, [currentPath]);

  if (executor.error) {
    throw executor.error;
  }

  return files;
}
