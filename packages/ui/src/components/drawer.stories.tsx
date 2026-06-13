import type { Meta, StoryObj } from "@storybook/react";
import { Drawer } from "./drawer";
import { Button } from "./button";

const meta: Meta = {
  title: "Primitives/Drawer",
};
export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: () => (
    <Drawer.Root>
      <Drawer.Trigger asChild>
        <Button variant="ghost">Open Navigation</Button>
      </Drawer.Trigger>
      <Drawer.Content>
        <div className="p-6 pt-12 flex flex-col gap-2">
          <p className="text-caption uppercase tracking-wider text-ink-500 mb-2">Navigation</p>
          {["Dashboard", "Students", "Classes", "Reports", "Settings"].map((item) => (
            <button
              key={item}
              className="text-left px-3 py-2 rounded-input text-body text-ink-700 hover:bg-ink-100 transition-colors duration-micro ease-expo"
            >
              {item}
            </button>
          ))}
        </div>
      </Drawer.Content>
    </Drawer.Root>
  ),
};
