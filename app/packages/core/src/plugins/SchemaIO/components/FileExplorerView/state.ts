import { useEffect, useState } from "react";
import { useOperatorExecutor } from "@fiftyone/operators";

export function useCurrentFiles(defaultPath) {
  const [currentPath, setCurrentPath] = useState(defaultPath);
  const executor = useOperatorExecutor("list_files");
  const currentFiles = executor.result?.files || [];

  useEffect(() => {
    executor.execute({ path: currentPath });
  }, [currentPath]);

  if (executor.error) {
    throw executor.error;
  }

  return { setCurrentPath, currentFiles, currentPath };
}
