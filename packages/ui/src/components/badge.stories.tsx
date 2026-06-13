import type { Meta, StoryObj } from "@storybook/react";
import { Badge } from "./badge";

const meta: Meta<typeof Badge> = {
  title: "Primitives/Badge",
  component: Badge,
  args: { children: "Active" },
  argTypes: {
    tone: { control: "select", options: ["neutral", "brand", "success", "warning", "error", "info"] },
  },
};
export default meta;
type Story = StoryObj<typeof Badge>;

export const Neutral: Story = { args: { tone: "neutral" } };
export const Brand: Story = { args: { tone: "brand" } };
export const Success: Story = { args: { tone: "success", children: "Paid" } };
export const Warning: Story = { args: { tone: "warning", children: "Pending" } };
export const Error: Story = { args: { tone: "error", children: "Overdue" } };
export const Info: Story = { args: { tone: "info", children: "New" } };

export const AllTones: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Badge tone="neutral">Neutral</Badge>
      <Badge tone="brand">Brand</Badge>
      <Badge tone="success">Paid</Badge>
      <Badge tone="warning">Pending</Badge>
      <Badge tone="error">Overdue</Badge>
      <Badge tone="info">New</Badge>
    </div>
  ),
};
