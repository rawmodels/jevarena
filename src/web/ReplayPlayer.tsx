import { useEffect, useRef, useState } from "react";
import { Stepper } from "../core/replay";
import { TICKS_PER_SECOND } from "../core/engine";
import { drawMentalAttacks } from "../core/mental-render";
import { drawFrame, VIEW_H, VIEW_W } from "./render";
import { api } from "./api";
import type { ReplayResponse, State } from "./types";

export function ReplayPlayer({ id, models }: { id: string; models: State["models"] }) {
  const [record, setRecord] = useState<ReplayResponse | null>(null);
  const [error, setError] = useState("");
  const [playing, setPlaying] = useState(
    () => !matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [speed, setSpeed] = useState(1);
  const [tick, setTick] = useState(0);
  const tickRef = useRef(0),
    canvas = useRef<HTMLCanvasElement>(null),
    stepper = useRef<Stepper | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const data = await api<ReplayResponse>(
          `/api/matches/${encodeURIComponent(id)}`,
          undefined,
          controller.signal,
        );
        setRecord(data);
        setError("");
        if (data.status === "RUNNING") timer = setTimeout(() => void poll(), 1000);
      } catch (e) {
        if (!controller.signal.aborted) {
          setError(e instanceof Error ? e.message : "Replay unavailable");
          timer = setTimeout(() => void poll(), 3000);
        }
      }
    }
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [id]);
  const replay = record?.replay;
  function draw() {
    const ctx = canvas.current?.getContext("2d");
    const s = stepper.current?.s;
    if (!ctx || !s || !replay) return;
    const names = replay.fighters.map(
      (id, i) => replay.configs?.[i]?.name ?? models.find((m) => m.id === id)?.name ?? id,
    ) as [string, string];
    const colors = replay.fighters.map(
      (id, i) =>
        models.find((m) => m.id === (replay.configs?.[i]?.model ?? id))?.color ??
        (i ? "#259a98" : "#b82926"),
    ) as [string, string];
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    drawFrame(ctx, s, names, colors);
    drawMentalAttacks(ctx, s, replay.mentalEvents ?? []);
  }
  function seek(target: number) {
    if (!replay) return;
    const next = new Stepper(replay);
    while (next.s.tick < target && next.advance());
    stepper.current = next;
    tickRef.current = next.s.tick;
    setTick(next.s.tick);
    draw();
  }
  useEffect(() => {
    if (replay) seek(Math.min(tickRef.current, replay.ticks));
  }, [replay]);
  useEffect(() => {
    if (!replay || !playing) return;
    let frame = 0,
      previous = performance.now(),
      budget = 0,
      lastUi = 0;
    function loop(now: number) {
      budget = Math.min(budget + ((now - previous) / 1000) * TICKS_PER_SECOND * speed, 240);
      previous = now;
      const player = stepper.current;
      if (player) {
        while (budget >= 1) {
          if (!player.advance()) {
            budget = 0;
            break;
          }
          budget--;
        }
        tickRef.current = player.s.tick;
        draw();
        if (now - lastUi > 100) {
          lastUi = now;
          setTick(player.s.tick);
        }
      }
      frame = requestAnimationFrame(loop);
    }
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [playing, replay, speed]);
  const decision = Math.max(0, (replay?.d.length ?? 1) - 1);
  return (
    <section className="player" aria-label="Fight replay">
      <div className="player-heading">
        <strong>
          {record?.status === "RUNNING"
            ? "Live fight"
            : record?.status === "VOID"
              ? "Fight interrupted"
              : "Recorded fight"}
        </strong>
        <span>
          {record?.status === "RUNNING"
            ? `${replay?.d.length ?? 0} decisions`
            : replay
              ? `${replay.d.length} decisions · ${replay.hash}`
              : "Loading…"}
        </span>
      </div>
      <canvas
        ref={canvas}
        width={VIEW_W * 2}
        height={VIEW_H * 2}
        role="img"
        aria-label="Animated fight replay"
      />
      <div className="player-controls">
        <button onClick={() => setPlaying((p) => !p)}>{playing ? "Pause" : "Play"}</button>
        <button onClick={() => seek(0)}>Restart</button>
        <input
          aria-label="Replay position"
          type="range"
          min={0}
          max={replay?.ticks ?? 0}
          value={tick}
          onChange={(e) => seek(Number(e.target.value))}
        />
        <select
          aria-label="Playback speed"
          value={speed}
          onChange={(e) => setSpeed(Number(e.target.value))}
        >
          {[0.5, 1, 2, 4].map((n) => (
            <option key={n} value={n}>
              {n}×
            </option>
          ))}
        </select>
      </div>
      {(error || record?.error) && <p className="error">{error || record?.error}</p>}
      {record?.status === "RUNNING" && (
        <p className="note">Waiting for model decisions when playback reaches the latest frame.</p>
      )}
      {replay?.observations && (
        <details>
          <summary>Exact prompts from the latest decision</summary>
          {replay.observations[decision]?.map((text, side) => (
            <pre key={side}>
              {replay.configs?.[side]?.name}
              {"\n\n"}
              {text}
            </pre>
          ))}
        </details>
      )}
    </section>
  );
}
