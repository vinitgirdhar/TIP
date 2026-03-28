import type { Station } from "../../shared/types";
import { FARE_BY_ZONE_DIFFERENCE } from "../fareConfig";

export function calculateFareByZoneDifference(zoneDifference: number): number {
  const normalizedDifference = Math.max(0, Math.min(4, Math.abs(zoneDifference)));
  return FARE_BY_ZONE_DIFFERENCE[normalizedDifference];
}

export function calculateFare(entryStation: Station, exitStation: Station): number {
  return calculateFareByZoneDifference(exitStation.zone - entryStation.zone);
}

