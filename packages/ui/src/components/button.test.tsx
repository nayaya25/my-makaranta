import { render, screen } from "@testing-library/react";
import { Button } from "./button";

describe("Button", () => {
  it("renders its children", () => {
    render(<Button>Pay fees</Button>);
    expect(screen.getByRole("button", { name: "Pay fees" })).toBeInTheDocument();
  });

  it("defaults to the primary variant and md size", () => {
    render(<Button>Go</Button>);
    const el = screen.getByRole("button");
    expect(el.className).toContain("bg-brand-500");
    expect(el.className).toContain("h-11");
  });

  it("applies the destructive variant", () => {
    render(<Button variant="destructive">Delete</Button>);
    expect(screen.getByRole("button").className).toContain("bg-error");
  });

  it("merges custom classes without dropping base classes", () => {
    render(<Button className="w-full">Wide</Button>);
    const el = screen.getByRole("button");
    expect(el.className).toContain("w-full");
    expect(el.className).toContain("rounded-button");
  });

  it("defaults type to button", () => {
    render(<Button>Safe</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("type", "button");
  });
});
