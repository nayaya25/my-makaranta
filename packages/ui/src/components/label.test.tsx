import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { Label } from "./label";

describe("Label", () => {
  it("renders its text", () => {
    render(<Label>Full name</Label>);
    expect(screen.getByText("Full name")).toBeInTheDocument();
  });

  it("shows asterisk when required", () => {
    render(<Label required>Email</Label>);
    expect(document.querySelector("span.text-error")).toBeInTheDocument();
  });

  it("does not show asterisk when not required", () => {
    render(<Label>Email</Label>);
    expect(document.querySelector("span.text-error")).not.toBeInTheDocument();
  });

  it("passes htmlFor through to the label element", () => {
    render(<Label htmlFor="input-id">Name</Label>);
    expect(screen.getByText("Name").closest("label")).toHaveAttribute("for", "input-id");
  });

  it("forwards ref to the label element", () => {
    const ref = createRef<HTMLLabelElement>();
    render(<Label ref={ref}>Test</Label>);
    expect(ref.current).toBeInstanceOf(HTMLLabelElement);
  });
});
