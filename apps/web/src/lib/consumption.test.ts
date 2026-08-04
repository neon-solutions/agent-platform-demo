import { describe, expect, it } from "vitest";

import {
  BILLING_HOURS_PER_MONTH,
  BYTES_PER_GB,
  type ConsumptionBucket,
  type ConsumptionPeriod,
  estimateCost,
  estimateFleetCost,
  flattenConsumption,
  mergeBuckets,
  PUBLIC_TRANSFER_FREE_GB,
  sumBuckets,
  toAverageBytes,
  toBillingUnit,
} from "./consumption";

const HOURS_PER_DAY = 24;

const bucket = (
  start: string,
  end: string,
  values: ConsumptionBucket["values"],
): ConsumptionBucket => ({ end, start, values });

/** One project's response, as the v2 endpoint nests it. */
const period = (
  timeframes: { start: string; end: string; metrics: Record<string, number> }[],
): ConsumptionPeriod => ({
  consumption: timeframes.map((timeframe) => ({
    metrics: Object.entries(timeframe.metrics).map(([metric_name, value]) => ({
      metric_name,
      value,
    })),
    timeframe_end: timeframe.end,
    timeframe_start: timeframe.start,
  })),
  period_id: "period-1",
});

describe("flattenConsumption", () => {
  it("orders buckets oldest first regardless of response order", () => {
    const buckets = flattenConsumption([
      period([
        { end: "2026-08-03T00:00:00Z", metrics: { compute_unit_seconds: 2 }, start: "2026-08-02T00:00:00Z" },
        { end: "2026-08-02T00:00:00Z", metrics: { compute_unit_seconds: 1 }, start: "2026-08-01T00:00:00Z" },
      ]),
    ]);

    expect(buckets.map((entry) => entry.start)).toEqual([
      "2026-08-01T00:00:00Z",
      "2026-08-02T00:00:00Z",
    ]);
  });

  it("drops a bucket with no bounds, which cannot be placed on an axis", () => {
    const buckets = flattenConsumption([
      {
        consumption: [
          { metrics: [] },
          {
            metrics: [{ metric_name: "compute_unit_seconds", value: 5 }],
            timeframe_end: "2026-08-02T00:00:00Z",
            timeframe_start: "2026-08-01T00:00:00Z",
          },
        ],
      },
    ]);

    expect(buckets).toHaveLength(1);
    expect(buckets[0].start).toBe("2026-08-01T00:00:00Z");
  });

  it("drops metrics it has no rate or label for rather than carrying them as unknowns", () => {
    const [only] = flattenConsumption([
      period([
        {
          end: "2026-08-02T00:00:00Z",
          metrics: { compute_unit_seconds: 5, some_future_metric: 9 },
          start: "2026-08-01T00:00:00Z",
        },
      ]),
    ]);

    expect(only.values).toEqual({ compute_unit_seconds: 5 });
  });
});

describe("mergeBuckets", () => {
  it("sums the projects that share a timeframe into one account bucket", () => {
    const merged = mergeBuckets([
      bucket("2026-08-01T00:00:00Z", "2026-08-02T00:00:00Z", { compute_unit_seconds: 100 }),
      bucket("2026-08-01T00:00:00Z", "2026-08-02T00:00:00Z", { compute_unit_seconds: 40 }),
      bucket("2026-08-02T00:00:00Z", "2026-08-03T00:00:00Z", { compute_unit_seconds: 7 }),
    ]);

    expect(merged).toEqual([
      bucket("2026-08-01T00:00:00Z", "2026-08-02T00:00:00Z", { compute_unit_seconds: 140 }),
      bucket("2026-08-02T00:00:00Z", "2026-08-03T00:00:00Z", { compute_unit_seconds: 7 }),
    ]);
  });

  it("keeps a metric only one project reported", () => {
    const [merged] = mergeBuckets([
      bucket("2026-08-01T00:00:00Z", "2026-08-02T00:00:00Z", { compute_unit_seconds: 10 }),
      bucket("2026-08-01T00:00:00Z", "2026-08-02T00:00:00Z", {
        public_network_transfer_bytes: BYTES_PER_GB,
      }),
    ]);

    expect(merged.values).toEqual({
      compute_unit_seconds: 10,
      public_network_transfer_bytes: BYTES_PER_GB,
    });
  });

  it("leaves totals unchanged, since merging only regroups", () => {
    const buckets = [
      bucket("2026-08-01T00:00:00Z", "2026-08-02T00:00:00Z", { compute_unit_seconds: 100 }),
      bucket("2026-08-01T00:00:00Z", "2026-08-02T00:00:00Z", { compute_unit_seconds: 40 }),
    ];

    expect(sumBuckets(mergeBuckets(buckets))).toEqual(sumBuckets(buckets));
  });
});

