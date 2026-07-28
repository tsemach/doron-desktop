"use client";

import { useEffect, useState } from "react";
import { Users as UsersIcon, Loader2 } from "lucide-react";
import EditUserModal from "../../../components/users/EditUserModal";
import DeleteUserModal from "../../../components/users/DeleteUserModal";
import KebabMenu from "../../../components/KebabMenu";
import type { BackendUser } from "../../../components/users/types";

// Styling mirrors app/(dashboard)/templates/page.tsx's table/card look, but
// reads/writes apps/backend's `users` table (via lib/backendDb.ts), not
// office's own database.
export default function UsersPage() {
  const [users, setUsers] = useState<BackendUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingUser, setEditingUser] = useState<BackendUser | null>(null);
  const [deletingUser, setDeletingUser] = useState<BackendUser | null>(null);

  async function fetchUsers() {
    try {
      setLoading(true);
      const res = await fetch("/api/users");
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      }
    } catch (err) {
      console.error("Failed to fetch users:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchUsers();
  }, []);

  return (
    <div className="flex-1 w-full max-w-7xl mx-auto px-6 py-10 flex flex-col gap-8">
      <div className="flex items-center justify-between border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800">Users</h1>
          <p className="text-sm text-slate-500">Manage Ascurix customer accounts (apps/backend database).</p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm min-h-[400px]">
        <h2 className="text-lg font-semibold mb-4 text-slate-800 flex items-center gap-2">
          <UsersIcon className="size-5 text-teal-600" />
          Registered Users ({users.length})
        </h2>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-2">
            <Loader2 className="size-8 animate-spin text-teal-700" />
            <span className="text-sm">Loading users...</span>
          </div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-1 border border-dashed border-slate-200 rounded-lg">
            <UsersIcon className="size-12 stroke-[1.2] text-slate-300 mb-2" />
            <p className="font-medium text-sm">No users found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-medium">
                  <th className="py-3 px-4">Name</th>
                  <th className="py-3 px-4">Email</th>
                  <th className="py-3 px-4">Tier</th>
                  <th className="py-3 px-4">Created</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="py-3.5 px-4 font-semibold text-slate-800">{user.name || "—"}</td>
                    <td className="py-3.5 px-4 text-slate-600">{user.email}</td>
                    <td className="py-3.5 px-4">
                      <span className="flex items-center gap-1.5 text-xs bg-slate-100 px-2 py-0.5 rounded-full w-fit capitalize">
                        {user.tier}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-500 text-xs">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <KebabMenu
                        editLabel="Edit user"
                        deleteLabel="Delete user"
                        onEdit={() => setEditingUser(user)}
                        onDelete={() => setDeletingUser(user)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editingUser && (
        <EditUserModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSaved={(updated) => {
            setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
            setEditingUser(null);
          }}
        />
      )}

      {deletingUser && (
        <DeleteUserModal
          user={deletingUser}
          onCancel={() => setDeletingUser(null)}
          onDeleted={(id) => {
            setUsers((prev) => prev.filter((u) => u.id !== id));
            setDeletingUser(null);
          }}
        />
      )}
    </div>
  );
}
