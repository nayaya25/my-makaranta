import { render, screen } from "@testing-library/react";
import { Badge } from "./badge";

describe("Badge", () => {
  it("renders children", () => {
    render(<Badge>Active</Badge>);
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("defaults to neutral tone", () => {
    render(<Badge>Neutral</Badge>);
    expect(screen.getByText("Neutral").className).toContain("bg-ink-100");
  });

  it("applies brand tone classes", () => {
    render(<Badge tone="brand">Brand</Badge>);
    expect(screen.getByText("Brand").className).toContain("bg-brand-50");
  });

  it("applies success tone classes", () => {
    render(<Badge tone="success">Success</Badge>);
    expect(screen.getByText("Success").className).toContain("text-success");
  });

  it("applies error tone classes", () => {
    render(<Badge tone="error">Error</Badge>);
    expect(screen.getByText("Error").className).toContain("text-error");
  });

  it("merges custom className", () => {
    render(<Badge className="ml-2">Tag</Badge>);
    expect(screen.getByText("Tag").className).toContain("ml-2");
  });
});
