import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { QueryCache, QueryClient } from "@tanstack/react-query";
import type { appRouter } from "@vibe/api/routers/index";
import { toast } from "sonner";

export function createQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        toast.error(`Error: ${error.message}`, {
          action: {
            label: "retry",
            onClick: () => {
              query.invalidate();
            },
          },
        });
      },
    }),
    defaultOptions: { queries: { staleTime: 60 * 1000 } },
  });
}

/**
 * Browser oRPC client. Client components render on the server too, so the
 * URL falls back to a placeholder there — react-query never executes
 * queries during SSR, only in the browser. Server code (loaders, the /new
 * flow) uses the direct router client in "@/lib/server" instead.
 */
const link = new RPCLink({
  url:
    typeof window === "undefined"
      ? "http://ssr.invalid/api/rpc"
      : `${window.location.origin}/api/rpc`,
  fetch(url, options) {
    return fetch(url, {
      ...options,
      credentials: "include",
    });
  },
});

export const client: RouterClient<typeof appRouter> = createORPCClient(link);

export const orpc = createTanstackQueryUtils(client);
