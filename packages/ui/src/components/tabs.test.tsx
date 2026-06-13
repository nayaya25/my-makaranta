import { render, screen } from "@testing-library/react";
import { Tabs } from "./tabs";

describe("Tabs", () => {
  it("shows default tab content", () => {
    render(
      <Tabs.Root defaultValue="tab1">
        <Tabs.List>
          <Tabs.Trigger value="tab1">Tab One</Tabs.Trigger>
          <Tabs.Trigger value="tab2">Tab Two</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="tab1">Content One</Tabs.Content>
        <Tabs.Content value="tab2">Content Two</Tabs.Content>
      </Tabs.Root>,
    );
    expect(screen.getByText("Content One")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Tab One" })).toHaveAttribute("data-state", "active");
  });

  it("inactive trigger has data-state=inactive", () => {
    render(
      <Tabs.Root defaultValue="tab1">
        <Tabs.List>
          <Tabs.Trigger value="tab1">Tab One</Tabs.Trigger>
          <Tabs.Trigger value="tab2">Tab Two</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="tab1">Content One</Tabs.Content>
        <Tabs.Content value="tab2">Content Two</Tabs.Content>
      </Tabs.Root>,
    );
    expect(screen.getByRole("tab", { name: "Tab Two" })).toHaveAttribute("data-state", "inactive");
  });

  it("switching value shows the correct tab content", () => {
    const { rerender } = render(
      <Tabs.Root value="tab1" onValueChange={() => {}}>
        <Tabs.List>
          <Tabs.Trigger value="tab1">Tab One</Tabs.Trigger>
          <Tabs.Trigger value="tab2">Tab Two</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="tab1">Content One</Tabs.Content>
        <Tabs.Content value="tab2">Content Two</Tabs.Content>
      </Tabs.Root>,
    );
    expect(screen.getByRole("tab", { name: "Tab One" })).toHaveAttribute("data-state", "active");

    rerender(
      <Tabs.Root value="tab2" onValueChange={() => {}}>
        <Tabs.List>
          <Tabs.Trigger value="tab1">Tab One</Tabs.Trigger>
          <Tabs.Trigger value="tab2">Tab Two</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="tab1">Content One</Tabs.Content>
        <Tabs.Content value="tab2">Content Two</Tabs.Content>
      </Tabs.Root>,
    );
    expect(screen.getByRole("tab", { name: "Tab Two" })).toHaveAttribute("data-state", "active");
    expect(screen.getByText("Content Two")).toBeInTheDocument();
  });

  it("renders a tablist with two tabs", () => {
    render(
      <Tabs.Root defaultValue="tab1">
        <Tabs.List>
          <Tabs.Trigger value="tab1">Tab One</Tabs.Trigger>
          <Tabs.Trigger value="tab2">Tab Two</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="tab1">Content One</Tabs.Content>
        <Tabs.Content value="tab2">Content Two</Tabs.Content>
      </Tabs.Root>,
    );
    expect(screen.getByRole("tablist")).toBeInTheDocument();
    expect(screen.getAllByRole("tab")).toHaveLength(2);
  });
});
