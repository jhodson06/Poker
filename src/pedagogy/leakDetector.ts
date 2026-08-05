/**
 * Automated Leak Detection Engine
 *
 * Aggregates per-decision EV loss records across multiple dimensions
 * (street × position × board texture × action type) to surface the
 * player's top strategic vulnerabilities and generate targeted drill configs.
 *
 * Minimum data thresholds:
 *   - 15 total decisions before generating a report
 *   - 3 decisions per category before including it in results
 */

import { BettingStreet, PlayerPosition } from '../engine/stateMachine';
import { GradeClassification } from './evCalculator';

// ─── Data Types ───────────────────────────────────────────────────────────────

export interface LeakRecord {
  street: BettingStreet;
  position: PlayerPosition;
  boardTexture: 'dry' | 'wet' | 'very_wet' | 'preflop';
  actionTaken: string;   // the action bucket matched (e.g. 'fold', 'bet_33')
  grade: GradeClassification;
  evLoss: number;        // BB units, 0 for Correct
  handNumber: number;
}

export interface LeakSummary {
  key: string;
  category: string;       // Human-readable label
  dimension: 'street' | 'position' | 'texture' | 'cross' | 'action';
  decisionCount: number;
  mistakeCount: number;   // Mistake + Blunder count
  totalEvLoss: number;
  avgEvLoss: number;
  worstAction: string;
  worstEvLoss: number;
}

export interface DrillRecommendation {
  title: string;
  description: string;
  suggestedPosition?: PlayerPosition;
  suggestedStreet?: BettingStreet;
  suggestedBoardTexture?: 'dry' | 'wet' | 'very_wet';
}

export interface LeakReport {
  topLeaks: LeakSummary[];
  drillRecommendations: DrillRecommendation[];
  totalDecisions: number;
  decisionsWithErrors: number;
  hasEnoughData: boolean;
}

const MIN_DECISIONS_FOR_REPORT  = 15;
const MIN_DECISIONS_PER_CATEGORY = 3;

// ─── Report Generator ─────────────────────────────────────────────────────────

