import { render, screen, fireEvent } from "@testing-library/react";
import { ErrorState } from "./error-state";

describe("ErrorState", () => {
  it("renders default title", () => {
    render(<ErrorState />);
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("renders custom title", () => {
    render(<ErrorState title="Failed to load students" />);
    expect(screen.getByText("Failed to load students")).toBeInTheDocument();
  });

  it("renders description when provided", () => {
    render(<ErrorState description="Please check your connection." />);
    expect(screen.getByText("Please check your connection.")).toBeInTheDocument();
  });

  it("does not render Try again button when onRetry is not provided", () => {
    render(<ErrorState />);
    expect(screen.queryByText("Try again")).not.toBeInTheDocument();
  });

  it("renders Try again button and calls onRetry when clicked", () => {
    const onRetry = vi.fn();
    render(<ErrorState onRetry={onRetry} />);
    const btn = screen.getByText("Try again");
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
