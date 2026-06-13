import type { Meta, StoryObj } from "@storybook/react";
import { Dialog } from "./dialog";
import { Button } from "./button";

const meta: Meta = {
  title: "Primitives/Dialog",
};
export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: () => (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <Button>Open Dialog</Button>
      </Dialog.Trigger>
      <Dialog.Content>
        <Dialog.Header>
          <Dialog.Title>Confirm Enrollment</Dialog.Title>
          <Dialog.Description>
            This will enroll the student in the selected class. This action cannot be undone.
          </Dialog.Description>
        </Dialog.Header>
        <Dialog.Footer>
          <Dialog.Close asChild>
            <Button variant="ghost">Cancel</Button>
          </Dialog.Close>
          <Button>Confirm</Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog.Root>
  ),
};

export const WithForm: Story = {
  render: () => (
    <Dialog.Root defaultOpen>
      <Dialog.Content>
        <Dialog.Header>
          <Dialog.Title>Add Student</Dialog.Title>
          <Dialog.Description>Fill in the details to register a new student.</Dialog.Description>
        </Dialog.Header>
        <div className="flex flex-col gap-3 my-4">
          <input className="border border-ink-300 rounded-input px-3 py-2 text-body" placeholder="Full name" />
          <input className="border border-ink-300 rounded-input px-3 py-2 text-body" placeholder="Email" />
        </div>
        <Dialog.Footer>
          <Dialog.Close asChild>
            <Button variant="outline">Cancel</Button>
          </Dialog.Close>
          <Button>Save</Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog.Root>
  ),
};
