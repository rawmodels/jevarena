import entries from "./models.json";
export type Model = {
  id: string;
  name: string;
  maker: string;
  color: string;
  kind: "api" | "random" | "scripted";
  endpoint?: string;
  upstream?: string;
  keyEnv?: string;
  mode?: "choice" | "noul";
  requestsPerSecond?: number;
};
export const MODELS = entries as Model[];
export function modelById(id: string): Model {
  const model = MODELS.find((model) => model.id === id);
  if (!model) throw new Error(`Unknown model: ${id}`);
  return model;
}
export function publicModels() {
  return MODELS.map((model) => ({
    ...model,
    configured: model.kind !== "api" || !!process.env[model.keyEnv!],
  }));
}