export function generateLeakReport(records: LeakRecord[]): LeakReport {
  const hasEnoughData = records.length >= MIN_DECISIONS_FOR_REPORT;
  const decisionsWithErrors = records.filter(r => r.evLoss > 0).length;

  if (!hasEnoughData) {
    return { topLeaks: [], drillRecommendations: [], totalDecisions: records.length, decisionsWithErrors, hasEnoughData: false };
  }

  // Only analyze decisions where the player actually lost EV
  const errorRecords = records.filter(r => r.evLoss > 0);
  if (errorRecords.length < MIN_DECISIONS_PER_CATEGORY) {
    return { topLeaks: [], drillRecommendations: [], totalDecisions: records.length, decisionsWithErrors: 0, hasEnoughData: true };
  }

  // ── Build category buckets ──────────────────────────────────────────────────
  type Bucket = { records: LeakRecord[]; label: string; dim: LeakSummary['dimension'] };
  const buckets = new Map<string, Bucket>();

  const add = (key: string, label: string, dim: LeakSummary['dimension'], r: LeakRecord) => {
    if (!buckets.has(key)) buckets.set(key, { records: [], label, dim });
    buckets.get(key)!.records.push(r);
  };

  for (const r of errorRecords) {
    // Dimension 1: Street
    add(`street:${r.street}`, `${capitalize(r.street)} Decisions`, 'street', r);

    // Dimension 2: Position
    add(`pos:${r.position}`, `${r.position} Position`, 'position', r);

    // Dimension 3: Board texture (postflop only)
    if (r.boardTexture !== 'preflop') {
      const texLabel = r.boardTexture === 'very_wet'
        ? 'Very Wet Board Spots'
        : r.boardTexture === 'wet'
        ? 'Wet Board Spots'
        : 'Dry Board Spots';
      add(`tex:${r.boardTexture}`, texLabel, 'texture', r);
    }

    // Dimension 4: Cross — position + texture (postflop)
    if (r.boardTexture !== 'preflop') {
      const isOOP = ['UTG', 'MP', 'BB', 'SB'].includes(r.position);
      const posLabel = isOOP ? 'OOP' : 'IP';
      const texShort = r.boardTexture.replace('_', ' ');
      add(`cross:${r.position}:${r.boardTexture}`, `${posLabel} on ${texShort} boards (${r.position})`, 'cross', r);
    }

    // Dimension 5: Action taken
    const actLabel = formatActionLabel(r.actionTaken);
    add(`act:${r.actionTaken}`, `${actLabel} Decisions`, 'action', r);
  }

  // ── Compute summaries ───────────────────────────────────────────────────────
  const summaries: LeakSummary[] = [];

  for (const [key, { records: recs, label, dim }] of buckets) {
    if (recs.length < MIN_DECISIONS_PER_CATEGORY) continue;
    const totalEvLoss = recs.reduce((s, r) => s + r.evLoss, 0);
    const avgEvLoss   = totalEvLoss / recs.length;
    const mistakeCount = recs.filter(r => r.grade === 'Mistake' || r.grade === 'Blunder').length;
    const worst = recs.reduce((a, b) => a.evLoss > b.evLoss ? a : b);

    summaries.push({
      key,
      category: label,
      dimension: dim,
      decisionCount: recs.length,
      mistakeCount,
      totalEvLoss: round2(totalEvLoss),
      avgEvLoss:   round2(avgEvLoss),
      worstAction: formatActionLabel(worst.actionTaken),
      worstEvLoss: round2(worst.evLoss),
    });
  }

  // Sort by total EV loss descending, take top 5
  const topLeaks = summaries
    .sort((a, b) => b.totalEvLoss - a.totalEvLoss)
    .slice(0, 5);

  // ── Generate drill recommendations ─────────────────────────────────────────
  const drillRecommendations: DrillRecommendation[] = topLeaks.slice(0, 3).map(leak => {
    const drill: DrillRecommendation = {
      title: `Drill: ${leak.category}`,
      description: `Lost ${leak.totalEvLoss.toFixed(1)} BB over ${leak.decisionCount} decisions (avg ${leak.avgEvLoss.toFixed(2)} BB/decision, ${leak.mistakeCount} Mistakes/Blunders). Focus drills on this spot.`,
    };

    // Parse the key to extract sandbox config parameters
    const parts = leak.key.split(':');
    if (parts[0] === 'street') {
      drill.suggestedStreet = parts[1] as BettingStreet;
    } else if (parts[0] === 'pos') {
      drill.suggestedPosition = parts[1] as PlayerPosition;
    } else if (parts[0] === 'tex') {
      drill.suggestedBoardTexture = parts[1] as 'dry' | 'wet' | 'very_wet';
    } else if (parts[0] === 'cross') {
      drill.suggestedPosition    = parts[1] as PlayerPosition;
      drill.suggestedBoardTexture = parts[2] as 'dry' | 'wet' | 'very_wet';
    }

    return drill;
  });

  return { topLeaks, drillRecommendations, totalDecisions: records.length, decisionsWithErrors, hasEnoughData };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function round2(n: number): number {
  return Number(n.toFixed(2));
}

function formatActionLabel(action: string): string {
  const map: Record<string, string> = {
    fold:        'Fold',
    check:       'Check',
    call:        'Call',
    raise:       'Raise',
    allin:       'All-In',
    bet_33:      'Bet 33%',
    bet_50:      'Bet 50%',
    bet_67:      'Bet 67%',
    bet_75:      'Bet 75%',
    bet_100:     'Bet 100%',
    bet_150:     'Bet 150%',
    bet_overbet: 'Overbet',
  };
  return map[action] ?? action.toUpperCase();
}
