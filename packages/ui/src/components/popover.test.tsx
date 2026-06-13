import { render, screen, fireEvent } from "@testing-library/react";
import { Popover } from "./popover";

describe("Popover", () => {
  it("shows content when trigger is clicked", () => {
    render(
      <Popover.Root>
        <Popover.Trigger>Open Popover</Popover.Trigger>
        <Popover.Content>
          <p>Popover Content</p>
        </Popover.Content>
      </Popover.Root>,
    );
    fireEvent.click(screen.getByText("Open Popover"));
    expect(screen.getByText("Popover Content")).toBeInTheDocument();
  });

  it("renders trigger", () => {
    render(
      <Popover.Root>
        <Popover.Trigger>Open</Popover.Trigger>
        <Popover.Content>
          <p>Content</p>
        </Popover.Content>
      </Popover.Root>,
    );
    expect(screen.getByText("Open")).toBeInTheDocument();
  });
});
