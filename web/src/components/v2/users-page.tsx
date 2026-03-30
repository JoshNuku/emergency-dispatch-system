"use client";

import { useEffect, useMemo, useState } from "react";

import { dashboardStore, useDashboardStore } from "@/store/dashboard-store";
import { deleteUser, getUsers, updateUser } from "@/lib/api";
import ConfirmModal from "@/components/v2/ui/confirm-modal";
import { ensureArray, titleCase } from "@/lib/normalizers";
import type { Station, UserProfile } from "@/types/frontend";

// Map user roles to the station type they should be associated with (if any)
function roleToStationType(role?: string): string | null {
  if (!role) return null;
  switch (role) {
    case "ambulance_driver":
    case "hospital_admin":
      return "hospital";
    case "police_driver":
    case "police_admin":
      return "police";
    case "fire_driver":
    case "fire_admin":
      return "fire";
    default:
      return null;
  }
}

export function UsersPage() {
  const { token, users, loadingAction, state } = useDashboardStore();
  const setStore = dashboardStore.setState;
  const safeStations = useMemo(() => ensureArray<Station>(state.stations), [state.stations]);
  const [editingUserID, setEditingUserID] = useState("");
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState("hospital_admin");
  const [editStationID, setEditStationID] = useState("");
  const [pendingID, setPendingID] = useState("");

  useEffect(() => {
    if (!token) return;
    if (users.length > 0) return;
    setStore({ loadingAction: { kind: "load-users" } });
    void (async () => {
      try {
        const result = await getUsers(token);
        setStore({
          users: ensureArray<UserProfile>(result),
          loadingAction: { kind: "idle" },
        });
      } catch (error) {
        setStore({
          actionError:
            error instanceof Error ? error.message : "Failed to load users",
          loadingAction: { kind: "idle" },
        });
      }
    })();
  }, [token, users.length, setStore]);

  const isLoading = loadingAction.kind === "load-users";
  const canMutate = useMemo(() => Boolean(token), [token]);

  function beginEdit(user: UserProfile) {
    setEditingUserID(user.id);
    setEditName(user.name);
    setEditRole(user.role);
    setEditStationID(user.station_id ?? "");
  }

  async function saveUser(userID: string) {
    if (!token) return;
    setPendingID(userID);
    try {
      const updated = await updateUser(token, userID, {
        name: editName,
        role: editRole,
        station_id: editStationID || undefined,
      });
      setStore((c) => ({
        users: c.users.map((u) => (u.id === userID ? { ...u, ...updated } : u)),
        actionNotice: "User updated.",
      }));
      setEditingUserID("");
    } catch (error) {
      setStore({
        actionError: error instanceof Error ? error.message : "Failed to update user",
      });
    } finally {
      setPendingID("");
    }
  }

  async function removeUser(userID: string) {
    // open confirm modal
    setPendingID(userID);
  }

  async function confirmRemoveUser() {
    if (!token || !pendingID) return;
    setPendingID(pendingID);
    try {
      await deleteUser(token, pendingID);
      setStore((c) => ({
        users: c.users.filter((u) => u.id !== pendingID),
        actionNotice: "User deleted.",
      }));
      if (editingUserID === pendingID) setEditingUserID("");
    } catch (error) {
      setStore({ actionError: error instanceof Error ? error.message : "Failed to delete user" });
    } finally {
      setPendingID("");
    }
  }

  function cancelRemoveUser() {
    setPendingID("");
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-line bg-panel px-6 py-5">
        <h1 className="text-[14px] font-semibold text-foreground">Users</h1>
        <p className="mt-1 text-[12px] text-muted">
          Manage personnel accounts and role assignments.
        </p>
      </div>

      <div className="rounded-2xl border border-line bg-panel">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <p className="text-[13px] font-semibold text-foreground">
            Directory ({users.length})
          </p>
          <button
            type="button"
            onClick={() => setStore({ openModal: "user-manage" })}
            className="rounded-lg border border-line bg-background px-3 py-2 text-[12px] font-medium text-muted transition hover:border-line-strong hover:text-foreground"
          >
            Register user
          </button>
        </div>

        {isLoading ? (
          <div className="px-6 py-6 text-[12px] text-muted">Loading…</div>
        ) : users.length === 0 ? (
          <div className="px-6 py-6 text-[12px] text-muted">
            No users loaded yet.
          </div>
        ) : (
          <div className="divide-y divide-line">
            {users.slice(0, 100).map((u) => (
              <div key={u.id} className="px-6 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {editingUserID === u.id ? (
                      <div className="grid gap-2 sm:grid-cols-2">
                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="rounded-lg border border-line bg-background px-3 py-2 text-[12px] text-foreground"
                        />
                        <select
                          value={editRole}
                          onChange={(e) => {
                            const newRole = e.target.value;
                            setEditRole(newRole);
                            const allowed = roleToStationType(newRole);
                            const station = safeStations.find((s) => s.id === editStationID);
                            if (editStationID && allowed && station && station.type !== allowed) {
                              setEditStationID("");
                            }
                          }}
                          className="rounded-lg border border-line bg-background px-3 py-2 text-[12px] text-foreground"
                        >
                          <option value="system_admin">System Admin</option>
                          <option value="hospital_admin">Hospital Admin</option>
                          <option value="police_admin">Police Admin</option>
                          <option value="fire_admin">Fire Admin</option>
                          <option value="ambulance_driver">Ambulance Driver</option>
                        </select>
                        <select
                          value={editStationID}
                          onChange={(e) => setEditStationID(e.target.value)}
                          className="sm:col-span-2 rounded-lg border border-line bg-background px-3 py-2 text-[12px] text-foreground"
                        >
                          <option value="">No station</option>
                          {(() => {
                            const allowed = roleToStationType(editRole);
                            return safeStations
                              .filter((s) => !allowed || s.type === allowed)
                              .map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.name}
                                </option>
                              ));
                          })()}
                        </select>
                      </div>
                    ) : (
                      <>
                        <p className="truncate text-[13px] font-semibold text-foreground">
                          {u.name}
                        </p>
                        <p className="mt-1 text-[12px] text-muted">{u.email}</p>
                        <p className="mt-2 text-[11px] text-muted">
                          Role: {titleCase(u.role)}
                          {u.station_id ? ` · Station: ${u.station_id}` : ""}
                        </p>
                      </>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {editingUserID === u.id ? (
                      <>
                        <button
                          type="button"
                          onClick={() => void saveUser(u.id)}
                          disabled={!canMutate || pendingID === u.id}
                          className="rounded-md border border-line bg-panel-strong px-2.5 py-1 text-[11px] font-medium text-foreground disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingUserID("")}
                          disabled={pendingID === u.id}
                          className="rounded-md border border-line bg-background px-2.5 py-1 text-[11px] font-medium text-muted"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="rounded-md border border-line bg-background px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted">
                          {titleCase(u.role)}
                        </span>
                        <button
                          type="button"
                          onClick={() => beginEdit(u)}
                          disabled={!canMutate}
                          className="rounded-md border border-line bg-background px-2.5 py-1 text-[11px] font-medium text-muted disabled:opacity-50"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void removeUser(u.id)}
                          disabled={!canMutate || pendingID === u.id}
                          className="rounded-md border border-danger/20 bg-danger/10 px-2.5 py-1 text-[11px] font-medium text-danger disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <ConfirmModal
        open={!!pendingID}
        title="Delete user"
        description="Are you sure you want to delete this user? This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        loading={false}
        onConfirm={() => void confirmRemoveUser()}
        onCancel={() => cancelRemoveUser()}
      />
    </div>
  );
}

