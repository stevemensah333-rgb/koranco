import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FarmStructureRegister } from "./farm-structure-register";

const session = vi.fn();
const listFarmUnits = vi.fn();
vi.mock("@/lib/api/auth", () => ({ getCurrentSession: () => session() }));
vi.mock("@/modules/farm-structure/api", () => ({
  listFarmUnits: (...a: unknown[]) => listFarmUnits(...a),
  saveFarmUnit: vi.fn(),
  setFarmUnitStatus: vi.fn(),
  farmUnitAudit: vi.fn(),
}));
vi.mock("@/modules/workers/api", () => ({
  listWorkers: vi.fn(),
  saveWorker: vi.fn(),
  setWorkerStatus: vi.fn(),
  workerAudit: vi.fn(),
}));
beforeEach(() => {
  vi.clearAllMocks();
  session.mockResolvedValue({
    permissions: [
      "farm_structure.read",
      "farm_structure.create",
      "operational_audit.read",
    ],
  });
  listFarmUnits.mockResolvedValue({ items: [], total: 0 });
});

describe("FarmStructureRegister", () => {
  it("renders empty and filtered no-results states", async () => {
    render(<FarmStructureRegister />);
    expect(
      await screen.findByText("No farm units have been added."),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("Code or name"), {
      target: { value: "west" },
    });
    expect(
      await screen.findByText(
        "No farm units match the current search and filters.",
      ),
    ).toBeInTheDocument();
  });
  it("shows field/block hierarchy and parent selection", async () => {
    listFarmUnits.mockResolvedValue({
      items: [
        {
          id: "f",
          code: "F-1",
          name: "North Field",
          unit_type: "field",
          parent_id: null,
          status: "active",
        },
        {
          id: "b",
          code: "B-1",
          name: "North Block",
          unit_type: "block",
          parent_id: "f",
          status: "active",
        },
      ],
      total: 2,
    });
    render(<FarmStructureRegister />);
    expect(
      await screen.findByRole("table", { name: "Farm structure register" }),
    ).toBeInTheDocument();
    expect(screen.getByText("↳ North Block")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add farm unit" }));
    expect(
      screen.getByRole("option", { name: "F-1 — North Field" }),
    ).toBeInTheDocument();
  });
  it("is read-only for Supervisor", async () => {
    session.mockResolvedValue({ permissions: ["farm_structure.read"] });
    render(<FarmStructureRegister />);
    await screen.findByText("No farm units have been added.");
    expect(
      screen.queryByRole("button", { name: "Add farm unit" }),
    ).not.toBeInTheDocument();
  });
});
