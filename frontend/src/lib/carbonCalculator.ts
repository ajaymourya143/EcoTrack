import { prisma } from "./prisma";

interface CachedFactor {
  factor: number;
  unit: string;
}

// In-memory cache for emission factors to prevent redundant database queries
const factorCache: Record<string, CachedFactor> = {};

// Fallback US-Average/Standard emission factors in kg CO2e
const DEFAULT_FACTORS: Record<string, CachedFactor> = {
  electricity: { factor: 0.389, unit: "kWh" },    // 0.389 kg CO2e per kWh
  gas: { factor: 0.185, unit: "kWh" },            // 0.185 kg CO2e per kWh (or ~5.3 per therm)
  water: { factor: 0.298, unit: "m3" }            // 0.298 kg CO2e per m3
};

/**
 * Returns the emission factor for a given utility type, standardizing unit discrepancies.
 * Caches results in memory to minimize database read queries.
 */
export async function getEmissionFactor(utilityType: string, unit: string): Promise<number> {
  const normalizedType = utilityType.toLowerCase();
  const normalizedUnit = unit.toLowerCase();
  const cacheKey = `${normalizedType}_${normalizedUnit}`;

  // Check in-memory cache first
  if (factorCache[cacheKey]) {
    return factorCache[cacheKey].factor;
  }

  // Query factor from the database
  let dbFactor = await prisma.emissionFactor.findUnique({
    where: { utilityType: normalizedType }
  });

  // If factor is not initialized in the database, seed it dynamically
  if (!dbFactor) {
    const defaultVal = DEFAULT_FACTORS[normalizedType] || { factor: 1.0, unit: "units" };
    dbFactor = await prisma.emissionFactor.create({
      data: {
        utilityType: normalizedType,
        factor: defaultVal.factor,
        unit: defaultVal.unit,
        region: "US-Average"
      }
    });
  }

  let calculatedFactor = dbFactor.factor;
  const dbUnit = dbFactor.unit.toLowerCase();

  // Handle unit conversions between database factor unit and utility bill unit
  if (dbUnit !== normalizedUnit) {
    if (normalizedType === "gas") {
      if (dbUnit === "kwh" && (normalizedUnit === "therm" || normalizedUnit === "therms")) {
        // 1 therm = 29.3 kWh, so factor per therm is factor_per_kwh * 29.3001
        calculatedFactor = dbFactor.factor * 29.3001;
      } else if (dbUnit === "therm" && normalizedUnit === "kwh") {
        calculatedFactor = dbFactor.factor / 29.3001;
      }
    } else if (normalizedType === "water") {
      if (dbUnit === "m3" && (normalizedUnit === "gallon" || normalizedUnit === "gallons" || normalizedUnit === "gal")) {
        // 1 m3 = 264.172 gallons, so factor per gallon = factor_per_m3 / 264.172
        calculatedFactor = dbFactor.factor / 264.172;
      } else if ((dbUnit === "gallon" || dbUnit === "gallons" || dbUnit === "gal") && normalizedUnit === "m3") {
        calculatedFactor = dbFactor.factor * 264.172;
      }
    }
  }

  // Cache the standardized factor
  factorCache[cacheKey] = { factor: calculatedFactor, unit };
  return calculatedFactor;
}

/**
 * Calculates emissions for a given utility consumption input.
 * Returns emissions in kg CO2e, rounded to 2 decimal places.
 */
export async function calculateEmissions(
  utilityType: string,
  consumptionValue: number,
  unit: string
): Promise<number> {
  const factor = await getEmissionFactor(utilityType, unit);
  const emissions = consumptionValue * factor;
  return Math.round(emissions * 100) / 100;
}

/**
 * Clear the in-memory emission factor cache (used for unit tests)
 */
export function clearFactorCache() {
  for (const key in factorCache) {
    delete factorCache[key];
  }
}
