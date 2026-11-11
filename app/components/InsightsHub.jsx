"use client";

import { createClient } from "@supabase/supabase-js";
import { useEffect, useMemo, useRef, useState } from "react";

const OWNER = "00000000-0000-0000-0000-000000000001";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;
const DAYS = ["อาทิตย์","จันทร์","อังคาร","พุธ","พฤหัสบดี","ศุกร์","เสาร์"];
const TABS = [{id:"planner",label:"แผนดูอัจฉริยะ"},{id:"calendar",label:"ปฏิทิน"},{id:"stats",label:"สถิติ"},{id:"dna",label:"Watch DNA"},{id:"backup",label:"สำรองข้อมูล"}];
const dayNames = ["อาทิตย์","จันทร์","อังคาร","พุธ","พฤหัสบดี","ศุกร์","เสาร์"];
const parseDays = value => !value ? [] : value === "ทุกวัน" ? ["จันทร์","อังคาร","พุธ","พฤหัสบดี","ศุกร์","เสาร์","อาทิตย์"] : String(value).split(",").map(x=>x.trim());
const backlog = s => Math.max(0,(s.released_episodes ?? s.total_episodes ?? s.watched_episodes)-s.watched_episodes);
const available = s => s.released_episodes != null ? Math.max(0,s.released_episodes-s.watched_episodes) : s.total_episodes != null ? Math.max(0,s.total_episodes-s.watched_episodes) : Math.max(1,Number(s.plan_episodes)||3);
const score = s => (Number(s.rating)||3)*20 + Math.min(20,backlog(s)*1.4) + (s.next_episode_date ? 8 : 0) + (s.status==="watching"?8:0) - (s.status==="planned"?3:0);
const monthKey = d => d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0");
const dateKey = d => d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
const safeDate = d => new Date(d.getFullYear(),d.getMonth(),d.getDate());
const download = (name, body, type) => { const blob=new Blob([body],{type}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=name; a.click(); URL.revokeObjectURL(url); };
const escapeCsv = v => '"' + String(v ?? "").replace(/"/g,'""') + '"';

export default function InsightsHub({ shows, onRefresh }) {
  const [tab,setTab]=useState("planner");
  const [activity,setActivity]=useState([]);
  const DEFAULT_DAILY={1:90,2:90,3:90,4:90,5:90,6:240,0:300};
  const [prefs,setPrefs]=useState({weekday_minutes:90,weekend_minutes:270,episode_minutes:45,daily_minutes:DEFAULT_DAILY});
  const [prefsReady,setPrefsReady]=useState(false);
  const [month,setMonth]=useState(()=>new Date(new Date().getFullYear(),new Date().getMonth(),1));
  const [selectedDay,setSelectedDay]=useState(()=>dateKey(new Date()));
  const prefTimer=useRef(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const fileRef=useRef(null);

  async function loadHub(){
    const [a,p]=await Promise.all([
      supabase.from("series_tracker_activity").select("*").order("watched_at",{ascending:false}).limit(1000),
      supabase.from("series_tracker_preferences").select("*").eq("user_id",OWNER).maybeSingle()
    ]);
    if(!a.error) setActivity(a.data||[]);
    if(!p.error && p.data) setPrefs({weekday_minutes:p.data.weekday_minutes,weekend_minutes:p.data.weekend_minutes,episode_minutes:p.data.episode_minutes,daily_minutes:p.data.daily_minutes||DEFAULT_DAILY});
    setPrefsReady(true);
  }
  useEffect(()=>{loadHub();},[]);
  function savePrefs(next){
    setPrefs(next);
    if(prefTimer.current) clearTimeout(prefTimer.current);
    prefTimer.current=setTimeout(async()=>{
      setBusy(true);
      const {error}=await supabase.from("series_tracker_preferences").upsert({...next,user_id:OWNER,updated_at:new Date().toISOString()},{onConflict:"user_id"});
      setBusy(false); setMessage(error ? "บันทึกการตั้งค่าไม่สำเร็จ: "+error.message : "บันทึกเวลารับชมและซิงก์ข้ามอุปกรณ์แล้ว");
      setTimeout(()=>setMessage(""),3000);
    },500);
  }

  const activeShows=useMemo(()=>shows.filter(s=>["watching","planned"].includes(s.status)&&available(s)>0).sort((a,b)=>score(b)-score(a)),[shows]);
  const daysPlan=useMemo(()=>{
    const start=safeDate(new Date());
    const left=new Map(activeShows.map(show=>[show.id,available(show)]));
    let cursor=0;
    const plan=[];
    for(let offset=0;offset<14;offset++){
      const date=new Date(start); date.setDate(start.getDate()+offset);
      const minutes=Math.max(0,Number(prefs.daily_minutes?.[date.getDay()] ?? (date.getDay()===0||date.getDay()===6?prefs.weekend_minutes:prefs.weekday_minutes))||0);
      let remainingMinutes=minutes;
      const items=[];
      let safety=0;
      while(remainingMinutes>=5 && activeShows.length && safety<200){
        safety++;
        let found=-1;
        for(let j=0;j<activeShows.length;j++){
          const idx=(cursor+j)%activeShows.length;
          const candidate=activeShows[idx];
          const duration=Math.max(5,Number(candidate.episode_duration_minutes)||prefs.episode_minutes||45);
          if((left.get(candidate.id)||0)>0 && duration<=remainingMinutes){found=idx;break;}
        }
        if(found<0) break;
        const show=activeShows[found];
        const duration=Math.max(5,Number(show.episode_duration_minutes)||prefs.episode_minutes||45);
        left.set(show.id,left.get(show.id)-1);
        const existing=items.find(item=>item.show.id===show.id);
        if(existing) existing.count++;
        else items.push({show,count:1,minutes:duration});
        remainingMinutes-=duration;
        cursor=(found+1)%activeShows.length;
      }
      plan.push({date,items,minutes,used:minutes-remainingMinutes});
    }
    return plan;
  },[activeShows,prefs]);
  const remaining=activeShows.reduce((n,s)=>n+available(s),0);
  const backlogMinutes=activeShows.reduce((n,s)=>n+available(s)*Math.max(5,Number(s.episode_duration_minutes)||prefs.episode_minutes||45),0);
  const averageDailyMinutes=Object.values(prefs.daily_minutes||DEFAULT_DAILY).reduce((n,v)=>n+(Number(v)||0),0)/7;
  const finishDays=averageDailyMinutes>0?Math.ceil(backlogMinutes/averageDailyMinutes):null;
  const finishDate=finishDays==null?null:new Date(Date.now()+finishDays*86400000);

  const currentMonthActivity=activity.filter(a=>monthKey(new Date(a.watched_at))===monthKey(month));
  const monthEpisodes=currentMonthActivity.reduce((n,a)=>n+a.episode_delta,0);
  const totalEpisodes=activity.reduce((n,a)=>n+a.episode_delta,0);
  const completed=shows.filter(s=>s.status==="completed");
  const avgRating=completed.length?completed.reduce((n,s)=>n+(Number(s.rating)||0),0)/completed.length:0;
  const genreStats=useMemo(()=>{const map={}; shows.filter(s=>s.status!=="dropped").forEach(s=>(s.genre||"ไม่ระบุ").split(/[,/、]/).map(x=>x.trim()).filter(Boolean).forEach(g=>map[g]=(map[g]||0)+1));return Object.entries(map).sort((a,b)=>b[1]-a[1]);},[shows]);
  const countryStats=useMemo(()=>{const map={}; shows.filter(s=>s.status!=="dropped").forEach(s=>{const k=s.country||"ไม่ระบุ";map[k]=(map[k]||0)+1;});return Object.entries(map).sort((a,b)=>b[1]-a[1]);},[shows]);
  const rated=shows.filter(s=>s.status!=="dropped");
  const stars=rated.reduce((n,s)=>n+(Number(s.rating)||3),0)/(rated.length||1);
  const calendarItems=useMemo(()=>{
    const map={};
    shows.filter(s=>s.status!=="dropped").forEach(s=>{
      if(s.next_episode_date){(map[s.next_episode_date] ||= []).push({show:s,type:"new"});}
      const days=parseDays(s.release_day);
      if(days.length) for(let i=0;i<35;i++){const d=new Date(month.getFullYear(),month.getMonth(),1+i); if(d.getMonth()!==month.getMonth()) break; if(days.includes(dayNames[d.getDay()])){const key=dateKey(d);(map[key] ||= []).push({show:s,type:"air"});}}
    });
    return map;
  },[shows,month]);
  const firstDay=month.getDay(); const daysInMonth=new Date(month.getFullYear(),month.getMonth()+1,0).getDate();
  const selectedItems=calendarItems[selectedDay]||[];
  const weeklyBar=dayNames.map((name,i)=>({name,count:activity.filter(a=>new Date(a.watched_at).getDay()===i).reduce((n,a)=>n+a.episode_delta,0)}));
  const maxBar=Math.max(1,...weeklyBar.map(x=>x.count));

  function exportBackup(){
    const payload={app:"SeriDays",version:2,exported_at:new Date().toISOString(),shows,activity,preferences:prefs};
    download("seridays-backup-"+new Date().toISOString().slice(0,10)+".json",JSON.stringify(payload,null,2),"application/json");
    setMessage("ดาวน์โหลดไฟล์สำรองข้อมูลแล้ว");
  }
  function exportCsv(){
    const cols=["title","original_title","genre","country","season_number","watched_episodes","released_episodes","total_episodes","episode_duration_minutes","status","rating","release_day","next_episode_date","notes"];
    const rows=[cols.map(escapeCsv).join(","),...shows.map(s=>cols.map(c=>escapeCsv(s[c])).join(","))];
    download("seridays-series.csv","\uFEFF"+rows.join("\n"),"text/csv;charset=utf-8");
  }
  async function importBackup(file){
    if(!file)return;
    setBusy(true);setMessage("");
    try{
      const data=JSON.parse(await file.text());
      if(data.app!=="SeriDays"||!Array.isArray(data.shows))throw new Error("ไฟล์นี้ไม่ใช่ไฟล์สำรองของ SeriDays");
      const rows=data.shows.filter(s=>s.title).map(s=>({...s,user_id:OWNER,updated_at:new Date().toISOString()}));
      if(rows.length){const {error}=await supabase.from("series_tracker_shows").upsert(rows,{onConflict:"id",ignoreDuplicates:true});if(error)throw error;}
      if(data.preferences){const clean={weekday_minutes:Math.max(0,Math.min(720,Number(data.preferences.weekday_minutes)||90)),weekend_minutes:Math.max(0,Math.min(720,Number(data.preferences.weekend_minutes)||180)),episode_minutes:Math.max(10,Math.min(240,Number(data.preferences.episode_minutes)||45)),daily_minutes:data.preferences.daily_minutes||DEFAULT_DAILY};setPrefs(clean);const {error:prefError}=await supabase.from("series_tracker_preferences").upsert({...clean,user_id:OWNER,updated_at:new Date().toISOString()},{onConflict:"user_id"});if(prefError)throw prefError;}
      if(Array.isArray(data.activity)&&data.activity.length){const logs=data.activity.filter(x=>x.show_title&&Number(x.episode_delta)>0).map(x=>({...x,user_id:OWNER}));if(logs.length){const {error}=await supabase.from("series_tracker_activity").upsert(logs,{onConflict:"id",ignoreDuplicates:true});if(error)throw error;}}
      await Promise.all([loadHub(),onRefresh?.()]);
      setMessage("นำเข้าข้อมูลแล้ว โดยไม่เขียนทับซีรีส์ที่มี ID ซ้ำ");
    }catch(e){setMessage("นำเข้าไม่สำเร็จ: "+(e.message||"ไฟล์ไม่ถูกต้อง"));}
    setBusy(false);
  }
  return <section className="insights-hub">
    <div className="insights-title"><div><span className="eyebrow">SERIDAYS STUDIO</span><h2>ศูนย์วางแผนการรับชม</h2><p>วางแผน ดูความคืบหน้า และเข้าใจสไตล์การดูซีรีส์ของคุณ</p></div><span className="plan-badge">✦ SMART COMPANION</span></div>
    <div className="insights-tabs">{TABS.map(t=><button key={t.id} className={tab===t.id?"selected":""} onClick={()=>setTab(t.id)}>{t.label}</button>)}</div>
    {message&&<div className="notice success inline-notice">{message}</div>}
    {tab==="planner"&&<div className="insights-panel">
      <div className="insight-kpis"><div><small>ตอนที่ยังค้างในคิว</small><strong>{remaining}</strong></div><div><small>ความเร็วเฉลี่ยตามเวลาที่ตั้ง</small><strong>{dailyCapacity.toFixed(1)} <i>ตอน/วัน</i></strong></div><div><small>คาดว่าจะเคลียร์คิวใน</small><strong>{finishDays==null?"—":finishDays+" วัน"}</strong><em>{finishDate?finishDate.toLocaleDateString("th-TH",{day:"numeric",month:"short",year:"numeric"}):"ตั้งเวลารับชมเพื่อคำนวณ"}</em></div></div>
      <div className="insight-columns"><div className="insight-card"><div className="insight-card-head"><div><span className="eyebrow">SMART PRIORITY</span><h3>ลำดับเรื่องที่ควรดู</h3></div><span className="muted-small">คะแนน / 100</span></div>{activeShows.length?activeShows.slice(0,6).map((s,i)=><div className="priority-row" key={s.id}><b>{String(i+1).padStart(2,"0")}</b><div className="priority-poster">{s.poster_url?<img src={s.poster_url} alt=""/>:<span>✦</span>}</div><div className="priority-copy"><strong>{s.title}</strong><span>{"★".repeat(s.rating||3)} · ค้าง {backlog(s)} ตอน · {s.status==="planned"?"รอเริ่มดู":"กำลังดู"}</span></div><strong className="priority-score">{Math.round(score(s))}</strong></div>):<p className="empty-note">เพิ่มซีรีส์ที่อยากดูเพื่อสร้างคิวอัตโนมัติ</p>}</div>
      <div className="insight-card"><div className="insight-card-head"><div><span className="eyebrow">WATCH TIME SIMULATOR</span><h3>จำลองเวลารับชม</h3></div><span>⚙</span></div><div className="daily-time-settings"><div className="daily-time-heading"><strong>เวลาว่างแยกตามวัน</strong><small>ปรับวันหยุดหรือวันที่มีเวลาว่างพิเศษได้ตามจริง</small></div>{dayNames.map((name,day)=> <label className="setting-line daily-setting" key={day}><span>{name}</span><strong>{Number(prefs.daily_minutes?.[day]??(day===0||day===6?prefs.weekend_minutes:prefs.weekday_minutes))} นาที</strong><input type="range" min="0" max="720" step="15" value={Number(prefs.daily_minutes?.[day]??(day===0||day===6?prefs.weekend_minutes:prefs.weekday_minutes))} onChange={e=>savePrefs({...prefs,daily_minutes:{...(prefs.daily_minutes||DEFAULT_DAILY),[day]:Number(e.target.value)}})}/></label>)}</div><label className="setting-line">ความยาวเฉลี่ยสำรองต่อตอน <strong>{prefs.episode_minutes} นาที</strong><input type="range" min="10" max="180" step="5" value={prefs.episode_minutes} onChange={e=>savePrefs({...prefs,episode_minutes:Number(e.target.value)})}/></label><p className="sim-note">คำนวณจากจำนวนตอนที่ออกแล้วหรือจำนวนตอนทั้งหมดที่ระบุ หากยังไม่ทราบ ระบบใช้จำนวนตอนต่อรอบเป็นค่าประมาณ</p><div className="sim-result">ถ้าดูตามเวลานี้ คุณจะเคลียร์คิวได้ประมาณ <b>{finishDays??"—"} วัน</b></div></div></div>
      <div className="insight-card schedule-card"><div className="insight-card-head"><div><span className="eyebrow">NEXT 14 DAYS</span><h3>ตารางดูที่แนะนำ</h3></div><span className="muted-small">สลับเรื่องเพื่อไม่ให้ดูเรื่องเดียวติดกัน</span></div><div className="schedule-grid">{daysPlan.map((d,i)=><div className="schedule-day" key={i}><small>{d.date.toLocaleDateString("th-TH",{weekday:"short",day:"numeric",month:"short"})}</small><strong>{d.items.reduce((n,it)=>n+it.count,0)} ตอน · {d.used}/{d.minutes} นาที</strong>{d.items.slice(0,4).map((it,j)=><span key={j}>{it.show.title} ×{it.count} <i>{it.minutes*it.count}น.</i></span>)}{!d.items.length&&<em>{d.minutes?"วันพัก / ไม่มีตอนที่พอดี":"วันพัก"}</em>}</div>)}</div></div>
    </div>}
    {tab==="calendar"&&<div className="insights-panel"><div className="calendar-head"><button onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()-1,1))}>‹</button><h3>{month.toLocaleDateString("th-TH",{month:"long",year:"numeric"})}</h3><button onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()+1,1))}>›</button></div><div className="calendar-grid">{["อา","จ","อ","พ","พฤ","ศ","ส"].map(d=><b key={d}>{d}</b>)}{Array.from({length:firstDay},(_,i)=><span className="calendar-blank" key={"b"+i}/>)}{Array.from({length:daysInMonth},(_,i)=>{const day=i+1;const date=new Date(month.getFullYear(),month.getMonth(),day);const key=dateKey(date);const items=calendarItems[key]||[];return <button key={key} className={(selectedDay===key?"chosen ":"")+(items.length?"has-events":"")} onClick={()=>setSelectedDay(key)}><span>{day}</span>{items.length>0&&<i/>}</button>;})}</div><div className="calendar-details"><span className="eyebrow">SELECTED DATE</span><h3>{new Date(selectedDay+"T00:00:00").toLocaleDateString("th-TH",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</h3>{selectedItems.length?selectedItems.map((x,i)=><div className="calendar-event" key={i}><span>{x.type==="new"?"ตอนใหม่":"วันออกอากาศ"}</span><strong>{x.show.title}</strong></div>):<p className="empty-note">ไม่มีรายการออกอากาศที่บันทึกไว้ในวันนี้</p>}</div><p className="sim-note">หมายเหตุ: ปฏิทินอ้างอิงวันออกอากาศและวันตอนถัดไปที่คุณกรอกเอง ไม่ได้ดึงตารางจากผู้ให้บริการสตรีมมิงอัตโนมัติ</p></div>}
    {tab==="stats"&&<div className="insights-panel"><div className="stats-filter"><button onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()-1,1))}>‹</button><strong>{month.toLocaleDateString("th-TH",{month:"long",year:"numeric"})}</strong><button onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()+1,1))}>›</button></div><div className="insight-kpis"><div><small>ดูไปในเดือนนี้</small><strong>{monthEpisodes} <i>ตอน</i></strong></div><div><small>ดูสะสมตั้งแต่เริ่มบันทึก</small><strong>{totalEpisodes} <i>ตอน</i></strong></div><div><small>ดูจบแล้ว</small><strong>{completed.length} <i>เรื่อง</i></strong></div></div><div className="insight-columns"><div className="insight-card"><span className="eyebrow">WEEKDAY PATTERN</span><h3>วันที่ดูสะสมมากที่สุด</h3>{weeklyBar.map(d=><div className="bar-row" key={d.name}><span>{d.name}</span><div><i style={{width:(d.count/maxBar*100)+"%"}}/></div><b>{d.count}</b></div>)}</div><div className="insight-card"><span className="eyebrow">LIBRARY OVERVIEW</span><h3>ภาพรวมคลังซีรีส์</h3><div className="stat-line"><span>กำลังดู</span><b>{shows.filter(s=>s.status==="watching").length} เรื่อง</b></div><div className="stat-line"><span>อยากดู</span><b>{shows.filter(s=>s.status==="planned").length} เรื่อง</b></div><div className="stat-line"><span>พักดู</span><b>{shows.filter(s=>s.status==="paused").length} เรื่อง</b></div><div className="stat-line"><span>คะแนนเฉลี่ยความอยากดู</span><b>{stars.toFixed(1)} / 5</b></div><div className="stat-line"><span>คะแนนเฉลี่ยเรื่องที่ดูจบ</span><b>{avgRating.toFixed(1)} / 5</b></div></div></div><p className="sim-note">ประวัติรายเดือนเริ่มนับตั้งแต่วันที่เปิดใช้ระบบบันทึกกิจกรรมครั้งนี้ ยอดตอนเดิมก่อนหน้านี้ยังอยู่ในยอดสะสมจากข้อมูลซีรีส์ แต่ไม่สามารถแยกย้อนหลังเป็นรายเดือนได้</p></div>}
    {tab==="dna"&&<div className="insights-panel"><div className="dna-hero"><span className="eyebrow">YOUR WATCH DNA</span><h3>สไตล์การดูซีรีส์ของคุณ</h3><p>ภาพรวมจากแนว ประเทศ และคะแนนความอยากดูที่คุณบันทึก</p><div><strong>{rated.length}</strong><small>เรื่องในคลัง</small><strong>{stars.toFixed(1)}★</strong><small>คะแนนเฉลี่ย</small></div></div><div className="insight-columns"><div className="insight-card"><span className="eyebrow">FAVORITE GENRES</span><h3>แนวที่อยู่ในคลังมากที่สุด</h3>{genreStats.slice(0,8).map(([name,n])=><div className="bar-row" key={name}><span>{name}</span><div><i style={{width:(n/(genreStats[0]?.[1]||1)*100)+"%"}}/></div><b>{n}</b></div>)}</div><div className="insight-card"><span className="eyebrow">COUNTRY MIX</span><h3>ประเทศที่รับชม</h3>{countryStats.slice(0,8).map(([name,n])=><div className="stat-line" key={name}><span>{name}</span><b>{n} เรื่อง</b></div>)}</div></div><div className="insight-card"><span className="eyebrow">YOUR TASTE PROFILE</span><h3>สิ่งที่บอกได้จากคลังของคุณ</h3><p className="dna-summary">{genreStats[0]? "แนวที่มีมากที่สุดคือ "+genreStats[0][0]+". ":"ยังไม่มีข้อมูลแนวซีรีส์เพียงพอ. "}{countryStats[0]? "ประเทศที่มีเรื่องอยู่ในคลังมากที่สุดคือ "+countryStats[0][0]+". ":""}{stars>=4?"โดยรวมคุณให้คะแนนความอยากดูค่อนข้างสูง":stars>=3?"คุณมีความสนใจหลากหลายระดับ":"คุณค่อนข้างคัดเรื่องก่อนเริ่มดู"}</p><small className="sim-note">เป็นการสรุปจากข้อมูลที่กรอก ไม่ใช่การวิเคราะห์ประวัติการรับชมจากแพลตฟอร์มอื่น</small></div></div>}
    {tab==="backup"&&<div className="insights-panel"><div className="insight-card backup-card"><span className="eyebrow">YOUR DATA, YOUR CONTROL</span><h3>สำรองและย้ายข้อมูล</h3><p>ดาวน์โหลดข้อมูลซีรีส์ ประวัติการดู และการตั้งค่าเก็บไว้ได้ทุกเมื่อ</p><div className="backup-actions"><button className="button primary" onClick={exportBackup}>↓ สำรองข้อมูลทั้งหมด (JSON)</button><button className="button ghost" onClick={exportCsv}>↓ ส่งออกตารางซีรีส์ (CSV)</button><button className="button ghost" onClick={()=>fileRef.current?.click()}>↑ นำเข้าไฟล์สำรอง</button><input ref={fileRef} hidden type="file" accept=".json,application/json" onChange={e=>{importBackup(e.target.files?.[0]);e.target.value="";}}/></div><div className="backup-warning">การนำเข้าจะเพิ่มรายการใหม่และข้าม ID ที่มีอยู่แล้ว ไม่ลบหรือเขียนทับข้อมูลซีรีส์ปัจจุบัน แนะนำให้ดาวน์โหลดไฟล์สำรองก่อนนำเข้าทุกครั้ง</div><div className="stat-line"><span>ซีรีส์ในคลัง</span><b>{shows.length} รายการ</b></div><div className="stat-line"><span>บันทึกกิจกรรม</span><b>{activity.length} รายการ</b></div></div></div>}
  </section>;
}
