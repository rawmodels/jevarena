import { useEffect, useState } from "react";
import { CHARACTERS, STARTER_DEFENSE, STARTER_INJECTION } from "../core/characters";
import { defaultFighter, type FighterConfig } from "../core/config";
import { api } from "./api";
import { spriteUrl } from "./sprites";
import { CharacterPreview } from "./CharacterPreview";
import type { State } from "./types";
export function FighterEditor({
  state,
  edit,
  onSaved,
  onFight,
}: {
  state: State;
  edit: FighterConfig | null;
  onSaved: () => Promise<void>;
  onFight: (id: string) => void;
}) {
  const [draft, setDraft] = useState<FighterConfig>({ ...defaultFighter });
  const [left, setLeft] = useState("");
  const [right, setRight] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [ack, setAck] = useState(false);
  useEffect(() => {
    if (edit) setDraft({ ...edit });
  }, [edit]);
  useEffect(() => {
    if (!left && state.fighters[0]) setLeft(state.fighters[0].id);
    if (!right && state.fighters[1]) setRight(state.fighters[1].id);
  }, [state.fighters]);
  const model = state.models.find((m) => m.id === draft.model);
  const paid = [left, right].some(
    (id) =>
      state.models.find((m) => m.id === state.fighters.find((f) => f.id === id)?.model)?.kind ===
      "api",
  );
  function field(key: keyof FighterConfig, value: string) {
    setDraft((d) => ({ ...d, [key]: value }));
  }
  async function save() {
    setBusy(true);
    setMessage("");
    try {
      await api("/api/fighters", draft);
      await onSaved();
      setMessage("Fighter saved.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }
  async function fight() {
    setBusy(true);
    setMessage("");
    try {
      const result = await api<{ id: string }>("/api/fights", { left, right });
      onFight(result.id);
      await onSaved();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Fight failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section id="build">
      <div className="section-heading">
        <h2>Build a fighter</h2>
        <button
          onClick={() =>
            setDraft({
              ...defaultFighter,
              id: `fighter-${Date.now().toString(36)}`,
              name: "New Fighter",
            })
          }
        >
          New config
        </button>
      </div>
      <div className="builder">
        <div>
          <div className="pair">
            <label>
              Config ID
              <input
                value={draft.id}
                onChange={(e) => field("id", e.target.value)}
                maxLength={48}
              />
            </label>
            <label>
              Author nickname
              <input
                value={draft.author}
                onChange={(e) => field("author", e.target.value.toLowerCase())}
                maxLength={24}
              />
            </label>
          </div>
          <div className="pair">
            <label>
              Fighter name
              <input
                value={draft.name}
                onChange={(e) => field("name", e.target.value)}
                maxLength={48}
              />
            </label>
            <label>
              Model
              <select value={draft.model} onChange={(e) => field("model", e.target.value)}>
                {state.models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                    {m.configured ? "" : " · key needed"}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <fieldset className="character-picker">
            <legend>Character</legend>
            <div role="radiogroup" aria-label="Character" className="character-grid">
              {CHARACTERS.map((character) => (
                <button
                  type="button"
                  role="radio"
                  aria-checked={draft.character === character.id}
                  key={character.id}
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      character: character.id,
                      strategy: character.strategy,
                      defense: STARTER_DEFENSE,
                      injection: STARTER_INJECTION,
                    }))
                  }
                >
                  <span className="character-portrait">
                    <img src={spriteUrl(character.id)} alt="" width={382} height={203} />
                  </span>
                  <span>{character.name}</span>
                </button>
              ))}
            </div>
          </fieldset>
          <CharacterPreview character={draft.character} />

          {(
            [
              ["strategy", "Fighting strategy", 2000],
              ["defense", "Final instructions", 1000],
              ["injection", "Mental attack message", 1000],
            ] as const
          ).map(([key, title, max]) => (
            <label key={key}>
              {title}
              <textarea
                value={draft[key]}
                maxLength={max}
                rows={key === "strategy" ? 5 : 3}
                onChange={(e) => field(key, e.target.value)}
              />
            </label>
          ))}
          <button className="primary" disabled={busy} onClick={() => void save()}>
            Save fighter
          </button>
          {model && !model.configured && (
            <p className="note">Set {model.keyEnv} in the server’s .env to run this model.</p>
          )}
        </div>
        <aside>
          <h3>Start a fight</h3>
          <label>
            Fighter
            <select value={left} onChange={(e) => setLeft(e.target.value)}>
              <option value="">Choose…</option>
              {state.fighters.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} · @{f.author}
                </option>
              ))}
            </select>
          </label>
          <label>
            Opponent
            <select value={right} onChange={(e) => setRight(e.target.value)}>
              <option value="">Choose…</option>
              {state.fighters
                .filter((f) => f.id !== left)
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} · @{f.author}
                  </option>
                ))}
            </select>
          </label>
          {paid && (
            <label className="check">
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
              Use my server’s API keys for both models. Provider charges apply.
            </label>
          )}
          <button
            className="primary"
            disabled={busy || !left || !right || left === right || (paid && !ack)}
            onClick={() => void fight()}
          >
            Fight ↗
          </button>
          <p className="note">Built-in bots run without API keys. API keys stay on your server.</p>
          <p role="status">{message}</p>
        </aside>
      </div>
    </section>
  );
}
