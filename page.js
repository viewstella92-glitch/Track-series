"use client";

import { useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "series-tracker:data";

const STATUS = {
  watching: { label: "กำลังดู", cls: "status-watching" },
  done: { label: "ดูจบแล้ว", cls: "status-done" },
  paused: { label: "พักไว้", cls: "status-paused" },
  plan: { label: "อยากดู", cls: "status-plan" },
};

function loadSeries() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveSeries(list) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // ignore write errors (e.g. storage full/private mode)
  }
}

function emptyForm() {
  return {
    id: null,
    title: "",
    season: 1,
    currentEpisode: 0,
    totalEpisodes: "",
    status: "watching",
  };
}

export default function Page() {
  const [list, setList] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());

  useEffect(() => {
    setList(loadSeries());
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) saveSeries(list);
  }, [list, loaded]);

  const filtered = useMemo(() => {
    if (filter === "all") return list;
    return list.filter((s) => s.status === filter);
  }, [list, filter]);

  function openAddModal() {
    setForm(emptyForm());
    setModalOpen(true);
  }

  function openEditModal(series) {
    setForm({ ...series, totalEpisodes: series.totalEpisodes ?? "" });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
  }

  function handleSave(e) {
    e.preventDefault();
    if (!form.title.trim()) return;

    const payload = {
      id: form.id ?? crypto.randomUUID(),
      title: form.title.trim(),
      season: Number(form.season) || 1,
      currentEpisode: Number(form.currentEpisode) || 0,
      totalEpisodes: form.totalEpisodes === "" ? null : Number(form.totalEpisodes),
      status: form.status,
    };

    setList((prev) => {
      const exists = prev.some((s) => s.id === payload.id);
      if (exists) {
        return prev.map((s) => (s.id === payload.id ? payload : s));
      }
      return [payload, ...prev];
    });
    setModalOpen(false);
  }

  function handleDelete() {
    if (!form.id) return;
    setList((prev) => prev.filter((s) => s.id !== form.id));
    setModalOpen(false);
  }

  function updateEpisode(id, delta) {
    setList((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        let next = Math.max(0, s.currentEpisode + delta);
        if (s.totalEpisodes) next = Math.min(next, s.totalEpisodes);
        const status =
          s.totalEpisodes && next >= s.totalEpisodes ? "done" : s.status === "done" && next < s.totalEpisodes ? "watching" : s.status;
        return { ...s, currentEpisode: next, status };
      })
    );
  }

  function updateStatus(id, status) {
    setList((prev) => prev.map((s) => (s.id === id ? { ...s, status } : s)));
  }

  const counts = useMemo(() => {
    const c = { all: list.length, watching: 0, done: 0, paused: 0, plan: 0 };
    list.forEach((s) => {
      c[s.status] = (c[s.status] || 0) + 1;
    });
    return c;
  }, [list]);

  return (
    <div className="container">
      <header className="top">
        <div>
          <h1>📺 Series Tracker</h1>
          <p>แท็กซีรีย์ที่กำลังดู ดูถึงตอนไหนแล้ว — ข้อมูลเก็บไว้ในเบราว์เซอร์นี้เท่านั้น</p>
        </div>
        <button className="btn btn-primary" onClick={openAddModal}>
          + เพิ่มซีรีย์
        </button>
      </header>

      <div className="filters">
        {[
          ["all", "ทั้งหมด"],
          ["watching", STATUS.watching.label],
          ["paused", STATUS.paused.label],
          ["plan", STATUS.plan.label],
          ["done", STATUS.done.label],
        ].map(([key, label]) => (
          <button
            key={key}
            className={`chip ${filter === key ? "active" : ""}`}
            onClick={() => setFilter(key)}
          >
            {label} {counts[key] ? `(${counts[key]})` : ""}
          </button>
        ))}
      </div>

      {loaded && filtered.length === 0 && (
        <div className="empty">
          {list.length === 0
            ? "ยังไม่มีซีรีย์ในลิสต์ กด “เพิ่มซีรีย์” เพื่อเริ่มแท็กเรื่องแรก"
            : "ไม่มีซีรีย์ในหมวดนี้"}
        </div>
      )}

      <div className="grid">
        {filtered.map((s) => {
          const pct = s.totalEpisodes
            ? Math.min(100, Math.round((s.currentEpisode / s.totalEpisodes) * 100))
            : null;
          return (
            <div className="card" key={s.id}>
              <div className="card-head">
                <h3 onClick={() => openEditModal(s)} style={{ cursor: "pointer" }}>
                  {s.title}
                </h3>
                <span className={`status-badge ${STATUS[s.status].cls}`}>
                  {STATUS[s.status].label}
                </span>
              </div>

              <div className="progress-row">
                <span>ซีซัน {s.season}</span>
                {s.totalEpisodes ? (
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${pct}%` }} />
                  </div>
                ) : null}
                {s.totalEpisodes ? <span>{pct}%</span> : null}
              </div>

              <div className="ep-controls">
                <button className="btn-icon" onClick={() => updateEpisode(s.id, -1)}>
                  −
                </button>
                <span className="ep-count">
                  ตอนที่ {s.currentEpisode}
                  {s.totalEpisodes ? ` / ${s.totalEpisodes}` : ""}
                </span>
                <button className="btn-icon" onClick={() => updateEpisode(s.id, 1)}>
                  +
                </button>
              </div>

              <div className="card-footer">
                <select
                  className="status-select"
                  value={s.status}
                  onChange={(e) => updateStatus(s.id, e.target.value)}
                >
                  {Object.entries(STATUS).map(([key, v]) => (
                    <option key={key} value={key}>
                      {v.label}
                    </option>
                  ))}
                </select>
                <button className="btn btn-ghost" onClick={() => openEditModal(s)}>
                  แก้ไข
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {modalOpen && (
        <div className="modal-backdrop" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{form.id ? "แก้ไขซีรีย์" : "เพิ่มซีรีย์ใหม่"}</h2>
            <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div className="field">
                <label>ชื่อซีรีย์</label>
                <input
                  autoFocus
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="เช่น Squid Game"
                  required
                />
              </div>

              <div className="field-row">
                <div className="field">
                  <label>ซีซัน</label>
                  <input
                    type="number"
                    min="1"
                    value={form.season}
                    onChange={(e) => setForm({ ...form, season: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>ดูถึงตอนที่</label>
                  <input
                    type="number"
                    min="0"
                    value={form.currentEpisode}
                    onChange={(e) => setForm({ ...form, currentEpisode: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>ตอนทั้งหมด (ถ้ามี)</label>
                  <input
                    type="number"
                    min="0"
                    value={form.totalEpisodes}
                    onChange={(e) => setForm({ ...form, totalEpisodes: e.target.value })}
                    placeholder="ไม่บังคับ"
                  />
                </div>
              </div>

              <div className="field">
                <label>สถานะ</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                >
                  {Object.entries(STATUS).map(([key, v]) => (
                    <option key={key} value={key}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </div>

              {form.id && (
                <button type="button" className="delete-link" onClick={handleDelete}>
                  ลบซีรีย์นี้
                </button>
              )}

              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={closeModal}>
                  ยกเลิก
                </button>
                <button type="submit" className="btn btn-primary">
                  บันทึก
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
