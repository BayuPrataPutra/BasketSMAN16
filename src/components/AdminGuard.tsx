import React, { useEffect, useState } from "react";
import { auth, db } from "../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";

export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      if (!u) { setAllowed(false); hardRedirect("/"); return; }
      const unsubDoc = onSnapshot(doc(db, "users", u.uid), (snap) => {
        const raw = snap.exists() ? (snap.data() as any)?.role : "";
        const role = (typeof raw === "string" ? raw.trim().toLowerCase() : "");
        if (role === "admin") setAllowed(true);
        else { setAllowed(false); hardRedirect("/student"); }
      });
      return () => unsubDoc();
    });
    return () => unsubAuth();
  }, []);

  if (allowed === true) return <>{children}</>;
  return (
    <div className="min-h-[40vh] grid place-items-center p-6">
      <div className="opacity-80 text-center">Memeriksa akses…</div>
    </div>
  );
}

function hardRedirect(path: string) {
  try { window.location.replace(path); } catch {}
  setTimeout(() => { if (window.location.pathname !== path) window.location.assign(path); }, 120);
  setTimeout(() => { if (window.location.pathname !== path) (window as any).location = path; }, 300);
}
