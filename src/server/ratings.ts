import { bradleyTerry } from "../core/elo";
import type { FighterConfig } from "../core/config";
import type { Replay } from "../core/match";
import { fingerprint } from "./storage";

/** Edited configs get new rating identities; old games keep their exact opponent version. */
export function userRatings(fighters: FighterConfig[], matches: Replay[]) {
  const version = (fighter: FighterConfig) => `${fighter.id}:${fingerprint(fighter)}`;
  const ids = new Set<string>();
  const games = matches.map((match) => {
    const [a, b] = match.configs.map(version);
    ids.add(a);
    ids.add(b);
    return { a, b, score: match.winner === null ? 0.5 : match.winner === 0 ? 1 : 0 };
  });
  const ratings = ids.size ? bradleyTerry([...ids], games) : {};
  return fighters
    .map((fighter) => {
      const own = matches.filter((match) =>
        match.configs.some((config) => version(config) === version(fighter)),
      );
      const wins = own.filter(
        (match) =>
          match.winner !== null && version(match.configs[match.winner]) === version(fighter),
      ).length;
      const draws = own.filter((match) => match.winner === null).length;
      return {
        ...fighter,
        elo: own.length ? Math.round(ratings[version(fighter)]) : 1000,
        w: wins,
        l: own.length - wins - draws,
        d: draws,
        games: own.length,
      };
    })
    .sort((a, b) => b.elo - a.elo);
}
