"use client";

import { Plus } from "lucide-react";

import { dashboardStore, useDashboardStore } from "@/store/dashboard-store";
import type { ModalView } from "@/types/frontend";

import { IncidentDetails } from "@/components/dashboard/incident-details";
import { NewIncidentForm } from "@/components/dashboard/new-incident-form";
import { LoginModal } from "@/components/dashboard/login-modal";
import { VehicleControl } from "@/components/dashboard/vehicle-control";

type StoreUpdate = Parameters<typeof dashboardStore.setState>[0];

export function DashboardModals(props: {
  onLogin: (email: string, password: string) => Promise<void>;
}) {
  const { onLogin } = props;
  const { openModal, selectedIncidentID } = useDashboardStore();
  const setStore = (update: StoreUpdate) => dashboardStore.setState(update);

  if (!openModal) return null;

  const modalKey = openModal as Exclude<ModalView, null>;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-md animate-in fade-in duration-300"
        onClick={() => setStore({ openModal: null, selectedIncidentID: null })}
      />
      <div className="relative w-full max-w-xl bg-[#0c0c0c] rounded-3xl border border-zinc-800 overflow-hidden shadow-2xl p-8 animate-in zoom-in-95 duration-300">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-xl font-bold uppercase tracking-tight">
            {modalKey.replace("-", " ")}
          </h2>
          <button
            onClick={() => setStore({ openModal: null, selectedIncidentID: null })}
            className="w-10 h-10 rounded-xl bg-zinc-900 flex items-center justify-center text-zinc-500 hover:text-white transition-all"
          >
            <Plus className="w-5 h-5 rotate-45" />
          </button>
        </div>

        {openModal === "incident-intake" && <NewIncidentForm />}
        {openModal === "login" && <LoginModal onLogin={onLogin} />}
        {openModal === "incident-details" && selectedIncidentID && (
          <IncidentDetails incidentId={selectedIncidentID} />
        )}
        {openModal === "vehicle-command" && <VehicleControl />}
      </div>
    </div>
  );
}

