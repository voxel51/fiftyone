import { Text, TextColor, TextVariant } from "@voxel51/voodo";
import type { Meta, StoryObj } from "@storybook/react";
import SidebarPanel from "./SidebarPanel";

const meta: Meta<typeof SidebarPanel> = {
  title: "Tiling/Components/SidebarPanel",
  component: SidebarPanel,
};
export default meta;

type Story = StoryObj<typeof SidebarPanel>;

export const Default: Story = {
  render: () => (
    <div style={{ width: 280, height: 320, display: "flex" }}>
      <SidebarPanel title="Settings">
        <Text variant={TextVariant.Sm} color={TextColor.Primary}>
          Panel body content goes here.
        </Text>
      </SidebarPanel>
    </div>
  ),
};
