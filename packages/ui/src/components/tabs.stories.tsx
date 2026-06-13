import type { Meta, StoryObj } from "@storybook/react";
import { Tabs } from "./tabs";

const meta: Meta = {
  title: "Primitives/Tabs",
};
export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: () => (
    <Tabs.Root defaultValue="students">
      <Tabs.List>
        <Tabs.Trigger value="students">Students</Tabs.Trigger>
        <Tabs.Trigger value="teachers">Teachers</Tabs.Trigger>
        <Tabs.Trigger value="fees">Fees</Tabs.Trigger>
      </Tabs.List>
      <Tabs.Content value="students">
        <p className="text-body text-ink-700">Students panel content</p>
      </Tabs.Content>
      <Tabs.Content value="teachers">
        <p className="text-body text-ink-700">Teachers panel content</p>
      </Tabs.Content>
      <Tabs.Content value="fees">
        <p className="text-body text-ink-700">Fees panel content</p>
      </Tabs.Content>
    </Tabs.Root>
  ),
};
