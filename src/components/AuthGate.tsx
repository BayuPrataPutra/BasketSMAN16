import React, { useEffect, useMemo, useState } from "react";
import { auth, db, googleProvider } from "../lib/firebase";
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { doc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";

/** =======================
 *  Auth Gate (UI Enhanced)
 *  ======================= */
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [profileReady, setProfileReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (!u) {
        setProfile(null);
        setProfileReady(true);
        setLoading(false);
        return;
      }
      const unsubUser = onSnapshot(
        doc(db, "users", u.uid),
        (snap) => {
          setProfile(snap.exists() ? snap.data() : null);
          setProfileReady(true);
          setLoading(false);
        },
        (e) => {
          console.error("[AuthGate] onSnapshot error:", e);
          setErr(e?.message || String(e));
          setProfile(null);
          setProfileReady(true);
          setLoading(false);
        }
      );
      (window as any).__unsubUserDoc?.();
      (window as any).__unsubUserDoc = unsubUser;
    });

    return () => {
      unsubAuth();
      (window as any).__unsubUserDoc?.();
      (window as any).__unsubUserDoc = undefined;
    };
  }, []);

  const enforceRedirect = (target: string) => {
    try {
      window.location.replace(target);
    } catch {}
    setTimeout(() => {
      if (!window.location.pathname.startsWith(target))
        window.location.assign(target);
    }, 120);
    setTimeout(() => {
      if (!window.location.pathname.startsWith(target))
        (window as any).location = target;
    }, 300);
  };

  // Loading
  if (loading) {
    return (
      <FullScreenShell>
        <CardGlass className="w-full max-w-sm text-center space-y-3">
          <Spinner />
          <div className="text-sm opacity-80">Memuat sesi autentikasi…</div>
        </CardGlass>
      </FullScreenShell>
    );
  }

  // Error
  if (err) {
    return (
      <FullScreenShell>
        <CardGlass className="w-full max-w-md">
          <h2 className="text-lg font-semibold">Autentikasi Gagal</h2>
          <p
            className="mt-1 text-sm text-rose-300 wrap-break-words"
            aria-live="polite"
          >
            {err}
          </p>
          <div className="mt-4">
            <button
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 transition"
              onClick={() => location.reload()}
            >
              Muat ulang
            </button>
          </div>
        </CardGlass>
      </FullScreenShell>
    );
  }

  // Belum login → Auth Screen
  if (!user) return <AuthScreen />;

  // Login tapi belum punya dokumen profil → Onboarding
  if (user && profileReady && !profile) {
    return <Onboarding uid={user.uid} email={user.email} />;
  }

  // Enforce route berdasarkan role
  if (user && profileReady && profile) {
    if (typeof window !== "undefined") {
      const rawRole = typeof profile?.role === "string" ? profile.role : "";
      const role =
        rawRole.trim().toLowerCase() === "admin" ? "admin" : "student";
      const path = window.location.pathname;

      const target = role === "admin" ? "/admin" : "/student";
      const onHome = path === "/";
      const onStudent = path.startsWith("/student");
      const onAdmin = path.startsWith("/admin");

      if (onHome && !path.startsWith(target)) {
        enforceRedirect(target);
        return (
          <FullScreenShell>
            <CardGlass className="w-full max-w-sm text-center">
              <div className="opacity-80">Mengalihkan ke dashboard {role}…</div>
            </CardGlass>
          </FullScreenShell>
        );
      }

      if (onStudent && role === "admin") {
        enforceRedirect("/admin");
        return (
          <FullScreenShell>
            <CardGlass className="w-full max-w-sm text-center">
              <div className="opacity-80">Mengalihkan ke dashboard admin…</div>
            </CardGlass>
          </FullScreenShell>
        );
      }
      if (onAdmin && role === "student") {
        enforceRedirect("/student");
        return (
          <FullScreenShell>
            <CardGlass className="w-full max-w-sm text-center">
              <div className="opacity-80">Mengalihkan ke dashboard siswa…</div>
            </CardGlass>
          </FullScreenShell>
        );
      }
    }
  }

  // Path sesuai → render halaman
  return <>{children}</>;
}

/** ================
 *  Auth Screen UI
 *  ================ */
