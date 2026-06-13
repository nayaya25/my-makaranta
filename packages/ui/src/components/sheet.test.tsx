import { render, screen } from "@testing-library/react";
import { Sheet } from "./sheet";

describe("Sheet", () => {
  it("shows content when defaultOpen is true", () => {
    render(
      <Sheet.Root defaultOpen>
        <Sheet.Content>
          <Sheet.Header>
            <Sheet.Title>Student Details</Sheet.Title>
          </Sheet.Header>
        </Sheet.Content>
      </Sheet.Root>,
    );
    expect(screen.getByText("Student Details")).toBeInTheDocument();
  });

  it("applies rounded-t-sheet class for side=bottom", () => {
    render(
      <Sheet.Root defaultOpen>
        <Sheet.Content side="bottom" data-testid="sheet-content">
          <Sheet.Title>Bottom Sheet</Sheet.Title>
        </Sheet.Content>
      </Sheet.Root>,
    );
    const content = screen.getByTestId("sheet-content");
    expect(content.className).toContain("rounded-t-sheet");
  });

  it("renders trigger", () => {
    render(
      <Sheet.Root>
        <Sheet.Trigger>Open Sheet</Sheet.Trigger>
        <Sheet.Content>
          <Sheet.Title>Hidden</Sheet.Title>
        </Sheet.Content>
      </Sheet.Root>,
    );
    expect(screen.getByText("Open Sheet")).toBeInTheDocument();
  });

  it("renders close button", () => {
    render(
      <Sheet.Root defaultOpen>
        <Sheet.Content>
          <Sheet.Title>Sheet</Sheet.Title>
        </Sheet.Content>
      </Sheet.Root>,
    );
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });
});
