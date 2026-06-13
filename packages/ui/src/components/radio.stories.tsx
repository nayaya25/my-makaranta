import type { Meta, StoryObj } from "@storybook/react";
import { RadioGroup, RadioGroupItem } from "./radio";

const meta: Meta = {
  title: "Primitives/Radio",
};
export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: () => (
    <RadioGroup defaultValue="b">
      <div className="flex items-center gap-2">
        <RadioGroupItem value="a" id="r-a" />
        <label htmlFor="r-a">Option A</label>
      </div>
      <div className="flex items-center gap-2">
        <RadioGroupItem value="b" id="r-b" />
        <label htmlFor="r-b">Option B</label>
      </div>
      <div className="flex items-center gap-2">
        <RadioGroupItem value="c" id="r-c" disabled />
        <label htmlFor="r-c">Option C (disabled)</label>
      </div>
    </RadioGroup>
  ),
};
