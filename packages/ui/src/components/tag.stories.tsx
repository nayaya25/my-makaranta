import type { Meta, StoryObj } from "@storybook/react";
import { Tag } from "./tag";

const meta: Meta<typeof Tag> = {
  title: "Primitives/Tag",
  component: Tag,
  args: { children: "Mathematics" },
};
export default meta;
type Story = StoryObj<typeof Tag>;

export const Default: Story = {};

export const Removable: Story = {
  args: { onRemove: () => alert("removed") },
};

export const TagList: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Tag>Mathematics</Tag>
      <Tag>English</Tag>
      <Tag onRemove={() => {}}>Science</Tag>
      <Tag onRemove={() => {}}>History</Tag>
    </div>
  ),
};
