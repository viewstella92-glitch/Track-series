"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const supabase = url && key ? createClient(url, key) : null;

const STATUS = {
  watching: { label: "กำลังดู", tone: "blue" },
  completed: { label: "ดูจบแล้ว", tone: "green" },
  paused: { label: "พักดู", tone: "amber" },
  planned: { label: "อยากดู", tone: "violet" },
  dropped: { label: "เลิกดู", tone: "muted" },
};
const NAV = [
  { id: "all", label: "ภาพรวม", icon: "◫" },
  { id: "watching", label: "กำลังดู", icon: "▶" },
  { id: "planned", label: "อยากดู", icon: "♡" },
  { id: "completed", label: "ดูจบแล้ว", icon: "✓" },
  { id: "paused", label: "พักดู", icon: "Ⅱ" },
];
const EMPTY = {
  title: "", original_title: "", poster_url: "", genre: "", country: "",
  season_number: 1, watched_episodes: 0, released_episodes: "",
  total_episodes: "", status: "watching", release_day: "",
  next_episode_date: "", notes: "",
};
const asNumber = value => value === "" || value == null ? null : Math.max(0, Number(value) || 0);
const backlog = show => Math.max(0, (show.released_episodes ?? show.total_episodes ?? show.watched_episodes) - show.watched_episodes);
const progress = show => show.total_episodes == null ? null : Math.min(100, Math.round(show.watched_episodes / Math.max(1, show.total_episodes) * 100));
const formatDate = value => value ? new Date(value + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short" }) : "ยังไม่กำหนด";

function AuthScreen() {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setBusy(true); setError(""); setMessage("");
    try {
      if (mode === "signup") {
        const { data, error: authError } = await supabase.auth.signUp({ email: email.trim(), password });
        if (authError) throw authError;
        setMessage(data.session ? "สร้างบัญชีสำเร็จ กำลังเข้าสู่ระบบ…" : "สมัครสำเร็จ กรุณาตรวจอีเมลเพื่อยืนยันบัญชี แล้วกลับมาเข้าสู่ระบบ");
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (authError) throw authError;
      }
    } catch (err) { setError(err.message || "เกิดข้อผิดพลาด กรุณาลองอีกครั้ง"); }
    finally { setBusy(false); }
  }

  return <main className="auth-shell">
    <div className="auth-art"><div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" /><div className="art-copy">
      <span className="eyebrow">YOUR PERSONAL WATCH UNIVERSE</span>
      <h1>Every story<br /><em>has its moment.</em></h1>
      <p>พื้นที่เล็ก ๆ สำหรับทุกเรื่องราวที่คุณกำลังติดตาม</p>
      <div className="art-stamp">SERIES<br />TRACKER <span>✦</span></div>
    </div></div>
    <section className="auth-panel">
      <div className="brand-mark"><span>✦</span> SERIDAYS</div>
      <div className="auth-heading"><span className="eyebrow">WELCOME TO YOUR SCREEN TIME</span><h2>{mode === "login" ? "กลับมาติดตามเรื่องโปรดกัน" : "สร้างพื้นที่ซีรีส์ของคุณ"}</h2><p>เข้าสู่ระบบเพื่อซิงก์รายการดูระหว่างทุกอุปกรณ์</p></div>
      <form className="auth-form" onSubmit={submit}>
        <label>อีเมล<input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" required /></label>
        <label>รหัสผ่าน<input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="อย่างน้อย 6 ตัวอักษร" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={6} required /></label>
        {error && <div className="notice error">{error}</div>}
        {message && <div className="notice success">{message}</div>}
        <button className="button primary full" disabled={busy}>{busy ? "กำลังดำเนินการ…" : mode === "login" ? "เข้าสู่ระบบ  →" : "สร้างบัญชี  →"}</button>
      </form>
      <p className="auth-switch">{mode === "login" ? "ยังไม่มีบัญชี?" : "มีบัญชีอยู่แล้ว?"} <button onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); setMessage(""); }}>{mode === "login" ? "สมัครสมาชิก" : "เข้าสู่ระบบ"}</button></p>
      <div className="secure-note">⌁ ข้อมูลส่วนตัวของคุณถูกแยกเก็บตามบัญชี</div>
    </section>
  </main>;
}

