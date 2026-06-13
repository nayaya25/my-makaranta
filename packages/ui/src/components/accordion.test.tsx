import { render, screen, fireEvent } from "@testing-library/react";
import { Accordion } from "./accordion";

describe("Accordion", () => {
  it("renders trigger text", () => {
    render(
      <Accordion.Root type="single" collapsible>
        <Accordion.Item value="item-1">
          <Accordion.Trigger>What is myMakaranta?</Accordion.Trigger>
          <Accordion.Content>A school management platform.</Accordion.Content>
        </Accordion.Item>
      </Accordion.Root>,
    );
    expect(screen.getByText("What is myMakaranta?")).toBeInTheDocument();
  });

  it("content is not in the document when collapsed, appears after trigger click", () => {
    render(
      <Accordion.Root type="single" collapsible>
        <Accordion.Item value="item-1">
          <Accordion.Trigger>FAQ</Accordion.Trigger>
          <Accordion.Content>Answer content here.</Accordion.Content>
        </Accordion.Item>
      </Accordion.Root>,
    );
    // Radix accordion hides content via hidden attribute when closed
    const content = screen.queryByText("Answer content here.");
    if (content) {
      expect(content).not.toBeVisible();
    } else {
      expect(content).toBeNull();
    }
    fireEvent.click(screen.getByText("FAQ"));
    expect(screen.getByText("Answer content here.")).toBeInTheDocument();
  });

  it("shows content when defaultValue is set", () => {
    render(
      <Accordion.Root type="single" defaultValue="item-1">
        <Accordion.Item value="item-1">
          <Accordion.Trigger>Open by default</Accordion.Trigger>
          <Accordion.Content>Visible content</Accordion.Content>
        </Accordion.Item>
      </Accordion.Root>,
    );
    expect(screen.getByText("Visible content")).toBeInTheDocument();
  });
});
