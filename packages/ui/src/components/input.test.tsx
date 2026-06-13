import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { Input } from "./input";

describe("Input", () => {
  it("renders an input element", () => {
    render(<Input />);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("accepts a value and placeholder", () => {
    render(<Input defaultValue="hello" placeholder="Enter text" />);
    const el = screen.getByRole("textbox");
    expect(el).toHaveValue("hello");
    expect(el).toHaveAttribute("placeholder", "Enter text");
  });

  it("applies error border when invalid", () => {
    render(<Input invalid />);
    expect(screen.getByRole("textbox").className).toContain("border-error");
  });

  it("does not apply error border when not invalid", () => {
    render(<Input />);
    expect(screen.getByRole("textbox").className).not.toContain("border-error");
    expect(screen.getByRole("textbox").className).toContain("border-ink-300");
  });

  it("merges custom className", () => {
    render(<Input className="w-48" />);
    expect(screen.getByRole("textbox").className).toContain("w-48");
  });

  it("forwards ref to the input element", () => {
    const ref = createRef<HTMLInputElement>();
    render(<Input ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
  });
});