describe("toAverageBytes", () => {
  it("reads a day of holding 1 GB as 1 GB, not 24", () => {
    const byteHours = BYTES_PER_GB * HOURS_PER_DAY;

    expect(toAverageBytes(byteHours, HOURS_PER_DAY)).toBe(BYTES_PER_GB);
  });

  it("is zero for a bucket with no duration, rather than dividing by zero", () => {
    expect(toAverageBytes(BYTES_PER_GB, 0)).toBe(0);
  });
});

describe("toBillingUnit", () => {
  it("converts CU-seconds to CU-hours", () => {
    expect(toBillingUnit("compute_unit_seconds", 3600)).toBe(1);
  });

  it("converts byte-hours to GB-months on Neon's fixed 744-hour month", () => {
    const byteHours = BYTES_PER_GB * BILLING_HOURS_PER_MONTH;

    expect(toBillingUnit("root_branch_bytes_month", byteHours)).toBe(1);
  });

  it("leaves transfer as plain GB", () => {
    expect(toBillingUnit("public_network_transfer_bytes", BYTES_PER_GB * 3)).toBe(3);
  });
});

describe("estimateCost", () => {
  it("bills only the transfer past the free allowance", () => {
    const usedGb = PUBLIC_TRANSFER_FREE_GB + 100;
    const { items } = estimateCost(
      { public_network_transfer_bytes: usedGb * BYTES_PER_GB },
      "agent",
    );
    const [transfer] = items;

    expect(transfer.used).toBeCloseTo(usedGb);
    expect(transfer.included).toBeCloseTo(PUBLIC_TRANSFER_FREE_GB);
    expect(transfer.quantity).toBeCloseTo(100);
    expect(transfer.cost).toBeCloseTo(10);
  });

  it("charges nothing under the allowance", () => {
    const { total } = estimateCost(
      { public_network_transfer_bytes: 400 * BYTES_PER_GB },
      "agent",
    );

    expect(total).toBe(0);
  });

  it("bills only the branch-hours past the plan's included branches", () => {
    const hoursInPeriod = 24;
    // 25 branches held for a day, on a plan that includes 25 (one of which
    // is the root, so 24 free children).
    const { items } = estimateCost({ extra_branches_month: 25 * hoursInPeriod }, "agent", {
      hoursInPeriod,
    });
    const [branches] = items;

    expect(branches.quantity).toBeCloseTo(hoursInPeriod / BILLING_HOURS_PER_MONTH);
  });

  it("keeps zero-cost lines unless asked to drop them", () => {
    const totals = { public_network_transfer_bytes: 0 };

    expect(estimateCost(totals, "agent").items).toHaveLength(1);
    expect(estimateCost(totals, "agent", { omitZero: true }).items).toHaveLength(0);
  });
});

describe("estimateFleetCost", () => {
  it("gives every project its own allowance", () => {
    const perProject = [
      { public_network_transfer_bytes: 400 * BYTES_PER_GB },
      { public_network_transfer_bytes: 400 * BYTES_PER_GB },
    ];

    // Both projects sit under the 500 GB allowance, so nothing is billable —
    // though their sum, 800 GB, would be 300 GB over a single one.
    expect(estimateFleetCost(perProject, "agent").total).toBe(0);
    expect(
      estimateCost({ public_network_transfer_bytes: 800 * BYTES_PER_GB }, "agent").total,
    ).toBeCloseTo(30);
  });

  it("sums the billable overage across projects", () => {
    const perProject = [
      { public_network_transfer_bytes: (PUBLIC_TRANSFER_FREE_GB + 10) * BYTES_PER_GB },
      { public_network_transfer_bytes: (PUBLIC_TRANSFER_FREE_GB + 30) * BYTES_PER_GB },
    ];
    const [transfer] = estimateFleetCost(perProject, "agent").items;

    expect(transfer.quantity).toBeCloseTo(40);
    expect(transfer.included).toBeCloseTo(PUBLIC_TRANSFER_FREE_GB * 2);
    expect(transfer.cost).toBeCloseTo(4);
  });

  it("adds metrics that only some projects reported", () => {
    const { items, total } = estimateFleetCost(
      [{ compute_unit_seconds: 3600 }, { snapshot_storage_bytes_month: 0 }],
      "agent",
    );

    expect(items.map((item) => item.id)).toEqual([
      "compute_unit_seconds",
      "snapshot_storage_bytes_month",
    ]);
    expect(total).toBeCloseTo(0.106);
  });

  it("is empty for an account with no projects", () => {
    expect(estimateFleetCost([], "agent")).toEqual({ items: [], plan: "agent", total: 0 });
  });
});
