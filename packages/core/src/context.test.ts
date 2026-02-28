import { describe, it, expect } from "vitest";
import { parseDuration } from "./context";

describe("parseDuration", () => {
  it("passes through numbers as-is (milliseconds)", () => {
    expect(parseDuration(5000)).toBe(5000);
    expect(parseDuration(0)).toBe(0);
  });

  it("parses milliseconds", () => {
    expect(parseDuration("100ms")).toBe(100);
  });

  it("parses seconds", () => {
    expect(parseDuration("30s")).toBe(30_000);
    expect(parseDuration("1s")).toBe(1000);
  });

  it("parses minutes", () => {
    expect(parseDuration("5m")).toBe(300_000);
    expect(parseDuration("1m")).toBe(60_000);
  });

  it("parses hours", () => {
    expect(parseDuration("2h")).toBe(7_200_000);
    expect(parseDuration("1h")).toBe(3_600_000);
  });

  it("parses days", () => {
    expect(parseDuration("1d")).toBe(86_400_000);
  });

  it("throws on invalid format", () => {
    expect(() => parseDuration("5x")).toThrow("Invalid duration format");
    expect(() => parseDuration("abc")).toThrow("Invalid duration format");
    expect(() => parseDuration("")).toThrow("Invalid duration format");
    expect(() => parseDuration("5 m")).toThrow("Invalid duration format");
  });
});
