import { useEffect, useState } from "react";
import { useOperatorExecutor } from "@fiftyone/operators";

export function useCurrentFiles(defaultPath) {
  const [currentPath, setCurrentPath] = useState(defaultPath);
  const executor = useOperatorExecutor("list_files");
  const currentFiles = executor.result?.files || [];

  const refresh = () => {
    executor.execute({ path: currentPath });
  };

  useEffect(refresh, [currentPath]);

  if (executor.error) {
    throw executor.error;
  }

  return { setCurrentPath, refresh, currentFiles, currentPath };
}
