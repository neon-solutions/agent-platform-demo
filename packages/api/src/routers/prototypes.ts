import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "../index";
import {
  createPrototype,
  deletePrototype,
  getPrototype,
  getUsage,
  listCheckpoints,
  listPrototypes,
  provisionPrototype,
  renamePrototype,
  restoreCheckpoint,
  upgradeToPaid,
  wakePrototype,
} from "../services/prototypes";

const idInput = z.object({ id: z.uuid() });

/** Load a prototype, enforcing ownership. */
async function owned(id: string, userId: string) {
  const proto = await getPrototype(id, userId);
  if (!proto) {
    throw new ORPCError("NOT_FOUND");
  }
  return proto;
}

export const prototypesRouter = {
  list: protectedProcedure.handler(({ context }) => listPrototypes(context.session.user.id)),

  get: protectedProcedure
    .input(idInput)
    .handler(({ context, input }) => owned(input.id, context.session.user.id)),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(200),
        plan: z.enum(["free", "paid"]).default("free"),
        description: z.string().max(2000).optional(),
      }),
    )
    .handler(({ context, input }) =>
      createPrototype(context.session.user.id, input.name, input.plan, input.description),
    ),

  /** The long-running half: Neon project + sandbox. Safe to re-run on error. */
  provision: protectedProcedure.input(idInput).handler(async ({ context, input }) => {
    await owned(input.id, context.session.user.id);
    return await provisionPrototype(input.id);
  }),

  /** Resume the sandbox + make sure the dev server is serving. */
  wake: protectedProcedure.input(idInput).handler(async ({ context, input }) => {
    const proto = await owned(input.id, context.session.user.id);
    if (proto.status !== "ready" || !proto.databaseUrl) {
      throw new ORPCError("CONFLICT", { message: "prototype not ready" });
    }
    const url = await wakePrototype(proto);
    return { url };
  }),

  rename: protectedProcedure
    .input(
      idInput.extend({
        name: z.string().min(1).max(200),
        description: z.string().max(2000).optional(),
      }),
    )
    .handler(async ({ context, input }) => {
      await owned(input.id, context.session.user.id);
      return await renamePrototype(input.id, input.name, input.description);
    }),

  /** Full teardown: sandbox, tenant Neon project, ledger row. */
  delete: protectedProcedure.input(idInput).handler(async ({ context, input }) => {
    await owned(input.id, context.session.user.id);
    await deletePrototype(input.id);
    return { ok: true };
  }),

  /**
   * Account-teardown helper: delete every app the user owns (sandboxes +
   * tenant Neon projects). Called before Better Auth removes the account.
   */
  teardownAll: protectedProcedure.handler(async ({ context }) => {
    const rows = await listPrototypes(context.session.user.id);
    for (const row of rows) {
      await deletePrototype(row.id);
    }
    return { deleted: rows.length };
  }),

  /** Free -> paid: cross-org Neon project transfer. */
  upgrade: protectedProcedure.input(idInput).handler(async ({ context, input }) => {
    await owned(input.id, context.session.user.id);
    return await upgradeToPaid(input.id);
  }),

  checkpoints: protectedProcedure.input(idInput).handler(async ({ context, input }) => {
    await owned(input.id, context.session.user.id);
    return await listCheckpoints(input.id);
  }),

  /** Compound restore: git reset + Neon snapshot restore together. */
  restore: protectedProcedure
    .input(idInput.extend({ checkpointId: z.uuid() }))
    .handler(async ({ context, input }) => {
      await owned(input.id, context.session.user.id);
      return await restoreCheckpoint(input.id, input.checkpointId);
    }),

  /**
   * Billing-aligned per-project consumption (last 30 days). The v2
   * consumption API is gated to Launch+ plans, so a free-org app returns
   * `planGated` — a state to sell the upgrade with, not an error.
   */
  usage: protectedProcedure.input(idInput).handler(async ({ context, input }) => {
    const proto = await owned(input.id, context.session.user.id);
    try {
      return { planGated: false as const, usage: await getUsage(proto) };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/Launch plan|not available|plan/i.test(message)) {
        return { planGated: true as const, usage: null };
      }
      throw err;
    }
  }),
};
