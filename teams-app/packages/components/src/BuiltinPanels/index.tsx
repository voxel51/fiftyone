import dynamic from "next/dynamic";
import { Fragment } from "react";

/**
 * Built-in panels use the `@fiftyone/plugins` package, which cannot be loaded
 * on the server.
 */
const BuiltinPanels = dynamic(
  async () => {
    await import("../DataLens");

    return Fragment;
  },
  { ssr: false }
);

export default BuiltinPanels;
