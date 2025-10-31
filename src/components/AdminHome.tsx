import React, { useEffect, useMemo, useState } from "react";
import { db } from "../lib/firebase";
import {
  addDoc,
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  Timestamp,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";

// ===== Types =====
type UserDoc = {
  id: string;
  name: string;
  email?: string | null;
  role: "student" | "admin";
  deleted?: boolean;
};

type SessionDoc = {
  id: string;
  title: string;
  date: any; // Firestore Timestamp | Date
  location?: { lat: number; lng: number } | null;
  note?: string | null;
};

type AttendanceDoc = {
  id: string;
  sessionId: string;
  uid: string;
  name: string;
  status: "present" | "excused";
  reason?: string | null;
  createdAt?: any;
};

// Lokasi default: SMAN 16 Bandung (Mekarsari, Kiaracondong)
const DEFAULT_LOCATION = { lat: -6.9273429, lng: 107.6559513 }; // dekat Jl. Mekarsari
const DEFAULT_RADIUS_METERS = 200;

const toDate = (v: any) => (v && typeof v.toDate === "function" ? v.toDate() : new Date(v));
const fmtID = (d: Date) =>
  d.toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "full", timeStyle: "short" });

export default function AdminHome() {
  // ===== Data state =====
  const [students, setStudents] = useState<UserDoc[]>([]);
  const [sessions, setSessions] = useState<SessionDoc[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [attendance, setAttendance] = useState<AttendanceDoc[]>([]);

  // === Dialog State ===
  const [dialog, setDialog] = useState<{
    open: boolean;
    type: "success" | "error";
    title: string;
    message: string;
  }>({ open: false, type: "success", title: "", message: "" });

  function showSuccess(title: string, message: string) {
    setDialog({ open: true, type: "success", title, message });
  }
  function showError(title: string, message: string) {
    setDialog({ open: true, type: "error", title, message });
  }

  // ===== Quick load: students & sessions (realtime) =====
  useEffect(() => {
    const qUsers = query(collection(db, "users"), where("deleted", "!=", true));
    const unsubUsers = onSnapshot(qUsers, (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as any) }))
        .filter((u: any) => u.role !== "admin");
      setStudents(list as UserDoc[]);
    });

    const qSessions = query(collection(db, "sessions"), orderBy("date", "desc"), limit(30));
    const unsubSessions = onSnapshot(qSessions, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as SessionDoc[];
      setSessions(list);
      if (!selectedSessionId && list.length > 0) setSelectedSessionId(list[0].id);
    });

    return () => {
      unsubUsers();
      unsubSessions();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ===== Load attendance for selected session (realtime) =====
  useEffect(() => {
    if (!selectedSessionId) return;
    const qAtt = query(collection(db, "attendance"), where("sessionId", "==", selectedSessionId));
    const unsub = onSnapshot(qAtt, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as AttendanceDoc[];
      setAttendance(list);
    });
    return () => unsub();
  }, [selectedSessionId]);

  const selectedSession = useMemo(
    () => sessions.find((s) => s.id === selectedSessionId) || null,
    [sessions, selectedSessionId]
  );

  // ===== Derived: recap =====
  const present = attendance.filter((a) => a.status === "present");
  const excused = attendance.filter((a) => a.status === "excused");
  const attendedUids = new Set(attendance.map((a) => a.uid));
  const notAttended = students.filter((s) => !attendedUids.has(s.id));

  // ===== Create Session =====
  const [title, setTitle] = useState("");
  const [dateStr, setDateStr] = useState(""); // yyyy-mm-ddThh:mm (local)
  const [lat, setLat] = useState<string>("");
  const [lng, setLng] = useState<string>("");
  const [note, setNote] = useState("");
  const [savingSession, setSavingSession] = useState(false);

 const createSession = async () => {
  if (!title || !dateStr) {
    showError("Gagal membuat sesi", "Isi judul dan tanggal terlebih dahulu.");
    return;
  }
  setSavingSession(true);
  try {
    const when = Timestamp.fromDate(new Date(dateStr));
    const previousTitle = title.trim();

    // ⬇️ pakai lokasi default jika lat/lng kosong
    const hasLatLng = lat.trim() !== "" && lng.trim() !== "";
    const location = hasLatLng ? { lat: Number(lat), lng: Number(lng) } : DEFAULT_LOCATION;

    const docRef = await addDoc(collection(db, "sessions"), {
      title: previousTitle,
      date: when,
      location,
      radiusMeters: DEFAULT_RADIUS_METERS, // radius tetap 200m
      note: note.trim() || null,
      createdAt: serverTimestamp(),
    });

    showSuccess(
      "Sesi berhasil dibuat",
      `ID: ${docRef.id}\nJudul: ${previousTitle || "(tanpa judul)"}\nLokasi: ${location.lat}, ${location.lng}${
        hasLatLng ? "" : " (default SMAN 16 Bandung)"
      }\nRadius: ${DEFAULT_RADIUS_METERS} m`
    );

    setTitle(""); setDateStr(""); setLat(""); setLng(""); setNote("");
  } catch (e: any) {
    console.error("[createSession] error:", e);
    showError("Gagal membuat sesi", e?.message || "Terjadi kesalahan. Coba lagi.");
  } finally {
    setSavingSession(false);
  }
};


  // ===== Admin mark attendance =====
  const [pickUid, setPickUid] = useState<string>("");
  const [reason, setReason] = useState("");
  const [savingAtt, setSavingAtt] = useState(false);

  const adminMark = async (status: "present" | "excused") => {
    if (!selectedSession) return showError("Tidak ada sesi", "Pilih sesi terlebih dahulu.");
    if (!pickUid) return showError("Belum pilih siswa", "Pilih siswa yang ingin ditandai.");
    const stu = students.find((s) => s.id === pickUid);
    if (!stu) return showError("Siswa tidak ditemukan", "Data siswa tidak ada.");
    if (status === "excused" && reason.trim().length < 3)
      return showError("Alasan terlalu singkat", "Tulis alasan izin minimal 3 karakter.");

    setSavingAtt(true);
    try {
      const attendanceId = `${selectedSession.id}_${pickUid}`;
      await setDoc(
        doc(db, "attendance", attendanceId),
        {
          sessionId: selectedSession.id,
          uid: pickUid,
          name: stu.name,
          status,
          reason: status === "excused" ? reason.trim() : null,
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );
      setReason("");
      showSuccess("Absensi disimpan", `${stu.name} → ${status === "present" ? "Hadir" : "Izin"}`);
    } catch (e: any) {
      console.error(e);
      showError("Gagal menyimpan absensi", e?.message || "Coba lagi.");
    } finally {
      setSavingAtt(false);
    }
  };

  // ===== Export CSV =====
  const exportCsv = () => {
    if (!selectedSession) return;
    const rows = [
      ["sessionId", "uid", "name", "status", "reason", "createdAt"],
      ...attendance.map((a) => [
        a.sessionId,
        a.uid,
        a.name,
        a.status,
        a.reason || "",
        a.createdAt?.toDate ? a.createdAt.toDate().toISOString() : "",
      ]),
    ];
    const csv = rows.map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance_${selectedSession.id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* ===== Quick stats ===== */}
      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl bg-slate-800 p-4">
          <div className="text-sm opacity-70">Total Siswa</div>
          <div className="text-3xl font-bold">{students.length}</div>
        </div>
        <div className="rounded-2xl bg-slate-800 p-4">
          <div className="text-sm opacity-70">Total Sesi</div>
          <div className="text-3xl font-bold">{sessions.length}</div>
        </div>
        <div className="rounded-2xl bg-slate-800 p-4">
          <div className="text-sm opacity-70">Sesi Terpilih</div>
          <div className="font-semibold">
            {selectedSession ? (
              <>
                {selectedSession.title} · <span className="opacity-80">{fmtID(toDate(selectedSession.date))}</span>
              </>
            ) : (
              <span className="opacity-60">—</span>
            )}
          </div>
        </div>
      </section>

      {/* ===== Create session ===== */}
      <section className="rounded-2xl bg-slate-800 p-4 space-y-3">
        <h2 className="text-lg font-semibold">Buat Sesi Latihan</h2>
        <div className="grid md:grid-cols-2 gap-3">
          <input
            className="p-2 rounded bg-slate-900"
            placeholder="Judul sesi"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <input
            className="p-2 rounded bg-slate-900"
            type="datetime-local"
            value={dateStr}
            onChange={(e) => setDateStr(e.target.value)}
          />
          <input
            className="p-2 rounded bg-slate-900"
            placeholder="Lat (opsional, default: -6.9273429)"
            value={lat}
            onChange={(e) => setLat(e.target.value)}
          />
          <input
            className="p-2 rounded bg-slate-900"
            placeholder="Lng (opsional, default: 107.6559513)"
            value={lng}
            onChange={(e) => setLng(e.target.value)}
          />
          <input
            className="p-2 rounded bg-slate-900 md:col-span-2"
            placeholder="Catatan (opsional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <button
            className="px-4 py-2 rounded-xl bg-emerald-600 disabled:opacity-60"
            disabled={savingSession}
            onClick={createSession}
          >
            {savingSession ? "Menyimpan…" : "Buat Sesi"}
          </button>
        </div>
      </section>

      {/* ===== Sessions list & pick ===== */}
      <section className="rounded-2xl bg-slate-800 p-4 space-y-3">
        <h2 className="text-lg font-semibold">Daftar Sesi</h2>
        {sessions.length === 0 ? (
          <p className="text-sm opacity-70">Belum ada sesi.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left opacity-70">
                  <th className="py-2 pr-4">Judul</th>
                  <th className="py-2 pr-4">Tanggal</th>
                  <th className="py-2 pr-4">Pilih</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id} className="border-t border-slate-700">
                    <td className="py-2 pr-4">{s.title}</td>
                    <td className="py-2 pr-4">{fmtID(toDate(s.date))}</td>
                    <td className="py-2 pr-4">
                      <button
                        className={`px-3 py-1 rounded-xl ${
                          selectedSessionId === s.id ? "bg-blue-600" : "bg-slate-600"
                        }`}
                        onClick={() => setSelectedSessionId(s.id)}
                      >
                        Pilih
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ===== Recap for selected session ===== */}
      <section className="rounded-2xl bg-slate-800 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Rekap Absensi Sesi</h2>
          <div className="text-sm opacity-80">
            Hadir: <b>{present.length}</b> · Izin: <b>{excused.length}</b> · Belum absen: <b>{notAttended.length}</b>
          </div>
        </div>

        {!selectedSession ? (
          <p className="text-sm opacity-70">Pilih sesi untuk melihat rekap.</p>
        ) : (
          <div className="grid md:grid-cols-3 gap-4">
            <div className="rounded-xl bg-slate-900 p-3">
              <div className="font-semibold mb-2">Hadir</div>
              {present.length === 0 ? (
                <div className="text-sm opacity-70">—</div>
              ) : (
                <ul className="text-sm space-y-1">
                  {present.map((a) => (
                    <li key={a.id}>{a.name}</li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-xl bg-slate-900 p-3">
              <div className="font-semibold mb-2">Izin</div>
              {excused.length === 0 ? (
                <div className="text-sm opacity-70">—</div>
              ) : (
                <ul className="text-sm space-y-1">
                  {excused.map((a) => (
                    <li key={a.id}>
                      <div className="flex items-start justify-between gap-2">
                        <span>{a.name}</span>
                        {a.reason && <span className="opacity-70 text-xs">{a.reason}</span>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-xl bg-slate-900 p-3">
              <div className="font-semibold mb-2">Belum Absen</div>
              {notAttended.length === 0 ? (
                <div className="text-sm opacity-70">—</div>
              ) : (
                <ul className="text-sm space-y-1">
                  {notAttended.map((u) => (
                    <li key={u.id}>{u.name}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* Actions: admin mark & export */}
        <div className="mt-4 flex flex-col md:flex-row gap-3 md:items-end">
          <div className="flex-1">
            <label className="text-xs opacity-70">Pilih siswa untuk tandai</label>
            <select
              className="w-full p-2 rounded bg-slate-900 mt-1"
              value={pickUid}
              onChange={(e) => setPickUid(e.target.value)}
            >
              <option value="">— Pilih siswa —</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="text-xs opacity-70">Alasan izin (opsional / wajib untuk izin)</label>
            <input
              className="w-full p-2 rounded bg-slate-900 mt-1"
              placeholder="Alasan izin…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <button
              className="px-4 py-2 rounded-xl bg-emerald-600 disabled:opacity-60"
              disabled={savingAtt || !selectedSession}
              onClick={() => adminMark("present")}
            >
              Tandai Hadir
            </button>
            <button
              className="px-4 py-2 rounded-xl bg-amber-600 disabled:opacity-60"
              disabled={savingAtt || !selectedSession}
              onClick={() => adminMark("excused")}
            >
              Tandai Izin
            </button>
            <button
              className="px-4 py-2 rounded-xl bg-slate-700 disabled:opacity-60"
              disabled={!selectedSession}
              onClick={exportCsv}
            >
              Export CSV
            </button>
          </div>
        </div>
      </section>

      {/* === Modal feedback === */}
      {dialog.open && (
        <div className="fixed inset-0 z-999 bg-black/60 grid place-items-center p-4">
          <div className="w-full max-w-md rounded-2xl p-5 bg-slate-800">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold">
                {dialog.type === "success" ? "✅ " : "⚠️ "}
                {dialog.title}
              </h3>
              <button
                className="px-3 py-1 rounded bg-slate-700 hover:bg-slate-600 text-sm"
                onClick={() => setDialog({ ...dialog, open: false })}
              >
                Tutup
              </button>
            </div>

            <pre className="whitespace-pre-wrap text-sm opacity-90 mt-3">{dialog.message}</pre>

            <div className="mt-4 flex justify-end">
              <button
                className={`px-4 py-2 rounded-xl text-sm ${
                  dialog.type === "success" ? "bg-emerald-600" : "bg-rose-600"
                }`}
                onClick={() => setDialog({ ...dialog, open: false })}
              >
                Oke
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
