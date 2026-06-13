import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { Textarea } from "./textarea";

describe("Textarea", () => {
  it("renders a textarea element", () => {
    render(<Textarea />);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("accepts a value and placeholder", () => {
    render(<Textarea defaultValue="hello" placeholder="Enter text" />);
    const el = screen.getByRole("textbox");
    expect(el).toHaveValue("hello");
    expect(el).toHaveAttribute("placeholder", "Enter text");
  });

  it("applies error border when invalid", () => {
    render(<Textarea invalid />);
    expect(screen.getByRole("textbox").className).toContain("border-error");
  });

  it("does not apply error border when not invalid", () => {
    render(<Textarea />);
    expect(screen.getByRole("textbox").className).not.toContain("border-error");
    expect(screen.getByRole("textbox").className).toContain("border-ink-300");
  });

  it("merges custom className", () => {
    render(<Textarea className="w-48" />);
    expect(screen.getByRole("textbox").className).toContain("w-48");
  });

  it("forwards ref to the textarea element", () => {
    const ref = createRef<HTMLTextAreaElement>();
    render(<Textarea ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLTextAreaElement);
  });
});
