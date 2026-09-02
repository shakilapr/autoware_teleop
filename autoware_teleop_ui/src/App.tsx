import { useEffect } from "react";
import { Console } from "./components/Console";
import { Systems } from "./components/Systems";
import { Dashboard } from "./components/Dashboard";
import { StatusStrip } from "./components/StatusStrip";
import { useTeleop } from "./stores/teleop";

export default function App() {
  const connect = useTeleop((s) => s.connect);
  const keyDown = useTeleop((s) => s.keyDown);
  const keyUp = useTeleop((s) => s.keyUp);

  useEffect(() => { connect(); }, [connect]);

  // Global keyboard: WASD/Space drive, only active in keyboard mode.
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (["w", "a", "s", "d", " "].includes(k)) {
        e.preventDefault();
        keyDown(k === " " ? "space" : k);
      }
    };
    const onUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (["w", "a", "s", "d", " "].includes(k)) {
        keyUp(k === " " ? "space" : k);
      }
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, [keyDown, keyUp]);

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
    </div>
  );
}
