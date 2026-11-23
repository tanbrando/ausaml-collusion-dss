"use client";

/** Mục lục dính có scroll-spy cho trang báo cáo dài (/benchmark). */

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

export interface NavSection {
  id: string;
  label: string;
}

export function SectionNav({ sections }: { sections: NavSection[] }) {
  const [activeId, setActiveId] = useState(sections[0]?.id);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-10% 0px -70% 0px" }
    );
    sections.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [sections]);

  return (
    <nav aria-label="Mục lục trang" className="no-print">
      {/* Desktop: danh sách dọc dính */}
      <ul className="sticky top-6 hidden space-y-0.5 border-l border-line lg:block">
        {sections.map((s) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              aria-current={activeId === s.id ? "true" : undefined}
              onClick={() => setActiveId(s.id)}
              className={cn(
                "-ml-px block border-l-2 py-1.5 pl-4 text-sm transition-colors",
                activeId === s.id ? "border-primary font-medium text-fg" : "border-transparent text-muted hover:text-fg"
              )}
            >
              {s.label}
            </a>
          </li>
        ))}
      </ul>
      {/* Mobile: hàng chip cuộn ngang */}
      <ul className="scrollbar-thin -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:hidden">
        {sections.map((s) => (
          <li key={s.id} className="shrink-0">
            <a
              href={`#${s.id}`}
              className={cn(
                "inline-flex h-8 items-center rounded-full border px-3 text-sm",
                activeId === s.id ? "border-primary/40 bg-primary-subtle text-primary-fg" : "border-line bg-surface text-fg-secondary"
              )}
            >
              {s.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
