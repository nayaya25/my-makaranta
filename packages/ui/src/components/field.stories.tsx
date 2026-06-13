import type { Meta, StoryObj } from "@storybook/react";
import { Field } from "./field";
import { Input } from "./input";

const meta: Meta<typeof Field> = {
  title: "Primitives/Field",
  component: Field,
};
export default meta;
type Story = StoryObj<typeof Field>;

export const Default: Story = {
  render: () => (
    <Field label="Email address" htmlFor="email">
      <Input id="email" placeholder="you@example.com" />
    </Field>
  ),
};

export const WithHint: Story = {
  render: () => (
    <Field label="Password" htmlFor="pw" hint="At least 8 characters">
      <Input id="pw" type="password" />
    </Field>
  ),
};

export const WithError: Story = {
  render: () => (
    <Field label="Email address" htmlFor="email-err" error="Enter a valid email">
      <Input id="email-err" invalid defaultValue="not-an-email" />
    </Field>
  ),
};

export const Required: Story = {
  render: () => (
    <Field label="Full name" htmlFor="fullname" required>
      <Input id="fullname" placeholder="Amina Yusuf" />
    </Field>
  ),
};
