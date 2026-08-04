import { describe, expect, it } from "vitest";

import {
  IDLE_RESTORE,
  type RestoreEvent,
  restoreReducer,
  type RestoreState,
} from "./restore-lifecycle";

const run = (events: RestoreEvent[], from: RestoreState = IDLE_RESTORE) =>
  events.reduce(restoreReducer, from);

const RESTORING = { awaitingPaint: false, restoring: true };
const AWAITING = { awaitingPaint: true, restoring: true };

describe("restoreReducer", () => {
  it("holds the loader from the request until the app paints again", () => {
    expect(run([{ type: "started" }])).toEqual(RESTORING);
    expect(run([{ type: "started" }, { type: "committed" }])).toEqual(AWAITING);
    expect(
      run([{ type: "started" }, { type: "committed" }, { type: "painted" }]),
    ).toEqual(IDLE_RESTORE);
  });

  it("stays up across the server call, however long it takes", () => {
    // The restore runs a git reset, an npm install, and a dev-server boot
    // before it returns. Nothing during that stretch may settle it.
    expect(run([{ type: "started" }, { type: "painted" }])).toEqual(RESTORING);
    expect(run([{ type: "started" }, { type: "timed-out" }])).toEqual(RESTORING);
  });

  it("clears on failure, so a refused restore leaves no loader behind", () => {
    expect(run([{ type: "started" }, { type: "failed" }])).toEqual(IDLE_RESTORE);
  });

  it("lifts the loader when a reload never paints", () => {
    expect(
      run([{ type: "started" }, { type: "committed" }, { type: "timed-out" }]),
    ).toEqual(IDLE_RESTORE);
  });

  it("ignores a reload that no restore asked for", () => {
    expect(run([{ type: "committed" }])).toEqual(IDLE_RESTORE);
    expect(run([{ type: "painted" }])).toEqual(IDLE_RESTORE);
    expect(run([{ type: "timed-out" }])).toEqual(IDLE_RESTORE);
  });

  it("settles once, so a late paint cannot reopen a finished restore", () => {
    const settled = run([
      { type: "started" },
      { type: "committed" },
      { type: "painted" },
    ]);

    expect(restoreReducer(settled, { type: "painted" })).toEqual(IDLE_RESTORE);
    expect(restoreReducer(settled, { type: "timed-out" })).toEqual(IDLE_RESTORE);
  });

  it("keeps waiting through a second restore started before the first painted", () => {
    const state = run([
      { type: "started" },
      { type: "committed" },
      { type: "started" },
    ]);

    expect(state).toEqual(RESTORING);
    expect(restoreReducer(state, { type: "painted" })).toEqual(RESTORING);
  });
});
