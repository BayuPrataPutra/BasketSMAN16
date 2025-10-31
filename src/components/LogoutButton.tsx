import React from "react";
import { signOut } from "firebase/auth";
import { auth } from "../lib/firebase";

export default function LogoutButton() {
  const handleLogout = async () => {
    await signOut(auth);
  };

  return (
    <button
      onClick={handleLogout}
      className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-sm transition"
    >
      Logout
    </button>
  );
}
