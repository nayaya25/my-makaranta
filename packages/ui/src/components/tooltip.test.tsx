import { render, screen } from "@testing-library/react";
import { Tooltip } from "./tooltip";

describe("Tooltip", () => {
  it("shows content when defaultOpen is true", () => {
    render(
      <Tooltip.Provider>
        <Tooltip.Root defaultOpen>
          <Tooltip.Trigger>Hover me</Tooltip.Trigger>
          <Tooltip.Content>Tooltip text</Tooltip.Content>
        </Tooltip.Root>
      </Tooltip.Provider>,
    );
    expect(screen.getAllByText("Tooltip text").length).toBeGreaterThan(0);
  });

  it("renders trigger text", () => {
    render(
      <Tooltip.Provider>
        <Tooltip.Root>
          <Tooltip.Trigger>Hover me</Tooltip.Trigger>
          <Tooltip.Content>Hidden tooltip</Tooltip.Content>
        </Tooltip.Root>
      </Tooltip.Provider>,
    );
    expect(screen.getByText("Hover me")).toBeInTheDocument();
  });

  it("renders with custom content", () => {
    render(
      <Tooltip.Provider>
        <Tooltip.Root defaultOpen>
          <Tooltip.Trigger>Fee due</Tooltip.Trigger>
          <Tooltip.Content>Payment overdue by 3 days</Tooltip.Content>
        </Tooltip.Root>
      </Tooltip.Provider>,
    );
    expect(screen.getAllByText("Payment overdue by 3 days").length).toBeGreaterThan(0);
  });
});
