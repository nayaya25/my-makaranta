import { render, screen, act } from "@testing-library/react";
import { Avatar } from "./avatar";

describe("Avatar", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders fallback initials from a two-word name", async () => {
    render(<Avatar name="Tunde Okafor" />);
    await act(() => vi.runAllTimers());
    expect(screen.getByText("TO")).toBeInTheDocument();
  });

  it("renders single initial from a one-word name", async () => {
    render(<Avatar name="Amaka" />);
    await act(() => vi.runAllTimers());
    expect(screen.getByText("A")).toBeInTheDocument();
  });

  it("applies sm size classes", () => {
    const { container } = render(<Avatar name="Test User" size="sm" />);
    expect(container.firstChild).toHaveClass("h-8", "w-8");
  });

  it("applies md size classes by default", () => {
    const { container } = render(<Avatar name="Test User" />);
    expect(container.firstChild).toHaveClass("h-10", "w-10");
  });

  it("applies lg size classes", () => {
    const { container } = render(<Avatar name="Test User" size="lg" />);
    expect(container.firstChild).toHaveClass("h-12", "w-12");
  });

  it("merges custom className", () => {
    const { container } = render(<Avatar name="Test User" className="border" />);
    expect(container.firstChild).toHaveClass("border");
  });
});
