"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const supabase = url && key ? createClient(url, key) : null;

const AIR_DAYS = ["จันทร์","อังคาร","พุธ","พฤหัสบดี","ศุกร์","เสาร์","อาทิตย์"];
const parseReleaseDays = value => { if (!value) return []; if (value === "ทุกวัน") return [...AIR_DAYS]; return String(value).split(",").map(day => day.trim()).filter(day => AIR_DAYS.includes(day)); };
const releaseDayLabel = value => { const days = parseReleaseDays(value); return days.length === 7 ? "ออกอากาศทุกวัน" : days.length ? "ออกอากาศ " + days.join(" · ") : ""; };
const localDateKey = date => [date.getFullYear(), String(date.getMonth()+1).padStart(2,"0"), String(date.getDate()).padStart(2,"0")].join("-");
const dueReleaseUpdate = (show, todayKey) => {
  if (!show.next_episode_date || show.next_episode_date > todayKey || show.status !== "watching") return null;
  const days = parseReleaseDays(show.release_day);
  const cursor = new Date(show.next_episode_date + "T00:00:00Z");
  const end = new Date(todayKey + "T00:00:00Z");
  let added = 0; let first = true;
  while (cursor <= end && added < 366) {
    const weekday = AIR_DAYS[(cursor.getUTCDay() + 6) % 7];
    if (first || days.includes(weekday)) added += Math.max(1, Number(show.episodes_per_release) || 1);
    first = false; cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  let nextDate = null;
  if (days.length) {
    for (let i = 1; i <= 7; i++) {
      const candidate = new Date(end); candidate.setUTCDate(candidate.getUTCDate() + i);
      if (days.includes(AIR_DAYS[(candidate.getUTCDay() + 6) % 7])) { nextDate = candidate.toISOString().slice(0,10); break; }
    }
  }
  return { added, nextDate };
};
const STATUS = {
  watching: { label: "กำลังดู", tone: "blue" },
  completed: { label: "ดูจบแล้ว", tone: "green" },
  paused: { label: "พักดู", tone: "amber" },
  planned: { label: "อยากดู", tone: "violet" },
  dropped: { label: "เลิกดู", tone: "muted" },
};
const NAV = [
  { id: "all", label: "ภาพรวม", icon: "◫" },
  { id: "queue", label: "Flashcard Queue", icon: "▤" },
  { id: "watching", label: "กำลังดู", icon: "▶" },
  { id: "planned", label: "อยากดู", icon: "♡" },
  { id: "completed", label: "ดูจบแล้ว", icon: "✓" },
  { id: "paused", label: "พักดู", icon: "Ⅱ" },
];
const EMPTY = {
  title: "", original_title: "", poster_url: "", genre: "", country: "",
  season_number: 1, watched_episodes: 0, released_episodes: "", episodes_per_release: 1, episode_duration_minutes: 45, rating: 3, plan_episodes: 3, plan_order: 0, last_planned_at: null,
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
  const preferredLimit = Math.min(3, Math.max(1, Number(show.plan_episodes) || 3));
  const releaseBatch = isAiring(show) ? Math.max(1, Number(show.episodes_per_release) || 1) : 1;
  return Math.min(preferredLimit, planAvailable(show), Math.max(base + backlogBonus + airingBonus, releaseBatch));
};
const daysUntilRelease = show => {
  if (!show.next_episode_date) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  const next = new Date(show.next_episode_date + "T00:00:00"); next.setHours(0,0,0,0);
  return Math.round((next.getTime() - today.getTime()) / 86400000);
};
const planPriority = show => {
  const stars = Math.min(5, Math.max(1, Number(show.rating) || 3));
  const waiting = backlog(show);
  const days = daysUntilRelease(show);
  const ratingScore = stars * 12;
  const backlogScore = Math.min(18, waiting * 1.2);
  const statusScore = show.status === "watching" ? 6 : 2;
  const releaseUrgency = days === null ? 0 : days < 0 ? 5 : days === 0 ? 14 : days <= 2 ? 10 : days <= 5 ? 5 : 0;
  const batchScore = isAiring(show) ? Math.min(4, (Number(show.episodes_per_release) || 1) * 1.2) : 0;
  return ratingScore + backlogScore + statusScore + releaseUrgency + batchScore;
};
const planReason = show => {
  const days = daysUntilRelease(show);
  if (days === 0) return "มีตอนใหม่ออกวันนี้ · ควรจัดเวลาให้เรื่องนี้";
  if (days !== null && days > 0 && days <= 2) return "ใกล้วันออกตอนใหม่ · เตรียมเคลียร์ตอนค้าง";
  if (Number(show.rating) >= 5) return "คะแนนความอยากดูสูง · ให้ความสำคัญกับเรื่องโปรด";
  if (backlog(show) >= 8) return "มีตอนค้างสะสม " + backlog(show) + " ตอน · ควรทยอยตาม";
  if (show.status === "planned") return "อยู่ในรายการที่อยากดู · เริ่มจากเรื่องนี้ได้";
  if (days !== null && days < 0) return "มีวันออกอากาศที่ผ่านแล้ว · ตรวจสอบตอนใหม่";
  return "จัดลำดับจากคะแนน ความค้าง และตารางออกอากาศ";
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
  const [todayActivity, setTodayActivity] = useState([]);
  const [error, setError] = useState("");

  const loadShows = useCallback(async () => {
    setDataReady(false); setError("");
    const { data, error: loadError } = await supabase.from("series_tracker_shows").select("*").order("updated_at", { ascending: false });
    if (loadError) setError("โหลดข้อมูลไม่สำเร็จ: " + loadError.message);
    else {
      const todayKey = localDateKey(new Date());
      const refreshed = [];
      for (const show of data || []) {
        const due = dueReleaseUpdate(show, todayKey);
        if (!due || !due.added) { refreshed.push(show); continue; }
        const released = Number(show.released_episodes ?? show.watched_episodes ?? 0);
        const result = await supabase.from("series_tracker_shows").update({ released_episodes: released + due.added, next_episode_date: due.nextDate, updated_at: new Date().toISOString() }).eq("id", show.id).eq("next_episode_date", show.next_episode_date).select().maybeSingle();
        if (result.error) { setError("อัปเดตตอนใหม่อัตโนมัติไม่สำเร็จ: " + result.error.message); refreshed.push(show); }
        else refreshed.push(result.data || show);
      }
      setShows(refreshed);
    }
    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
    const { data: activity } = await supabase.from("series_tracker_activity").select("id, show_id, show_title, episode_delta, created_at").gte("created_at", dayStart.toISOString()).order("created_at", { ascending: false });
    setTodayActivity(activity || []);
    setDataReady(true);
  }, []);

  useEffect(() => { if (supabase) loadShows(); }, [loadShows]);

  useEffect(() => {
    if (!supabase) return;
    const now = new Date();
    const midnight = new Date(now); midnight.setHours(24, 0, 5, 0);
    const timer = setTimeout(() => loadShows(), Math.max(1000, midnight.getTime() - now.getTime()));
    return () => clearTimeout(timer);
  }, [loadShows]);

  useEffect(() => {
    if (!supabase) return;
    const channel = supabase.channel("series-sync-personal")
      .on("postgres_changes", { event: "*", schema: "public", table: "series_tracker_shows" }, () => loadShows())
      .on("postgres_changes", { event: "*", schema: "public", table: "series_tracker_activity" }, () => loadShows())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadShows]);

  const counts = useMemo(() => {
    const result = { all: shows.filter(s => s.status !== "dropped").length, queue: shows.filter(s => ["watching","planned","paused"].includes(s.status)).length, watching: 0, planned: 0, completed: 0, paused: 0 };
    shows.forEach(show => { if (result[show.status] !== undefined) result[show.status] += 1; });
    return result;
  }, [shows]);
  const totals = useMemo(() => ({
    watched: shows.reduce((sum, show) => sum + show.watched_episodes, 0),
    backlog: shows.filter(show => show.status === "watching").reduce((sum, show) => sum + backlog(show), 0),
  }), [shows]);
  const filtered = useMemo(() => shows.filter(show => {
    const inTab = active === "all" ? show.status !== "dropped" : active === "queue" ? ["watching","planned","paused"].includes(show.status) : show.status === active;
    const text = (show.title + " " + (show.original_title || "") + " " + (show.genre || "")).toLowerCase();
    return inTab && text.includes(query.toLowerCase());
  }).sort((a,b) => new Date(a.created_at || 0) - new Date(b.created_at || 0)), [shows, active, query]);
  const queueShows = useMemo(() => shows.filter(show => ["watching","planned","paused"].includes(show.status)).sort((a,b) => {
    const ao = Number(a.plan_order) || 0; const bo = Number(b.plan_order) || 0;
    if (ao > 0 && bo > 0 && ao !== bo) return ao - bo;
    if (ao > 0 && !bo) return -1; if (bo > 0 && !ao) return 1;
    const score = show => (Number(show.rating) || 3) * 100 + Math.min(30, backlog(show) * 2) + (show.status === "watching" ? 5 : 0);
    return score(b) - score(a);
  }), [shows]);
  const queueBacklog = queueShows.reduce((sum, show) => sum + backlog(show), 0);
  const queueMinutes = queueShows.reduce((sum, show) => sum + backlog(show) * (Number(show.episode_duration_minutes) || 45), 0);
  const smartArrangeQueue = async () => {
    const ranked = [...queueShows].sort((a,b) => {
      const score = show => (Number(show.rating) || 3) * 100 + Math.min(30, backlog(show) * 2) + (show.status === "watching" ? 5 : 0);
      return score(b) - score(a);
    });
    for (let i = 0; i < ranked.length; i++) {
      const { data, error: updateError } = await supabase.from("series_tracker_shows").update({ plan_order: i + 1, updated_at: new Date().toISOString() }).eq("id", ranked[i].id).select().single();
      if (updateError) { setError("จัดลำดับคิวไม่สำเร็จ: " + updateError.message); return; }
      setShows(current => current.map(item => item.id === ranked[i].id ? data : item));
    }
    setNotice("จัดคิวตามคะแนนความอยากดูและจำนวนตอนค้างแล้ว"); setTimeout(() => setNotice(""), 2500);
  };
  const moveQueueItem = async (show, direction) => {
    const index = queueShows.findIndex(item => item.id === show.id); const target = index + direction;
    if (target < 0 || target >= queueShows.length) return;
    const reordered = [...queueShows]; [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    for (let i = 0; i < reordered.length; i++) {
      const { data, error: updateError } = await supabase.from("series_tracker_shows").update({ plan_order: i + 1, updated_at: new Date().toISOString() }).eq("id", reordered[i].id).select().single();
      if (updateError) { setError("บันทึกลำดับคิวไม่สำเร็จ: " + updateError.message); await loadShows(); return; }
      setShows(current => current.map(item => item.id === reordered[i].id ? data : item));
    }
  };

  const today = new Date();
  const todayKey = localDateKey(today);
  const todayName = AIR_DAYS[(today.getDay() + 6) % 7];
  const airingToday = useMemo(() => shows.filter(show => show.status === "watching" && (show.next_episode_date === todayKey || parseReleaseDays(show.release_day).includes(todayName))), [shows, todayKey, todayName]);
  const todayEpisodeCount = todayActivity.reduce((sum, item) => sum + Math.max(0, Number(item.episode_delta) || 0), 0);
  const todayWatchedTitles = [...new Set(todayActivity.filter(item => Number(item.episode_delta) > 0).map(item => item.show_title))];

  function openAdd() { setForm({ ...EMPTY }); setError(""); setModal(true); }
  function openEdit(show) { setForm({ ...EMPTY, ...show, plan_episodes: show.plan_episodes || 3, rating: show.rating || 3, episodes_per_release: show.episodes_per_release || 1, episode_duration_minutes: show.episode_duration_minutes || 45, released_episodes: show.released_episodes ?? "", total_episodes: show.total_episodes ?? "", next_episode_date: show.next_episode_date || "" }); setError(""); setModal(true); }
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
      user_id: "00000000-0000-0000-0000-000000000001",
      title: form.title.trim(), original_title: form.original_title?.trim() || null,
      poster_url: form.poster_url?.trim() || null, genre: form.genre?.trim() || null, country: form.country?.trim() || null,
      season_number: Math.max(1, Number(form.season_number) || 1), watched_episodes: watched,
      released_episodes: released, total_episodes: total, status: form.status,
      plan_episodes: Math.min(30, Math.max(1, Number(form.plan_episodes) || 3)), episodes_per_release: Math.min(10, Math.max(1, Number(form.episodes_per_release) || 1)), episode_duration_minutes: Math.min(240, Math.max(5, Number(form.episode_duration_minutes) || 45)), rating: Math.min(5, Math.max(1, Number(form.rating) || 3)), plan_order: Number(form.plan_order) || 0,
      release_day: form.release_day || null, next_episode_date: form.next_episode_date || null,
      notes: form.notes?.trim() || null, updated_at: new Date().toISOString(),
    };
    setSaving(true); setError("");
    const result = form.id
      ? await supabase.from("series_tracker_shows").update(payload).eq("id", form.id).select().single()
      : await supabase.from("series_tracker_shows").insert(payload).select().single();
    if (result.error) { setError("บันทึกไม่สำเร็จ: " + result.error.message); setSaving(false); return; }
    setShows(current => form.id ? current.map(item => item.id === form.id ? result.data : item) : [result.data, ...current]);
    if (!form.id) await loadShows();
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
    const nextStatus = show.total_episodes !== null && next === show.total_episodes ? "completed" : ["planned","paused"].includes(show.status) && delta > 0 ? "watching" : show.status === "completed" && next < show.total_episodes ? "watching" : show.status;
    const { data, error: updateError } = await supabase.from("series_tracker_shows").update({ watched_episodes: next, status: nextStatus, updated_at: new Date().toISOString() }).eq("id", show.id).select().single();
    if (updateError) setError("อัปเดตตอนไม่สำเร็จ: " + updateError.message);
    else {
      setShows(current => current.map(item => item.id === show.id ? data : item));
      if (delta > 0) {
        const { data: activity } = await supabase.from("series_tracker_activity").insert({ user_id: "00000000-0000-0000-0000-000000000001", show_id: show.id, show_title: show.title, episode_delta: delta }).select("id, show_id, show_title, episode_delta, created_at").single();
        if (activity) setTodayActivity(current => [activity, ...current]);
      }
    }
  }

  async function quickStatus(show, status) {
    const { data, error: updateError } = await supabase.from("series_tracker_shows").update({ status, updated_at: new Date().toISOString() }).eq("id", show.id).select().single();
    if (updateError) setError(updateError.message);
    else setShows(current => current.map(item => item.id === show.id ? data : item));
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
      <header className="topbar"><div className="breadcrumb">MY LIBRARY <span>/</span> {active === "all" ? "OVERVIEW" : active === "queue" ? "FLASHCARD QUEUE" : STATUS[active]?.label?.toUpperCase()}</div><div className="topbar-right"><span className="sync-state"><i /> SYNCED</span><button className="button primary add-top" onClick={openAdd}>＋ เพิ่มซีรีส์</button></div></header>
      <div className="content-wrap">
        <section className="welcome-row"><div><span className="eyebrow">YOUR WATCH JOURNAL</span><h1>วันนี้ดูอะไรดี <em>?</em></h1><p>การ์ดซีรีส์ทั้งหมดของคุณ พร้อมสถานะตอนล่าสุดและกำหนดออกอากาศ</p></div><div className="date-pill">{new Date().toLocaleDateString("th-TH", { weekday:"long", day: "numeric", month: "long", year: "numeric" })}</div></section>
        <section className="today-dashboard">
          <div className="today-summary">
            <span className="eyebrow">TODAY AT A GLANCE</span>
            <h2>สรุปการดูวันนี้</h2>
            <div className="today-kpis">
              <div><strong>{todayEpisodeCount}</strong><span>ตอนที่ดูวันนี้</span></div>
              <div><strong>{airingToday.length}</strong><span>เรื่องที่มีตอนใหม่วันนี้</span></div>
              <div><strong>{todayWatchedTitles.length}</strong><span>เรื่องที่ได้ดูวันนี้</span></div>
            </div>
            <p className="today-watched-note">{todayWatchedTitles.length ? "วันนี้คุณดู: " + todayWatchedTitles.join(" · ") : "ยังไม่มีประวัติการดูวันนี้ กดปุ่ม + บนการ์ดเมื่อดูจบแต่ละตอน"}</p>
          </div>
          <div className="today-notices">
            <div className="today-notice-heading"><div><span className="eyebrow">NEW EPISODES</span><h3>วันนี้มีเรื่องไหนมา</h3></div><span className="today-date-tag">{todayName}</span></div>
            {!dataReady ? <p className="today-empty">กำลังตรวจสอบตารางออกอากาศ…</p> : airingToday.length ? airingToday.map(show => <div className="today-release-row" key={show.id}>
              <div className="today-release-poster">{show.poster_url ? <img src={show.poster_url} alt="" /> : <b>{show.title.slice(0,1)}</b>}</div>
              <div className="today-release-copy"><strong>{show.title}</strong><span>{show.next_episode_date === todayKey ? "กำหนดตอนใหม่วันนี้" : releaseDayLabel(show.release_day)}</span></div>
              <b className="today-release-count">+{Math.max(1, Number(show.episodes_per_release) || 1)} ตอน</b>
            </div>) : <div className="today-empty">ไม่มีซีรีส์ที่กำหนดให้ออกวันนี้ ✧<small>เพิ่มวันออกอากาศหรือวันตอนถัดไปในรายละเอียดซีรีส์ได้</small></div>}
          </div>
        </section>
        {active === "queue" && <section className="flashcard-queue-section">
          <div className="flashcard-queue-heading"><div><span className="eyebrow">YOUR NEXT WATCH LIST</span><h2>Flashcard Queue <span>{queueShows.length} เรื่อง</span></h2><p>คิวซีรีย์ที่คุณเลือกเอง จัดลำดับและปรับจำนวนตอนที่จะดูได้ตลอด</p></div><button className="button primary" onClick={smartArrangeQueue} disabled={queueShows.length < 2}>✦ จัดคิวอัจฉริยะ</button></div>
          <div className="flashcard-queue-stats"><div><small>ตอนที่ค้างทั้งหมด</small><strong>{queueBacklog.toLocaleString("th-TH")} <i>ตอน</i></strong></div><div><small>เวลาที่ต้องใช้โดยประมาณ</small><strong>{Math.floor(queueMinutes / 60)} <i>ชม.</i> {queueMinutes % 60} <i>นาที</i></strong></div><div><small>เรื่องที่อยู่ในคิว</small><strong>{queueShows.length} <i>เรื่อง</i></strong></div></div>
          {queueShows.length ? <div className="flashcard-queue-grid">{queueShows.map((show,index) => { const waiting = backlog(show); const duration = Number(show.episode_duration_minutes) || 45; const target = Math.min(waiting, Math.max(1, Number(show.plan_episodes) || 3)); return <article className="flashcard-queue-card" key={show.id}><div className="flashcard-queue-poster">{show.poster_url ? <img src={show.poster_url} alt={show.title} /> : <div className="poster-placeholder"><b>{show.title.slice(0,2).toUpperCase()}</b><small>SERIES</small></div>}<span>#{index + 1}</span></div><div className="flashcard-queue-body"><div className="flashcard-queue-top"><span className={"status-tag " + STATUS[show.status]?.tone}>{STATUS[show.status]?.label}</span><button className="more-button" onClick={() => openEdit(show)} aria-label={"แก้ไข " + show.title}>···</button></div><h3>{show.title}</h3><div className="flashcard-stars">{"★".repeat(Number(show.rating) || 3)}{"☆".repeat(5 - (Number(show.rating) || 3))}</div><div className="flashcard-queue-progress"><span>ดูแล้ว {show.watched_episodes} ตอน</span><b>{waiting} ตอนค้าง</b></div><div className="flashcard-queue-track"><i style={{width:(show.total_episodes ? Math.min(100, show.watched_episodes / Math.max(1,show.total_episodes)*100) : 0) + "%"}} /></div><div className="flashcard-target"><div><small>เป้าหมายรอบถัดไป</small><strong>{target} ตอน · ประมาณ {target * duration} นาที</strong></div><button onClick={() => openEdit(show)}>ปรับแผน</button></div><div className="flashcard-queue-actions"><button onClick={() => moveQueueItem(show,-1)} disabled={index===0} aria-label="เลื่อนขึ้น">↑</button><button onClick={() => moveQueueItem(show,1)} disabled={index===queueShows.length-1} aria-label="เลื่อนลง">↓</button>{show.status !== "watching" && <button className="queue-start" onClick={() => quickStatus(show,"watching")}>เริ่มดู</button>}<button className="queue-watch" onClick={() => changeEpisodes(show,1)} disabled={show.total_episodes !== null && show.watched_episodes >= show.total_episodes}>＋ ดูแล้ว 1 ตอน</button></div></div></article>; })}</div> : <div className="flashcard-queue-empty"><strong>คิวยังว่างอยู่</strong><p>เพิ่มซีรีย์แล้วเลือกสถานะ “อยากดู” หรือ “กำลังดู” เพื่อให้เรื่องนั้นเข้ามาอยู่ในคิวนี้</p><button className="button primary" onClick={openAdd}>＋ เพิ่มซีรีส์เข้าคิว</button></div>}
        </section>}
        {active !== "queue" && <section className="stats-grid compact-stats">
          <div className="stat-card"><span className="stat-icon lavender">▣</span><span className="stat-label">ซีรีส์ทั้งหมด</span><strong>{counts.all}</strong><small>เรื่องในคลังของคุณ</small></div>
          <div className="stat-card"><span className="stat-icon blue">▶</span><span className="stat-label">กำลังดู</span><strong>{counts.watching}</strong><small>เรื่องที่ติดตามอยู่</small></div>
          <div className="stat-card"><span className="stat-icon peach">◷</span><span className="stat-label">ดูวันนี้</span><strong>{todayEpisodeCount}</strong><small>ตอนที่บันทึกในวันนี้</small></div>
          <div className="stat-card"><span className="stat-icon mint">≋</span><span className="stat-label">ตอนค้างดู</span><strong>{totals.backlog}</strong><small>จากเรื่องที่กำลังดู</small></div>
        </section>}
        {error && <div className="notice error inline-notice">{error}<button onClick={() => setError("")}>×</button></div>}
        {notice && <div className="notice success inline-notice">{notice}</div>}
        {active !== "queue" && <>
        <section className="section-heading"><div><span className="eyebrow">YOUR SERIES CARDS</span><h2>{active === "all" ? "การ์ดซีรีส์ของฉัน" : active === "queue" ? "ซีรีย์ในคิว" : STATUS[active]?.label || "การ์ดซีรีส์ของฉัน"} <span>{filtered.length}</span></h2></div><div className="search-box"><span>⌕</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="ค้นหาชื่อเรื่อง…" /></div></section>
        <div className="filter-row">{NAV.map(item => <button key={item.id} className={active === item.id ? "filter-chip selected" : "filter-chip"} onClick={() => setActive(item.id)}>{item.label}</button>)}</div>
        {!dataReady ? <div className="empty-state"><span className="loader" /><p>กำลังซิงก์ข้อมูลของคุณ…</p></div> :
          filtered.length === 0 ? <div className="empty-state"><div className="empty-illustration">✧</div><h3>{query ? "ไม่พบเรื่องที่ค้นหา" : "พื้นที่นี้ยังว่างอยู่"}</h3><p>{query ? "ลองค้นหาด้วยชื่อเรื่องอื่น" : "เพิ่มซีรีส์ที่กำลังดูหรืออยากดู แล้วการ์ดของเรื่องนั้นจะอยู่ที่นี่"}</p>{!query && <button className="button primary" onClick={openAdd}>＋ เพิ่มซีรีส์</button>}</div> :
          <div className="series-grid">{filtered.map(show => {
            const pct = progress(show);
            return <article className="series-card" key={show.id}>
              <button className="poster-thumb" onClick={() => openEdit(show)} aria-label={"แก้ไข " + show.title}>
                {show.poster_url ? <img src={show.poster_url} alt={show.title} /> : <div className="poster-placeholder"><span>✦</span><b>{show.title.slice(0,2).toUpperCase()}</b><small>SERIES</small></div>}
                <span className={"status-tag " + STATUS[show.status]?.tone}>{STATUS[show.status]?.label}</span>
              </button>
              <div className="series-info">
                <div className="series-title-row"><div><h3>{show.title}</h3>{show.original_title && <p className="original-title">{show.original_title}</p>}<div className="series-rating">{"★".repeat(show.rating || 3)}{"☆".repeat(5 - (show.rating || 3))}</div></div><button className="more-button" onClick={() => openEdit(show)} aria-label="แก้ไข">···</button></div>
                <div className="series-meta"><span>ซีซัน {show.season_number}</span>{show.genre && <><i>·</i><span>{show.genre}</span></>}{show.country && <><i>·</i><span>{show.country}</span></>}{show.release_day && <><i>·</i><span className="airing-label">{releaseDayLabel(show.release_day)}</span></>}</div>
                <div className="episode-line"><strong>EP {show.watched_episodes}</strong><span>/ {show.total_episodes ?? show.released_episodes ?? "—"}</span>{pct !== null && <b>{pct}%</b>}</div>
                <div className="progress-track"><div className="progress-value" style={{ width: (pct ?? 0) + "%" }} /></div>
                <div className="card-bottom"><div className="backlog-copy">{show.status === "watching" ? <><strong>{backlog(show)}</strong> ตอนค้างดู</> : show.status === "planned" ? "รอเริ่มรับชม" : show.status === "completed" ? "รับชมครบแล้ว" : STATUS[show.status]?.label}</div>
                  {show.status === "watching" && <div className="episode-actions"><button onClick={() => changeEpisodes(show, -1)} disabled={show.watched_episodes <= 0}>−</button><button onClick={() => changeEpisodes(show, 1)} disabled={show.total_episodes !== null && show.watched_episodes >= show.total_episodes}>＋</button></div>}
                </div>
                {show.next_episode_date && <div className="next-episode">✦ ตอนต่อไป {formatDate(show.next_episode_date)}</div>}
              </div>
            </article>;
          })}</div>
        }
        </>}
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
        <label className="wide rating-field">ความอยากดู <span className="field-hint">ให้คะแนนความชอบส่วนตัว</span><div className="rating-picker" role="group" aria-label="คะแนนความอยากดู">{[1,2,3,4,5].map(star => <button type="button" key={star} className={star <= (Number(form.rating) || 3) ? "rating-star active" : "rating-star"} onClick={() => setForm({ ...form, rating: star })} aria-label={star + " ดาว"}>★</button>)}<b>{form.rating || 3}/5</b></div></label>
        <label>ปล่อยครั้งละกี่ตอน<input type="number" min="1" max="10" value={form.episodes_per_release || 1} onChange={e => setForm({ ...form, episodes_per_release: e.target.value })} /><small className="field-hint">เช่น 2 ตอนต่อวันออกอากาศ</small></label>
        <label>ความยาวต่อตอน (นาที)<input type="number" min="5" max="240" step="1" value={form.episode_duration_minutes || 45} onChange={e => setForm({ ...form, episode_duration_minutes: e.target.value })} /><small className="field-hint">กำหนดแยกแต่ละเรื่อง เช่น อนิเมะ 24 นาที</small></label>\n        <label>เป้าหมายตอนต่อครั้ง<input type="number" min="1" max="30" value={form.plan_episodes || 3} onChange={e => setForm({ ...form, plan_episodes: e.target.value })} /><small className="field-hint">ใช้คำนวณเวลาที่ต้องใช้ในคิว</small></label>
        <label>ออกอากาศแล้ว<input type="number" min="0" value={form.released_episodes} onChange={e => setForm({ ...form, released_episodes: e.target.value })} placeholder="ถ้าทราบ" /></label>
        <label>จำนวนตอนทั้งหมด<input type="number" min="0" value={form.total_episodes} onChange={e => setForm({ ...form, total_episodes: e.target.value })} placeholder="ถ้าทราบ" /></label>
        <fieldset className="wide air-days-field"><legend>วันออกอากาศ <span className="field-hint">เลือกได้มากกว่า 1 วัน</span></legend><div className="air-days-picker">{AIR_DAYS.map(day => { const selected = parseReleaseDays(form.release_day).includes(day); return <label key={day} className={selected ? "air-day selected" : "air-day"}><input type="checkbox" checked={selected} onChange={e => { const days = parseReleaseDays(form.release_day); const next = e.target.checked ? [...days, day] : days.filter(item => item !== day); setForm({ ...form, release_day: AIR_DAYS.filter(item => next.includes(item)).join(",") }); }} /><span>{day}</span></label>; })}</div><small className="field-hint">ไม่เลือกวันได้ หากยังไม่ทราบตารางออกอากาศ</small></fieldset>
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
