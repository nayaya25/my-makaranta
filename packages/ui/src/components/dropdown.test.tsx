import { render, screen } from "@testing-library/react";
import { Dropdown } from "./dropdown";

describe("Dropdown", () => {
  it("renders trigger button", () => {
    render(
      <Dropdown.Root>
        <Dropdown.Trigger>Open menu</Dropdown.Trigger>
        <Dropdown.Content>
          <Dropdown.Item>Profile</Dropdown.Item>
        </Dropdown.Content>
      </Dropdown.Root>,
    );
    expect(screen.getByText("Open menu")).toBeInTheDocument();
  });

  it("shows items when open", () => {
    render(
      <Dropdown.Root open>
        <Dropdown.Trigger>Open menu</Dropdown.Trigger>
        <Dropdown.Content>
          <Dropdown.Item>Profile</Dropdown.Item>
          <Dropdown.Item>Settings</Dropdown.Item>
        </Dropdown.Content>
      </Dropdown.Root>,
    );
    expect(screen.getByText("Profile")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("renders separator and label when open", () => {
    render(
      <Dropdown.Root open>
        <Dropdown.Trigger>Menu</Dropdown.Trigger>
        <Dropdown.Content>
          <Dropdown.Label>Actions</Dropdown.Label>
          <Dropdown.Item>Edit</Dropdown.Item>
          <Dropdown.Separator />
          <Dropdown.Item>Delete</Dropdown.Item>
        </Dropdown.Content>
      </Dropdown.Root>,
    );
    expect(screen.getByText("Actions")).toBeInTheDocument();
    expect(screen.getByText("Edit")).toBeInTheDocument();
  });
});
