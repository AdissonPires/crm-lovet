"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function SidebarNavLink({
  href, label, icon, badge,
}: {
  href: string;
  label: string;
  icon: React.ReactElement<{ className?: string }>;
  badge?: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`group flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[13px] font-medium transition-colors ${
        active ? "bg-white text-brand-800 shadow-sm" : "text-white/70 hover:bg-white/10 hover:text-white"
      }`}
    >
      <span className={`h-[18px] w-[18px] shrink-0 [&>svg]:h-full [&>svg]:w-full ${active ? "text-brand-700" : "text-white/60 group-hover:text-white"}`}>
        {icon}
      </span>
      <span className="flex-1 truncate">{label}</span>
      {badge}
    </Link>
  );
}
