/** Tipos compartidos entre el cliente y el game-service. */

export type Phase = "lobby" | "playing" | "tiebreak" | "finished";
export type PayoutMode = "winner" | "top2" | "custom";
export type ExactReward = "money" | "double" | "both";
/** Nivel oculto de la mesa: sesga el dado hacia el 1. Solo el admin lo conoce y
 *  JAMÁS viaja en el estado público de la sala. */
export type Difficulty = "facil" | "medio" | "dificil";

export interface RoomSettings {
  buyIn: number;
  rounds: number;
  maxPlayers: number;
  turnSeconds: number;
  payoutMode: PayoutMode;
  custom: { first: number; second: number; third: number };
  exactEnabled: boolean;
  exactTarget: number;
  exactReward: ExactReward;
  exactMoney: number;
  /** Solo presente en el formulario del admin y en el evento privado room:admin-settings. */
  difficulty?: Difficulty;
  /** % editable de que salga 1 en cada nivel (0–90). Igual que difficulty: SOLO
   *  viaja en el canal privado del administrador, jamás en el estado público. */
  onesPct?: { facil: number; medio: number; dificil: number };
}

export interface DiceColors {
  /** id del preset o "custom" */
  id: string;
  /** color de la cara */
  face: string;
  /** color secundario de la cara (degradado) */
  face2: string;
  /** color de los puntos */
  pip: string;
  /** nombre visible */
  name: string;
}

export interface PublicPlayer {
  id: string;
  name: string;
  isAdmin: boolean;
  connected: boolean;
  joinedAt: number;
}

export interface FeedEvent {
  id: string;
  ts: number;
  kind: "join" | "leave" | "kick" | "roll" | "bust" | "hold" | "start" | "round" | "turn" | "finish" | "tiebreak" | "system" | "chat" | "bonus";
  text: string;
  playerId?: string;
  value?: number;
}

export interface ChatMsg {
  id: string;
  ts: number;
  from: string;
  playerId: string;
  text: string;
}

export interface GameInfo {
  round: number;
  totalRounds: number;
  currentPlayerId: string | null;
  turnTotal: number;
  dice: number | null;
  turnEndsAt: number | null;
  tiebreak: { players: string[]; rolls: Record<string, number>; stage: number } | null;
}

export interface FinalResults {
  ranking: { playerId: string; name: string; position: number; points: number; amount: number }[];
  pot: number;
  mode: PayoutMode;
  finishedAt: number;
}

export interface PublicRoom {
  code: string;
  createdAt: number;
  settings: RoomSettings;
  pot: number;
  phase: Phase;
  players: PublicPlayer[];
  scores: Record<string, number>;
  bonus?: Record<string, number>;
  game: GameInfo;
  events: FeedEvent[];
  chat: ChatMsg[];
  results: FinalResults | null;
  serverNow: number;
}

export interface Identity {
  playerId: string;
  token: string;
  name: string;
  balance: number;
}

export interface RollResult {
  playerId: string;
  name: string;
  value: number;
  ts: number;
  exactBonus?: {
    target: number;
    reward: ExactReward;
    money: number;
    doubled: boolean;
    banked: number;
  };
}

export interface HistoryGame {
  id: string;
  code: string;
  at: number;
  pot: number;
  position: number;
  points: number;
  amount: number;
}
