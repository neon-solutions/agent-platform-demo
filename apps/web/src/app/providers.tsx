"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@vibe/ui/components/sonner";
import { type ReactNode, useState } from "react";

import { createQueryClient } from "@/utils/orpc";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => createQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster richColors />
    </QueryClientProvider>
  );
}
