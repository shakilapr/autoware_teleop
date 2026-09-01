import { useEffect } from "react";
import { Console } from "./components/Console";
import { Dashboard } from "./components/Dashboard";
import { useTeleop } from "./stores/teleop";

export default function App() {
  const connect = useTeleop((s) => s.connect);
  useEffect(() => { connect(); }, [connect]);

  return (
    <div className="min-h-screen bg-zinc-950 p-6 text-zinc-100">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-bold">autoware_teleop</h1>
        <span className="text-xs text-zinc-500">Autoware Universe extension</span>
      </header>
      <main className="grid max-w-4xl gap-4 md:grid-cols-2">
        <Console />
        <Dashboard />
      </main>
    </div>
  );
}
