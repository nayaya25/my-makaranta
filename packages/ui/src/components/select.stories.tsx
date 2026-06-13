import type { Meta, StoryObj } from "@storybook/react";
import { Select } from "./select";

const meta: Meta = {
  title: "Primitives/Select",
};
export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: () => (
    <div className="w-64">
      <Select.Root>
        <Select.Trigger>
          <Select.Value placeholder="Select a level" />
        </Select.Trigger>
        <Select.Content>
          <Select.Item value="js1">JS1</Select.Item>
          <Select.Item value="js2">JS2</Select.Item>
          <Select.Item value="ss1">SS1</Select.Item>
          <Select.Item value="ss2">SS2</Select.Item>
          <Select.Item value="ss3">SS3</Select.Item>
        </Select.Content>
      </Select.Root>
    </div>
  ),
};
