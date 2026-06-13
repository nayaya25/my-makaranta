import { render, screen, fireEvent } from "@testing-library/react";
import { Checkbox } from "./checkbox";

describe("Checkbox", () => {
  it("renders a checkbox", () => {
    render(<Checkbox aria-label="Accept terms" />);
    expect(screen.getByRole("checkbox")).toBeInTheDocument();
  });

  it("is unchecked by default", () => {
    render(<Checkbox aria-label="Accept terms" />);
    expect(screen.getByRole("checkbox")).toHaveAttribute("data-state", "unchecked");
  });

  it("toggles checked on click", () => {
    render(<Checkbox aria-label="Accept terms" />);
    const cb = screen.getByRole("checkbox");
    fireEvent.click(cb);
    expect(cb).toHaveAttribute("data-state", "checked");
  });
});