function AuthScreen() {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<"google" | "login" | "register" | null>(
    null
  );

  const doEmailLogin = async () => {
    setMsg(null);
    setBusy("login");
    try {
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (e: any) {
      setMsg(e?.message || String(e));
    } finally {
      setBusy(null);
    }
  };

  const doEmailRegister = async () => {
    setMsg(null);
    setBusy("register");
    try {
      await createUserWithEmailAndPassword(auth, email, pass);
    } catch (e: any) {
      setMsg(e?.message || String(e));
    } finally {
      setBusy(null);
    }
  };

  const doGoogle = async () => {
    setMsg(null);
    setBusy("google");
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e: any) {
      setMsg(e?.message || String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <FullScreenShell>
      <CardGlass className="w-full max-w-md">
        <div className="space-y-4" aria-live="polite">
          {msg && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-900/20 px-3 py-2 text-sm text-rose-200">
              {msg}
            </div>
          )}

          <Button
            onClick={doGoogle}
            disabled={!!busy}
            variant="light"
            className="w-full flex items-center justify-center gap-2"
            title="Masuk dengan Google"
          >
            {busy === "google" ? <Spinner small /> : <GoogleIcon />}
            <span>Masuk dengan Google</span>
          </Button>

          <div className="relative my-2">
            <div className="h-px w-full bg-white/10" />
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-slate-900 px-2 text-xs text-zinc-400">
              atau
            </span>
          </div>

          <Field label="Email">
            <input
              className="w-full h-11 rounded-xl bg-slate-900/80 border border-white/10 px-3 outline-none focus:border-pink-400 transition"
              placeholder="nama@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              inputMode="email"
              autoComplete="email"
            />
          </Field>

          <Field label="Password">
            <div className="relative">
              <input
                className="w-full h-11 rounded-xl bg-slate-900/80 border border-white/10 px-3 pr-10 outline-none focus:border-pink-400 transition"
                type={showPass ? "text" : "password"}
                placeholder="••••••••"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                className="absolute inset-y-0 right-2 my-auto h-7 w-7 grid place-items-center rounded-lg hover:bg-white/5"
                aria-label={
                  showPass ? "Sembunyikan password" : "Tampilkan password"
                }
                title={showPass ? "Sembunyikan password" : "Tampilkan password"}
              >
                {showPass ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </Field>

          <div className="flex gap-2 pt-1">
            <Button onClick={doEmailLogin} disabled={!!busy} className="flex-1">
              {busy === "login" ? <Spinner small /> : "Login"}
            </Button>
            <Button
              onClick={doEmailRegister}
              disabled={!!busy}
              variant="success"
              className="flex-1"
            >
              {busy === "register" ? <Spinner small /> : "Daftar"}
            </Button>
          </div>
        </div>
      </CardGlass>
    </FullScreenShell>
  );
}

/** ==================
 *  Onboarding Screen
 *  ================== */
function Onboarding({ uid, email }: { uid: string; email: string | null }) {
  const [name, setName] = useState("");
  const [cohortYear, setCohortYear] = useState<number | "">("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const disabled = useMemo(
    () => !name || !cohortYear || saving,
    [name, cohortYear, saving]
  );

  const save = async () => {
    setMsg(null);
    if (!name || !cohortYear) {
      setMsg("Nama dan Tahun Angkatan wajib diisi");
      return;
    }
    try {
      setSaving(true);
      await setDoc(doc(db, "users", uid), {
        name,
        cohortYear: Number(cohortYear),
        role: "student",
        email: email ?? null,
        deleted: false,
        createdAt: serverTimestamp(),
      });
    } catch (e: any) {
      setMsg(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <FullScreenShell>

      <CardGlass className="w-full max-w-md space-y-4" aria-live="polite">
        {msg && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-900/20 px-3 py-2 text-sm text-rose-200">
            {msg}
          </div>
        )}

        <Field label="Nama Lengkap">
          <input
            className="w-full h-11 rounded-xl bg-slate-900/80 border border-white/10 px-3 outline-none focus:border-pink-400 transition"
            placeholder="Nama Lengkap"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>

        <Field label="Tahun Angkatan">
          <input
            className="w-full h-11 rounded-xl bg-slate-900/80 border border-white/10 px-3 outline-none focus:border-pink-400 transition"
            type="number"
            placeholder="mis. 2024"
            value={cohortYear}
            onChange={(e) => {
              const v = e.target.value;
              setCohortYear(v === "" ? "" : Number(v));
            }}
            min={2000}
            max={3000}
            inputMode="numeric"
          />
        </Field>

        <div className="flex gap-2 pt-1">
          <Button
            onClick={save}
            disabled={disabled}
            variant="success"
            className="flex-1"
          >
            {saving ? <Spinner small /> : "Simpan"}
          </Button>
          <Button
            onClick={() => signOut(auth)}
            variant="light"
            className="flex-1"
          >
            Keluar
          </Button>
        </div>
      </CardGlass>
    </FullScreenShell>
  );
}

/** ===========
 *  UI Primitives
 *  =========== */

function FullScreenShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Lapisan dasar: selaras dengan tema slate-900 */}
      <div className="absolute inset-0 bg-slate-900" />

      {/* Aksen gradasi lembut: pink brand (selaras dengan site-mu) */}
      <div
        className="
          pointer-events-none absolute inset-0
          bg-[radial-gradient(1200px_600px_at_120%_-10%,rgba(236,72,153,0.12),transparent),
              radial-gradient(900px_520px_at_-20%_110%,rgba(244,114,182,0.10),transparent)]
        "
      />

      {/* Grid tipis (subtle) biar modern */}
      <div
        className="
          pointer-events-none absolute inset-0
          [background-image:linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),
                             linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)]
          bg-size[24px_24px]
        "
      />

      {/* Vignette lembut supaya fokus ke kartu */}
      <div className="pointer-events-none absolute inset-0 bg-linear-to-b from-transparent via-transparent to-black/10" />

      {/* Konten */}
      <div className="relative z-10 flex min-h-screen items-center justify-center p-6">
        {children}
      </div>
    </div>
  );
}

