import { mcapAdapterDescriptor } from "../adapters/mcap/descriptor";
import { leRobotAdapterDescriptor } from "../adapters/lerobot/descriptor";
import { registerFormatAdapter } from "../runtime";
import { registerEpisodeViews } from "../views/entry";

registerFormatAdapter(mcapAdapterDescriptor);
registerFormatAdapter(leRobotAdapterDescriptor);
registerEpisodeViews();
