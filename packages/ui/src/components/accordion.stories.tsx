import type { Meta, StoryObj } from "@storybook/react";
import { Accordion } from "./accordion";

const meta: Meta = {
  title: "Primitives/Accordion",
};
export default meta;
type Story = StoryObj;

export const Single: Story = {
  render: () => (
    <div className="w-[480px]">
      <Accordion.Root type="single" collapsible>
        <Accordion.Item value="fees">
          <Accordion.Trigger>How do I pay school fees?</Accordion.Trigger>
          <Accordion.Content>
            Navigate to the Fees section, select the term, and click Pay Now.
          </Accordion.Content>
        </Accordion.Item>
        <Accordion.Item value="results">
          <Accordion.Trigger>When are results published?</Accordion.Trigger>
          <Accordion.Content>
            Results are published within 48 hours of the exam closing date.
          </Accordion.Content>
        </Accordion.Item>
        <Accordion.Item value="attendance">
          <Accordion.Trigger>How is attendance tracked?</Accordion.Trigger>
          <Accordion.Content>
            Teachers mark attendance daily in the Attendance module.
          </Accordion.Content>
        </Accordion.Item>
      </Accordion.Root>
    </div>
  ),
};

export const Multiple: Story = {
  render: () => (
    <div className="w-[480px]">
      <Accordion.Root type="multiple">
        <Accordion.Item value="item-1">
          <Accordion.Trigger>Section A</Accordion.Trigger>
          <Accordion.Content>Content for section A.</Accordion.Content>
        </Accordion.Item>
        <Accordion.Item value="item-2">
          <Accordion.Trigger>Section B</Accordion.Trigger>
          <Accordion.Content>Content for section B.</Accordion.Content>
        </Accordion.Item>
      </Accordion.Root>
    </div>
  ),
};
