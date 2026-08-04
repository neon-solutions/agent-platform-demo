import { describe, expect, it } from "vitest";

import { parseConsumptionQuery } from "./consumption-query";

const query = (params: Record<string, string>) =>
  parseConsumptionQuery(new URLSearchParams(params));

const DAY = { from: "2026-08-01T00:00:00Z", to: "2026-08-02T00:00:00Z" };

describe("parseConsumptionQuery", () => {
  it("defaults to daily granularity, every metric, and the whole fleet", () => {
    const result = query(DAY);

    expect(result).toEqual({
      ok: true,
      query: {
        from: DAY.from,
        granularity: "daily",
        metrics: null,
        projectIds: [],
        to: DAY.to,
      },
    });
  });

  it("splits comma-separated project ids", () => {
    const result = query({ ...DAY, project_ids: "one, two ,three" });

    expect(result.ok && result.query.projectIds).toEqual(["one", "two", "three"]);
  });

  it("keeps a metric filter the caller asked for", () => {
    const result = query({ ...DAY, metrics: "compute_unit_seconds,extra_branches_month" });

    expect(result.ok && result.query.metrics).toEqual([
      "compute_unit_seconds",
      "extra_branches_month",
    ]);
  });

  it("rejects a metric Neon does not meter", () => {
    expect(query({ ...DAY, metrics: "cpu_cycles" }).ok).toBe(false);
  });

  it("rejects unparseable dates", () => {
    expect(query({ from: "yesterday", to: DAY.to }).ok).toBe(false);
    expect(query({ from: DAY.from, to: "" }).ok).toBe(false);
  });

  it("rejects a missing range outright", () => {
    expect(query({ granularity: "daily" }).ok).toBe(false);
  });

  it("rejects a reversed range", () => {
    const result = query({ from: DAY.to, to: DAY.from });

    expect(result).toEqual({ error: "from must be before to", ok: false });
  });

  it("rejects an unknown granularity", () => {
    expect(query({ ...DAY, granularity: "weekly" }).ok).toBe(false);
  });

  it("rejects an hourly window past the 168 hours hourly reaches back", () => {
    const result = query({
      from: "2026-07-01T00:00:00Z",
      granularity: "hourly",
      to: "2026-08-01T00:00:00Z",
    });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain("168 hours");
  });

  it("accepts the same window at daily, which reaches 60 days", () => {
    expect(
      query({ from: "2026-07-01T00:00:00Z", granularity: "daily", to: "2026-08-01T00:00:00Z" })
        .ok,
    ).toBe(true);
  });

  it("accepts an hourly window at the limit", () => {
    expect(
      query({ from: "2026-07-26T00:00:00Z", granularity: "hourly", to: "2026-08-02T00:00:00Z" })
        .ok,
    ).toBe(true);
  });
});
