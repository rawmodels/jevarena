import { useState } from "react";
import type { RatingRow } from "./types";
export function Leaderboard({
  rows,
  users,
  watch,
  edit,
}: {
  rows: RatingRow[];
  users: boolean;
  watch: (id: string) => void;
  edit?: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"elo" | "games" | "score">("elo");
  const [direction, setDirection] = useState(-1);
  const score = (r: RatingRow) => (r.games ? (r.w + r.d / 2) / r.games : 0);
  const sorted = rows
    .map((r, index) => ({ ...r, rank: index + 1, score: score(r) }))
    .filter((r) =>
      `${r.name} ${r.author ?? ""} ${r.maker ?? ""} ${r.model}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    )
    .sort((a, b) => direction * (a[sort] - b[sort]) || a.rank - b.rank);
  function toggle(key: typeof sort) {
    if (sort === key) setDirection((d) => -d);
    else {
      setSort(key);
      setDirection(-1);
    }
  }
  return (
    <>
      <div className="table-toolbar">
        <p>
          {rows.length} {users ? "local fighter configs" : "models · 420 verified fights"}
        </p>
        <label>
          <span className="sr-only">Search</span>
          <input
            type="search"
            placeholder={users ? "Search fighter or @author…" : "Search models…"}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>
      <div className="table-scroll" tabIndex={0} role="region" aria-label="Leaderboard">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>{users ? "Fighter / author" : "Model"}</th>
              {users && <th>Model</th>}
              {(
                [
                  ["elo", "Elo"],
                  ["score", "Score %"],
                  ["games", "Fights"],
                ] as const
              ).map(([key, label]) => (
                <th
                  key={key}
                  aria-sort={sort === key ? (direction < 0 ? "descending" : "ascending") : "none"}
                >
                  <button onClick={() => toggle(key)}>
                    {label} {sort === key ? (direction < 0 ? "↓" : "↑") : "↕"}
                  </button>
                </th>
              ))}
              <th>W / L / D</th>
              <th>Replay</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.id}>
                <td className="rank">{String(r.rank).padStart(2, "0")}</td>
                <td>
                  <strong>{r.name}</strong>
                  <small>{users ? `@${r.author}` : r.maker}</small>
                </td>
                {users && <td>{r.model}</td>}
                <td className="elo">{r.elo}</td>
                <td>{r.games ? `${(r.score * 100).toFixed(1)}%` : "—"}</td>
                <td>{r.games}</td>
                <td>
                  <span className="win">{r.w}</span> / <span className="loss">{r.l}</span> / {r.d}
                </td>
                <td>
                  <button
                    disabled={!r.games}
                    onClick={() => watch(r.id)}
                    aria-label={`Watch ${r.name}`}
                  >
                    Watch ↗
                  </button>
                  {users && edit && (
                    <button className="text-button" onClick={() => edit(r.id)}>
                      Edit
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!sorted.length && (
        <p className="empty">
          {query ? "No matches." : "Save two fighters below and start a fight."}
        </p>
      )}
    </>
  );
}
