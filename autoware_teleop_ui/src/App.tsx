import { useEffect } from "react";
import { Radio } from "lucide-react";
import { Console } from "./components/Console";
import { Systems } from "./components/Systems";
import { Dashboard } from "./components/Dashboard";
import { StatusStrip } from "./components/StatusStrip";
import { OutputTopics } from "./components/OutputTopics";
import { EventLogs } from "./components/EventLogs";
import { useTeleop } from "./stores/teleop";

export default function App() {
  const connect = useTeleop((s) => s.connect);
  const keyDown = useTeleop((s) => s.keyDown);
  const keyUp = useTeleop((s) => s.keyUp);
  const releaseAll = useTeleop((s) => s.releaseAll);

  useEffect(() => { connect(); }, [connect]);

  // Global keyboard: WASD/Space drive, only active in keyboard mode.
  useEffect(() => {
    const DRIVE_KEYS = ["w", "a", "s", "d", " "];
    const isTypingTarget = (t: EventTarget | null) =>
      t instanceof HTMLElement &&
      (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA" || t.isContentEditable);

    const onDown = (e: KeyboardEvent) => {
      if (useTeleop.getState().intent.input_mode !== "keyboard") return;
      if (isTypingTarget(e.target)) return;
      const k = e.key.toLowerCase();
      if (DRIVE_KEYS.includes(k)) {
        e.preventDefault();
        keyDown(k === " " ? "space" : k);
      }
    };
    const onUp = (e: KeyboardEvent) => {
      if (useTeleop.getState().intent.input_mode !== "keyboard") return;
      const k = e.key.toLowerCase();
      if (DRIVE_KEYS.includes(k)) {
        keyUp(k === " " ? "space" : k);
      }
    };

    // Safety: leaving the tab / losing focus must not leave the vehicle
    // holding a command. This applies in keyboard mode AND raw (blur can
    // happen mid-drag on sliders too).
    const onBlur = () => releaseAll();
    const onVis = () => {
      if (document.hidden) releaseAll();
    };

    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [keyDown, keyUp, releaseAll]);

  return (
    <div className="min-h-screen bg-zinc-950 p-3.5 sm:p-6 text-zinc-100 antialiased">
      <div className="mx-auto max-w-7xl">
        <header className="mb-4 flex items-center justify-between gap-2 border-b border-zinc-800/80 pb-3">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white font-black text-sm shadow-md shadow-blue-600/30">
              AV
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-bold tracking-tight text-white flex flex-wrap items-center gap-1.5 sm:gap-2">
                <span>Autoware Teleop Console</span>
                <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-400 border border-zinc-700">
                  v0.1.0
                </span>
              </h1>
              <p className="text-[11px] sm:text-xs text-zinc-400 truncate">Direct ROS 2 vehicle actuation & telemetry bridge</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 text-xs text-zinc-400">
            <Radio className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="hidden md:inline">Universe Extension</span>
            <span className="rounded-full h-2 w-2 bg-emerald-500 shadow-sm shadow-emerald-500/80" />
          </div>
        </header>

        <StatusStrip />

        <main className="grid gap-4.5 lg:grid-cols-3 md:grid-cols-2 grid-cols-1 items-stretch">
          <Console />
          <Systems />
          <div className="md:col-span-2 lg:col-span-1">
            <Dashboard />
          </div>
        </main>

        <div className="mt-4.5 grid grid-cols-1 lg:grid-cols-2 gap-4.5 items-stretch">
          <OutputTopics />
          <EventLogs />
        </div>
      </div>
    </div>
  );
}


