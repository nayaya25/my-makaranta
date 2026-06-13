import { render, screen, fireEvent } from "@testing-library/react";
import { RadioGroup, RadioGroupItem } from "./radio";

describe("RadioGroup", () => {
  function setup() {
    render(
      <RadioGroup>
        <RadioGroupItem value="a" aria-label="Option A" />
        <RadioGroupItem value="b" aria-label="Option B" />
      </RadioGroup>,
    );
  }

  it("renders a radiogroup", () => {
    setup();
    expect(screen.getByRole("radiogroup")).toBeInTheDocument();
  });

  it("renders radio items", () => {
    setup();
    expect(screen.getAllByRole("radio")).toHaveLength(2);
  });

  it("selecting an item sets it to checked", () => {
    setup();
    const optA = screen.getAllByRole("radio")[0]!;
    fireEvent.click(optA);
    expect(optA).toHaveAttribute("data-state", "checked");
  });
});
