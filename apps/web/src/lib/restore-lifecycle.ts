/**
 * A checkpoint restore spans three things that finish in an order nobody
 * controls: the server call, the preview's reload, and a bound on how long
 * the loader may stay up. The order matters — settling on the wrong event
 * drops the user onto a blank iframe at the moment the restore was supposed
 * to pay off — so the transitions live here rather than in effects.
 */
export interface RestoreState {
  /** A restore is running, or its app has not painted again yet. */
  restoring: boolean;
  /** The reload for a finished restore is on its way. */
  awaitingPaint: boolean;
}

export type RestoreEvent =
  /** The user asked for a restore. */
  | { type: "started" }
  /** The server refused or failed. */
  | { type: "failed" }
  /** The server returned and the preview's reload has been issued. */
  | { type: "committed" }
  /** The preview finished loading. */
  | { type: "painted" }
  /** The reload took too long to paint. */
  | { type: "timed-out" };

export const IDLE_RESTORE: RestoreState = { awaitingPaint: false, restoring: false };

export const restoreReducer = (
  state: RestoreState,
  event: RestoreEvent
): RestoreState => {
  switch (event.type) {
    case "started":
      return { awaitingPaint: false, restoring: true };

    case "failed":
      return IDLE_RESTORE;

    // Outside a restore this is an ordinary reload, and waiting for it to
    // paint would hold a loader nobody raised.
    case "committed":
      return state.restoring ? { awaitingPaint: true, restoring: true } : state;

    // Only the load this restore is waiting on ends it. A hot reload or a
    // sandbox restart while the server is still working would otherwise
    // lift the scrim off an app that has not come back.
    case "painted":
    case "timed-out":
      return state.restoring && state.awaitingPaint ? IDLE_RESTORE : state;

    default:
      return state;
  }
};
