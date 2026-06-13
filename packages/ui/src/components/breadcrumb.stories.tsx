import type { Meta, StoryObj } from "@storybook/react";
import { Breadcrumb } from "./breadcrumb";

const meta: Meta<typeof Breadcrumb> = {
  title: "Primitives/Breadcrumb",
  component: Breadcrumb,
};
export default meta;
type Story = StoryObj<typeof Breadcrumb>;

export const Default: Story = {
  args: {
    items: [
      { label: "Dashboard", href: "/" },
      { label: "Students", href: "/students" },
      { label: "Ibrahim Bashir" },
    ],
  },
};

export const TwoLevels: Story = {
  args: {
    items: [
      { label: "Dashboard", href: "/" },
      { label: "Fee Records" },
    ],
  },
};

export const SingleItem: Story = {
  args: {
    items: [{ label: "Dashboard" }],
  },
};
