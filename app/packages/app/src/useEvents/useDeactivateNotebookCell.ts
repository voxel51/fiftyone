import { useScreenshot } from "@fiftyone/state";
import { useCallback } from "react";
import { EventHandlerHook } from "./registerEvent";

const useDeactivateNotebookCell: EventHandlerHook = (ctx) => {
  const screenshot = useScreenshot(
    new URLSearchParams(window.location.search).get("context") as
      | "ipython"
      | "colab"
      | "databricks"
      | undefined
  );

  return useCallback(() => {
    ctx.controller.abort();
    screenshot();
  }, [screenshot, ctx.controller]);
};

export default useDeactivateNotebookCell;
