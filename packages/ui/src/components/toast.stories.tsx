import type { Meta, StoryObj } from "@storybook/react";
import { Toast } from "./toast";
import { Button } from "./button";

const meta: Meta = {
  title: "Primitives/Toast",
};
export default meta;
type Story = StoryObj;

export const Neutral: Story = {
  render: () => (
    <Toast.Provider>
      <Toast.Root defaultOpen tone="neutral" title="Notification" description="This is a neutral toast." />
      <Toast.Viewport />
    </Toast.Provider>
  ),
};

export const Success: Story = {
  render: () => (
    <Toast.Provider>
      <Toast.Root defaultOpen tone="success" title="Payment received" description="Fees have been recorded successfully." />
      <Toast.Viewport />
    </Toast.Provider>
  ),
};

export const Error: Story = {
  render: () => (
    <Toast.Provider>
      <Toast.Root defaultOpen tone="error" title="Upload failed" description="Please try again or contact support." />
      <Toast.Viewport />
    </Toast.Provider>
  ),
};

export const Info: Story = {
  render: () => (
    <Toast.Provider>
      <Toast.Root defaultOpen tone="info" title="New term starting" description="Term 2 begins on Jan 8." />
      <Toast.Viewport />
    </Toast.Provider>
  ),
};

export const AllTones: Story = {
  render: () => (
    <Toast.Provider>
      <Toast.Root defaultOpen tone="neutral" title="Neutral" description="Neutral toast message." />
      <Toast.Root defaultOpen tone="success" title="Success" description="Action completed." />
      <Toast.Root defaultOpen tone="error" title="Error" description="Something went wrong." />
      <Toast.Root defaultOpen tone="info" title="Info" description="Here is some info." />
      <Toast.Viewport />
    </Toast.Provider>
  ),
};
