import { vi, describe, it, expect, beforeEach } from "vitest";
import { getEmissionFactor, calculateEmissions, clearFactorCache } from "../lib/carbonCalculator";
import { prisma } from "../lib/prisma";

// Mock the prisma client singleton
vi.mock("../lib/prisma", () => ({
  prisma: {
    emissionFactor: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

describe("Carbon Calculator Utilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearFactorCache();
  });

  describe("getEmissionFactor", () => {
    it("should fetch emission factor from the database if present", async () => {
      const mockDbFactor = {
        id: "1",
        utilityType: "electricity",
        factor: 0.5,
        unit: "kWh",
        region: "US-Average",
        updatedAt: new Date(),
      };

      vi.mocked(prisma.emissionFactor.findUnique).mockResolvedValue(mockDbFactor);

      const factor = await getEmissionFactor("electricity", "kWh");
      expect(factor).toBe(0.5);
      expect(prisma.emissionFactor.findUnique).toHaveBeenCalledWith({
        where: { utilityType: "electricity" },
      });
    });

    it("should seed default factors when database record does not exist", async () => {
      const mockCreatedFactor = {
        id: "2",
        utilityType: "water",
        factor: 0.298,
        unit: "m3",
        region: "US-Average",
        updatedAt: new Date(),
      };

      vi.mocked(prisma.emissionFactor.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.emissionFactor.create).mockResolvedValue(mockCreatedFactor);

      const factor = await getEmissionFactor("water", "m3");
      expect(factor).toBe(0.298);
      expect(prisma.emissionFactor.create).toHaveBeenCalledWith({
        data: {
          utilityType: "water",
          factor: 0.298,
          unit: "m3",
          region: "US-Average",
        },
      });
    });

    it("should convert units correctly for gas (kWh to therms)", async () => {
      const mockDbFactor = {
        id: "3",
        utilityType: "gas",
        factor: 0.185, // per kWh
        unit: "kWh",
        region: "US-Average",
        updatedAt: new Date(),
      };

      vi.mocked(prisma.emissionFactor.findUnique).mockResolvedValue(mockDbFactor);

      const factor = await getEmissionFactor("gas", "therm");
      // 0.185 * 29.3001 = 5.4205185
      expect(factor).toBeCloseTo(5.4205, 4);
    });

    it("should convert units correctly for gas (therms to kWh)", async () => {
      const mockDbFactor = {
        id: "4",
        utilityType: "gas",
        factor: 5.4, // per therm
        unit: "therm",
        region: "US-Average",
        updatedAt: new Date(),
      };

      vi.mocked(prisma.emissionFactor.findUnique).mockResolvedValue(mockDbFactor);

      const factor = await getEmissionFactor("gas", "kwh");
      // 5.4 / 29.3001 = 0.1843
      expect(factor).toBeCloseTo(0.1843, 4);
    });

    it("should convert units correctly for water (m3 to gallons)", async () => {
      const mockDbFactor = {
        id: "5",
        utilityType: "water",
        factor: 0.298, // per m3
        unit: "m3",
        region: "US-Average",
        updatedAt: new Date(),
      };

      vi.mocked(prisma.emissionFactor.findUnique).mockResolvedValue(mockDbFactor);

      const factor = await getEmissionFactor("water", "gallon");
      // 0.298 / 264.172 = 0.001128
      expect(factor).toBeCloseTo(0.001128, 6);
    });

    it("should convert units correctly for water (gallons to m3)", async () => {
      const mockDbFactor = {
        id: "6",
        utilityType: "water",
        factor: 0.0011, // per gallon
        unit: "gallon",
        region: "US-Average",
        updatedAt: new Date(),
      };

      vi.mocked(prisma.emissionFactor.findUnique).mockResolvedValue(mockDbFactor);

      const factor = await getEmissionFactor("water", "m3");
      // 0.0011 * 264.172 = 0.2905892
      expect(factor).toBeCloseTo(0.2906, 4);
    });
  });

  describe("calculateEmissions", () => {
    it("should compute carbon footprint and round to 2 decimal places", async () => {
      const mockDbFactor = {
        id: "7",
        utilityType: "electricity",
        factor: 0.389,
        unit: "kWh",
        region: "US-Average",
        updatedAt: new Date(),
      };

      vi.mocked(prisma.emissionFactor.findUnique).mockResolvedValue(mockDbFactor);

      // 325.4 * 0.389 = 126.5806 => 126.58
      const emissions = await calculateEmissions("electricity", 325.4, "kWh");
      expect(emissions).toBe(126.58);
    });
  });
});
