import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import { HarvestList } from "./harvest-list";
import { HarvestWorkspace } from "./harvest-workspace";

const replace = vi.fn();
const router = { replace };
const session = vi.fn();
const list = vi.fn();
const farmUnits = vi.fn();
const get = vi.fn();
const create = vi.fn();
const update = vi.fn();
const submit = vi.fn();
const correct = vi.fn();
const audit = vi.fn();
const sync = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/api/auth", () => ({ getCurrentSession: () => session() }));
vi.mock("@/modules/farm-structure/api", () => ({
  listFarmUnits: (...args: unknown[]) => farmUnits(...args),
  activeFarmUnitsForOffline: async () => (await farmUnits()).items,
}));
vi.mock("@/modules/harvest/api", () => ({
  listHarvest: (...args: unknown[]) => list(...args),
  getHarvest: (...args: unknown[]) => get(...args),
  createHarvest: (...args: unknown[]) => create(...args),
  updateHarvest: (...args: unknown[]) => update(...args),
  submitHarvest: (...args: unknown[]) => submit(...args),
  correctHarvest: (...args: unknown[]) => correct(...args),
  harvestAudit: (...args: unknown[]) => audit(...args),
}));
vi.mock("@/modules/harvest/offline/sync", () => ({
  syncHarvest: (...args: unknown[]) => sync(...args),
}));

const user = {
  id: "u1",
  display_name: "Supervisor",
  login_identifier: "supervisor",
  role: "supervisor",
  password_change_required: false,
  permissions: ["harvest.read", "harvest.record", "harvest.correct"],
};
const farmUnit = {
  id: "f1",
  code: "BLK-1",
  name: "North Block",
  unit_type: "block",
  parent_id: null,
  status: "active",
  created_at: "",
  updated_at: "",
};
const draft = {
  id: "h1",
  harvest_date: "2026-08-07",
  farm_unit_id: "f1",
  farm_unit_code: "BLK-1",
  farm_unit_name: "North Block",
  farm_unit_type: "block",
  farm_unit_active: true,
  quantity: "25.000",
  unit: "fruit_count",
  notes: null,
  status: "draft",
  version: 1,
  created_by: "u1",
  created_by_name: "Supervisor",
  created_at: "2026-08-07T08:00:00Z",
  updated_at: "2026-08-07T08:00:00Z",
  submitted_by: null,
  submitted_by_name: null,
  submitted_at: null,
};
const submitted = {
  ...draft,
  status: "submitted",
  version: 2,
  submitted_by: "u1",
  submitted_by_name: "Supervisor",
  submitted_at: "2026-08-07T08:05:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  window.confirm = vi.fn(() => true);
  session.mockResolvedValue(user);
  list.mockResolvedValue({
    items: [submitted],
    total: 1,
    limit: 50,
    offset: 0,
  });
  farmUnits.mockResolvedValue({ items: [farmUnit], total: 1 });
  get.mockResolvedValue(submitted);
  create.mockResolvedValue(draft);
  update.mockResolvedValue({ ...draft, version: 2 });
  submit.mockResolvedValue(submitted);
  sync.mockResolvedValue("synced");
  correct.mockResolvedValue({ ...submitted, quantity: "30.000", version: 3 });
  audit.mockResolvedValue({ items: [], total: 0 });
});

it("renders the compact harvest list and filters", async () => {
  render(<HarvestList />);
  expect(
    await screen.findByRole("table", { name: "Harvest records" }),
  ).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Unit"), {
    target: { value: "kilograms" },
  });
  await waitFor(() =>
    expect(list).toHaveBeenLastCalledWith(
      expect.objectContaining({ unit: "kilograms" }),
    ),
  );
  expect(screen.getByRole("link", { name: "Record harvest" })).toHaveAttribute(
    "href",
    "/harvest/new",
  );
});

it("denies a Worker-role session without showing harvest content", async () => {
  session.mockResolvedValue({ ...user, role: "worker", permissions: [] });
  render(<HarvestList />);
  expect(
    await screen.findByText("You do not have permission to access Harvest."),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("table", { name: "Harvest records" }),
  ).not.toBeInTheDocument();
});

describe("field harvest capture", () => {
  it("searches and selects FarmUnit, validates count, reviews, and submits", async () => {
    render(<HarvestWorkspace id="new" />);
    const option = await screen.findByRole("button", { name: /BLK-1/ });
    fireEvent.click(option);
    fireEvent.change(screen.getByLabelText("Quantity"), {
      target: { value: "1.5" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    expect(
      await screen.findByText("Fruit count must be a whole number."),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Quantity"), {
      target: { value: "25" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    expect(
      screen.getByRole("heading", { name: "Review before submission" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Submit harvest" }));
    await waitFor(() => expect(sync).toHaveBeenCalledWith(user.id));
    expect(
      await screen.findByText("Harvest submitted and confirmed by the server."),
    ).toBeInTheDocument();
  });

  it("preserves entered values after a server submission error", async () => {
    sync.mockRejectedValue(
      new ApiError("The selected FarmUnit is inactive", 409),
    );
    render(<HarvestWorkspace id="new" />);
    fireEvent.click(await screen.findByRole("button", { name: /BLK-1/ }));
    fireEvent.change(screen.getByLabelText("Quantity"), {
      target: { value: "18" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit harvest" }));
    expect(
      await screen.findByText("The selected FarmUnit is inactive"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === "DD" &&
          element.textContent?.trim() === "18 fruit",
      ),
    ).toBeInTheDocument();
  });

  it("shows submitted detail and performs a reasoned correction", async () => {
    get.mockResolvedValue(submitted);
    audit.mockResolvedValue({
      items: [
        {
          id: "a1",
          action: "submitted",
          actor_user_id: "u1",
          actor_display_name: "Supervisor",
          before_state: null,
          after_state: {},
          reason: null,
          occurred_at: "2026-08-07T08:05:00Z",
        },
      ],
      total: 1,
    });
    render(<HarvestWorkspace id="h1" />);
    expect(
      await screen.findByRole("heading", { name: "Submitted harvest" }),
    ).toBeInTheDocument();
    expect(await screen.findByText(/Supervisor/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Correct record" }));
    fireEvent.change(screen.getByLabelText("Quantity"), {
      target: { value: "30" },
    });
    fireEvent.change(screen.getByLabelText("Correction reason"), {
      target: { value: "Corrected source form" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm correction" }));
    await waitFor(() =>
      expect(correct).toHaveBeenCalledWith(
        expect.objectContaining({ id: "h1" }),
        expect.objectContaining({ quantity: "30" }),
        "Corrected source form",
      ),
    );
    expect(window.confirm).toHaveBeenCalled();
  });
});
