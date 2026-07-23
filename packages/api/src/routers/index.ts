import type { RouterClient } from "@orpc/server";

import { publicProcedure } from "../index";
import { modelsRouter } from "./models";
import { prototypesRouter } from "./prototypes";

export const appRouter = {
  healthCheck: publicProcedure.handler(() => {
    return "OK";
  }),
  models: modelsRouter,
  prototypes: prototypesRouter,
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
