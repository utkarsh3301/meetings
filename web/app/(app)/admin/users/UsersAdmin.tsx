"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { label } from "@/lib/format";

type User = { id: string; name: string; email: string; role: string; active: boolean };

export function UsersAdmin({ users, meId }: { users: User[]; meId: string }) {
  const router = useRouter();
  const [error, setError] = useState("");

  async function act(fn: () => Promise<unknown>) {
    setError("");
    try {
      await fn();
      router.refresh();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  }

  return (
    <div className="space-y-6">
      <form
        className="card grid max-w-3xl gap-3 p-5 sm:grid-cols-[1fr_1fr_1fr_auto_auto] sm:items-end"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const f = new FormData(form);
          const ok = await act(() =>
            api("/api/users", "POST", { name: f.get("name"), email: f.get("email"), password: f.get("password"), role: f.get("role") }),
          );
          if (ok) form.reset();
        }}
      >
        <label><span className="label">Name</span><input name="name" className="input" required /></label>
        <label><span className="label">Email</span><input name="email" type="email" className="input" required /></label>
        <label><span className="label">Password</span><input name="password" type="password" minLength={8} className="input" required /></label>
        <label>
          <span className="label">Role</span>
          <select name="role" className="input"><option value="MEMBER">member</option><option value="ADMIN">admin</option></select>
        </label>
        <button className="btn">Add user</button>
      </form>
      {error && <p className="text-sm text-alert">{error}</p>}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>{["Name", "Email", "Role", "Status", ""].map((h) => <th key={h} className="th">{h}</th>)}</tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className={u.active ? "" : "opacity-50"}>
                <td className="td font-medium">{u.name}</td>
                <td className="td">{u.email}</td>
                <td className="td">{label(u.role)}</td>
                <td className="td font-mono text-xs uppercase">{u.active ? "active" : "deactivated"}</td>
                <td className="td">
                  <div className="flex flex-wrap gap-3 text-xs">
                    <button className="link" onClick={() => {
                      const password = prompt(`New password for ${u.email} (8+ characters)`);
                      if (password) act(() => api(`/api/users/${u.id}`, "PATCH", { password }));
                    }}>Reset password</button>
                    {u.id !== meId && (
                      <>
                        <button className="link" onClick={() => act(() => api(`/api/users/${u.id}`, "PATCH", { role: u.role === "ADMIN" ? "MEMBER" : "ADMIN" }))}>
                          {u.role === "ADMIN" ? "Make member" : "Make admin"}
                        </button>
                        <button className="link" onClick={() => act(() => api(`/api/users/${u.id}`, "PATCH", { active: !u.active }))}>
                          {u.active ? "Deactivate" : "Reactivate"}
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
