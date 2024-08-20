import type { RegisteredWriter } from "./registerWriter";

const onSetModalFilters: RegisteredWriter<"modalFilters"> = () => () => {
  // TODO: OSS is a noop
};

export default onSetModalFilters;
