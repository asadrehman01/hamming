import React, { useEffect, useState, useMemo } from "react";
import { supabase } from "../lib/supabaseClient";
import { Activity, Clock, AlertTriangle, AlertCircle, X, ChevronRight, UserX, UserCheck, Calendar } from "lucide-react";

// Helper to format time safely
const fmtTime = (ts) => {
  if (!ts) return "—";
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ts));
};

const fmtDate = (ts) => {
  if (!ts) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(ts));
};

export default function AttendanceDashboardCard({ userId }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [atRiskMembers, setAtRiskMembers] = useState([]);
  const [todaysCheckins, setTodaysCheckins] = useState([]);

  useEffect(() => {
    if (!userId) return;
    let isMounted = true;

    const loadData = async () => {
      setLoading(true);
      try {
        // Fetch last 30 days of logs
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        
        const { data: rawLogs, error: logsError } = await supabase
          .from("attendance_logs")
          .select(`
            id,
            scanned_at,
            punch_time,
            status,
            customer_id,
            customers ( id, first_name, last_name, phone, membership_end_date )
          `)
          .eq("user_id", userId)
          .or(`scanned_at.gte.${thirtyDaysAgo},punch_time.gte.${thirtyDaysAgo}`)
          .order("scanned_at", { ascending: false })
          .order("punch_time", { ascending: false })
          .limit(2000);

        if (logsError) throw logsError;
        if (!isMounted) return;

        const normalizedLogs = (rawLogs || []).map(l => ({
          ...l,
          timestamp: l.scanned_at || l.punch_time,
        })).filter(l => l.timestamp);

        setLogs(normalizedLogs);

        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        
        const today = normalizedLogs.filter(l => {
          return new Date(l.timestamp).getTime() >= startOfToday;
        });
        setTodaysCheckins(today);

        // Fetch At-Risk Members
        const { data: activeCusts } = await supabase
          .from("active_customers")
          .select("id, first_name, last_name, phone")
          .eq("gym_id", userId);

        if (activeCusts && isMounted) {
          const lastVisits = {};
          normalizedLogs.forEach(l => {
            if (l.customer_id) {
              const t = new Date(l.timestamp).getTime();
              if (!lastVisits[l.customer_id] || t > lastVisits[l.customer_id]) {
                lastVisits[l.customer_id] = t;
              }
            }
          });

          const atRisk = activeCusts.map(c => {
            const lastVisitTs = lastVisits[c.id] || 0;
            const daysSince = lastVisitTs === 0 
              ? Infinity 
              : Math.floor((Date.now() - lastVisitTs) / (1000 * 60 * 60 * 24));
            
            return { ...c, lastVisitTs, daysSince };
          }).filter(c => c.daysSince >= 14)
            .sort((a, b) => b.daysSince - a.daysSince);

          setAtRiskMembers(atRisk.slice(0, 10));
        }

      } catch (err) {
        console.error("Failed to load attendance dashboard data", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadData();

    // Realtime Subscription
    const channel = supabase
      .channel('attendance_dashboard_inserts')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'attendance_logs', filter: `user_id=eq.${userId}` }, async (payload) => {
        let customer = null;
        if (payload.new.customer_id) {
           const { data } = await supabase.from('customers').select('id, first_name, last_name, phone, membership_end_date').eq('id', payload.new.customer_id).single();
           customer = data;
        }

        if (!isMounted) return;

        const newLog = {
          ...payload.new,
          timestamp: payload.new.scanned_at || payload.new.punch_time,
          customers: customer
        };

        setTodaysCheckins(prev => [newLog, ...prev]);
        setLogs(prev => [newLog, ...prev]);
      })
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [userId]);


  // Compute Heatmap Data (Days vs Hours)
  const heatmapData = useMemo(() => {
    const matrix = Array.from({ length: 7 }, () => Array(24).fill(0));
    let maxVal = 0;
    
    logs.forEach(l => {
      const d = new Date(l.timestamp);
      const day = d.getDay(); // 0 (Sun) - 6 (Sat)
      const hour = d.getHours(); // 0 - 23
      matrix[day][hour]++;
      if (matrix[day][hour] > maxVal) maxVal = matrix[day][hour];
    });

    return { matrix, maxVal };
  }, [logs]);

  // Compute Monthly Volume (last 30 days by day)
  const volumeData = useMemo(() => {
    const days = {};
    const now = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const key = d.toISOString().split('T')[0];
      days[key] = 0;
    }
    
    logs.forEach(l => {
      const d = new Date(l.timestamp);
      const key = d.toISOString().split('T')[0];
      if (days[key] !== undefined) {
        days[key]++;
      }
    });

    const arr = Object.entries(days).map(([date, count]) => ({ date, count }));
    const maxCount = Math.max(...arr.map(d => d.count), 1);
    
    return { arr, maxCount };
  }, [logs]);

  const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  // For better visualization, we might just show hours 6AM to 10PM (6 to 22)
  const displayHours = Array.from({length: 17}, (_, i) => i + 6);

  if (loading) {
    return (
      <div className="dashboard-card border p-8 rounded-2xl flex items-center justify-center h-64 shadow-lg shadow-black/5 animate-pulse">
        <span className="text-sm dashboard-muted tracking-wider">Loading attendance...</span>
      </div>
    );
  }

  return (
    <div className="col-span-1 lg:col-span-3 dashboard-card border rounded-2xl shadow-lg shadow-black/5 overflow-hidden">
      <div className="p-6 border-b border-black/5 flex items-center justify-between bg-white/50">
        <h3 className="dashboard-header-title text-lg font-medium text-[#0d0d0d] tracking-tight flex items-center gap-2">
          <Activity size={18} className="text-emerald-500" />
          Attendance Dashboard
        </h3>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-black/5">
        
        {/* Live Today's Checkins */}
        <div className="p-6 space-y-4">
          <h4 className="text-sm font-semibold tracking-wider text-black/60 uppercase flex items-center justify-between">
            Live Check-Ins
            <span className="bg-emerald-100 text-emerald-700 text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
              {todaysCheckins.length} Today
            </span>
          </h4>
          
          <div className="space-y-3 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
            {todaysCheckins.length === 0 ? (
              <div className="text-center py-6 text-sm text-black/30 italic">No check-ins today yet.</div>
            ) : (
              todaysCheckins.map(log => (
                <div key={log.id} className="flex items-center justify-between bg-white border border-black/5 p-3 rounded-xl shadow-sm hover:shadow-md transition-all" role="listitem">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 border border-black/5 flex items-center justify-center text-xs font-bold text-black/80 shadow-inner" aria-hidden="true">
                      {log.customers?.first_name?.[0] || "?"}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-black/90">{log.customers ? `${log.customers.first_name} ${log.customers.last_name}` : "Unknown Member"}</p>
                      <p className="text-xs text-black/60">{log.status === "expired_member" ? "Expired" : "Active"}</p>
                    </div>
                  </div>
                  <div className="text-xs font-mono text-black/60 bg-black/5 px-2 py-1 rounded-md" aria-label={`Check-in time: ${fmtTime(log.timestamp)}`}>
                    {fmtTime(log.timestamp)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Peak Hours Heatmap */}
        <div className="p-6 space-y-4">
          <h4 className="text-sm font-semibold tracking-wider text-black/60 uppercase">
            Peak Hours (30 Days)
          </h4>
          <div className="overflow-x-auto">
            <div className="min-w-max">
              <div className="flex">
                <div className="w-8"></div>
                {displayHours.map(h => (
                  <div key={h} className="w-6 text-[9px] text-center text-black/40 font-mono mb-1">
                    {h}
                  </div>
                ))}
              </div>
              {daysOfWeek.map((day, dIdx) => (
                <div key={day} className="flex items-center mb-1">
                  <div className="w-8 text-[10px] text-black/50 font-medium">{day}</div>
                  {displayHours.map(h => {
                    const count = heatmapData.matrix[dIdx][h];
                    const intensity = heatmapData.maxVal > 0 ? count / heatmapData.maxVal : 0;
                    // Color mapping from light green to dark emerald
                    let bg = "bg-black/5";
                    if (intensity > 0) bg = "bg-emerald-200";
                    if (intensity > 0.3) bg = "bg-emerald-300";
                    if (intensity > 0.6) bg = "bg-emerald-400";
                    if (intensity > 0.8) bg = "bg-emerald-500";
                    
                    return (
                      <div 
                        key={`${dIdx}-${h}`} 
                        role="gridcell"
                        aria-label={`${count} visits on ${day} at ${h}:00`}
                        title={`${count} visits on ${day} at ${h}:00`}
                        className={`w-5 h-5 mx-[2px] rounded-sm ${bg} transition-colors hover:ring-1 ring-black/20`}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* At-Risk Members */}
        <div className="p-6 space-y-4">
          <h4 className="text-sm font-semibold tracking-wider text-black/60 uppercase flex items-center gap-2">
            <UserX size={14} className="text-amber-500" />
            At-Risk Members
          </h4>
          <p className="text-xs text-black/40 mb-2">Active members with 0 visits in 14+ days</p>
          
          <div className="space-y-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
            {atRiskMembers.length === 0 ? (
              <div className="text-center py-6 text-sm text-black/30 italic">All active members are visiting regularly!</div>
            ) : (
              atRiskMembers.map(m => (
                <div key={m.id} className="flex items-center justify-between p-2 hover:bg-black/5 rounded-lg transition-colors group cursor-pointer" role="button" tabIndex={0} aria-label={`At-risk member: ${m.first_name} ${m.last_name}, last visit ${m.daysSince === Infinity ? "never" : `${m.daysSince} days ago`}`}>
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-amber-500" aria-hidden="true"></div>
                    <div>
                      <p className="text-sm font-medium text-black/90">{m.first_name} {m.last_name}</p>
                      <p className="text-[10px] text-black/60">{m.phone}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold text-amber-700">{m.daysSince === Infinity ? "Never" : `${m.daysSince}d ago`}</p>
                    <p className="text-[9px] text-black/60">{m.lastVisitTs ? fmtDate(m.lastVisitTs) : ""}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Monthly Visit Volume */}
        <div className="p-6 space-y-4">
          <h4 className="text-sm font-semibold tracking-wider text-black/60 uppercase flex items-center gap-2">
            <Activity size={14} className="text-blue-500" />
            Monthly Volume
          </h4>
          <p className="text-xs text-black/40 mb-2">Visits over the last 30 days</p>
          
          <div className="h-48 flex items-end gap-1 mt-6">
            {volumeData.arr.map((day, i) => {
              const heightPct = (day.count / volumeData.maxCount) * 100;
              const dateObj = new Date(day.date);
              const isToday = i === 29;
              return (
                <div 
                  key={day.date} 
                  className="flex-1 flex flex-col justify-end group relative"
                  title={`${day.count} visits on ${dateObj.toLocaleDateString()}`}
                >
                  <div 
                    className={`w-full rounded-t-sm transition-all duration-500 ${isToday ? 'bg-emerald-400' : 'bg-blue-300 hover:bg-blue-400'}`}
                    style={{ height: `${Math.max(heightPct, 2)}%` }}
                  ></div>
                  
                  {/* Tooltip */}
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity bg-black text-white text-[10px] px-2 py-1 rounded pointer-events-none whitespace-nowrap z-10">
                    {day.count} visits
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-[10px] text-black/40 font-mono mt-2">
            <span>{new Date(volumeData.arr[0].date).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
            <span>Today</span>
          </div>
        </div>

      </div>
    </div>
  );
}
