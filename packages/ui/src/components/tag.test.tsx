import { render, screen, fireEvent } from "@testing-library/react";
import { Tag } from "./tag";

describe("Tag", () => {
  it("renders label", () => {
    render(<Tag>Mathematics</Tag>);
    expect(screen.getByText("Mathematics")).toBeInTheDocument();
  });

  it("does not render remove button without onRemove", () => {
    render(<Tag>Science</Tag>);
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
  });

  it("renders remove button when onRemove is provided", () => {
    render(<Tag onRemove={() => {}}>English</Tag>);
    expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
  });

  it("calls onRemove when remove button is clicked", () => {
    const onRemove = vi.fn();
    render(<Tag onRemove={onRemove}>History</Tag>);
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("merges custom className", () => {
    render(<Tag className="mt-2">Extra</Tag>);
    expect(screen.getByText("Extra").className).toContain("mt-2");
  });
});
