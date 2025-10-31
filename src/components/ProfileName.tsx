import React, { useEffect, useState } from "react";
import { auth, db } from "../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";

export default function ProfileName({ greeting = true }: { greeting?: boolean }) {
  const [name, setName] = useState<string>("");

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      if (!u) { setName(""); return; }
      const unsubDoc = onSnapshot(doc(db, "users", u.uid), (snap) => {
        // urutan prioritas: nama di users -> displayName auth -> potongan email -> "Pengguna"
        const data = snap.exists() ? snap.data() as any : {};
        const fallbackFromAuth = u.displayName || (u.email ? u.email.split("@")[0] : "");
        setName((data?.name || fallbackFromAuth || "Pengguna") as string);
      });
      return () => unsubDoc();
    });
    return () => unsubAuth();
  }, []);

  if (!name) return null;

  return (
    <div className="flex items-center gap-2">
      <div className="h-8 w-8 rounded-full bg-slate-700 grid place-items-center text-sm">
        {name.charAt(0).toUpperCase()}
      </div>
      <div className="text-sm">
        {greeting ? <>Halo, <span className="font-semibold">{name}</span></> : <span className="font-semibold">{name}</span>}
      </div>
    </div>
  );
}
