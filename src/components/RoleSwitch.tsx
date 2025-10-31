import React, { useEffect, useState } from "react";
import { auth, db } from "../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot, getDoc } from "firebase/firestore";

export default function RoleSwitch() {
  const [status, setStatus] = useState<"boot"|"noauth"|"listen"|"got"|"fallback"|"error">("boot");
  const [msg, setMsg] = useState<string>("Memeriksa status…");

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setStatus("noauth");
        setMsg("Belum login.");
        return;
      }

      const userRef = doc(db, "users", u.uid);
      setStatus("listen");
      setMsg("Membaca profil pengguna…");

      // 1) Realtime snapshot
      const unsubDoc = onSnapshot(
        userRef,
        (snap) => {
          if (!snap.exists()) {
            setMsg("Profil belum ada. Menunggu pembuatan profil…");
            return;
          }
          const data: any = snap.data();
          const role = data?.role === "admin" ? "admin" : "student";
          setStatus("got");
          go(role);
        },
        async (err) => {
          console.error("[RoleSwitch] onSnapshot error:", err);
          setStatus("error");
          setMsg("Gagal membaca profil realtime. Mencoba fallback…");

          // 2) Fallback: one-time getDoc
          try {
            const s2 = await getDoc(userRef);
            if (s2.exists()) {
              const data: any = s2.data();
              const role = data?.role === "admin" ? "admin" : "student";
              setStatus("fallback");
              go(role);
              return;
            }
            // 3) Jika tetap tidak ada dokumen, anggap student agar tidak nyangkut
            setStatus("fallback");
            go("student");
          } catch (e) {
            console.error("[RoleSwitch] getDoc fallback error:", e);
            // 4) Last resort: tetap student
            setStatus("fallback");
            go("student");
          }
        }
      );

      // hard timeout: kalau 1.5s tidak ada role, fallback fetch sekali
      const to = setTimeout(async () => {
        if (status === "listen") {
          try {
            const s2 = await getDoc(userRef);
            if (s2.exists()) {
              const data: any = s2.data();
              const role = data?.role === "admin" ? "admin" : "student";
              setStatus("fallback");
              go(role);
            } else {
              setStatus("fallback");
              go("student");
            }
          } catch {
            setStatus("fallback");
            go("student");
          }
        }
      }, 1500);

      return () => {
        clearTimeout(to);
        unsubDoc();
      };
    });

    return () => unsubAuth();
  }, []); // eslint-disable-line

  function go(role: "admin"|"student") {
    const target = role === "admin" ? "/admin" : "/student";
    const here = window.location.pathname;
    if (here.startsWith(target)) return;

    // multi-try redirect (beberapa env strict)
    try { window.location.replace(target); } catch {}
    setTimeout(() => { if (!window.location.pathname.startsWith(target)) window.location.assign(target); }, 120);
    setTimeout(() => { if (!window.location.pathname.startsWith(target)) (window as any).location = target; }, 300);
  }

  return (
    <div className="min-h-[30vh] grid place-items-center">
      <div className="text-center opacity-80">
        <div className="font-semibold">Mengalihkan ke dashboard…</div>
        <div className="text-sm mt-1">{msg}</div>
        <div className="text-xs mt-2 opacity-60">Status: {status}</div>
      </div>
    </div>
  );
}
