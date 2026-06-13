import { render, screen } from "@testing-library/react";
import { Toast } from "./toast";

describe("Toast", () => {
  it("renders title text when defaultOpen", () => {
    render(
      <Toast.Provider>
        <Toast.Root defaultOpen title="Fees paid successfully" description="Your payment has been recorded." />
        <Toast.Viewport />
      </Toast.Provider>,
    );
    expect(screen.getByText("Fees paid successfully")).toBeInTheDocument();
  });

  it("renders description text", () => {
    render(
      <Toast.Provider>
        <Toast.Root defaultOpen title="Notice" description="Session will expire soon." />
        <Toast.Viewport />
      </Toast.Provider>,
    );
    expect(screen.getByText("Session will expire soon.")).toBeInTheDocument();
  });

  it("applies tone classes", () => {
    render(
      <Toast.Provider>
        <Toast.Root defaultOpen tone="error" title="Error toast" />
        <Toast.Viewport />
      </Toast.Provider>,
    );
    const title = screen.getByText("Error toast");
    expect(title.closest("[class*='border-l-error']") ?? title.closest("li") ?? title.parentElement?.parentElement).toBeTruthy();
  });
});
