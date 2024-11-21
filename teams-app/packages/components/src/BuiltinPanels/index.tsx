import dynamic from "next/dynamic";

/**
 * Built-in panels use the `@fiftyone/plugins` package, which cannot be loaded
 * on the server.
 */
const BuiltinPanels = dynamic(
  async () => {
    return import("@fiftyone/components/src/components/BuiltinPanels");
  },
  { ssr: false }
);

export default BuiltinPanels;
