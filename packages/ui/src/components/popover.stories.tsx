import type { Meta, StoryObj } from "@storybook/react";
import { Popover } from "./popover";
import { Button } from "./button";

const meta: Meta = {
  title: "Primitives/Popover",
};
export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: () => (
    <div className="flex items-center justify-center h-48">
      <Popover.Root>
        <Popover.Trigger asChild>
          <Button variant="outline">Open Popover</Button>
        </Popover.Trigger>
        <Popover.Content>
          <p className="text-body font-medium text-ink-1000 mb-1">Quick Info</p>
          <p className="text-small text-ink-500">
            This student has 3 pending assignments due this week.
          </p>
        </Popover.Content>
      </Popover.Root>
    </div>
  ),
};

export const WithClose: Story = {
  render: () => (
    <div className="flex items-center justify-center h-48">
      <Popover.Root>
        <Popover.Trigger asChild>
          <Button variant="secondary">Show Options</Button>
        </Popover.Trigger>
        <Popover.Content>
          <div className="flex flex-col gap-1">
            <p className="text-small font-medium text-ink-700 mb-2">Options</p>
            <button className="text-left text-body text-ink-1000 px-2 py-1.5 rounded-sm hover:bg-ink-100 transition-colors duration-micro ease-expo">
              Edit
            </button>
            <button className="text-left text-body text-error px-2 py-1.5 rounded-sm hover:bg-error/10 transition-colors duration-micro ease-expo">
              Delete
            </button>
          </div>
        </Popover.Content>
      </Popover.Root>
    </div>
  ),
};
