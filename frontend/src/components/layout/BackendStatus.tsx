"use client";

/** Chỉ báo kết nối backend (GET /health), tự kiểm tra lại mỗi 30 giây. */

import { useEffect, useState } from "react";
import { fetchHealth } from "@/lib/api";
import { cn } from "@/lib/cn";
import { Tooltip } from "@/components/ui/Tooltip";

type Status = "checking" | "online" | "offline";

const TEXT: Record<Status, string> = {
  checking: "Đang kiểm tra backend…",
  online: "Backend đã kết nối",
  offline: "Mất kết nối backend",
};

const DOT: Record<Status, string> = {
  checking: "bg-sidebar-muted",
  online: "bg-success",
  offline: "bg-danger",
};

export function BackendStatus({ collapsed = false }: { collapsed?: boolean }) {
  const [status, setStatus] = useState<Status>("checking");

  useEffect(() => {
    let active = true;
    const check = async () => {
      const ok = await fetchHealth();
      if (active) setStatus(ok ? "online" : "offline");
    };
    void check();
    const timer = window.setInterval(check, 30_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <Tooltip content={TEXT[status]} side="right" enabled={collapsed}>
      <div
        role="status"
        aria-label={TEXT[status]}
        tabIndex={collapsed ? 0 : undefined}
        className={cn(
          "flex h-9 items-center gap-3 rounded-md text-sm text-sidebar-muted",
          collapsed ? "w-9 justify-center" : "px-3"
        )}
      >
        <span className="relative flex h-2 w-2 shrink-0">
          {status === "online" && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-40 motion-reduce:hidden" />
          )}
          <span className={cn("relative inline-flex h-2 w-2 rounded-full", DOT[status])} />
        </span>
        {!collapsed && <span className="truncate">{TEXT[status]}</span>}
      </div>
    </Tooltip>
  );
}
