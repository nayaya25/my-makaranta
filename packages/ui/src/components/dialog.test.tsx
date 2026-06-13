import { render, screen } from "@testing-library/react";
import { Dialog } from "./dialog";

describe("Dialog", () => {
  it("shows content when defaultOpen is true", () => {
    render(
      <Dialog.Root defaultOpen>
        <Dialog.Content>
          <Dialog.Header>
            <Dialog.Title>Confirm Action</Dialog.Title>
            <Dialog.Description>Are you sure?</Dialog.Description>
          </Dialog.Header>
          <Dialog.Footer>
            <Dialog.Close>Cancel</Dialog.Close>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog.Root>,
    );
    expect(screen.getByText("Confirm Action")).toBeInTheDocument();
    expect(screen.getByText("Are you sure?")).toBeInTheDocument();
  });

  it("renders a close button with aria-label Close", () => {
    render(
      <Dialog.Root defaultOpen>
        <Dialog.Content>
          <Dialog.Title>Test</Dialog.Title>
        </Dialog.Content>
      </Dialog.Root>,
    );
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });

  it("renders trigger", () => {
    render(
      <Dialog.Root>
        <Dialog.Trigger>Open Dialog</Dialog.Trigger>
        <Dialog.Content>
          <Dialog.Title>Hidden</Dialog.Title>
        </Dialog.Content>
      </Dialog.Root>,
    );
    expect(screen.getByText("Open Dialog")).toBeInTheDocument();
  });
});
