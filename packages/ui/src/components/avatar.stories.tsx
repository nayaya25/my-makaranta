import type { Meta, StoryObj } from "@storybook/react";
import { Avatar } from "./avatar";

const meta: Meta<typeof Avatar> = {
  title: "Primitives/Avatar",
  component: Avatar,
  args: { name: "Tunde Okafor" },
  argTypes: {
    size: { control: "select", options: ["sm", "md", "lg"] },
  },
};
export default meta;
type Story = StoryObj<typeof Avatar>;

export const Fallback: Story = {};

export const WithImage: Story = {
  args: {
    src: "https://i.pravatar.cc/150?img=3",
    name: "Amaka Eze",
  },
};

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <Avatar name="Tunde Okafor" size="sm" />
      <Avatar name="Tunde Okafor" size="md" />
      <Avatar name="Tunde Okafor" size="lg" />
    </div>
  ),
};
