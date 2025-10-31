import React, { useEffect, useState } from "react";
import { db } from "../lib/firebase";
import { collection, getDocs, orderBy, query, updateDoc, doc, where } from "firebase/firestore";

interface UserDoc {
  id: string;
  name: string;
  email?: string | null;
  role: "student" | "admin";
  deleted?: boolean;
}

export default function AdminUserRoles() {
  const [users, setUsers] = useState<UserDoc[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    const qy = query(collection(db, "users"), orderBy("name"));
    const snap = await getDocs(qy);
    setUsers(
      snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as any) }))
        .filter((u) => !u.deleted)
    );
  };

  useEffect(() => {
    load();
  }, []);

  const setRole = async (uid: string, role: "student" | "admin") => {
    try {
      setBusy(uid + role);
      await updateDoc(doc(db, "users", uid), { role });
      await load();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-2xl bg-slate-800 p-4 mt-4">
      <h2 className="text-lg font-semibold mb-3">Kelola Peran Pengguna</h2>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left opacity-70">
              <th className="py-2 pr-4">Nama</th>
              <th className="py-2 pr-4">Email</th>
              <th className="py-2 pr-4">Peran</th>
              <th className="py-2 pr-4">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-slate-700">
                <td className="py-2 pr-4">{u.name}</td>
                <td className="py-2 pr-4">{u.email || "—"}</td>
                <td className="py-2 pr-4">{u.role}</td>
                <td className="py-2 pr-4 flex gap-2">
                  <button
                    className="px-3 py-1 rounded-xl bg-blue-600 disabled:opacity-60"
                    disabled={busy === u.id + "admin" || u.role === "admin"}
                    onClick={() => setRole(u.id, "admin")}
                  >Jadikan Admin</button>
                  <button
                    className="px-3 py-1 rounded-xl bg-slate-600 disabled:opacity-60"
                    disabled={busy === u.id + "student" || u.role === "student"}
                    onClick={() => setRole(u.id, "student")}
                  >Jadikan Siswa</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs opacity-70 mt-3">Perubahan peran akan langsung berlaku. Jika sedang membuka halaman lain, pengguna mungkin perlu me-refresh.</p>
    </div>
  );
}
