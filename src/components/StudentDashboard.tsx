import React, { useEffect, useState } from "react";
import { auth, db } from "../lib/firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  serverTimestamp,
  where,
} from "firebase/firestore";

type SessionDoc = {
  id: string;
  title: string;
  date: any;
  location?: { lat: number; lng: number } | null;
  radiusMeters?: number | null;
  note?: string;
};

type AttendanceDoc = {
  id: string;
  sessionId: string;
  uid: string;
  name: string;
  status: "present" | "excused";
  reason?: string | null;
  createdAt?: any;
  geo?: {
    lat: number;
    lng: number;
    accuracy?: number;
    distanceMeters?: number;
  } | null;
};

// Lokasi default SMA Negeri 16 Bandung
const DEFAULT_LOCATION = { lat: -6.898185420791878,  lng: 107.64542238620072 };
// Radius default (tidak perlu input admin)
const DEFAULT_RADIUS_METERS = 200;

const toDate = (v: any) =>
  v && typeof v.toDate === "function" ? v.toDate() : new Date(v);
const fmtID = (d: Date) =>
  d.toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    dateStyle: "full",
    timeStyle: "short",
  });

// Hitung jarak 2 koordinat (Haversine formula)
function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export default function StudentDashboard() {
  const [sessions, setSessions] = useState<SessionDoc[]>([]);
  const [activeSession, setActiveSession] = useState<SessionDoc | null>(null);
  const [myProfile, setMyProfile] = useState<{ name: string } | null>(null);
  const [myAttendance, setMyAttendance] = useState<AttendanceDoc | null>(null);
  const [loading, setLoading] = useState(true);

  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [geoMsg, setGeoMsg] = useState<string | null>(null);

  const uid = auth.currentUser?.uid || "";

  // === Load profile
  useEffect(() => {
    (async () => {
      if (!uid) return;
      const s = await getDoc(doc(db, "users", uid));
      const data = s.exists() ? (s.data() as any) : {};
      const fallback = auth.currentUser?.displayName || "Tanpa Nama";
      setMyProfile({ name: data?.name || fallback });
    })();
  }, [uid]);

  // === Load sessions
  useEffect(() => {
    (async () => {
      const sq = query(collection(db, "sessions"), orderBy("date", "desc"), limit(20));
      const ss = await getDocs(sq);
      const slist: SessionDoc[] = ss.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      setSessions(slist);

      const now = new Date();
      let chosen: SessionDoc | null = null;
      const futureSorted = slist
        .filter((s) => toDate(s.date).getTime() >= now.getTime() - 1000 * 60 * 60 * 24)
        .sort((a, b) => toDate(a.date).getTime() - toDate(b.date).getTime());
      chosen = futureSorted[0] || slist[0] || null;
      setActiveSession(chosen);
    })();
  }, []);

  // === Load attendance for current session
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        if (!uid || !activeSession) {
          setMyAttendance(null);
          return;
        }
        const id = `${activeSession.id}_${uid}`;
        const a = await getDoc(doc(db, "attendance", id));
        setMyAttendance(a.exists() ? ({ id: a.id, ...(a.data() as any) } as AttendanceDoc) : null);
      } finally {
        setLoading(false);
      }
    })();
  }, [uid, activeSession?.id]);

  // === Get current position
  const getCurrentPosition = () =>
    new Promise<GeolocationPosition>((resolve, reject) => {
      if (!("geolocation" in navigator)) {
        reject(new Error("Perangkat tidak mendukung Geolocation."));
        return;
      }
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 15000,
      });
    });

  // === Mark attendance (with geofence)
  const handleMark = async (status: "present" | "excused") => {
    if (!uid || !activeSession) return;
    if (!myProfile?.name) {
      alert("Nama profil tidak ditemukan.");
      return;
    }

    // Izin tidak perlu lokasi
    if (status === "excused" && reason.trim().length < 3) {
      alert("Tulis alasan izin (min. 3 karakter).");
      return;
    }

    let geoPayload: AttendanceDoc["geo"] = null;
    if (status === "present") {
      try {
        setGeoMsg("Memeriksa lokasi… mohon izinkan akses GPS.");
        const pos = await getCurrentPosition();
        const myLoc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const acc = pos.coords.accuracy ?? undefined;

        const sessionLoc = activeSession.location || DEFAULT_LOCATION;
        const radius = activeSession.radiusMeters ?? DEFAULT_RADIUS_METERS;
        const dist = Math.round(distanceMeters(myLoc, sessionLoc));

        geoPayload = { lat: myLoc.lat, lng: myLoc.lng, accuracy: acc, distanceMeters: dist };

        if (dist > radius) {
          setGeoMsg(`Lokasi di luar radius: ${dist} m (maks ${radius} m).`);
          alert("Tidak dapat absen: Anda tidak berada di lokasi sesi.");
          return;
        }

        setGeoMsg(`Lokasi OK: jarak ~${dist} m (batas ${radius} m).`);
      } catch (e: any) {
        console.error("[geofence] error:", e);
        setGeoMsg(e?.message || "Gagal mengakses lokasi.");
        alert("Tidak dapat mengambil lokasi. Aktifkan izin lokasi untuk absen hadir.");
        return;
      }
    }

    // Simpan absensi
    setSaving(true);
    try {
      const attendanceId = `${activeSession.id}_${uid}`;
      await setDoc(
        doc(db, "attendance", attendanceId),
        {
          sessionId: activeSession.id,
          uid,
          name: myProfile.name,
          status,
          reason: status === "excused" ? reason.trim() : null,
          geo: geoPayload,
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );
      const fresh = await getDoc(doc(db, "attendance", attendanceId));
      setMyAttendance(fresh.exists() ? ({ id: fresh.id, ...(fresh.data() as any) } as AttendanceDoc) : null);
      if (status === "present") setReason("");
      alert("Absensi tersimpan.");
    } catch (e: any) {
      console.error(e);
      alert(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  // === History (5 latest)
  const [history, setHistory] = useState<AttendanceDoc[]>([]);
  useEffect(() => {
    (async () => {
      if (!uid) return;
      const qh = query(collection(db, "attendance"), where("uid", "==", uid), orderBy("createdAt", "desc"), limit(5));
      const hs = await getDocs(qh);
      setHistory(hs.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as AttendanceDoc[]);
    })();
  }, [uid, myAttendance?.id]);

  return (
    <div className="space-y-6">
      {/* === Session Info === */}
      <section className="rounded-2xl bg-slate-800 p-4">
        <h2 className="text-xl font-semibold">Sesi Terdekat</h2>
        {!activeSession ? (
          <p className="text-sm opacity-70 mt-2">Belum ada sesi yang dijadwalkan.</p>
        ) : (
          <div className="mt-3 space-y-1">
            <div className="text-lg font-semibold">{activeSession.title}</div>
            <div className="text-sm opacity-80">{fmtID(toDate(activeSession.date))}</div>
            <div className="text-xs opacity-70">
              Lokasi: {(activeSession.location || DEFAULT_LOCATION).lat.toFixed(5)}, {(activeSession.location || DEFAULT_LOCATION).lng.toFixed(5)}
              {" · "}Radius: {(activeSession.radiusMeters ?? DEFAULT_RADIUS_METERS)} m
            </div>
            {activeSession.note && <div className="text-sm opacity-80">Catatan: {activeSession.note}</div>}
          </div>
        )}
      </section>

      {/* === Attendance === */}
      <section className="rounded-2xl bg-slate-800 p-4">
        <h2 className="text-xl font-semibold">Absensi Saya</h2>
        {!activeSession ? (
          <p className="text-sm opacity-70 mt-2">Tidak ada sesi untuk diabsen saat ini.</p>
        ) : loading ? (
          <p className="text-sm opacity-70 mt-2">Memeriksa status…</p>
        ) : myAttendance ? (
          <div className="mt-3">
            <div className="text-sm">
              Status:{" "}
              <span
                className={`px-2 py-1 rounded ${
                  myAttendance.status === "present" ? "bg-emerald-700" : "bg-amber-700"
                }`}
              >
                {myAttendance.status === "present" ? "Hadir" : "Izin"}
              </span>
            </div>
            {myAttendance.reason && <div className="text-sm opacity-80 mt-1">Alasan: {myAttendance.reason}</div>}
            {myAttendance.geo && (
              <div className="text-xs opacity-70 mt-1">
                Lokasi dicatat: {myAttendance.geo.lat.toFixed(5)}, {myAttendance.geo.lng.toFixed(5)} · jarak ~
                {Math.round(myAttendance.geo.distanceMeters || 0)} m
              </div>
            )}
            <div className="text-xs opacity-60 mt-1">
              Dicatat: {myAttendance.createdAt?.toDate ? fmtID(myAttendance.createdAt.toDate()) : "—"}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className="px-4 py-2 rounded-xl bg-emerald-600 disabled:opacity-60"
                disabled={saving}
                onClick={() => handleMark("present")}
              >
                Ubah ke Hadir (cek lokasi)
              </button>
              <div className="flex items-center gap-2">
                <input
                  className="p-2 rounded bg-slate-900"
                  placeholder="Alasan izin…"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
                <button
                  className="px-4 py-2 rounded-xl bg-amber-600 disabled:opacity-60"
                  disabled={saving}
                  onClick={() => handleMark("excused")}
                >
                  Ubah ke Izin
                </button>
              </div>
            </div>
            {geoMsg && <div className="text-xs opacity-70 mt-2">{geoMsg}</div>}
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            <div className="flex flex-wrap gap-2">
              <button
                className="px-4 py-2 rounded-xl bg-emerald-600 disabled:opacity-60"
                disabled={saving || !activeSession}
                onClick={() => handleMark("present")}
              >
                Absen Hadir (cek lokasi)
              </button>
              <div className="flex items-center gap-2">
                <input
                  className="p-2 rounded bg-slate-900"
                  placeholder="Alasan izin…"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
                <button
                  className="px-4 py-2 rounded-xl bg-amber-600 disabled:opacity-60"
                  disabled={saving || !activeSession}
                  onClick={() => handleMark("excused")}
                >
                  Absen Izin
                </button>
              </div>
            </div>
            {geoMsg && <div className="text-xs opacity-70">{geoMsg}</div>}
            <p className="text-xs opacity-60">Catatan: Absen Hadir membutuhkan izin lokasi aktif di perangkat.</p>
          </div>
        )}
      </section>

      {/* === History === */}
      <section className="rounded-2xl bg-slate-800 p-4">
        <h2 className="text-xl font-semibold">Riwayat Terakhir</h2>
        {history.length === 0 ? (
          <p className="text-sm opacity-70 mt-2">Belum ada riwayat.</p>
        ) : (
          <div className="overflow-x-auto mt-2">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left opacity-70">
                  <th className="py-2 pr-4">Sesi</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Alasan</th>
                  <th className="py-2 pr-4">Waktu</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-t border-slate-700">
                    <td className="py-2 pr-4">{h.sessionId}</td>
                    <td className="py-2 pr-4">
                      <span
                        className={`px-2 py-1 rounded ${
                          h.status === "present" ? "bg-emerald-700" : "bg-amber-700"
                        }`}
                      >
                        {h.status === "present" ? "Hadir" : "Izin"}
                      </span>
                    </td>
                    <td className="py-2 pr-4">{h.reason || "—"}</td>
                    <td className="py-2 pr-4">
                      {h.createdAt?.toDate ? fmtID(h.createdAt.toDate()) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
