import type { Meta, StoryObj } from "@storybook/react";
import { Inbox } from "lucide-react";
import { EmptyState } from "./empty-state";
import { Button } from "./button";

const meta: Meta<typeof EmptyState> = {
  title: "Primitives/EmptyState",
  component: EmptyState,
};
export default meta;
type Story = StoryObj<typeof EmptyState>;

export const Default: Story = {
  args: {
    title: "No students found",
    description: "Add your first student to get started.",
  },
};

export const WithIcon: Story = {
  args: {
    icon: <Inbox size={24} />,
    title: "No messages yet",
    description: "Messages from parents will appear here.",
  },
};

export const WithAction: Story = {
  args: {
    icon: <Inbox size={24} />,
    title: "No fee records",
    description: "Collect fees to start tracking payments.",
    action: <Button size="sm">Add fee record</Button>,
  },
};

export const TitleOnly: Story = {
  args: {
    title: "Nothing here yet",
  },
};
