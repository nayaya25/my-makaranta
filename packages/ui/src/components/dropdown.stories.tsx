import type { Meta, StoryObj } from "@storybook/react";
import { Dropdown } from "./dropdown";
import { Button } from "./button";

const meta: Meta = {
  title: "Primitives/Dropdown",
};
export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: () => (
    <Dropdown.Root>
      <Dropdown.Trigger asChild>
        <Button variant="secondary">Open menu</Button>
      </Dropdown.Trigger>
      <Dropdown.Content>
        <Dropdown.Item>View profile</Dropdown.Item>
        <Dropdown.Item>Edit details</Dropdown.Item>
        <Dropdown.Separator />
        <Dropdown.Item>Delete</Dropdown.Item>
      </Dropdown.Content>
    </Dropdown.Root>
  ),
};

export const WithLabel: Story = {
  render: () => (
    <Dropdown.Root>
      <Dropdown.Trigger asChild>
        <Button variant="outline">Actions</Button>
      </Dropdown.Trigger>
      <Dropdown.Content>
        <Dropdown.Label>Student</Dropdown.Label>
        <Dropdown.Item>View report card</Dropdown.Item>
        <Dropdown.Item>Send message</Dropdown.Item>
        <Dropdown.Separator />
        <Dropdown.Label>Admin</Dropdown.Label>
        <Dropdown.Item>Suspend student</Dropdown.Item>
      </Dropdown.Content>
    </Dropdown.Root>
  ),
};
