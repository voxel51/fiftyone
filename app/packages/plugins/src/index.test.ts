import { describe, it } from "vitest";
import { registerComponent, PluginComponentType } from ".";

const FakeComponent: React.FunctionComponent = () => {
  return null;
};

describe("registerComponent", () => {
  it("should allow for registration of components", () => {
    registerComponent({
      name: "FakeComponent",
      type: PluginComponentType.Visualizer,
      component: FakeComponent,
      activator: () => true,
    });
  });
});
