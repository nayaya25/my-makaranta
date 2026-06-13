import { render, screen } from "@testing-library/react";
import { Select } from "./select";

describe("Select", () => {
  it("renders the trigger", () => {
    render(
      <Select.Root>
        <Select.Trigger>
          <Select.Value placeholder="Pick one" />
        </Select.Trigger>
        <Select.Content>
          <Select.Item value="a">Alpha</Select.Item>
          <Select.Item value="b">Beta</Select.Item>
        </Select.Content>
      </Select.Root>,
    );
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("shows the placeholder text when no value is selected", () => {
    render(
      <Select.Root>
        <Select.Trigger>
          <Select.Value placeholder="Pick one" />
        </Select.Trigger>
        <Select.Content>
          <Select.Item value="a">Alpha</Select.Item>
        </Select.Content>
      </Select.Root>,
    );
    expect(screen.getByText("Pick one")).toBeInTheDocument();
  });

  it("shows the selected value label when a controlled value is set", () => {
    render(
      <Select.Root value="a" onValueChange={() => {}}>
        <Select.Trigger>
          <Select.Value placeholder="Pick one" />
        </Select.Trigger>
        <Select.Content>
          <Select.Item value="a">Alpha</Select.Item>
          <Select.Item value="b">Beta</Select.Item>
        </Select.Content>
      </Select.Root>,
    );
    expect(screen.getByText("Alpha")).toBeInTheDocument();
  });
});
