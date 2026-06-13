import type { Meta, StoryObj } from "@storybook/react";
import { Sheet } from "./sheet";
import { Button } from "./button";

const meta: Meta = {
  title: "Primitives/Sheet",
};
export default meta;
type Story = StoryObj;

export const Right: Story = {
  render: () => (
    <Sheet.Root>
      <Sheet.Trigger asChild>
        <Button>Open Right Sheet</Button>
      </Sheet.Trigger>
      <Sheet.Content side="right">
        <Sheet.Header>
          <Sheet.Title>Student Profile</Sheet.Title>
        </Sheet.Header>
        <div className="p-6 flex-1">
          <p className="text-body text-ink-700">Student details go here.</p>
        </div>
        <Sheet.Footer>
          <Sheet.Close asChild>
            <Button variant="ghost">Close</Button>
          </Sheet.Close>
          <Button>Save Changes</Button>
        </Sheet.Footer>
      </Sheet.Content>
    </Sheet.Root>
  ),
};

export const Left: Story = {
  render: () => (
    <Sheet.Root>
      <Sheet.Trigger asChild>
        <Button>Open Left Sheet</Button>
      </Sheet.Trigger>
      <Sheet.Content side="left">
        <Sheet.Header>
          <Sheet.Title>Navigation</Sheet.Title>
        </Sheet.Header>
        <div className="p-6 flex-1">
          <p className="text-body text-ink-700">Navigation links go here.</p>
        </div>
      </Sheet.Content>
    </Sheet.Root>
  ),
};

export const Bottom: Story = {
  render: () => (
    <Sheet.Root>
      <Sheet.Trigger asChild>
        <Button>Open Bottom Sheet</Button>
      </Sheet.Trigger>
      <Sheet.Content side="bottom">
        <Sheet.Header>
          <Sheet.Title>Actions</Sheet.Title>
        </Sheet.Header>
        <div className="p-6">
          <p className="text-body text-ink-700">Mobile action sheet content.</p>
        </div>
        <Sheet.Footer>
          <Sheet.Close asChild>
            <Button variant="outline" className="w-full">Dismiss</Button>
          </Sheet.Close>
        </Sheet.Footer>
      </Sheet.Content>
    </Sheet.Root>
  ),
};
