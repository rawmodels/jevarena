import { useEffect, useState } from "react";
import { api } from "./api";
import { Leaderboard } from "./Leaderboard";
import { ReplayPlayer } from "./ReplayPlayer";
import { FighterEditor } from "./FighterEditor";
import type { FighterConfig } from "../core/config";
import type { State } from "./types";
export function App() {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"models" | "users">("models");
  const [matchId, setMatchId] = useState("");
  const [model, setModel] = useState("");
  const [edit, setEdit] = useState<FighterConfig | null>(null);
  async function refresh(signal?: AbortSignal) {
    try {
      const data = await api<State>("/api/state", undefined, signal);
      setState(data);
      setError("");
      setMatchId(
        (id) =>
          id ||
          data.modelBoard.matches.find(
            (m) =>
              m.fighters.includes(data.modelBoard.fighters[0].id) &&
              m.fighters.includes(data.modelBoard.fighters[1].id),
          )?.id ||
          "",
      );
    } catch (e) {
      if (!signal?.aborted) setError(e instanceof Error ? e.message : "Could not load arena");
    }
  }
  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    const timer = setInterval(() => void refresh(controller.signal), 3000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, []);
  function watch(id: string) {
    if (!state) return;
    const matches = tab === "models" ? state.modelBoard.matches : state.matches;
    const match = matches.find((m) => m.fighters.includes(id));
    setModel(tab === "models" ? id : "");
    if (match) setMatchId(match.id);
    document.getElementById("watch")?.scrollIntoView({ behavior: "smooth" });
  }
  const choices = state?.modelBoard.matches.filter((m) => m.fighters.includes(model)) ?? [];
  return (
    <>
      <header>
        <a href="#" className="brand">
          JEV<span>ARENA</span>
        </a>
        <nav>
          <a href="#rating">Leaderboard</a>
          <a href="#build">Build a fighter</a>
          <a href="https://github.com/AlexWortega/jevarena">GitHub ↗</a>
        </nav>
      </header>
      <main>
        <div className="hero">
          <p className="eyebrow">Decision models · open source</p>
          <h1>
            FIGHTING
            <br />
            <span>JEVS.</span>
          </h1>
          <p>Write a strategy. Pick a model. Watch it fight.</p>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {!state ? (
          <p>Loading arena…</p>
        ) : (
          <>
            <section id="watch">
              <div className="section-heading">
                <h2>Watch the fight</h2>
                {model && (
                  <select
                    aria-label="Choose recorded matchup"
                    value={matchId}
                    onChange={(e) => setMatchId(e.target.value)}
                  >
                    {choices.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.fighters
                          .map((id) => state.models.find((model) => model.id === id)?.name ?? id)
                          .join(" vs ")}{" "}
                        · Game {Number(m.id.split("--").at(-1)) + 1}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              {matchId && <ReplayPlayer key={matchId} id={matchId} models={state.models} />}
            </section>
            <section id="rating">
              <h2>Leaderboard</h2>
              <div role="tablist" aria-label="Leaderboards" className="tabs">
                <button
                  role="tab"
                  aria-selected={tab === "models"}
                  aria-controls="rating-panel"
                  id="models-tab"
                  onClick={() => setTab("models")}
                >
                  Models <span>{state.modelBoard.fighters.length}</span>
                </button>
                <button
                  role="tab"
                  aria-selected={tab === "users"}
                  aria-controls="rating-panel"
                  id="users-tab"
                  onClick={() => setTab("users")}
                >
                  User Jev Fighters <span>{state.userBoard.length}</span>
                </button>
              </div>
              <div role="tabpanel" id="rating-panel" aria-labelledby={`${tab}-tab`}>
                <Leaderboard
                  key={tab}
                  users={tab === "users"}
                  rows={
                    tab === "models"
                      ? state.modelBoard.fighters
                      : state.userBoard.map((row) => ({
                          ...row,
                          model: state.models.find((m) => m.id === row.model)?.name ?? row.model,
                        }))
                  }
                  watch={watch}
                  edit={(id) => {
                    setEdit(state.fighters.find((f) => f.id === id) ?? null);
                    document.getElementById("build")?.scrollIntoView({ behavior: "smooth" });
                  }}
                />
              </div>
              {tab === "models" && (
                <details className="method">
                  <summary>Method & data · {state.modelBoard.date}</summary>
                  <p>
                    21 paid models. Same character, strategy, defense and mental message by
                    @arenaraw. Each pair plays twice with the same seed and swapped sides.
                    Bradley–Terry on the Elo scale, centered at1000, with one virtual draw per pair.
                    Score counts a draw as half a win. One default configuration, without
                    uncertainty intervals.
                  </p>
                  <a href="/api/benchmark/manifest">Protocol & model versions ↗</a>
                </details>
              )}
            </section>
            <FighterEditor
              state={state}
              edit={edit}
              onSaved={() => refresh()}
              onFight={(id) => {
                setModel("");
                setMatchId(id);
                document.getElementById("watch")?.scrollIntoView({ behavior: "smooth" });
              }}
            />
            <section>
              <h2>Your fights</h2>
              {state.jobs.map((job) => (
                <div className="feed" key={job.id}>
                  <button
                    onClick={() => {
                      setModel("");
                      setMatchId(job.id);
                      document.getElementById("watch")?.scrollIntoView({ behavior: "smooth" });
                    }}
                  >
                    {job.configs.map((c) => c.name).join(" vs ")} ↗
                  </button>
                  <span>
                    {job.status} · {job.decisions} decisions · {job.requests} requests
                    {job.error && ` · ${job.error}`}
                  </span>
                  {job.status === "RUNNING" && (
                    <button
                      onClick={() =>
                        void api(`/api/matches/${job.id}/cancel`, {}).then(() => refresh())
                      }
                    >
                      Cancel
                    </button>
                  )}
                </div>
              ))}
              {state.matches
                .filter((m) => !state.jobs.some((j) => j.id === m.id))
                .slice(-20)
                .reverse()
                .map((match) => (
                  <div className="feed" key={match.id}>
                    <button
                      onClick={() => {
                        setModel("");
                        setMatchId(match.id);
                        document.getElementById("watch")?.scrollIntoView({ behavior: "smooth" });
                      }}
                    >
                      {match.names?.join(" vs ")} ↗
                    </button>
                    <span>
                      {match.winner === null ? "Draw" : `${match.names?.[match.winner]} wins`}
                    </span>
                  </div>
                ))}
              {!state.jobs.length && !state.matches.length && (
                <p className="empty">Your completed local fights appear here.</p>
              )}
            </section>
          </>
        )}
      </main>
      <footer>
        JEV Arena · MIT · Original canvas artwork ·{" "}
        <a href="https://www.rawmodels.ai/arena">Hosted arena ↗</a>
      </footer>
    </>
  );
}
