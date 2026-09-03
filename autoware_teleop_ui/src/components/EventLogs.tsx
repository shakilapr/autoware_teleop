import { useState, useRef, useEffect } from "react";
import { useTeleop, LogEntry } from "../stores/teleop";
import { ScrollText, Trash2, Filter } from "lucide-react";

type LogFilter = "ALL" | "WARN+" | "ERROR";

export function EventLogs() {
  const logs = useTeleop((s) => s.logs);
  const clearLogs = useTeleop((s) => s.clearLogs);
  const [filter, setFilter] = useState<LogFilter>("ALL");
  const logEndRef = useRef<HTMLDivElement>(null);

  const filtered = logs.filter((l) => {
    if (filter === "WARN+") return l.level === "WARN" || l.level === "ERROR" || l.level === "CRIT";
    if (filter === "ERROR") return l.level === "ERROR" || l.level === "CRIT";
    return true;
  });

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs.length]);

  const levelBadge = (level: LogEntry["level"]) => {
    switch (level) {
      case "CRIT":
        return "bg-rose-600 text-white font-black animate-pulse shadow-sm";
      case "ERROR":
        return "bg-red-950/80 text-red-300 border border-red-800/70";
      case "WARN":
        return "bg-amber-950/80 text-amber-300 border border-amber-800/70";
      case "INFO":
      default:
        return "bg-sky-950/80 text-sky-300 border border-sky-800/70";
    }
  };

  const messageTone = (level: LogEntry["level"]) => {
    switch (level) {
      case "CRIT":
        return "text-rose-200 font-semibold";
      case "ERROR":
        return "text-red-200";
      case "WARN":
        return "text-amber-200";
      case "INFO":
      default:
        return "text-zinc-300";
    }
  };

  return (
    <div className="flex flex-col justify-between rounded-xl border border-zinc-800 bg-zinc-900 p-4 shadow-md h-full">
      <div>
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/80 pb-2.5">
          <div className="flex items-center gap-2">
            <ScrollText className="w-4 h-4 text-amber-400 shrink-0" />
            <h2 className="text-base font-bold text-zinc-100">Diagnostic Event Log</h2>
          </div>

          <div className="flex items-center gap-2">
            {/* Filter Pill Group */}
            <div className="flex items-center gap-1 bg-zinc-950/80 p-0.5 rounded-lg border border-zinc-800 text-[10px] font-semibold">
              <Filter className="w-3 h-3 text-zinc-500 ml-1.5 shrink-0" />
              {(["ALL", "WARN+", "ERROR"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-2 py-0.5 rounded-md transition ${
                    filter === f
                      ? "bg-zinc-800 text-zinc-100 shadow-sm border border-zinc-700"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>

            <button
              onClick={clearLogs}
              title="Clear event log buffer"
              className="p-1.5 rounded-lg border border-zinc-800 bg-zinc-950/60 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Console Log Window */}
        <div className="h-[205px] overflow-y-auto rounded-lg bg-zinc-950/80 border border-zinc-850 p-2.5 font-mono text-[11px] space-y-1.5 scrollbar-thin">
          {filtered.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs italic text-zinc-600 font-sans">
              No diagnostic events matching current filter.
            </div>
          ) : (
            filtered.map((log) => (
              <div key={log.id} className="flex items-start gap-2 leading-relaxed py-0.5">
                <span className="text-zinc-500 shrink-0 select-none text-[10px]">
                  [{log.timestamp}]
                </span>
                <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold shrink-0 uppercase tracking-wide leading-tight ${levelBadge(log.level)}`}>
                  {log.level}
                </span>
                <span className="text-zinc-400 font-semibold shrink-0 text-[10px]">
                  [{log.subsystem}]
                </span>
                <span className={`${messageTone(log.level)} break-words text-[11px]`}>
                  {log.message}
                </span>
              </div>
            ))
          )}
          <div ref={logEndRef} />
        </div>
      </div>
    </div>
  );
}
