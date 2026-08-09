"use client";

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
import { BarChart } from "@/modules/reports/components/bar-chart";
import { ChartFrame } from "@/modules/reports/components/chart-frame";
import { HarvestBars } from "@/modules/reports/components/harvest-bars";
import { ReportSection } from "@/modules/reports/components/report-section";
import {
  PresetButtons,
  ReportToolbar,
} from "@/modules/reports/components/report-toolbar";
import { SummaryStrip } from "@/modules/reports/components/summary-strip";

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

        <section className="review-section" aria-labelledby="reporting-heading">
          <h2 id="reporting-heading">Management reporting primitives</h2>
          <p className="review-intro">
            Synthetic-only examples of the reporting primitives (summary strip,
            report toolbar, chart frame, dependency-free bar chart, FarmUnit
            comparison). Not operational data.
          </p>
          <ReportSection
            description="Compact bordered statistic cells, not oversized metric cards."
            title="Summary strip"
          >
            <SummaryStrip
              groups={[
                {
                  title: "Attendance",
                  cells: [
                    { label: "Sessions", value: "3" },
                    { label: "Present", value: "41", context: "of 46 roster" },
                    { label: "Absent", value: "5" },
                    { label: "Roster", value: "46" },
                  ],
                },
                {
                  title: "Harvest",
                  cells: [
                    {
                      label: "Fruit count",
                      value: "12,450",
                      context: "2 records",
                    },
                    { label: "Kilograms", value: "840.5", context: "1 record" },
                  ],
                },
              ]}
            />
          </ReportSection>
          <ReportSection
            description="Filters stay inline; the active period is stated explicitly."
            title="Report toolbar"
          >
            <ReportToolbar
              actions={
                <Button variant="secondary">Export attendance CSV</Button>
              }
              periodLabel="Period 2026-08-01 – 2026-08-08 · inclusive, submitted sessions only"
            >
              <label className="filter-field">
                <span className="filter-field-label">From</span>
                <TextInput type="date" defaultValue="2026-08-01" />
              </label>
              <label className="filter-field">
                <span className="filter-field-label">To</span>
                <TextInput type="date" defaultValue="2026-08-08" />
              </label>
              <PresetButtons onSelect={() => undefined} />
            </ReportToolbar>
          </ReportSection>
          <ReportSection
            description="Stacked bars communicate roster composition; hatched Absent provides a non-color distinction."
            title="Attendance over time (synthetic)"
          >
            <ChartFrame
              description="Present and absent workers per operational date."
              legend={[
                { className: "bar-present", label: "Present" },
                { className: "bar-absent", label: "Absent" },
              ]}
              meta="Last 14 days"
              title="Attendance over time"
            >
              <BarChart
                data={[
                  {
                    label: "2026-08-05",
                    fullLabel: "2026-08-05",
                    values: { present: 30, absent: 4 },
                  },
                  {
                    label: "2026-08-06",
                    fullLabel: "2026-08-06",
                    values: { present: 34, absent: 2 },
                  },
                  {
                    label: "2026-08-07",
                    fullLabel: "2026-08-07",
                    values: { present: 41, absent: 5 },
                  },
                ]}
                description="Present and absent workers per operational date."
                formatValue={(value) =>
                  new Intl.NumberFormat("en-US").format(value)
                }
                series={[
                  {
                    className: "bar-present",
                    key: "present",
                    label: "Present",
                  },
                  { className: "bar-absent", key: "absent", label: "Absent" },
                ]}
                stacked
              />
            </ChartFrame>
          </ReportSection>
          <ReportSection
            description="One unit per chart; the empty frame explains what will appear."
            title="Harvest over time (synthetic)"
          >
            <ChartFrame
              actions={
                <label className="chart-select">
                  <span className="sr-only">Harvest unit</span>
                  <select
                    className="select-input select-input-compact"
                    defaultValue="fruit_count"
                  >
                    <option value="fruit_count">Fruit count</option>
                    <option value="kilograms">Kilograms</option>
                  </select>
                </label>
              }
              description="Submitted fruit count quantity per operational date."
              meta="Last 14 days · fruit"
              title="Harvest over time"
            >
              <BarChart
                data={[
                  {
                    label: "2026-08-05",
                    fullLabel: "2026-08-05",
                    values: { quantity: 4200 },
                  },
                  {
                    label: "2026-08-06",
                    fullLabel: "2026-08-06",
                    values: { quantity: 6100 },
                  },
                  {
                    label: "2026-08-07",
                    fullLabel: "2026-08-07",
                    values: { quantity: 12450 },
                  },
                ]}
                description="Submitted fruit count quantity per operational date."
                formatValue={(value) =>
                  new Intl.NumberFormat("en-US").format(value)
                }
                series={[
                  { className: "bar-harvest", key: "quantity", label: "fruit" },
                ]}
              />
            </ChartFrame>
            <ChartFrame
              description="Exact FarmUnit totals for one unit."
              empty
              emptyMessage="No submitted Harvest in the last 14 days. The trend appears here after records are submitted."
              meta="Last 14 days"
              title="Harvest over time · empty"
            />
          </ReportSection>
          <ReportSection
            description="Exact FarmUnit comparison, one unit per chart."
            title="Harvest by FarmUnit (synthetic)"
          >
            <HarvestBars
              comparison={[
                {
                  label: "BLOCK-1",
                  context: "2 records · Block One",
                  value: 12450,
                },
                {
                  label: "BLOCK-2",
                  context: "1 record · Block Two",
                  value: 6100,
                },
                {
                  label: "FIELD-2",
                  context: "1 record · Field Two",
                  value: 4200,
                },
              ]}
              unit="fruit_count"
            />
          </ReportSection>
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
