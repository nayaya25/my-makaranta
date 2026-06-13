import { render, screen } from "@testing-library/react";
import { Inbox } from "lucide-react";
import { EmptyState } from "./empty-state";

describe("EmptyState", () => {
  it("renders the title", () => {
    render(<EmptyState title="No students found" />);
    expect(screen.getByText("No students found")).toBeInTheDocument();
  });

  it("renders the description when provided", () => {
    render(<EmptyState title="No data" description="Add your first record to get started." />);
    expect(screen.getByText("Add your first record to get started.")).toBeInTheDocument();
  });

  it("does not render description element when omitted", () => {
    render(<EmptyState title="Empty" />);
    expect(screen.queryByText("Add your first record")).not.toBeInTheDocument();
  });

  it("renders the action when provided", () => {
    render(
      <EmptyState
        title="No students"
        action={<button>Add student</button>}
      />,
    );
    expect(screen.getByText("Add student")).toBeInTheDocument();
  });

  it("renders the icon when provided", () => {
    render(
      <EmptyState
        title="No messages"
        icon={<Inbox data-testid="inbox-icon" />}
      />,
    );
    expect(screen.getByTestId("inbox-icon")).toBeInTheDocument();
  });
});
