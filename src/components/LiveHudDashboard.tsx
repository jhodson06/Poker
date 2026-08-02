import React from 'react';
import { Award, Zap, Flame, Settings, Grid, RotateCcw, Layers } from 'lucide-react';
import { SessionStats } from '../pedagogy/gtoScoreEngine';

interface LiveHudDashboardProps {
  stats: SessionStats;
  difficultyMode: 'simple' | 'grouped' | 'standard';
  playerCount: number;
  onOpenSettings: () => void;
  onOpenSolutionBrowser: () => void;
  onResetSession: () => void;
}

export const LiveHudDashboard: React.FC<LiveHudDashboardProps> = ({
  stats,
  difficultyMode,
  playerCount,
  onOpenSettings,
  onOpenSolutionBrowser,
  onResetSession
}) => {
  const getGtoScoreBadgeColor = (score: number) => {
    if (score >= 95) return 'from-emerald-500 to-teal-400 text-slate-950';
    if (score >= 85) return 'from-amber-400 to-yellow-500 text-slate-950';
    return 'from-rose-500 to-red-600 text-white';
  };

  return (
    <header className="w-full glass-panel px-4 py-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 shadow-lg">
      {/* Brand & App Info */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-emerald-500/20 transition-all duration-200 hover:scale-105">
          <Zap className="w-6 h-6 text-slate-950 stroke-[2.5]" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-extrabold text-lg tracking-tight text-white font-heading">
              GTO POKER TRAINER
            </h1>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              {playerCount} Players | {difficultyMode} Mode
            </span>
          </div>
          <p className="text-xs text-slate-400 font-medium">Real-Time EV Loss & Nash Strategy Feedback</p>
        </div>
      </div>

      {/* Live HUD Stats */}
      <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
        {/* Hands Played */}
        <div className="flex items-center gap-2 bg-slate-900/80 px-3 py-1.5 rounded-xl border border-slate-800 transition-all duration-200 hover:scale-105 hover:border-slate-700 shadow-md">
          <Layers className="w-4 h-4 text-cyan-400" />
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-400 uppercase font-semibold">Hands</span>
            <span className="text-sm font-extrabold text-cyan-300 font-mono">
              {stats.handsPlayed}
            </span>
          </div>
        </div>

        {/* GTO Score Badge */}
        <div className="flex items-center gap-2 bg-slate-900/80 px-3 py-1.5 rounded-xl border border-slate-800 transition-all duration-200 hover:scale-105 hover:border-slate-700 shadow-md">
          <Award className="w-4 h-4 text-emerald-400" />
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-400 uppercase font-semibold">GTO Score</span>
            <span className={`text-sm font-extrabold px-2 py-0.5 rounded-md bg-gradient-to-r ${getGtoScoreBadgeColor(stats.gtoScorePercent)}`}>
              {stats.gtoScorePercent}%
            </span>
          </div>
        </div>

        {/* EV Lost */}
        <div className="flex items-center gap-2 bg-slate-900/80 px-3 py-1.5 rounded-xl border border-slate-800 transition-all duration-200 hover:scale-105 hover:border-slate-700 shadow-md">
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-400 uppercase font-semibold">Session EV Loss</span>
            <span className={`text-sm font-mono font-bold ${stats.totalEvLossBB > 2.0 ? 'text-rose-400' : 'text-emerald-400'}`}>
              -{stats.totalEvLossBB} BB
            </span>
          </div>
        </div>

        {/* Streak */}
        <div className="flex items-center gap-2 bg-slate-900/80 px-3 py-1.5 rounded-xl border border-slate-800 transition-all duration-200 hover:scale-105 hover:border-slate-700 shadow-md">
          <Flame className={`w-4 h-4 ${stats.currentStreak > 0 ? 'text-amber-400 animate-pulse' : 'text-slate-600'}`} />
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-400 uppercase font-semibold">Streak</span>
            <span className="text-sm font-bold text-amber-400 font-mono">
              {stats.currentStreak} 🔥
            </span>
          </div>
        </div>
      </div>

      {/* Action Buttons with High-Contrast Hover Styles */}
      <div className="flex items-center gap-2">
        <button
          onClick={onOpenSolutionBrowser}
          className="btn-poker-nav flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold shadow-md transition-all duration-200 hover:scale-105 active:scale-95"
        >
          <Grid className="w-4 h-4 text-emerald-400" />
          <span className="hidden sm:inline">13x13 Solutions</span>
        </button>

        <button
          onClick={onOpenSettings}
          className="btn-poker-nav flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold shadow-md transition-all duration-200 hover:scale-105 active:scale-95"
        >
          <Settings className="w-4 h-4 text-cyan-400" />
          <span className="hidden sm:inline">Settings</span>
        </button>

        <button
          onClick={onResetSession}
          title="Reset Session Stats"
          className="btn-poker-nav p-2 rounded-xl text-slate-300 transition-all duration-200 hover:scale-105 active:scale-95"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
