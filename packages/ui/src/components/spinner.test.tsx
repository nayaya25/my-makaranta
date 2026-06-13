import { render, screen } from "@testing-library/react";
import { Spinner } from "./spinner";

describe("Spinner", () => {
  it("renders with role status", () => {
    render(<Spinner />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("has animate-spin class", () => {
    render(<Spinner />);
    expect(screen.getByRole("status")).toHaveClass("animate-spin");
  });

  it("uses default aria-label Loading", () => {
    render(<Spinner />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-label", "Loading");
  });

  it("accepts a custom aria-label", () => {
    render(<Spinner aria-label="Saving changes" />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-label", "Saving changes");
  });

  it("applies sm size classes", () => {
    render(<Spinner size="sm" />);
    expect(screen.getByRole("status")).toHaveClass("h-4", "w-4");
  });

  it("applies md size classes by default", () => {
    render(<Spinner />);
    expect(screen.getByRole("status")).toHaveClass("h-5", "w-5");
  });

  it("applies lg size classes", () => {
    render(<Spinner size="lg" />);
    expect(screen.getByRole("status")).toHaveClass("h-6", "w-6");
  });
});
