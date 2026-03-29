"use client";

import { Shield, Home, Map as LucideMap, BarChart3, Car, Plus } from "lucide-react";
import type { ReactNode } from "react";

export function DashboardShell(props: {
  profileName: string;
  activeSectionID: string;
  onSelectSection: (id: string) => void;
  onOpenIncidentIntake: () => void;
  children: ReactNode;
}) {
  const { profileName, activeSectionID, onSelectSection, onOpenIncidentIntake, children } =
    props;

  return (
    <div className="flex h-full w-full">
      <aside className="w-64 border-r border-zinc-800/80 bg-[#0a0a0a] flex flex-col z-40">
        <div className="h-14 flex items-center px-4 border-b border-zinc-800/80 gap-3">
          <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center">
            <Shield className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-sm font-bold truncate">{profileName}</span>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {[
            { id: "top", label: "Overview", icon: Home },
            { id: "dispatches", label: "Dispatches", icon: LucideMap },
            { id: "fleet", label: "Fleet", icon: Car },
            { id: "analytics", label: "Analytics", icon: BarChart3 },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => onSelectSection(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                activeSectionID === item.id
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900"
              }`}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 bg-[#0a0a0a]">
        <header className="h-14 border-b border-zinc-800/80 flex items-center justify-between px-8">
          <span className="text-[11px] font-bold text-zinc-600 uppercase tracking-widest">
            {activeSectionID}
          </span>
          <button
            onClick={onOpenIncidentIntake}
            className="px-4 py-1.5 rounded-lg bg-zinc-100 text-black text-xs font-bold hover:bg-white transition-all shadow-lg flex items-center gap-2"
          >
            <Plus className="w-3.5 h-3.5" /> Dispatch
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-6xl mx-auto space-y-8">{children}</div>
        </div>
      </main>
    </div>
  );
}

