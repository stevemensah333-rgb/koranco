import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkerRegister } from "./worker-register";

const session = vi.fn();
const listWorkers = vi.fn();
const saveWorker = vi.fn();
const setWorkerStatus = vi.fn();
vi.mock("@/lib/api/auth", () => ({ getCurrentSession: () => session() }));
vi.mock("@/modules/workers/api", () => ({
  listWorkers: (...a: unknown[]) => listWorkers(...a),
  saveWorker: (...a: unknown[]) => saveWorker(...a),
  setWorkerStatus: (...a: unknown[]) => setWorkerStatus(...a),
  workerAudit: vi.fn(),
}));
const manager = {
  permissions: [
    "workers.read",
    "workers.create",
    "workers.update",
    "workers.deactivate",
    "operational_audit.read",
  ],
};
const supervisor = { permissions: ["workers.read"] };
beforeEach(() => {
  vi.clearAllMocks();
  window.confirm = vi.fn(() => true);
  session.mockResolvedValue(manager);
  listWorkers.mockResolvedValue({ items: [], total: 0, limit: 50, offset: 0 });
});

describe("WorkerRegister", () => {
  it("shows loading then the empty register state", async () => {
    render(<WorkerRegister />);
    expect(
      screen.getByText("Checking worker-register access…"),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("No workers have been added to the register."),
    ).toBeInTheDocument();
  });
  it("shows a compact worker list and search-driven no-results state", async () => {
    listWorkers
      .mockResolvedValueOnce({
        items: [
          {
            id: "1",
            worker_code: "KOR-1",
            full_name: "Ama Mensah",
            status: "active",
          },
        ],
        total: 1,
      })
      .mockResolvedValue({ items: [], total: 0 });
    render(<WorkerRegister />);
    expect(
      await screen.findByRole("table", { name: "Worker register" }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("Code or name"), {
      target: { value: "missing" },
    });
    expect(
      await screen.findByText(
        "No workers match the current search and filter.",
      ),
    ).toBeInTheDocument();
    expect(listWorkers).toHaveBeenLastCalledWith("missing", "");
  });
  it("keeps Supervisor access read-only", async () => {
    session.mockResolvedValue(supervisor);
    listWorkers.mockResolvedValue({
      items: [
        {
          id: "1",
          worker_code: "KOR-1",
          full_name: "Ama Mensah",
          status: "active",
        },
      ],
      total: 1,
    });
    render(<WorkerRegister />);
    await screen.findByText("Ama Mensah");
    expect(
      screen.queryByRole("button", { name: "Add worker" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Edit" }),
    ).not.toBeInTheDocument();
  });
  it("validates create and confirms deactivation", async () => {
    listWorkers.mockResolvedValue({
      items: [
        {
          id: "1",
          worker_code: "KOR-1",
          full_name: "Ama Mensah",
          status: "active",
        },
      ],
      total: 1,
    });
    setWorkerStatus.mockResolvedValue({});
    render(<WorkerRegister />);
    await screen.findByText("Ama Mensah");
    fireEvent.click(screen.getByRole("button", { name: "Add worker" }));
    fireEvent.click(screen.getByRole("button", { name: "Save worker" }));
    expect(
      await screen.findByText("Worker code and full name are required."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));
    await waitFor(() => expect(window.confirm).toHaveBeenCalled());
    expect(setWorkerStatus).toHaveBeenCalled();
  });
});
