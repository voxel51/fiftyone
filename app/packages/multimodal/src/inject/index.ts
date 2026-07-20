import { mcapAdapterDescriptor } from "../adapters/mcap/descriptor";
import { registerFormatAdapter } from "../runtime/adapter-registry";
import { registerEpisodeViews } from "../views/entry";

registerFormatAdapter(mcapAdapterDescriptor);
registerEpisodeViews();
