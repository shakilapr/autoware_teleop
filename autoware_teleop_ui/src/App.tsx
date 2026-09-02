import { useEffect } from "react";
import { Console } from "./components/Console";
import { Systems } from "./components/Systems";
import { Dashboard } from "./components/Dashboard";
import { StatusStrip } from "./components/StatusStrip";
import { OutputTopics } from "./components/OutputTopics";
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
    <div className="min-h-screen bg-zinc-950 p-6 text-zinc-100">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-bold">autoware_teleop</h1>
        <span className="text-xs text-zinc-500">Autoware Universe extension</span>
      </header>
      <StatusStrip />
      <main className="grid max-w-6xl gap-4 lg:grid-cols-3 md:grid-cols-2">
        <Console />
        <Systems />
        <Dashboard />
      </main>
      <OutputTopics />
    </div>
  );
}