function CardGlass({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={
        "rounded-2xl bg-white/4 backdrop-blur-md border border-white/10 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.6)] p-6 " +
        className
      }
    >
      {children}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const id = useMemo(() => "f_" + Math.random().toString(36).slice(2, 9), []);
  return (
    <label className="block">
      <div className="mb-1 text-sm font-medium text-zinc-200">{label}</div>
      {React.cloneElement(children as any, { id })}
    </label>
  );
}

function Button({
  children,
  onClick,
  disabled,
  className = "",
  variant = "primary",
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  title?: string;
  variant?: "primary" | "success" | "light";
}) {
  const base =
    "px-4 py-2 rounded-xl font-medium transition focus:outline-none focus-visible:ring focus-visible:ring-pink-500 disabled:opacity-60 disabled:cursor-not-allowed";
  const styles =
    variant === "primary"
      ? "bg-blue-600 hover:bg-blue-500"
      : variant === "success"
      ? "bg-emerald-600 hover:bg-emerald-500"
      : "bg-slate-800 hover:bg-slate-700";
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

function Spinner({ small = false }: { small?: boolean }) {
  return (
    <span
      className={
        "inline-block animate-spin rounded-full border-t-transparent border-current " +
        (small ? "h-4 w-4 border-2" : "h-6 w-6 border-2")
      }
      aria-hidden="true"
    />
  );
}

/** Icons (inline, tanpa dependency) */
function GoogleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M12 10.2v3.7h5.3c-.2 1.3-1.6 3.7-5.3 3.7-3.2 0-5.9-2.6-5.9-5.9s2.6-5.9 5.9-5.9c1.8 0 3 .8 3.7 1.5l2.5-2.4C16.8 3.6 14.6 2.7 12 2.7 6.9 2.7 2.7 6.9 2.7 12S6.9 21.3 12 21.3c7 0 9.7-4.9 9.7-7.3 0-.5-.1-.9-.1-1.1H12z"
      />
    </svg>
  );
}
function EyeIcon() {
  return (
    <svg
      className="h-5 w-5 opacity-80"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
    >
      <path
        strokeWidth="1.8"
        d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"
      />
      <circle cx="12" cy="12" r="3" strokeWidth="1.8" />
    </svg>
  );
}
function EyeOffIcon() {
  return (
    <svg
      className="h-5 w-5 opacity-80"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
    >
      <path strokeWidth="1.8" d="M3 3l18 18" />
      <path strokeWidth="1.8" d="M10.6 10.6A3 3 0 0 0 12 15a3 3 0 0 0 3-3" />
      <path
        strokeWidth="1.8"
        d="M9.9 4.2A10.8 10.8 0 0 1 12 4c6.5 0 10 7 10 7a19.3 19.3 0 0 1-3.1 4.1M6.2 6.2A19.6 19.6 0 0 0 2 11s3.5 7 10 7c1.5 0 2.9-.3 4.1-.8"
      />
    </svg>
  );
}
