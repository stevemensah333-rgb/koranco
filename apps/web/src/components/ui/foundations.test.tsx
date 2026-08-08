import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FieldShell } from "@/components/shells/field-shell";
import { ManagementShell } from "@/components/shells/management-shell";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField, fieldDescriptionIds } from "@/components/ui/form-field";
import { TextInput } from "@/components/ui/inputs";

describe("foundational controls", () => {
  it("prevents disabled button actions", () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Unavailable action
      </Button>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Unavailable action" }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("associates a visible label, guidance, and error with an invalid field", () => {
    const describedBy = fieldDescriptionIds("reference", {
      description: true,
      error: true,
    });
    render(
      <FormField
        description="Use a synthetic reference."
        error="A reference is required."
        htmlFor="reference"
        label="Reference"
      >
        <TextInput aria-describedby={describedBy} id="reference" invalid />
      </FormField>,
    );

    const field = screen.getByRole("textbox", { name: /Reference/ });
    expect(field).toBeInvalid();
    expect(field).toHaveAccessibleDescription(
      "Use a synthetic reference. A reference is required.",
    );
  });
});

describe("application shells", () => {
  it("provides keyboard-reachable management navigation and a skip link", () => {
    render(
      <ManagementShell
        navigation={[
          { current: true, href: "/", label: "Current area" },
          { href: "/related", label: "Related area" },
        ]}
      >
        <h1>Management content</h1>
      </ManagementShell>,
    );

    expect(
      screen.getByRole("link", { name: "Skip to main content" }),
    ).toHaveAttribute("href", "#main-content");
    for (const link of screen.getAllByRole("link", { name: "Related area" })) {
      expect(link).toHaveAttribute("href", "/related");
      expect(link.tabIndex).toBe(0);
    }
  });

  it("renders management landmarks: header, primary nav, sidebar, and main", () => {
    render(
      <ManagementShell
        navigation={[
          { current: true, href: "/", label: "Current area" },
          { href: "/related", label: "Related area" },
        ]}
      >
        <h1>Management content</h1>
      </ManagementShell>,
    );

    expect(screen.getByRole("banner")).toBeInTheDocument();
    for (const nav of screen.getAllByRole("navigation", {
      name: "Primary navigation",
    })) {
      expect(nav).toBeInTheDocument();
    }
    expect(screen.getByRole("complementary")).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveTextContent("Management content");
  });

  it("renders field context, status location, content, and primary action", () => {
    render(
      <FieldShell
        actions={<Button>Continue</Button>}
        context="Synthetic field context"
        status={<span>Status location</span>}
      >
        <h1>Field task</h1>
      </FieldShell>,
    );

    expect(screen.getByText("Synthetic field context")).toBeInTheDocument();
    expect(screen.getByText("Status location")).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveTextContent("Field task");
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
  });
});

describe("state patterns", () => {
  it("exposes error messages as alerts", () => {
    render(
      <Alert title="Service unavailable" tone="error">
        Try again when the connection is restored.
      </Alert>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Service unavailable");
  });

  it("gives an empty state an accessible heading", () => {
    render(
      <EmptyState
        description="No synthetic examples are available."
        heading="No examples"
      />,
    );

    expect(
      screen.getByRole("region", { name: "No examples" }),
    ).toBeInTheDocument();
  });
});
