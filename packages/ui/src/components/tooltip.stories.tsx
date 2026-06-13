import type { Meta, StoryObj } from "@storybook/react";
import { Tooltip } from "./tooltip";
import { Button } from "./button";
import { Badge } from "./badge";

const meta: Meta = {
  title: "Primitives/Tooltip",
  decorators: [
    (Story) => (
      <Tooltip.Provider>
        <Story />
      </Tooltip.Provider>
    ),
  ],
};
export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: () => (
    <div className="flex items-center justify-center h-32">
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <Button variant="secondary">Hover me</Button>
        </Tooltip.Trigger>
        <Tooltip.Content>Enroll student in class</Tooltip.Content>
      </Tooltip.Root>
    </div>
  ),
};

export const OnBadge: Story = {
  render: () => (
    <div className="flex items-center justify-center h-32">
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <span>
            <Badge tone="warning">Overdue</Badge>
          </span>
        </Tooltip.Trigger>
        <Tooltip.Content>Fee payment is 3 days overdue</Tooltip.Content>
      </Tooltip.Root>
    </div>
  ),
};

export const AllSides: Story = {
  render: () => (
    <div className="flex items-center justify-center gap-6 h-48">
      {(["top", "right", "bottom", "left"] as const).map((side) => (
        <Tooltip.Root key={side}>
          <Tooltip.Trigger asChild>
            <Button variant="outline" size="sm">{side}</Button>
          </Tooltip.Trigger>
          <Tooltip.Content side={side}>Tooltip on {side}</Tooltip.Content>
        </Tooltip.Root>
      ))}
    </div>
  ),
};
