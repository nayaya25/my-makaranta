import { render, screen } from "@testing-library/react";
import { Field } from "./field";

describe("Field", () => {
  it("renders label and children", () => {
    render(
      <Field label="Email" htmlFor="email">
        <input id="email" />
      </Field>,
    );
    expect(screen.getByText("Email")).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("associates label with control via htmlFor", () => {
    render(
      <Field label="Username" htmlFor="username">
        <input id="username" />
      </Field>,
    );
    const label = screen.getByText("Username").closest("label");
    expect(label).toHaveAttribute("for", "username");
  });

  it("shows error with role alert", () => {
    render(
      <Field label="Email" error="Email is required">
        <input />
      </Field>,
    );
    const alert = screen.getByRole("alert");
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent("Email is required");
  });

  it("shows hint when no error", () => {
    render(
      <Field label="Password" hint="At least 8 characters">
        <input type="password" />
      </Field>,
    );
    expect(screen.getByText("At least 8 characters")).toBeInTheDocument();
  });

  it("hides hint when error is present", () => {
    render(
      <Field hint="At least 8 characters" error="Too short">
        <input type="password" />
      </Field>,
    );
    expect(screen.queryByText("At least 8 characters")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Too short");
  });

  it("renders required asterisk on label", () => {
    render(
      <Field label="Name" required>
        <input />
      </Field>,
    );
    expect(document.querySelector("span.text-error")).toBeInTheDocument();
  });

  it("renders children without a label", () => {
    render(
      <Field>
        <input aria-label="standalone" />
      </Field>,
    );
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });
});
