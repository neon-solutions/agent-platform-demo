"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function NewApp() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [plan, setPlan] = useState<"free" | "paid">("free");
  const [loading, setLoading] = useState(false);

  async function create() {
    setLoading(true);
    try {
      const res = await fetch("/api/prototypes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, plan }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create app");
      router.push(`/app/${data.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create app");
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 sm:flex-row sm:items-center">
      <Input
        placeholder="What do you want to build? e.g. a habit tracker"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && !loading && create()}
        className="flex-1"
      />
      <div className="flex items-center gap-2">
        <select
          value={plan}
          onChange={(e) => setPlan(e.target.value as "free" | "paid")}
          className="h-10 rounded-md border border-input bg-transparent px-3 text-sm"
          title="Which Neon org tier hosts this app's database"
        >
          <option value="free">Free DB</option>
          <option value="paid">Paid DB</option>
        </select>
        <Button onClick={create} disabled={loading}>
          <Sparkles /> {loading ? "Creating…" : "Create app"}
        </Button>
      </div>
    </div>
  );
}
