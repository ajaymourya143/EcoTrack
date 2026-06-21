import { vi, describe, it, expect, beforeEach } from "vitest";
import { BillRepository } from "../lib/repositories/billRepository";
import { ActionRepository } from "../lib/repositories/actionRepository";
import { prisma } from "../lib/prisma";

// Mock the prisma client singleton
vi.mock("../lib/prisma", () => ({
  prisma: {
    bill: {
      findMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    action: {
      count: vi.fn(),
      createMany: vi.fn(),
      findMany: vi.fn(),
    },
    userAction: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

describe("BillRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should retrieve all bills ordered by creation date descending", async () => {
    const mockBills = [{ id: "1", utilityType: "electricity", emissions: 10 }];
    vi.mocked(prisma.bill.findMany).mockResolvedValue(mockBills as any);

    const result = await BillRepository.getAllBills();
    expect(result).toEqual(mockBills);
    expect(prisma.bill.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: "desc" },
    });
  });

  it("should create a new bill entry and force utility type to lowercase", async () => {
    const mockInput = {
      utilityType: "Electricity",
      consumptionValue: 120,
      unit: "kWh",
      emissions: 45.6,
      startDate: new Date("2026-05-01"),
      endDate: new Date("2026-05-31"),
      fileName: "bill.pdf",
    };

    vi.mocked(prisma.bill.create).mockResolvedValue({ id: "new-id", ...mockInput } as any);

    const result = await BillRepository.createBill(mockInput);
    expect(result.id).toBe("new-id");
    expect(prisma.bill.create).toHaveBeenCalledWith({
      data: {
        utilityType: "electricity",
        consumptionValue: 120,
        unit: "kWh",
        emissions: 45.6,
        startDate: mockInput.startDate,
        endDate: mockInput.endDate,
        fileName: "bill.pdf",
      },
    });
  });

  it("should delete a bill entry by ID", async () => {
    vi.mocked(prisma.bill.delete).mockResolvedValue({ id: "deleted-id" } as any);

    const result = await BillRepository.deleteBill("deleted-id");
    expect(result).toBeDefined();
    expect(prisma.bill.delete).toHaveBeenCalledWith({
      where: { id: "deleted-id" },
    });
  });
});

describe("ActionRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getAllActions", () => {
    it("should return actions and bypass seeding if actions already exist", async () => {
      const mockActions = [{ id: "1", title: "Action A" }];
      vi.mocked(prisma.action.count).mockResolvedValue(3);
      vi.mocked(prisma.action.findMany).mockResolvedValue(mockActions as any);

      const result = await ActionRepository.getAllActions();
      expect(result).toEqual(mockActions);
      expect(prisma.action.count).toHaveBeenCalled();
      expect(prisma.action.createMany).not.toHaveBeenCalled();
      expect(prisma.action.findMany).toHaveBeenCalledWith({
        orderBy: { title: "asc" },
      });
    });

    it("should seed actions if no actions exist in the database", async () => {
      vi.mocked(prisma.action.count).mockResolvedValue(0);
      vi.mocked(prisma.action.createMany).mockResolvedValue({ count: 6 });
      vi.mocked(prisma.action.findMany).mockResolvedValue([]);

      await ActionRepository.getAllActions();
      expect(prisma.action.createMany).toHaveBeenCalled();
      expect(prisma.action.findMany).toHaveBeenCalled();
    });
  });

  describe("getUserActions", () => {
    it("should query user actions with related action models", async () => {
      const mockUserActions = [{ id: "ua-1", actionId: "a-1", action: { title: "LED" } }];
      vi.mocked(prisma.userAction.findMany).mockResolvedValue(mockUserActions as any);

      const result = await ActionRepository.getUserActions();
      expect(result).toEqual(mockUserActions);
      expect(prisma.userAction.findMany).toHaveBeenCalledWith({
        include: { action: true },
        orderBy: { createdAt: "desc" },
      });
    });
  });

  describe("commitToAction", () => {
    it("should return the existing user action if already committed", async () => {
      const mockExisting = { id: "ua-1", actionId: "a-1", status: "active" };
      vi.mocked(prisma.userAction.findFirst).mockResolvedValue(mockExisting as any);

      const result = await ActionRepository.commitToAction("a-1");
      expect(result).toEqual(mockExisting);
      expect(prisma.userAction.create).not.toHaveBeenCalled();
    });

    it("should create a new user action commitment if not already committed", async () => {
      vi.mocked(prisma.userAction.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.userAction.create).mockResolvedValue({ id: "ua-new", actionId: "a-1" } as any);

      const result = await ActionRepository.commitToAction("a-1");
      expect(result.id).toBe("ua-new");
      expect(prisma.userAction.create).toHaveBeenCalledWith({
        data: {
          actionId: "a-1",
          status: "active",
        },
      });
    });
  });

  describe("toggleActionComplete", () => {
    it("should mark action as completed and record date when completed", async () => {
      vi.mocked(prisma.userAction.update).mockResolvedValue({ id: "ua-1", status: "completed" } as any);

      await ActionRepository.toggleActionComplete("ua-1", true);
      expect(prisma.userAction.update).toHaveBeenCalledWith({
        where: { id: "ua-1" },
        data: expect.objectContaining({
          status: "completed",
          completedAt: expect.any(Date),
        }),
      });
    });

    it("should mark action as active and clear completion date when reactivated", async () => {
      vi.mocked(prisma.userAction.update).mockResolvedValue({ id: "ua-1", status: "active" } as any);

      await ActionRepository.toggleActionComplete("ua-1", false);
      expect(prisma.userAction.update).toHaveBeenCalledWith({
        where: { id: "ua-1" },
        data: {
          status: "active",
          completedAt: null,
        },
      });
    });
  });

  describe("deleteUserAction", () => {
    it("should delete commitment by ID", async () => {
      vi.mocked(prisma.userAction.delete).mockResolvedValue({ id: "ua-1" } as any);

      await ActionRepository.deleteUserAction("ua-1");
      expect(prisma.userAction.delete).toHaveBeenCalledWith({
        where: { id: "ua-1" },
      });
    });
  });

  describe("getAvoidedEmissions", () => {
    it("should sum savings of completed actions and round to 2 decimals", async () => {
      const mockCompleted = [
        { id: "ua-1", action: { savings: 15.255 } },
        { id: "ua-2", action: { savings: 8.4 } },
      ];
      vi.mocked(prisma.userAction.findMany).mockResolvedValue(mockCompleted as any);

      // 15.255 + 8.4 = 23.655 => 23.66
      const result = await ActionRepository.getAvoidedEmissions();
      expect(result).toBe(23.66);
      expect(prisma.userAction.findMany).toHaveBeenCalledWith({
        where: { status: "completed" },
        include: { action: true },
      });
    });
  });
});
