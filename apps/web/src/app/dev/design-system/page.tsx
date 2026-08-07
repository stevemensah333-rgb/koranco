import { notFound } from "next/navigation";

import { FieldShell } from "@/components/shells/field-shell";
import { ManagementShell } from "@/components/shells/management-shell";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DataTable, type TableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { fieldDescriptionIds, FormField } from "@/components/ui/form-field";
import { SelectInput, TextArea, TextInput } from "@/components/ui/inputs";
import { LoadingIndicator } from "@/components/ui/loading-indicator";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";

type ExampleRow = {
  id: string;
  label: string;
  quantity: string;
  state: string;
};

const exampleRows: ExampleRow[] = [
  {
    id: "sample-a",
    label: "Synthetic record A",
    quantity: "1,240",
    state: "Review",
  },
  {
    id: "sample-b",
    label: "Synthetic record B",
    quantity: "85",
    state: "Complete",
  },
];

const columns: TableColumn<ExampleRow>[] = [
  { header: "Example", key: "label", render: (row) => row.label },
  {
    align: "numeric",
    header: "Quantity",
    key: "quantity",
    render: (row) => row.quantity,
  },
  {
    header: "State",
    key: "state",
    render: (row) => (
      <StatusBadge tone={row.state === "Complete" ? "success" : "warning"}>
        {row.state}
      </StatusBadge>
    ),
  },
];

const navigation = [
  { current: true, href: "#management-preview", label: "Current area" },
  { href: "#components", label: "Related area" },
];

export default function DesignSystemPage() {
  if (process.env.NODE_ENV !== "development") notFound();

  const exampleDescription = fieldDescriptionIds("example-reference", {
    description: true,
    error: true,
  });

  return (
    <div className="design-review">
      <div className="design-review-inner">
        <header className="review-intro">
          <h1>Design-system review</h1>
          <p>
            Development-only synthetic examples for reviewing Koranco&apos;s
            visual language. This is not operational farm data or a product
            workflow.
          </p>
        </header>

        <section className="review-section" aria-labelledby="type-heading">
          <h2 id="type-heading">Typography and status</h2>
          <div className="review-grid">
            <div className="review-surface stack">
              <p className="type-sample-large">Clear operational hierarchy</p>
              <p className="type-sample-body">
                Compact body text remains readable for forms, records, and
                supporting guidance.
              </p>
              <p className="numeric">Tabular numerals: 08:45 · 1,240 · 27.50</p>
            </div>
            <div className="review-surface">
              <h3>Status language</h3>
              <div className="cluster">
                <StatusBadge tone="success">Synced</StatusBadge>
                <StatusBadge tone="warning">Requires attention</StatusBadge>
                <StatusBadge tone="error">Failed</StatusBadge>
                <StatusBadge tone="info">Saved locally</StatusBadge>
                <StatusBadge pending>Waiting to sync</StatusBadge>
              </div>
            </div>
          </div>
        </section>

        <section
          className="review-section"
          id="components"
          aria-labelledby="components-heading"
        >
          <h2 id="components-heading">Controls and forms</h2>
          <div className="review-grid">
            <div className="review-surface stack">
              <h3>Buttons</h3>
              <div className="cluster">
                <Button>Primary action</Button>
                <Button variant="secondary">Secondary action</Button>
                <Button variant="danger">Destructive action</Button>
                <Button disabled>Unavailable</Button>
              </div>
            </div>
            <div className="review-surface stack">
              <h3>Form structure</h3>
              <FormField
                description="Synthetic reference used only to review field guidance."
                error="Enter a reference before continuing."
                htmlFor="example-reference"
                label="Example reference"
              >
                <TextInput
                  aria-describedby={exampleDescription}
                  id="example-reference"
                  invalid
                  placeholder="Example: REF-001"
                />
              </FormField>
              <FormField
                htmlFor="example-option"
                label="Example option"
                optional
              >
                <SelectInput id="example-option">
                  <option value="">Select an option</option>
                  <option>First synthetic option</option>
                </SelectInput>
              </FormField>
              <FormField htmlFor="example-notes" label="Notes" optional>
                <TextArea
                  id="example-notes"
                  readOnly
                  value="Read-only example content"
                />
              </FormField>
              <label className="checkbox-field">
                <input type="checkbox" />
                <span>Confirm this synthetic example</span>
              </label>
            </div>
          </div>
        </section>

        <section className="review-section" aria-labelledby="messages-heading">
          <h2 id="messages-heading">Messages and states</h2>
          <div className="review-grid">
            <div className="stack">
              <Alert title="Information" tone="info">
                Explanatory information belongs close to the affected work.
              </Alert>
              <Alert title="Action required" tone="warning">
                State the issue and the next action in plain language.
              </Alert>
              <Alert title="Service unavailable" tone="error">
                Work could not be sent. Preserve input and offer a safe retry
                later.
              </Alert>
              <Alert title="Saved" tone="success">
                Confirmation describes exactly what succeeded.
              </Alert>
            </div>
            <div className="review-surface stack">
              <LoadingIndicator label="Loading example records…" />
              <EmptyState
                action={
                  <Button variant="secondary">Available next action</Button>
                }
                description="Explain why this area is empty and what the user can do next."
                heading="No example records"
              />
            </div>
          </div>
        </section>

        <section className="review-section" aria-labelledby="table-heading">
          <h2 id="table-heading">Table foundation</h2>
          <DataTable
            caption="Synthetic records for visual review"
            columns={columns}
            getRowKey={(row) => row.id}
            rows={exampleRows}
          />
        </section>

        <section
          className="review-section"
          id="management-preview"
          aria-labelledby="management-heading"
        >
          <h2 id="management-heading">Management shell</h2>
          <div className="review-surface">
            <ManagementShell
              navigation={navigation}
              preview
              utility={<StatusBadge>Review mode</StatusBadge>}
            >
              <PageHeader
                actions={<Button>Contextual action</Button>}
                description="A compact heading area leaves room for records, filters, and operational detail."
                title="Example management area"
              />
              <section
                className="content-section"
                aria-label="Management preview content"
              >
                <DataTable
                  caption="Management density example"
                  columns={columns}
                  getRowKey={(row) => row.id}
                  rows={exampleRows}
                />
              </section>
            </ManagementShell>
          </div>
        </section>

        <section className="review-section" aria-labelledby="field-heading">
          <h2 id="field-heading">Field shell</h2>
          <div className="field-preview-boundary">
            <FieldShell
              actions={<Button fullWidth>Primary field action</Button>}
              context="Example field task · no operational data"
              preview
              status={<StatusBadge pending>Status location</StatusBadge>}
            >
              <PageHeader
                description="Phone-first content uses strong labels, short paths, and a stable action region."
                title="Example field task"
              />
              <div className="content-section stack">
                <FormField htmlFor="field-example" label="Example input">
                  <TextInput id="field-example" inputMode="numeric" />
                </FormField>
              </div>
            </FieldShell>
          </div>
        </section>
      </div>
    </div>
  );
}
