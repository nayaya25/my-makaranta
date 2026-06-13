import type { Meta, StoryObj } from "@storybook/react";
import { Input } from "./input";

const meta: Meta<typeof Input> = {
  title: "Primitives/Input",
  component: Input,
  args: { placeholder: "Enter text…" },
};
export default meta;
type Story = StoryObj<typeof Input>;

export const Default: Story = {};
export const WithValue: Story = { args: { defaultValue: "Ibrahim Bashir" } };
export const Invalid: Story = { args: { invalid: true, defaultValue: "bad@" } };
export const Disabled: Story = { args: { disabled: true, placeholder: "Disabled" } };
