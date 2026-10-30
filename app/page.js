'use client';

import { useEffect, useMemo, useState } from 'react';

const STORE = 'series-tracker-v3';
const WEEKDAYS = ['อา.','จ.','อ.','พ.','พฤ.','ศ.','ส.'];
const EMPTY = [];
const uid = () => typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2);
const dateKey = (d) => { const x = new Date(d); return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0'); };
const parseDate = (s) => s ? new Date(s+'T12:00:00') : null;
const fmtDate = (s) => { const d=parseDate(s); return d ? d.toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric'}) : 'ยังไม่กำหนด'; };
const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
const defaultShow = () => ({id:uid(),title:'',englishTitle:'',poster:'',totalEpisodes:'',releasedEpisodes:0,watchedEpisodes:0,status:'watching',priority:'normal',releaseDays:[],episodesPerRelease:1,releaseStart:'',releaseEnd:'',nextReleaseDate:'',notes:'',updatedAt:new Date().toISOString()});
function calc(show) {
  const total = Math.max(0, Number(show.totalEpisodes)||0);
  const released = clamp(Number(show.releasedEpisodes)||0,0,total||Number.MAX_SAFE_INTEGER);
  const watched = clamp(Number(show.watchedEpisodes)||0,0,released);
  return {total,released,watched,backlog:Math.max(0,released-watched),unreleased:Math.max(0,total-released),progress:total?Math.round(watched/total*100):0,nextWatch:watched+1};
}
function getNextRelease(show, from=new Date()) {
  if (show.status==='completed'||show.status==='paused'||show.status==='planned'||!show.releaseDays?.length) return null;
  const today = new Date(from.getFullYear(),from.getMonth(),from.getDate(),12);
  if (show.nextReleaseDate) {
    const manual=parseDate(show.nextReleaseDate);
    if (manual && manual >= today) return dateKey(manual);
  }
  for(let i=0;i<15;i++){
    const d=new Date(today); d.setDate(today.getDate()+i);
    if(show.releaseDays.includes(d.getDay()) && (!show.releaseStart || dateKey(d)>=show.releaseStart) && (!show.releaseEnd || dateKey(d)<=show.releaseEnd)) return dateKey(d);
  }
  return null;
}
function releasesInMonth(shows, year, month) {
  const map={}; const days=new Date(year,month+1,0).getDate();
  for(let day=1;day<=days;day++){
    const d=new Date(year,month,day,12); const key=dateKey(d);
    for(const s of shows){
      if(!s.releaseDays?.includes(d.getDay()) || s.status==='completed'||s.status==='paused'||s.status==='planned') continue;
      if(s.releaseStart && key<s.releaseStart) continue;
      if(s.releaseEnd && key>s.releaseEnd) continue;
      const c=calc(s); if(c.unreleased<=0) continue;
      map[key] ||= [];
      map[key].push({id:s.id,title:s.title,episodes:Math.min(Number(s.episodesPerRelease)||1,c.unreleased),color:s.color||'violet'});
    }
  }
  for(const s of shows){
    if(s.nextReleaseDate && s.status!=='completed' && s.status!=='paused' && s.status!=='planned'){
      const d=parseDate(s.nextReleaseDate); if(d && d.getFullYear()===year && d.getMonth()===month){
        const key=dateKey(d); const c=calc(s);
        if(c.unreleased>0){map[key] ||= []; if(!map[key].some(x=>x.id===s.id)) map[key].push({id:s.id,title:s.title,episodes:Math.min(Number(s.episodesPerRelease)||1,c.unreleased),color:s.color||'violet'});}
      }
    }
  }
  return map;
}
const money = (n) => new Intl.NumberFormat('th-TH').format(n);
const COLORS = ['violet','rose','blue','amber','emerald','fuchsia'];

export default function Home() {
  const [shows,setShows]=useState([]);
  const [ready,setReady]=useState(false);
  const [tab,setTab]=useState('home');
  const [query,setQuery]=useState('');
  const [filter,setFilter]=useState('all');
  const [editing,setEditing]=useState(null);
  const [form,setForm]=useState(defaultShow);
  const [month,setMonth]=useState(()=>new Date(new Date().getFullYear(),new Date().getMonth(),1));
  const [selectedDay,setSelectedDay]=useState(dateKey(new Date()));
  const [toast,setToast]=useState('');

  useEffect(()=>{try{const raw=localStorage.getItem(STORE); if(raw) setShows(JSON.parse(raw)); else {const old=localStorage.getItem('series-tracker'); if(old) {const parsed=JSON.parse(old); if(Array.isArray(parsed)) setShows(parsed.map(s=>({...defaultShow(),...s,id:s.id||uid(),title:s.title||s.name||'',releasedEpisodes:s.releasedEpisodes??s.currentEpisode??s.episodesReleased??0,watchedEpisodes:s.watchedEpisodes??s.watched??s.currentEpisode??0,totalEpisodes:s.totalEpisodes??s.total??''})));}}}catch(e){} setReady(true);},[]);
  useEffect(()=>{if(ready) localStorage.setItem(STORE,JSON.stringify(shows));},[shows,ready]);
  useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(''),2600);return()=>clearTimeout(t);},[toast]);

  const active=shows.filter(s=>!['completed','paused','planned'].includes(s.status));
  const totalBacklog=active.reduce((n,s)=>n+calc(s).backlog,0);
  const todayKey=dateKey(new Date());
  const todayReleases=useMemo(()=>releasesInMonth(shows,new Date().getFullYear(),new Date().getMonth())[todayKey]||[],[shows,todayKey]);
  const ranked=useMemo(()=>active.map(s=>({...s,stats:calc(s),next:getNextRelease(s)})).sort((a,b)=>{
    const rank=s=> (s.priority==='high'?4:s.priority==='low'?0:1)+(s.next===todayKey?3:0)+(s.releaseEnd && s.releaseEnd<=dateKey(new Date(Date.now()+7*86400000))?2:0)+(s.stats.backlog>0?1:0);
    return rank(b)-rank(a)||b.stats.backlog-a.stats.backlog;
  }),[active,todayKey]);
  const calendar=useMemo(()=>releasesInMonth(shows,month.getFullYear(),month.getMonth()),[shows,month]);
  const filtered=shows.filter(s=>(filter==='all'||s.status===filter)&&((s.title||'').toLowerCase().includes(query.toLowerCase())||(s.englishTitle||'').toLowerCase().includes(query.toLowerCase())));
  const upcoming=Object.entries(calendar).filter(([d])=>d>=todayKey).sort(([a],[b])=>a.localeCompare(b)).slice(0,5);

  function openNew(){setEditing(null);setForm(defaultShow());setTab('form');}
  function openEdit(s){setEditing(s.id);setForm({...defaultShow(),...s,releaseDays:s.releaseDays||[]});setTab('form');}
  function save(e){e.preventDefault();if(!form.title.trim()){setToast('กรุณาใส่ชื่อซีรีส์');return;}
    const next={...form,id:editing||uid(),title:form.title.trim(),releasedEpisodes:Math.max(0,Number(form.releasedEpisodes)||0),watchedEpisodes:Math.max(0,Number(form.watchedEpisodes)||0),episodesPerRelease:Math.max(1,Number(form.episodesPerRelease)||1),updatedAt:new Date().toISOString()};
    if(next.totalEpisodes!=='') next.releasedEpisodes=Math.min(next.releasedEpisodes,Number(next.totalEpisodes)||0);
    next.watchedEpisodes=Math.min(next.watchedEpisodes,next.releasedEpisodes);
    setShows(prev=>editing?prev.map(s=>s.id===editing?next:s):[next,...prev]);
    setToast(editing?'บันทึกการแก้ไขแล้ว':'เพิ่มซีรีส์แล้ว');setTab('shows');
  }
  function updateShow(id,patch){setShows(prev=>prev.map(s=>s.id===id?{...s,...patch,updatedAt:new Date().toISOString()}:s));}
  function watched(id,delta){const s=shows.find(x=>x.id===id);if(!s)return;const c=calc(s);updateShow(id,{watchedEpisodes:clamp(c.watched+delta,0,c.released)});setToast(delta>0?'อัปเดตตอนที่ดูแล้ว':'ย้อนจำนวนตอนที่ดู');}
  function deleteShow(id){const s=shows.find(x=>x.id===id);if(!s)return;if(!confirm('ลบเรื่อง “'+s.title+'” ออกจากรายการใช่ไหม?'))return;setShows(prev=>prev.filter(x=>x.id!==id));setToast('ลบซีรีส์แล้ว');}
  function exportData(){const blob=new Blob([JSON.stringify(shows,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='series-tracker-backup.json';a.click();URL.revokeObjectURL(a.href);setToast('ดาวน์โหลดไฟล์สำรองแล้ว');}
  function importData(e){const file=e.target.files?.[0];if(!file)return;const reader=new FileReader();reader.onload=()=>{try{const data=JSON.parse(reader.result);if(!Array.isArray(data))throw new Error();if(!confirm('นำเข้าข้อมูล '+data.length+' เรื่อง? ข้อมูลปัจจุบันจะถูกแทนที่'))return;setShows(data.map(s=>({...defaultShow(),...s,id:s.id||uid()})));setToast('นำเข้าข้อมูลแล้ว');}catch{setToast('ไฟล์ไม่ถูกต้อง');}};reader.readAsText(file);e.target.value='';}
  function shiftMonth(delta){setMonth(prev=>new Date(prev.getFullYear(),prev.getMonth()+delta,1));}
  const monthTitle=month.toLocaleDateString('th-TH',{month:'long',year:'numeric'});
  const firstOffset=new Date(month.getFullYear(),month.getMonth(),1).getDay();
  const monthDays=new Date(month.getFullYear(),month.getMonth()+1,0).getDate();

  if(!ready) return <main className="loading">กำลังเตรียมชั้นวางซีรีส์ของคุณ…</main>;
  return <main className="app-shell">
    <aside className="sidebar">
      <button className="brand" onClick={()=>setTab('home')}><span className="brand-mark">S</span><span><strong>SeriDays</strong><small>your series companion</small></span></button>
      <div className="side-label">เมนูหลัก</div>
      {[['home','⌂','ภาพรวม'],['shows','▤','ซีรีส์ของฉัน'],['calendar','▦','ปฏิทินวันออน']].map(([id,icon,label])=><button key={id} className={'nav-item '+(tab===id?'active':'')} onClick={()=>setTab(id)}><span>{icon}</span>{label}{id==='shows'&&shows.length>0&&<em>{shows.length}</em>}</button>)}
      <div className="sidebar-bottom"><div className="mini-quote">“อีกหนึ่งตอน…แล้วค่อยนอน”</div><button className="nav-item" onClick={exportData}><span>⇩</span>สำรองข้อมูล</button><label className="nav-item import-label"><span>⇧</span>นำเข้าข้อมูล<input type="file" accept="application/json" onChange={importData} hidden/></label><div className="local-note"><span className="online-dot"/>ข้อมูลบันทึกในอุปกรณ์นี้</div></div>
    </aside>
    <section className="main-area">
      <header className="topbar"><div><div className="eyebrow">{new Date().toLocaleDateString('th-TH',{weekday:'long',day:'numeric',month:'long'})}</div><div className="top-title">{tab==='home'?'พื้นที่พักใจของคุณ':tab==='shows'?'ชั้นวางซีรีส์':tab==='calendar'?'ตารางวันออน':'จัดการข้อมูลซีรีส์'}</div></div><button className="primary-btn" onClick={openNew}><span>＋</span> เพิ่มซีรีส์</button></header>
      {tab==='form' ? <div className="content form-content"><button className="back-link" onClick={()=>setTab('shows')}>← กลับไปยังซีรีส์</button><div className="section-heading"><div><div className="eyebrow">{editing?'EDIT SERIES':'NEW SERIES'}</div><h1>{editing?'แก้ไขข้อมูลซีรีส์':'เพิ่มซีรีส์เรื่องใหม่'}</h1><p>กรอกเท่าที่รู้ได้เลย ระบบจะช่วยคำนวณตอนค้างให้เอง</p></div></div>
        <form className="form-card" onSubmit={save}>
          <div className="form-section-title">ข้อมูลเรื่อง <span>01</span></div>
          <div className="form-grid"><label className="field wide"><span>ชื่อซีรีส์ <b>*</b></span><input autoFocus value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="ชื่อเรื่องที่คุณกำลังดู" required/></label><label className="field"><span>ชื่อภาษาอังกฤษ / ชื่ออื่น</span><input value={form.englishTitle} onChange={e=>setForm({...form,englishTitle:e.target.value})} placeholder="Optional"/></label><label className="field"><span>ลิงก์โปสเตอร์ (ถ้ามี)</span><input value={form.poster} onChange={e=>setForm({...form,poster:e.target.value})} placeholder="https://…"/></label></div>
          <div className="form-section-title">จำนวนตอน <span>02</span></div>
          <div className="form-grid three"><label className="field"><span>จำนวนตอนทั้งหมด</span><input type="number" min="0" value={form.totalEpisodes} onChange={e=>setForm({...form,totalEpisodes:e.target.value})} placeholder="เช่น 40"/></label><label className="field"><span>ออนถึงตอนที่</span><input type="number" min="0" value={form.releasedEpisodes} onChange={e=>setForm({...form,releasedEpisodes:e.target.value})} placeholder="เช่น 28"/></label><label className="field"><span>คุณดูจบถึง EP.</span><input type="number" min="0" value={form.watchedEpisodes} onChange={e=>setForm({...form,watchedEpisodes:e.target.value})} placeholder="เช่น 23"/></label></div>
          <div className="calc-preview"><div><span>ตอนค้างดู</span><strong>{Math.max(0,(Number(form.releasedEpisodes)||0)-(Number(form.watchedEpisodes)||0))} <small>ตอน</small></strong></div><div><span>ยังไม่ออน</span><strong>{form.totalEpisodes===''?'—':Math.max(0,(Number(form.totalEpisodes)||0)-(Number(form.releasedEpisodes)||0))} <small>ตอน</small></strong></div><div><span>ดูแล้ว</span><strong>{form.totalEpisodes?Math.round((Number(form.watchedEpisodes)||0)/(Number(form.totalEpisodes)||1)*100):0}<small>%</small></strong></div></div>
          <div className="form-section-title">ตารางออน <span>03</span></div>
          <div className="field"><span>วันที่มีตอนใหม่</span><div className="weekday-picker">{WEEKDAYS.map((d,i)=><button type="button" key={d} className={form.releaseDays.includes(i)?'weekday selected':'weekday'} onClick={()=>setForm({...form,releaseDays:form.releaseDays.includes(i)?form.releaseDays.filter(x=>x!==i):[...form.releaseDays,i].sort()})}>{d}</button>)}</div><small className="hint">เลือกวันตามตารางจริง ระบบจะคาดการณ์วันออนในปฏิทินให้</small></div>
          <div className="form-grid three"><label className="field"><span>ออนกี่ตอนต่อวัน</span><input type="number" min="1" max="20" value={form.episodesPerRelease} onChange={e=>setForm({...form,episodesPerRelease:e.target.value})}/></label><label className="field"><span>วันเริ่มออน (ไม่บังคับ)</span><input type="date" value={form.releaseStart} onChange={e=>setForm({...form,releaseStart:e.target.value})}/></label><label className="field"><span>วันออนจบ (ไม่บังคับ)</span><input type="date" value={form.releaseEnd} onChange={e=>setForm({...form,releaseEnd:e.target.value})}/></label><label className="field"><span>วันออนตอนถัดไป (ระบุเอง)</span><input type="date" value={form.nextReleaseDate} onChange={e=>setForm({...form,nextReleaseDate:e.target.value})}/></label></div>
          <div className="form-section-title">การจัดการ <span>04</span></div><div className="form-grid three"><label className="field"><span>สถานะ</span><select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}><option value="watching">กำลังดู / กำลังออน</option><option value="planned">อยากดู / ยังไม่เริ่ม</option><option value="paused">พักไว้ก่อน</option><option value="completed">ดูจบแล้ว</option></select></label><label className="field"><span>ความสำคัญ</span><select value={form.priority} onChange={e=>setForm({...form,priority:e.target.value})}><option value="normal">ปกติ</option><option value="high">สำคัญมาก</option><option value="low">ดูเมื่อว่าง</option></select></label><label className="field"><span>หมายเหตุ</span><input value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="เช่น ดูกับเพื่อน"/></label></div>
          <div className="form-actions"><button type="button" className="secondary-btn" onClick={()=>setTab('shows')}>ยกเลิก</button><button type="submit" className="primary-btn">✓ บันทึกซีรีส์</button></div>
        </form></div> :
      tab==='calendar' ? <div className="content"><div className="section-heading"><div><div className="eyebrow">RELEASE PLANNER</div><h1>ปฏิทินวันออน</h1><p>ตารางนี้คำนวณจากวันที่คุณกรอก · แตะวันที่เพื่อดูรายละเอียด</p></div><div className="month-switch"><button onClick={()=>shiftMonth(-1)}>‹</button><strong>{monthTitle}</strong><button onClick={()=>shiftMonth(1)}>›</button></div></div>
        <div className="calendar-layout"><div className="calendar-card"><div className="calendar-grid weekday-head">{WEEKDAYS.map(d=><div key={d}>{d}</div>)}</div><div className="calendar-grid">{Array.from({length:firstOffset},(_,i)=><div key={'blank'+i} className="calendar-day blank"/>)}{Array.from({length:monthDays},(_,i)=>{const day=i+1,d=new Date(month.getFullYear(),month.getMonth(),day,12),key=dateKey(d),items=calendar[key]||[];return <button key={key} className={'calendar-day '+(key===selectedDay?'chosen ':'')+(key===todayKey?' today':'')} onClick={()=>setSelectedDay(key)}><span className="day-number">{day}</span>{items.slice(0,2).map(item=><span key={item.id} className={'event-pill '+item.color}>{item.title} · {item.episodes} EP</span>)}{items.length>2&&<span className="more-events">+{items.length-2} เรื่อง</span>}</button>})}</div><div className="calendar-legend"><span><i className="legend-dot violet"/> วันออนตามตาราง</span><span>ข้อมูลจากตารางที่คุณบันทึกไว้</span></div></div>
        <aside className="day-detail"><div className="eyebrow">SELECTED DAY</div><h2>{fmtDate(selectedDay)}</h2>{(calendar[selectedDay]||[]).length===0?<div className="empty-day"><span>☁</span><strong>ยังไม่มีตอนใหม่</strong><p>วันที่นี้ไม่มีซีรีส์ตามตารางที่บันทึกไว้</p></div>:(calendar[selectedDay]||[]).map(item=><div className="day-series" key={item.id}><div className="series-avatar">{item.title?.slice(0,1)||'S'}</div><div><strong>{item.title}</strong><span>คาดว่าจะออน {item.episodes} ตอน</span></div><button onClick={()=>{const s=shows.find(x=>x.id===item.id);if(s)openEdit(s)}}>แก้ไข</button></div>)}<div className="calendar-tip"><strong>หมายเหตุ</strong><p>วันออนเป็นการคาดการณ์จากตารางที่คุณกรอก หากมีการเลื่อนฉาย ให้แก้ไขวันออนตอนถัดไปในหน้ารายละเอียดซีรีส์</p></div></aside></div></div> :
      tab==='shows' ? <div className="content"><div className="section-heading"><div><div className="eyebrow">YOUR COLLECTION</div><h1>ซีรีส์ทั้งหมด <span className="heading-count">{shows.length}</span></h1><p>ทุกเรื่องที่คุณติดตาม พร้อมจำนวนตอนค้างแบบอัปเดตทันที</p></div></div><div className="toolbar"><div className="search-box"><span>⌕</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="ค้นหาชื่อซีรีส์…"/></div><select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">ทุกสถานะ</option><option value="watching">กำลังดู</option><option value="planned">อยากดู</option><option value="paused">พักไว้</option><option value="completed">ดูจบแล้ว</option></select></div>
        {filtered.length===0?<div className="empty-state"><div className="empty-illustration">✦</div><h2>{shows.length?'ไม่พบซีรีส์ที่ค้นหา':'เริ่มสร้างชั้นวางซีรีส์ของคุณ'}</h2><p>{shows.length?'ลองเปลี่ยนคำค้นหาหรือตัวกรอง':'เพิ่มเรื่องแรก แล้วระบบจะช่วยนับตอนค้างและวางแผนวันออนให้'}</p>{!shows.length&&<button className="primary-btn" onClick={openNew}>＋ เพิ่มซีรีส์เรื่องแรก</button>}</div>:<div className="series-list">{filtered.map(s=><SeriesCard key={s.id} show={s} onEdit={()=>openEdit(s)} onDelete={()=>deleteShow(s.id)} onWatched={d=>watched(s.id,d)} onStatus={status=>updateShow(s.id,{status})}/>)}</div>}</div> :
      <div className="content">
        <section className="welcome-card"><div className="welcome-copy"><div className="welcome-tag"><span>✦</span> YOUR LITTLE ESCAPE</div><h1>วันนี้อยากดู<br/><em>เรื่องไหนดี?</em></h1><p>ไม่ต้องจำเองว่าค้างกี่ตอน เราช่วยนับให้<br/>คุณมีหน้าที่แค่เลือกเรื่องที่อยากดู 💜</p><button className="welcome-btn" onClick={()=>setTab('shows')}>ไปที่ชั้นวางซีรีส์ <span>↗</span></button></div><div className="welcome-art"><div className="art-orbit orbit-one"/><div className="art-orbit orbit-two"/><div className="art-moon">☾</div><div className="art-star star-one">✦</div><div className="art-star star-two">✧</div><div className="art-book"><span>EPISODE</span><strong>your<br/>next<br/>story</strong><i>✦</i></div><div className="art-caption">one more episode?</div></div></section>
        <div className="stat-grid"><Stat icon="▤" label="เรื่องที่กำลังดู" value={active.length} note="เรื่องที่ยังไม่จบ"/><Stat icon="◷" label="ตอนที่ค้างดู" value={totalBacklog} note="ตอนที่ออนแล้วแต่ยังไม่ได้ดู"/><Stat icon="✦" label="มีตอนใหม่วันนี้" value={todayReleases.length} note="เรื่องตามตารางออน"/><Stat icon="✓" label="ดูจบแล้ว" value={shows.filter(s=>s.status==='completed').length} note="เรื่องที่ปิดจบแล้ว"/></div>
        <div className="home-columns"><section className="panel next-panel"><div className="panel-heading"><div><div className="eyebrow">SMART WATCH LIST</div><h2>แนะนำให้ดูต่อ <span>✦</span></h2></div><button className="text-btn" onClick={()=>setTab('shows')}>ดูทั้งหมด ↗</button></div>{ranked.length===0?<div className="empty-inline"><span>✧</span><div><strong>ชั้นวางยังว่างอยู่เลย</strong><p>เพิ่มซีรีส์ที่กำลังดู แล้วเราจะช่วยจัดลำดับให้</p><button className="text-btn" onClick={openNew}>+ เพิ่มเรื่องแรก</button></div></div>:ranked.slice(0,4).map((s,i)=><div className="next-row" key={s.id}><div className={'rank-number '+(i===0?'first':'')}>{String(i+1).padStart(2,'0')}</div><div className={'series-avatar large '+(s.color||COLORS[shows.findIndex(x=>x.id===s.id)%COLORS.length])}>{s.title?.slice(0,1)}</div><div className="next-info"><strong>{s.title}</strong><span>{s.stats.backlog>0?'ดูต่อ EP.'+s.stats.nextWatch+' · ค้าง '+s.stats.backlog+' ตอน':s.stats.unreleased>0?'ตามทันแล้ว · รอตอนใหม่':'ไม่มีตอนค้าง'}</span><div className="progress-track"><div style={{width:s.stats.progress+'%'}}/></div></div><div className="next-action">{s.stats.backlog>0?<><strong>{s.stats.backlog}</strong><small>ตอนค้าง</small><button onClick={()=>watched(s.id,1)} title="ทำเครื่องหมายว่าดูจบ 1 ตอน">+ ดูแล้ว</button></>:<span className="caught-up">✓ ทันแล้ว</span>}</div></div>)}</section>
        <section className="panel today-panel"><div className="panel-heading"><div><div className="eyebrow">YOUR RELEASE CALENDAR</div><h2>ตอนใหม่วันนี้</h2></div><button className="calendar-icon-btn" onClick={()=>setTab('calendar')}>▦</button></div><div className="today-date"><span className="today-badge">TODAY</span><strong>{new Date().toLocaleDateString('th-TH',{day:'numeric',month:'long'})}</strong></div>{todayReleases.length===0?<div className="no-release"><div>☾</div><strong>วันนี้พักดูได้สบาย ๆ</strong><p>ไม่มีตอนใหม่ตามตารางที่บันทึกไว้</p><button className="text-btn" onClick={()=>setTab('calendar')}>ดูปฏิทินออน →</button></div>:todayReleases.map(item=><div className="release-row" key={item.id}><span className={'release-dot '+item.color}/><div><strong>{item.title}</strong><small>ตอนใหม่ประมาณ {item.episodes} ตอน</small></div><span className="release-label">NEW</span></div>)}<div className="upcoming-block"><div className="upcoming-title">กำลังจะออน <button className="text-btn" onClick={()=>setTab('calendar')}>ปฏิทิน ↗</button></div>{upcoming.length===0?<p className="muted">เพิ่มวันออนเพื่อดูตอนที่จะมาถึง</p>:upcoming.slice(0,3).map(([d,items])=><div className="upcoming-row" key={d}><span>{parseDate(d).toLocaleDateString('th-TH',{day:'numeric',month:'short'})}</span><div>{items.map(i=><small key={i.id}>{i.title} · {i.episodes} EP</small>)}</div></div>)}</div></section></div>
        <div className="bottom-tip"><span>✦</span><div><strong>ตัวเลขแม่นเท่าข้อมูลล่าสุดที่คุณบันทึก</strong><p>ตารางวันออนเป็นการคาดการณ์ตามวันและจำนวนตอนที่ตั้งไว้ คุณแก้ไขได้ทุกเมื่อเมื่อกำหนดการเปลี่ยน</p></div><button onClick={exportData}>สำรองข้อมูล ↗</button></div>
      </div>}
    </section>{toast&&<div className="toast">{toast}</div>}
  </main>;
}

function Stat({icon,label,value,note}){return <div className="stat-card"><div className="stat-top"><span>{icon}</span><small>{label}</small></div><strong>{value}</strong><p>{note}</p></div>}
function SeriesCard({show:s,onEdit,onDelete,onWatched,onStatus}){const c=calc(s);const next=getNextRelease(s);return <article className="series-card"><div className={'poster-thumb '+(s.color||'violet')}>{s.poster?<img src={s.poster} alt="" onError={e=>{e.currentTarget.style.display='none'}}/>:<span>{s.title?.slice(0,1)||'✦'}</span>}</div><div className="series-main"><div className="series-title-row"><div><h3>{s.title}</h3>{s.englishTitle&&<p className="english-title">{s.englishTitle}</p>}</div><span className={'status-pill '+s.status}>{({watching:'กำลังดู',planned:'อยากดู',paused:'พักไว้',completed:'ดูจบแล้ว'})[s.status]||'กำลังดู'}</span></div><div className="series-metrics"><span><strong>{c.backlog}</strong> ตอนค้าง</span><span><strong>{c.released}</strong> ออนแล้ว</span><span><strong>{c.total||'—'}</strong> ตอนทั้งหมด</span></div><div className="progress-track wide-track"><div style={{width:c.progress+'%'}}/></div><div className="progress-caption"><span>ดูแล้ว {c.watched} ตอน · {c.progress}%</span><span>{c.unreleased>0?'ยังไม่ออน '+c.unreleased+' ตอน':'ออนครบแล้ว'}</span></div>{next&&<div className="next-release-note">◷ ออนครั้งถัดไปประมาณ {fmtDate(next)}</div>}{s.notes&&<div className="series-notes">{s.notes}</div>}</div><div className="series-actions"><div className="episode-stepper"><button disabled={c.watched<=0} onClick={()=>onWatched(-1)} title="ย้อนตอน">−</button><span>EP.{c.watched}</span><button disabled={c.watched>=c.released} onClick={()=>onWatched(1)} title="ดูจบเพิ่ม 1 ตอน">+</button></div><button className="small-action" onClick={onEdit}>แก้ไข</button><button className="small-action danger" onClick={onDelete}>ลบ</button></div></article>}
