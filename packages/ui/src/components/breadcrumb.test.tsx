import { render, screen } from "@testing-library/react";
import { Breadcrumb } from "./breadcrumb";

const items = [
  { label: "Dashboard", href: "/" },
  { label: "Students", href: "/students" },
  { label: "Ibrahim Bashir" },
];

describe("Breadcrumb", () => {
  it("renders all item labels", () => {
    render(<Breadcrumb items={items} />);
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Students")).toBeInTheDocument();
    expect(screen.getByText("Ibrahim Bashir")).toBeInTheDocument();
  });

  it("applies aria-current=page to the last item", () => {
    render(<Breadcrumb items={items} />);
    expect(screen.getByText("Ibrahim Bashir")).toHaveAttribute("aria-current", "page");
  });

  it("does not apply aria-current to non-last items", () => {
    render(<Breadcrumb items={items} />);
    expect(screen.getByText("Dashboard")).not.toHaveAttribute("aria-current");
    expect(screen.getByText("Students")).not.toHaveAttribute("aria-current");
  });

  it("renders links for non-last items", () => {
    render(<Breadcrumb items={items} />);
    expect(screen.getByText("Dashboard").tagName).toBe("A");
    expect(screen.getByText("Students").tagName).toBe("A");
    expect(screen.getByText("Ibrahim Bashir").tagName).toBe("SPAN");
  });

  it("has accessible nav landmark", () => {
    render(<Breadcrumb items={items} />);
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBeInTheDocument();
  });
});
