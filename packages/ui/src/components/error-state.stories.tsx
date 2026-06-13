import type { Meta, StoryObj } from "@storybook/react";
import { ErrorState } from "./error-state";

const meta: Meta<typeof ErrorState> = {
  title: "Primitives/ErrorState",
  component: ErrorState,
};
export default meta;
type Story = StoryObj<typeof ErrorState>;

export const Default: Story = {};

export const WithDescription: Story = {
  args: {
    description: "Unable to load student records. Check your connection.",
  },
};

export const WithRetry: Story = {
  args: {
    description: "The request timed out.",
    onRetry: () => alert("Retrying…"),
  },
};

export const CustomTitle: Story = {
  args: {
    title: "Failed to load fee records",
    description: "Please refresh the page.",
    onRetry: () => alert("Retrying…"),
  },
};