export default function Page() {
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [shows, setShows] = useState([]);
  const [dataReady, setDataReady] = useState(false);
  const [active, setActive] = useState("all");
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!supabase) { setAuthReady(true); return; }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthReady(true); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => { setSession(next); setAuthReady(true); });
    return () => listener.subscription.unsubscribe();
  }, []);

  const loadShows = useCallback(async () => {
    if (!session?.user?.id) return;
    setDataReady(false); setError("");
    const { data, error: loadError } = await supabase.from("series_tracker_shows").select("*").order("updated_at", { ascending: false });
    if (loadError) setError("โหลดข้อมูลไม่สำเร็จ: " + loadError.message);
    else setShows(data || []);
    setDataReady(true);
  }, [session?.user?.id]);

  useEffect(() => { if (session) loadShows(); else { setShows([]); setDataReady(true); } }, [session, loadShows]);

  useEffect(() => {
    if (!session?.user?.id) return;
    const channel = supabase.channel("series-sync-" + session.user.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "series_tracker_shows", filter: "user_id=eq." + session.user.id }, () => loadShows())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session?.user?.id, loadShows]);

  const counts = useMemo(() => {
    const result = { all: shows.filter(s => s.status !== "dropped").length, watching: 0, planned: 0, completed: 0, paused: 0 };
    shows.forEach(show => { if (result[show.status] !== undefined) result[show.status] += 1; });
    return result;
  }, [shows]);
  const totals = useMemo(() => ({
    watched: shows.reduce((sum, show) => sum + show.watched_episodes, 0),
    backlog: shows.filter(show => show.status === "watching").reduce((sum, show) => sum + backlog(show), 0),
  }), [shows]);
  const filtered = useMemo(() => shows.filter(show => {
    const inTab = active === "all" ? show.status !== "dropped" : show.status === active;
    const text = (show.title + " " + (show.original_title || "") + " " + (show.genre || "")).toLowerCase();
    return inTab && text.includes(query.toLowerCase());
  }).sort((a,b) => backlog(b) - backlog(a)), [shows, active, query]);
  const recommendation = shows.filter(s => s.status === "watching").sort((a,b) => backlog(b) - backlog(a))[0];

  function openAdd() { setForm({ ...EMPTY }); setError(""); setModal(true); }
  function openEdit(show) { setForm({ ...EMPTY, ...show, released_episodes: show.released_episodes ?? "", total_episodes: show.total_episodes ?? "", next_episode_date: show.next_episode_date || "" }); setError(""); setModal(true); }
  function closeModal() { if (!saving) setModal(false); }

  async function saveShow(event) {
    event.preventDefault();
    const total = asNumber(form.total_episodes);
    const watched = asNumber(form.watched_episodes) ?? 0;
    const released = asNumber(form.released_episodes);
    if (!form.title.trim()) return;
    if (total !== null && watched > total) { setError("จำนวนตอนที่ดูแล้วต้องไม่มากกว่าจำนวนตอนทั้งหมด"); return; }
    if (released !== null && released < watched) { setError("จำนวนตอนที่ออกอากาศแล้วต้องไม่น้อยกว่าตอนที่ดูแล้ว"); return; }
    const payload = {
      user_id: session.user.id, title: form.title.trim(), original_title: form.original_title?.trim() || null,
      poster_url: form.poster_url?.trim() || null, genre: form.genre?.trim() || null, country: form.country?.trim() || null,
      season_number: Math.max(1, Number(form.season_number) || 1), watched_episodes: watched,
      released_episodes: released, total_episodes: total, status: form.status,
      release_day: form.release_day || null, next_episode_date: form.next_episode_date || null,
      notes: form.notes?.trim() || null, updated_at: new Date().toISOString(),
    };
    setSaving(true); setError("");
    const result = form.id
      ? await supabase.from("series_tracker_shows").update(payload).eq("id", form.id).select().single()
      : await supabase.from("series_tracker_shows").insert(payload).select().single();
    if (result.error) { setError("บันทึกไม่สำเร็จ: " + result.error.message); setSaving(false); return; }
    setShows(current => form.id ? current.map(item => item.id === form.id ? result.data : item) : [result.data, ...current]);
    setModal(false); setSaving(false); setNotice(form.id ? "อัปเดตซีรีส์แล้ว" : "เพิ่มซีรีส์เข้าลิสต์แล้ว");
    setTimeout(() => setNotice(""), 2500);
  }

  async function deleteShow() {
    if (!form.id || !window.confirm("ลบซีรีส์เรื่องนี้ออกจากรายการใช่ไหม?")) return;
    setSaving(true);
    const { error: deleteError } = await supabase.from("series_tracker_shows").delete().eq("id", form.id);
    if (deleteError) { setError(deleteError.message); setSaving(false); return; }
    setShows(current => current.filter(item => item.id !== form.id));
    setModal(false); setSaving(false);
  }

  async function changeEpisodes(show, delta) {
    const next = Math.max(0, show.watched_episodes + delta);
    if (show.total_episodes !== null && next > show.total_episodes) return;
    const nextStatus = show.total_episodes !== null && next === show.total_episodes && show.status === "watching" ? "completed" : show.status === "completed" && next < show.total_episodes ? "watching" : show.status;
    const { data, error: updateError } = await supabase.from("series_tracker_shows").update({ watched_episodes: next, status: nextStatus, updated_at: new Date().toISOString() }).eq("id", show.id).select().single();
    if (updateError) setError("อัปเดตตอนไม่สำเร็จ: " + updateError.message);
    else setShows(current => current.map(item => item.id === show.id ? data : item));
  }

  async function quickStatus(show, status) {
    const { data, error: updateError } = await supabase.from("series_tracker_shows").update({ status, updated_at: new Date().toISOString() }).eq("id", show.id).select().single();
    if (updateError) setError(updateError.message);
    else setShows(current => current.map(item => item.id === show.id ? data : item));
  }

  if (!supabase) return <main className="config-screen"><div className="config-card"><div className="brand-mark"><span>✦</span> SERIDAYS</div><h1>ยังไม่ได้เชื่อมต่อฐานข้อมูล</h1><p>ตั้งค่า NEXT_PUBLIC_SUPABASE_URL และ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ใน Vercel ก่อนเริ่มใช้งาน</p></div></main>;
  if (!authReady) return <main className="loading-screen"><span className="loader" />กำลังเตรียมพื้นที่ซีรีส์ของคุณ…</main>;
  if (!session) return <AuthScreen />;

  return <main className="app-shell">
    <aside className="sidebar">
      <div className="brand-mark"><span>✦</span> SERIDAYS</div>
      <div className="side-label">YOUR LIBRARY</div>
      <nav className="side-nav">{NAV.map(item => <button key={item.id} className={active === item.id ? "nav-item active" : "nav-item"} onClick={() => setActive(item.id)}><span className="nav-icon">{item.icon}</span>{item.label}<span className="nav-count">{counts[item.id] || 0}</span></button>)}</nav>
      <div className="sidebar-bottom"><div className="mini-profile"><div className="avatar">{(session.user.email || "S").slice(0,1).toUpperCase()}</div><div className="profile-copy"><strong>My space</strong><span>{session.user.email}</span></div></div><button className="signout-button" onClick={() => supabase.auth.signOut()}>↪ ออกจากระบบ</button></div>
    </aside>
    <section className="main-area">
      <header className="topbar"><div className="breadcrumb">MY LIBRARY <span>/</span> {active === "all" ? "OVERVIEW" : STATUS[active]?.label?.toUpperCase()}</div><div className="topbar-right"><span className="sync-state"><i /> SYNCED</span><button className="button primary add-top" onClick={openAdd}>＋ เพิ่มซีรีส์</button></div></header>
      <div className="content-wrap">
        <section className="welcome-row"><div><span className="eyebrow">YOUR WATCH JOURNAL</span><h1>เรื่องราวของคุณ <em>วันนี้</em></h1><p>ทุกตอนที่ดู คืออีกหนึ่งช่วงเวลาที่ได้ใช้ไปกับเรื่องโปรด</p></div><div className="date-pill">{new Date().toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" })}</div></section>
        <section className="hero-banner"><div className="hero-glow" /><div className="hero-text"><span className="eyebrow">KEEP YOUR STORY GOING</span><h2>One more episode.<br /><em>One more memory.</em></h2><p>{recommendation ? "เรื่องที่น่าดูต่อ: " + recommendation.title + " · ค้าง " + backlog(recommendation) + " ตอน" : "เพิ่มซีรีส์เรื่องแรก แล้วเริ่มเก็บทุกโมเมนต์การรับชมของคุณ"}</p><button className="button light" onClick={recommendation ? () => openEdit(recommendation) : openAdd}>{recommendation ? "ดูรายละเอียดเรื่องนี้ ↗" : "เพิ่มซีรีส์เรื่องแรก ↗"}</button></div><div className="hero-art"><div className="poster-stack"><div className="poster poster-back">✦</div><div className="poster poster-front"><span>SCENE<br />NO. 01</span><b>STORY<br />CONTINUES</b><i>✧</i></div></div><div className="hero-orbit" /></div><div className="hero-index">S / 01</div></section>
        <section className="stats-grid">
          <div className="stat-card"><span className="stat-icon lavender">▣</span><span className="stat-label">ซีรีส์ทั้งหมด</span><strong>{counts.all}</strong><small>เรื่องในคลังของคุณ</small></div>
          <div className="stat-card"><span className="stat-icon blue">▶</span><span className="stat-label">กำลังติดตาม</span><strong>{counts.watching}</strong><small>เรื่องที่กำลังดูอยู่</small></div>
          <div className="stat-card"><span className="stat-icon peach">◷</span><span className="stat-label">ตอนที่ดูแล้ว</span><strong>{totals.watched}</strong><small>ตอนที่บันทึกไว้</small></div>
          <div className="stat-card"><span className="stat-icon mint">≋</span><span className="stat-label">ตอนที่ค้างดู</span><strong>{totals.backlog}</strong><small>จากเรื่องที่กำลังดู</small></div>
        </section>
        <section className="section-heading"><div><span className="eyebrow">YOUR COLLECTION</span><h2>{active === "all" ? "ซีรีส์ในลิสต์" : STATUS[active]?.label || "ซีรีส์ในลิสต์"} <span>{filtered.length}</span></h2></div><div className="search-box"><span>⌕</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="ค้นหาชื่อเรื่อง…" /></div></section>
        <div className="filter-row">{NAV.map(item => <button key={item.id} className={active === item.id ? "filter-chip selected" : "filter-chip"} onClick={() => setActive(item.id)}>{item.label}</button>)}</div>
        {error && <div className="notice error inline-notice">{error}<button onClick={() => setError("")}>×</button></div>}
        {notice && <div className="notice success inline-notice">{notice}</div>}
        {!dataReady ? <div className="empty-state"><span className="loader" /><p>กำลังซิงก์ข้อมูลของคุณ…</p></div> :
          filtered.length === 0 ? <div className="empty-state"><div className="empty-illustration">✧</div><h3>{query ? "ไม่พบเรื่องที่ค้นหา" : "พื้นที่นี้ยังว่างอยู่"}</h3><p>{query ? "ลองค้นหาด้วยชื่อเรื่องอื่น" : "เพิ่มซีรีส์ที่กำลังดูหรืออยากดู แล้วเราจะช่วยจัดการตอนที่เหลือให้"}</p>{!query && <button className="button primary" onClick={openAdd}>＋ เพิ่มซีรีส์</button>}</div> :
          <div className="series-grid">{filtered.map(show => {
            const pct = progress(show);
            return <article className="series-card" key={show.id}>
              <button className="poster-thumb" onClick={() => openEdit(show)} aria-label={"แก้ไข " + show.title}>
                {show.poster_url ? <img src={show.poster_url} alt={show.title} /> : <div className="poster-placeholder"><span>✦</span><b>{show.title.slice(0,2).toUpperCase()}</b><small>SERIES</small></div>}
                <span className={"status-tag " + STATUS[show.status]?.tone}>{STATUS[show.status]?.label}</span>
              </button>
              <div className="series-info">
                <div className="series-title-row"><div><h3>{show.title}</h3>{show.original_title && <p className="original-title">{show.original_title}</p>}</div><button className="more-button" onClick={() => openEdit(show)} aria-label="แก้ไข">···</button></div>
                <div className="series-meta"><span>ซีซัน {show.season_number}</span>{show.genre && <><i>·</i><span>{show.genre}</span></>}{show.country && <><i>·</i><span>{show.country}</span></>}</div>
                <div className="episode-line"><strong>EP {show.watched_episodes}</strong><span>/ {show.total_episodes ?? "—"}</span>{pct !== null && <b>{pct}%</b>}</div>
                <div className="progress-track"><div className="progress-value" style={{ width: (pct ?? 0) + "%" }} /></div>
                <div className="card-bottom"><div className="backlog-copy">{show.status === "watching" ? <><strong>{backlog(show)}</strong> ตอนค้างดู</> : show.status === "planned" ? "รอเริ่มรับชม" : show.status === "completed" ? "รับชมครบแล้ว" : STATUS[show.status]?.label}</div>
                  {show.status === "watching" && <div className="episode-actions"><button onClick={() => changeEpisodes(show, -1)} disabled={show.watched_episodes <= 0}>−</button><button onClick={() => changeEpisodes(show, 1)} disabled={show.total_episodes !== null && show.watched_episodes >= show.total_episodes}>＋</button></div>}
                </div>
                {show.next_episode_date && <div className="next-episode">✦ ตอนต่อไป {formatDate(show.next_episode_date)}</div>}
              </div>
            </article>;
          })}</div>
        }
        <footer className="app-footer"><span>✦ SERIDAYS</span><span>Made for the stories you love.</span><button onClick={loadShows}>↻ รีเฟรชข้อมูล</button></footer>
      </div>
    </section>
    {modal && <div className="modal-backdrop" onMouseDown={closeModal}><section className="series-modal" onMouseDown={e => e.stopPropagation()}>
      <div className="modal-heading"><div><span className="eyebrow">YOUR SERIES LIBRARY</span><h2>{form.id ? "แก้ไขรายละเอียด" : "เพิ่มซีรีส์ใหม่"}</h2></div><button className="close-modal" onClick={closeModal}>×</button></div>
      <form onSubmit={saveShow}><div className="form-grid">
        <label className="wide">ชื่อซีรีส์ *<input autoFocus value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="เช่น Love Between Fairy and Devil" required /></label>
        <label className="wide">ชื่อเรื่องต้นฉบับ / ชื่อภาษาอื่น<input value={form.original_title || ""} onChange={e => setForm({ ...form, original_title: e.target.value })} placeholder="ไม่บังคับ" /></label>
        <label className="wide">ลิงก์รูปโปสเตอร์<input type="url" value={form.poster_url || ""} onChange={e => setForm({ ...form, poster_url: e.target.value })} placeholder="https://…" /></label>
        <label>แนวซีรีส์<input value={form.genre || ""} onChange={e => setForm({ ...form, genre: e.target.value })} placeholder="โรแมนติก, ย้อนยุค…" /></label>
        <label>ประเทศ<input value={form.country || ""} onChange={e => setForm({ ...form, country: e.target.value })} placeholder="จีน, เกาหลี…" /></label>
        <label>ซีซัน<input type="number" min="1" value={form.season_number} onChange={e => setForm({ ...form, season_number: e.target.value })} /></label>
        <label>ดูแล้ว<input type="number" min="0" value={form.watched_episodes} onChange={e => setForm({ ...form, watched_episodes: e.target.value })} /></label>
        <label>ออกอากาศแล้ว<input type="number" min="0" value={form.released_episodes} onChange={e => setForm({ ...form, released_episodes: e.target.value })} placeholder="ถ้าทราบ" /></label>
        <label>จำนวนตอนทั้งหมด<input type="number" min="0" value={form.total_episodes} onChange={e => setForm({ ...form, total_episodes: e.target.value })} placeholder="ถ้าทราบ" /></label>
        <label>วันออกอากาศ<select value={form.release_day || ""} onChange={e => setForm({ ...form, release_day: e.target.value })}><option value="">ไม่ระบุ</option>{["จันทร์","อังคาร","พุธ","พฤหัสบดี","ศุกร์","เสาร์","อาทิตย์"].map(day => <option key={day}>{day}</option>)}</select></label>
        <label>วันตอนถัดไป<input type="date" value={form.next_episode_date || ""} onChange={e => setForm({ ...form, next_episode_date: e.target.value })} /></label>
        <label className="wide">สถานะ<select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>{Object.entries(STATUS).map(([id, value]) => <option key={id} value={id}>{value.label}</option>)}</select></label>
        <label className="wide">บันทึกเพิ่มเติม<textarea rows="3" value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="จดรายละเอียดที่อยากจำ…" /></label>
      </div>
      {error && <div className="notice error">{error}</div>}
      <div className="modal-actions">{form.id && <button type="button" className="button danger-text" onClick={deleteShow} disabled={saving}>ลบเรื่องนี้</button>}<div className="modal-actions-right"><button type="button" className="button ghost" onClick={closeModal} disabled={saving}>ยกเลิก</button><button type="submit" className="button primary" disabled={saving}>{saving ? "กำลังบันทึก…" : "บันทึกซีรีส์"}</button></div></div>
      </form>
    </section></div>}
  </main>;
}
