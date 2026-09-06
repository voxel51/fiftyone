import { leRobotAdapterDescriptor } from "../adapters/lerobot/descriptor";
import { mcapAdapterDescriptor } from "../adapters/mcap/descriptor";
import { registerFormatAdapter } from "../runtime/adapter-registry";
import {
  loadLeRobotViewExtensions,
  registerEpisodeViews,
} from "../views/entry";

// Format-specific view extensions are composed onto the adapter's lazy
// load here, in the injection root: the adapter layer stays view-free,
// while the extension still registers before `load()` resolves — so it
// exists before any session can expose `hasStateAction` — and stays out
// of the initial bundle for non-LeRobot sessions.
registerFormatAdapter({
  ...leRobotAdapterDescriptor,
  load: async (options) => {
    const [adapter] = await Promise.all([
      leRobotAdapterDescriptor.load(options),
      loadLeRobotViewExtensions(),
    ]);
    return adapter;
  },
});
registerFormatAdapter(mcapAdapterDescriptor);
registerEpisodeViews();
