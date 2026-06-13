import { render, screen } from "@testing-library/react";
import { Drawer } from "./drawer";

describe("Drawer", () => {
  it("shows content when defaultOpen is true", () => {
    render(
      <Drawer.Root defaultOpen>
        <Drawer.Content>
          <p>Navigation Menu</p>
        </Drawer.Content>
      </Drawer.Root>,
    );
    expect(screen.getByText("Navigation Menu")).toBeInTheDocument();
  });

  it("renders a sr-only title for screen readers (default)", () => {
    render(
      <Drawer.Root defaultOpen>
        <Drawer.Content>
          <p>Content</p>
        </Drawer.Content>
      </Drawer.Root>,
    );
    expect(screen.getByText("Drawer")).toBeInTheDocument();
  });

  it("renders a custom sr-only title when title prop is provided", () => {
    render(
      <Drawer.Root defaultOpen>
        <Drawer.Content title="Navigation">
          <p>Content</p>
        </Drawer.Content>
      </Drawer.Root>,
    );
    expect(screen.getByText("Navigation")).toBeInTheDocument();
  });

  it("renders trigger", () => {
    render(
      <Drawer.Root>
        <Drawer.Trigger>Open Drawer</Drawer.Trigger>
        <Drawer.Content>
          <p>Hidden Content</p>
        </Drawer.Content>
      </Drawer.Root>,
    );
    expect(screen.getByText("Open Drawer")).toBeInTheDocument();
  });

  it("renders close button", () => {
    render(
      <Drawer.Root defaultOpen>
        <Drawer.Content>
          <p>Content</p>
        </Drawer.Content>
      </Drawer.Root>,
    );
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });
});
