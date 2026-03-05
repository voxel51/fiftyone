import type { RegisteredWriter } from "./registerWriter";

// No-op writer: onSelectSamples already sends meta alongside selected
// in a single setSelected mutation. This writer exists only because
// useWriters requires a registered writer for every session atom.
const onSelectMeta: RegisteredWriter<"selectedMeta"> = () => () => {};

export default onSelectMeta;
