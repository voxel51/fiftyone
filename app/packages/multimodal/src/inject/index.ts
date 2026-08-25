import { leRobotAdapterDescriptor } from "../adapters/lerobot/descriptor";
import { mcapAdapterDescriptor } from "../adapters/mcap/descriptor";
import { registerFormatAdapter } from "../runtime/adapter-registry";
import { registerEpisodeViews } from "../views/entry";

registerFormatAdapter(leRobotAdapterDescriptor);
registerFormatAdapter(mcapAdapterDescriptor);
registerEpisodeViews();
