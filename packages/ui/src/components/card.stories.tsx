import type { Meta, StoryObj } from "@storybook/react";
import { Card, CardHeader, CardBody, CardFooter } from "./card";
import { Button } from "./button";

const meta: Meta<typeof Card> = {
  title: "Primitives/Card",
  component: Card,
};
export default meta;
type Story = StoryObj<typeof Card>;

export const FeeCard: Story = {
  render: () => (
    <Card className="w-80" elevation="md">
      <CardHeader>
        <p className="text-caption uppercase tracking-wide text-ink-500">Outstanding fees</p>
        <h3 className="font-display text-h2 tabular-nums text-ink-1000">₦175,000</h3>
      </CardHeader>
      <CardBody>
        <p className="text-small text-ink-700">
          Tunde Okafor · JSS2A · Second Term 2025/2026
        </p>
      </CardBody>
      <CardFooter>
        <Button className="w-full">Pay now</Button>
      </CardFooter>
    </Card>
  ),
};

export const ElevationScale: Story = {
  render: () => (
    <div className="flex flex-wrap gap-6 bg-paper p-8">
      {(["flat", "sm", "md", "lg"] as const).map((e) => (
        <Card key={e} elevation={e} className="grid h-28 w-44 place-items-center">
          <span className="text-small text-ink-500">elevation: {e}</span>
        </Card>
      ))}
    </div>
  ),
};
