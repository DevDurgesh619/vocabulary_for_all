// Shared domain types.

export type Direction = "w2m" | "m2w";

export interface Word {
  id: number;
  order: number;
  word: string;
  pos: string;
  posLabel: string;
  definition: string;
}

export interface Question {
  id: string;
  wordId: number;
  direction: Direction;
  prompt: string;
  promptPos: string;
  options: string[];
  optionWordIds: number[];
  correctIndex: number;
}

export type WordStatus = "new" | "learning" | "mastered" | "needs_review";
export type FluencyTier = "mastered" | "developing" | "needs_reinforcement" | "at_risk";

export type Role = "student" | "counsellor";

export interface Profile {
  user_id: string;
  role: Role;
  email: string | null;
  display_name: string | null;
  words_per_day: number;
  fast_threshold_ms: number;
  slow_threshold_ms: number;
  guess_threshold_ms: number;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface DailySession {
  id: string;
  user_id: string;
  day_number: number;
  word_ids: number[];
  status: "learning" | "tested";
  created_at: string;
}

export interface TestSession {
  id: string;
  user_id: string;
  daily_session_id: string | null;
  kind: "daily" | "revision";
  attempt_number: number;
  total: number;
  correct: number;
  score_pct: number;
  avg_response_ms: number;
  created_at: string;
}

export interface QuestionResponse {
  id: string;
  user_id: string;
  test_session_id: string;
  word_id: number;
  question_id: string;
  direction: Direction;
  selected_index: number | null;
  selected_word_id: number | null;
  is_correct: boolean;
  response_ms: number;
  answered_at: string;
}

export interface WordProgress {
  user_id: string;
  word_id: number;
  status: WordStatus;
  fluency_tier: FluencyTier | null;
  attempts: number;
  correct_count: number;
  last_correct: boolean | null;
  best_response_ms: number | null;
  last_response_ms: number | null;
  last_tested_at: string | null;
  updated_at: string;
}

// An answer captured locally during a test run, before it is persisted.
export interface LocalAnswer {
  question: Question;
  selectedIndex: number | null;
  selectedWordId: number | null;
  isCorrect: boolean;
  responseMs: number;
}
