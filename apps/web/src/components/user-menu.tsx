import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@vibe/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@vibe/ui/components/dropdown-menu";
import { Skeleton } from "@vibe/ui/components/skeleton";
import { LayoutGrid, LogOut, Plus, UserRound } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

/** Initials avatar; the user's image when they have one. */
function Avatar({
  name,
  image,
  className,
}: {
  name: string;
  image?: string | null;
  className?: string;
}) {
  if (image) {
    return <img alt="" className={cn("size-7 rounded-full object-cover", className)} src={image} />;
  }
  const initials = name
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-7 shrink-0 place-items-center rounded-full border border-border/60 bg-muted font-medium text-[11px] text-muted-foreground",
        className,
      )}
    >
      {initials || "?"}
    </span>
  );
}

/**
 * The avatar menu: a round trigger in the topbar; the sheet leads with
 * identity (avatar, name, email), then destinations with icons, then the
 * one destructive action on its own ground.
 */
export default function UserMenu() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return <Skeleton className="size-7 rounded-full" />;
  }

  if (!session) {
    return (
      <Link href="/login">
        <Button size="sm" variant="outline">
          Sign in
        </Button>
      </Link>
    );
  }

  const { name, email, image } = session.user;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account menu"
        className="rounded-full outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring/50 data-[popup-open]:ring-2 data-[popup-open]:ring-ring/40"
      >
        <Avatar image={image} name={name} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56 bg-card">
        <div className="flex items-center gap-3 px-2.5 py-2.5">
          <Avatar className="size-9" image={image} name={name} />
          <div className="min-w-0">
            <p className="truncate font-medium text-sm">{name}</p>
            <p className="truncate text-muted-foreground text-xs">{email}</p>
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => router.push("/app")}>
            <LayoutGrid /> Your apps
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push("/account")}>
            <UserRound /> Account
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push("/")}>
            <Plus /> New app
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            authClient.signOut({
              fetchOptions: {
                onSuccess: () => {
                  router.push("/");
                },
              },
            });
          }}
          variant="destructive"
        >
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
