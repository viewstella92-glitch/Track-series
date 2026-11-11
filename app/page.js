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
  season_number: 1, watched_episodes: 0, released_episodes: "", rating: 3, plan_episodes: 3, plan_order: 0, last_planned_at: null,
  total_episodes: "", status: "watching", release_day: "",
  next_episode_date: "", notes: "",
};
const asNumber = value => value === "" || value == null ? null : Math.max(0, Number(value) || 0);
const backlog = show => Math.max(0, (show.released_episodes ?? show.total_episodes ?? show.watched_episodes) - show.watched_episodes);
const progress = show => show.total_episodes == null ? null : Math.min(100, Math.round(show.watched_episodes / Math.max(1, show.total_episodes) * 100));
const formatDate = value => value ? new Date(value + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short" }) : "ยังไม่กำหนด";
const planAvailable = show => show.released_episodes != null ? Math.max(0, show.released_episodes - show.watched_episodes) : show.total_episodes != null ? Math.max(0, show.total_episodes - show.watched_episodes) : Math.max(1, show.plan_episodes || 3);
const isAiring = show => show.status === "watching" && (!!show.release_day || !!show.next_episode_date);
const planCount = show => {
  const stars = Math.min(5, Math.max(1, Number(show.rating) || 3));
  const base = stars >= 5 ? 2 : stars >= 3 ? 2 : 1;
  const backlogBonus = backlog(show) >= 10 ? 1 : 0;
  const airingBonus = isAiring(show) ? 1 : 0;
  return Math.min(3, planAvailable(show), base + backlogBonus + airingBonus);
};
const planPriority = show => {
  const stars = Math.min(5, Math.max(1, Number(show.rating) || 3));
  const backlogPressure = Math.min(3, backlog(show) / 8);
  const airingBoost = isAiring(show) ? 2.5 : 0;
  const nextDate = show.next_episode_date ? new Date(show.next_episode_date + "T00:00:00") : null;
  const daysToNext = nextDate ? Math.ceil((nextDate.getTime() - new Date().setHours(0,0,0,0)) / 86400000) : null;
  const soonBoost = daysToNext !== null && daysToNext >= 0 && daysToNext <= 3 ? 2 : 0;
  return stars * 1.5 + backlogPressure + airingBoost + soonBoost;
};
const wasPlannedRecently = show => show.last_planned_at && Date.now() - new Date(show.last_planned_at).getTime() < 6 * 60 * 60 * 1000;

export default function Page() {
  const [shows, setShows] = useState([]);
  const [dataReady, setDataReady] = useState(false);
  const [active, setActive] = useState("all");
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const loadShows = useCallback(async () => {
    setDataReady(false); setError("");
    const { data, error: loadError } = await supabase.from("series_tracker_shows").select("*").order("updated_at", { ascending: false });
    if (loadError) setError("โหลดข้อมูลไม่สำเร็จ: " + loadError.message);
    else setShows(data || []);
    setDataReady(true);
  }, []);

  useEffect(() => { if (supabase) loadShows(); }, [loadShows]);

  useEffect(() => {
    if (!supabase) return;
    const channel = supabase.channel("series-sync-personal")
      .on("postgres_changes", { event: "*", schema: "public", table: "series_tracker_shows" }, () => loadShows())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadShows]);

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
  const watchPlan = useMemo(() => shows.filter(show => ["watching", "planned"].includes(show.status) && planAvailable(show) > 0).sort((a,b) =>
    Number(wasPlannedRecently(a)) - Number(wasPlannedRecently(b)) ||
    planPriority(b) - planPriority(a) ||
    (a.plan_order ?? 0) - (b.plan_order ?? 0) ||
    new Date(a.created_at || 0) - new Date(b.created_at || 0)
  ), [shows]);

  function openAdd() { setForm({ ...EMPTY }); setError(""); setModal(true); }
  function openEdit(show) { setForm({ ...EMPTY, ...show, plan_episodes: show.plan_episodes || 3, rating: show.rating || 3, released_episodes: show.released_episodes ?? "", total_episodes: show.total_episodes ?? "", next_episode_date: show.next_episode_date || "" }); setError(""); setModal(true); }
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
      title: form.title.trim(), original_title: form.original_title?.trim() || null,
      poster_url: form.poster_url?.trim() || null, genre: form.genre?.trim() || null, country: form.country?.trim() || null,
      season_number: Math.max(1, Number(form.season_number) || 1), watched_episodes: watched,
      released_episodes: released, total_episodes: total, status: form.status,
      plan_episodes: Math.min(30, Math.max(1, Number(form.plan_episodes) || 3)), rating: Math.min(5, Math.max(1, Number(form.rating) || 3)), plan_order: Number(form.plan_order) || 0,
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

  async function completePlan(show) {
    const amount = planCount(show);
    if (!amount) return;
    const nextWatched = show.watched_episodes + amount;
    const finished = show.total_episodes != null && nextWatched >= show.total_episodes;
    const nextOrder = Math.max(0, ...shows.map(item => Number(item.plan_order) || 0)) + 1;
    const { data, error: updateError } = await supabase.from("series_tracker_shows").update({
      watched_episodes: nextWatched, status: finished ? "completed" : "watching",
      plan_order: nextOrder, last_planned_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq("id", show.id).select().single();
    if (updateError) setError("อัปเดตแผนดูไม่สำเร็จ: " + updateError.message);
    else {
      setShows(current => current.map(item => item.id === show.id ? data : item));
      setNotice(finished ? "ดูเรื่องนี้จบแล้ว! เลื่อนไปเรื่องถัดไปให้แล้ว" : "บันทึกแผนสำเร็จ · เรื่องถัดไปพร้อมแล้ว");
      setTimeout(() => setNotice(""), 2800);
    }
  }

  if (!supabase) return <main className="config-screen"><div className="config-card"><div className="brand-mark"><span>✦</span> SERIDAYS</div><h1>ยังไม่ได้เชื่อมต่อฐานข้อมูล</h1><p>ตั้งค่า NEXT_PUBLIC_SUPABASE_URL และ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ใน Vercel ก่อนเริ่มใช้งาน</p></div></main>;
  return <main className="app-shell">
    <aside className="sidebar">
      <div className="brand-mark"><span>✦</span> SERIDAYS</div>
      <div className="side-label">YOUR LIBRARY</div>
      <nav className="side-nav">{NAV.map(item => <button key={item.id} className={active === item.id ? "nav-item active" : "nav-item"} onClick={() => setActive(item.id)}><span className="nav-icon">{item.icon}</span>{item.label}<span className="nav-count">{counts[item.id] || 0}</span></button>)}</nav>
      <div className="sidebar-bottom"><div className="mini-profile"><div className="avatar">✦</div><div className="profile-copy"><strong>My private library</strong><span>Personal series tracker</span></div></div></div>
    </aside>
    <section className="main-area">
      <header className="topbar"><div className="breadcrumb">MY LIBRARY <span>/</span> {active === "all" ? "OVERVIEW" : STATUS[active]?.label?.toUpperCase()}</div><div className="topbar-right"><span className="sync-state"><i /> SYNCED</span><button className="button primary add-top" onClick={openAdd}>＋ เพิ่มซีรีส์</button></div></header>
      <div className="content-wrap">
        <section className="welcome-row"><div><span className="eyebrow">YOUR WATCH JOURNAL</span><h1>เรื่องราวของคุณ <em>วันนี้</em></h1><p>ทุกตอนที่ดู คืออีกหนึ่งช่วงเวลาที่ได้ใช้ไปกับเรื่องโปรด</p></div><div className="date-pill">{new Date().toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" })}</div></section>
        <section className="hero-banner"><div className="hero-glow" /><div className="hero-text"><span className="eyebrow">KEEP YOUR STORY GOING</span><h2>One more episode.<br /><em>One more memory.</em></h2><p>{recommendation ? "เรื่องที่น่าดูต่อ: " + recommendation.title + " · ค้าง " + backlog(recommendation) + " ตอน" : "เพิ่มซีรีส์เรื่องแรก แล้วเริ่มเก็บทุกโมเมนต์การรับชมของคุณ"}</p><button className="button light" onClick={recommendation ? () => openEdit(recommendation) : openAdd}>{recommendation ? "ดูรายละเอียดเรื่องนี้ ↗" : "เพิ่มซีรีส์เรื่องแรก ↗"}</button></div><div className="hero-art"><div className="poster-stack"><div className="poster poster-back">✦</div><div className="poster poster-front"><span>SCENE<br />NO. 01</span><b>STORY<br />CONTINUES</b><i>✧</i></div></div><div className="hero-orbit" /></div><div className="hero-index">S / 01</div></section>
        <section className="watch-plan-section">
          <div className="plan-heading"><div><span className="eyebrow">YOUR NEXT WATCH</span><h2>แผนดูของฉัน <span>{watchPlan.length} เรื่องในคิว</span></h2><p>ดูตามลำดับการ์ด ไม่ต้องยึดติดกับวันหรือเวลา</p></div><span className="plan-badge">✦ WATCH FLOW</span></div>
          {!dataReady ? <div className="plan-loading">กำลังเตรียมแผนดูของคุณ…</div> : watchPlan.length === 0 ? <div className="plan-empty"><div className="plan-empty-icon">✧</div><div><strong>ยังไม่มีเรื่องในแผนดู</strong><p>เพิ่มเรื่องที่กำลังดูหรืออยากดู แล้วเลือกจำนวนตอนต่อรอบได้เลย</p></div><button className="button primary" onClick={openAdd}>＋ เพิ่มซีรีส์</button></div> : <div className="plan-layout">
            <article className="plan-feature-card">
              <div className="plan-feature-poster">{watchPlan[0].poster_url ? <img src={watchPlan[0].poster_url} alt={watchPlan[0].title} /> : <div className="poster-placeholder"><span>✦</span><b>{watchPlan[0].title.slice(0,2).toUpperCase()}</b><small>SERIES</small></div>}<span className="plan-step">NOW PLAYING · 01</span></div>
              <div className="plan-feature-info">
                <div className="plan-current-label"><i /> เรื่องที่ต้องดูตอนนี้ <span className="plan-stars">{"★".repeat(watchPlan[0].rating || 3)}{"☆".repeat(5 - (watchPlan[0].rating || 3))}</span></div>
                <h3>{watchPlan[0].title}</h3>{watchPlan[0].original_title && <p className="plan-original">{watchPlan[0].original_title}</p>}
                <div className="plan-episode-target"><span>เป้าหมายรอบนี้</span><strong>{planCount(watchPlan[0])} <small>ตอน</small></strong><em>EP {watchPlan[0].watched_episodes + 1}–{watchPlan[0].watched_episodes + planCount(watchPlan[0])}</em></div>
                <div className="plan-remaining">ดูแล้ว {watchPlan[0].watched_episodes} ตอน {watchPlan[0].total_episodes != null ? `จากทั้งหมด ${watchPlan[0].total_episodes} ตอน` : watchPlan[0].released_episodes != null ? `จากที่ออกแล้ว ${watchPlan[0].released_episodes} ตอน` : "· ยังไม่ระบุจำนวนตอนทั้งหมด"}</div>
                <div className="plan-reason">{isAiring(watchPlan[0]) ? "◉ กำลังออนแอร์ · เร่งรักษาคิวไม่ให้ตอนค้าง" : "✦ จัดคิวตามคะแนนความอยากดูและตอนที่ค้าง"}</div>
                <div className="plan-feature-actions"><button className="button primary plan-done" onClick={() => completePlan(watchPlan[0])}>✓ ดูครบแล้ว · บันทึก +{planCount(watchPlan[0])} ตอน</button><button className="plan-edit" onClick={() => openEdit(watchPlan[0])}>ปรับแผน</button></div>
              </div>
            </article>
            <aside className="plan-queue"><div className="queue-title"><strong>เรื่องถัดไป</strong><span>UP NEXT</span></div>
              {watchPlan.slice(1,4).map((show,index) => <div className="queue-card" key={show.id}><span className="queue-number">0{index+2}</span><div className="queue-poster">{show.poster_url ? <img src={show.poster_url} alt="" /> : <b>{show.title.slice(0,1)}</b>}</div><div className="queue-copy"><strong>{show.title}</strong><span>{"★".repeat(show.rating || 3)} · แนะนำ {planCount(show)} ตอน</span></div><button onClick={() => openEdit(show)} aria-label={"ปรับแผน " + show.title}>···</button></div>)}
              {watchPlan.length > 4 && <div className="queue-more">และอีก {watchPlan.length - 4} เรื่องในคิว</div>}
              {watchPlan.length === 1 && <div className="queue-empty">ไม่มีเรื่องถัดไปแล้ว<br />เพิ่มเรื่องใหม่เข้าคิวได้เลย</div>}
            </aside>
          </div>}
        </section>
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
                <div className="series-meta"><span>ซีซัน {show.season_number}</span>{show.genre && <><i>·</i><span>{show.genre}</span></>}{show.country && <><i>·</i><span>{show.country}</span></>}{show.release_day && <><i>·</i><span className="airing-label">{show.release_day === "ทุกวัน" ? "ออกอากาศทุกวัน" : "ออกอากาศวัน" + show.release_day}</span></>}</div>
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
        <label className="wide rating-field">ความอยากดู <span className="field-hint">ให้คะแนนเพื่อช่วยจัดลำดับและจำนวนตอน</span><div className="rating-picker" role="group" aria-label="คะแนนความอยากดู">{[1,2,3,4,5].map(star => <button type="button" key={star} className={star <= (Number(form.rating) || 3) ? "rating-star active" : "rating-star"} onClick={() => setForm({ ...form, rating: star })} aria-label={star + " ดาว"}>★</button>)}<b>{form.rating || 3}/5</b></div></label>
         <label>จำนวนตอนต่อรอบ<input type="number" min="1" max="30" value={form.plan_episodes || 3} onChange={e => setForm({ ...form, plan_episodes: e.target.value })} /><small className="field-hint">ใช้เป็นค่าตั้งต้น ระบบจะปรับตามดาวและตอนค้าง (ไม่เกิน 3 ตอนต่อรอบ)</small></label>
        <label>ออกอากาศแล้ว<input type="number" min="0" value={form.released_episodes} onChange={e => setForm({ ...form, released_episodes: e.target.value })} placeholder="ถ้าทราบ" /></label>
        <label>จำนวนตอนทั้งหมด<input type="number" min="0" value={form.total_episodes} onChange={e => setForm({ ...form, total_episodes: e.target.value })} placeholder="ถ้าทราบ" /></label>
        <label>รูปแบบวันออกอากาศ<select value={form.release_day || ""} onChange={e => setForm({ ...form, release_day: e.target.value })}><option value="">ไม่ระบุ</option><option value="ทุกวัน">ทุกวัน</option>{["จันทร์","อังคาร","พุธ","พฤหัสบดี","ศุกร์","เสาร์","อาทิตย์"].map(day => <option key={day} value={day}>{day}</option>)}</select></label>
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
