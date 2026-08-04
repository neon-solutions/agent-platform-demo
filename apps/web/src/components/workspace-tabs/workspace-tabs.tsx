"use client";

import { useReducedMotion } from "motion/react";
import type { ComponentProps, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@vibe/ui/components/tabs";
import { cn } from "@vibe/ui/lib/utils";

export interface WorkspaceTab {
  /** Stable id, doubles as the panel value, e.g. "preview". */
  id: string;
  /** Mono label, e.g. "preview". */
  label: string;
  /** Optional leading icon. */
  icon?: ReactNode;
  /** Optional count rendered after the label, e.g. checkpoints. */
  count?: number;
  /** What the count counts, for the trigger's accessible name. */
  countLabel?: string;
  /** Right-aligned actions shown only while this tab is active. */
  actions?: ReactNode;
  /** The pane content. */
  content: ReactNode;
  /**
   * Keep this pane in the DOM while another tab is active. Required for
   * panes that own live state an unmount would destroy — an iframe running
   * the user's app, a scroll position, a video.
   */
  keepMounted?: boolean;
  disabled?: boolean;
}

export type WorkspaceTabsProps = Omit<ComponentProps<typeof Tabs>, "children"> & {
  tabs: WorkspaceTab[];
  /** Controlled active tab id. */
  value?: string;
  /** Uncontrolled initial tab id; defaults to the first tab. */
  defaultValue?: string;
  onValueChange?: (id: string) => void;
  /**
   * Right-aligned actions that belong to the whole workspace rather than to
   * one pane. A control scoped to the thing the tabs are about disappearing
   * on two of three tabs reads as a bug.
   */
  actions?: ReactNode;
  /**
   * A line under the bar for something the user must see whichever tab is
   * open — a pane that failed to load says so here, because saying it
   * inside that pane says it to nobody.
   */
  notice?: ReactNode;
};

/* ─────────────────────────────────────────────────────────
 * TAB BAR STORYBOARD
 *
 *  rest     mono lowercase labels, muted; the active tab
 *           holds foreground with a primary underline
 *  switch   the underline glides to the new tab (240ms
 *           strong ease-out) and the new pane fades up
 *           4px; the old pane just leaves
 *  actions  workspace-wide controls sit at the right of the
 *           bar; a tab may add its own, which fade in on
 *           the switch — the bar's height never changes
 *  hover    label warms to foreground, nothing moves
 * ───────────────────────────────────────────────────────── */
const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";

/** The underline that glides between active tabs. */
const GlideUnderline = ({ activeId }: { activeId: string }) => {
  const ref = useRef<HTMLSpanElement>(null);
  const [rect, setRect] = useState<{ left: number; width: number } | null>(null);
  // The transition is an inline style, and inline beats any class — so the
  // motion-reduce utility cannot turn this one off. It has to be read.
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const list = ref.current?.closest('[data-slot="tabs-list"]');

    if (!(list instanceof HTMLElement)) {
      return;
    }

    const measure = () => {
      const active = list.querySelector<HTMLElement>("[data-active]");

      if (active) {
        setRect({ left: active.offsetLeft, width: active.offsetWidth });
      }
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, [activeId]);

  return (
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute bottom-0 h-0.5 bg-primary",
        rect ? "opacity-100" : "opacity-0",
      )}
      ref={ref}
      style={{
        left: rect?.left ?? 0,
        transition: reduceMotion
          ? "none"
          : `left 240ms ${EASE_OUT}, width 240ms ${EASE_OUT}`,
        width: rect?.width ?? 0,
      }}
    />
  );
};

export const WorkspaceTabs = ({
  actions,
  className,
  defaultValue,
  notice,
  onValueChange,
  tabs,
  value,
  ...props
}: WorkspaceTabsProps) => {
  const fallback = defaultValue ?? tabs[0]?.id;
  const [internal, setInternal] = useState(fallback);
  const active = value ?? internal;
  const activeTab = tabs.find((tab) => tab.id === active);

  const handleChange = (next: unknown) => {
    const id = String(next);
    setInternal(id);
    onValueChange?.(id);
  };

  return (
    <Tabs
      className={cn("gap-0", className)}
      data-slot="workspace-tabs"
      onValueChange={handleChange}
      value={active}
      {...props}
    >
      <div className="flex items-center justify-between gap-3 border-border/40 border-b">
        <TabsList
          className="relative h-9 shrink gap-1 overflow-x-auto rounded-none bg-transparent p-0"
          variant="line"
        >
          {tabs.map((tab) => (
            <TabsTrigger
              aria-label={
                typeof tab.count === "number" && tab.countLabel
                  ? `${tab.label}, ${tab.count} ${tab.countLabel}`
                  : undefined
              }
              className="h-full flex-none rounded-none px-3 font-mono text-muted-foreground text-xs after:hidden hover:text-foreground data-active:bg-transparent data-active:text-foreground dark:data-active:border-transparent dark:data-active:bg-transparent"
              disabled={tab.disabled}
              key={tab.id}
              value={tab.id}
            >
              {tab.icon}
              {tab.label}
              {typeof tab.count === "number" ? (
                // Carried by the label of the tab it argues for, so it holds
                // foreground weight even while that tab is muted.
                <span
                  aria-hidden="true"
                  className="inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-sm bg-primary/10 px-[3px] pt-px font-medium text-[10px] text-primary leading-none tabular-nums"
                  data-slot="workspace-tabs-count"
                >
                  {tab.count}
                </span>
              ) : null}
            </TabsTrigger>
          ))}
          <GlideUnderline activeId={active} />
        </TabsList>
        {actions || activeTab?.actions ? (
          <div
            className="flex shrink-0 items-center gap-1.5 pr-1"
            data-slot="workspace-tabs-actions"
          >
            {activeTab?.actions ? (
              <div
                className="fade-in-0 flex animate-in items-center gap-1.5 duration-200 motion-reduce:animate-none"
                key={active}
              >
                {activeTab.actions}
              </div>
            ) : null}
            {actions}
          </div>
        ) : null}
      </div>
      {notice ? (
        <p
          className="border-destructive/30 border-b bg-destructive/5 px-3 py-2 text-xs"
          data-slot="workspace-tabs-notice"
        >
          {notice}
        </p>
      ) : null}
      {tabs.map((tab) => (
        <TabsContent
          className="fade-in-0 slide-in-from-bottom-1 min-h-0 flex-1 animate-in pt-4 duration-300 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 data-[hidden]:hidden motion-reduce:animate-none"
          key={tab.id}
          keepMounted={tab.keepMounted}
          value={tab.id}
        >
          {tab.content}
        </TabsContent>
      ))}
    </Tabs>
  );
};
