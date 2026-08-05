import React from 'react';
import { X, AlertTriangle, TrendingDown, Target, Zap, ChevronRight } from 'lucide-react';
import { LeakReport, DrillRecommendation } from '../pedagogy/leakDetector';

interface LeakReportModalProps {
  report: LeakReport;
  onClose: () => void;
  onApplyDrill: (drill: DrillRecommendation) => void;
}

const LEAK_COLORS = [
  { bar: 'bg-rose-500',   badge: 'bg-rose-500/20 border-rose-500/40 text-rose-300' },
  { bar: 'bg-orange-500', badge: 'bg-orange-500/20 border-orange-500/40 text-orange-300' },
  { bar: 'bg-amber-500',  badge: 'bg-amber-500/20 border-amber-500/40 text-amber-300' },
  { bar: 'bg-yellow-500', badge: 'bg-yellow-500/20 border-yellow-500/40 text-yellow-300' },
  { bar: 'bg-lime-500',   badge: 'bg-lime-500/20 border-lime-500/40 text-lime-300' },
];

export const LeakReportModal: React.FC<LeakReportModalProps> = ({ report, onClose, onApplyDrill }) => {
  const maxEvLoss = report.topLeaks[0]?.totalEvLoss ?? 1;
  const accuracy = report.totalDecisions > 0
    ? Math.round(((report.totalDecisions - report.decisionsWithErrors) / report.totalDecisions) * 100)
    : 100;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl glass-panel rounded-2xl border border-slate-700 shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-rose-500 to-orange-400 flex items-center justify-center shadow-lg">
              <AlertTriangle className="w-5 h-5 text-white stroke-[2.5]" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-white tracking-tight font-heading">
                LEAK ANALYSIS REPORT
              </h2>
              <p className="text-[11px] text-slate-400 font-medium">
                {report.totalDecisions} decisions analyzed · {report.decisionsWithErrors} contained EV loss
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto max-h-[calc(100vh-140px)] p-6 space-y-6">

          {/* Not enough data */}
          {!report.hasEnoughData && (
            <div className="text-center py-10 space-y-3">
              <Zap className="w-12 h-12 text-cyan-400 mx-auto opacity-60" />
              <p className="text-slate-300 font-semibold">
                Play at least {15 - report.totalDecisions} more decisions to unlock your Leak Report.
              </p>
              <p className="text-slate-500 text-xs">
                ({report.totalDecisions}/15 decisions recorded)
              </p>
              <div className="w-48 mx-auto bg-slate-900 rounded-full h-2 border border-slate-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-500 transition-all duration-500"
                  style={{ width: `${Math.min(100, (report.totalDecisions / 15) * 100)}%` }}
                />
              </div>
            </div>
          )}

          {/* Has data — show leaks */}
          {report.hasEnoughData && (
            <>
              {/* Overall score strip */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-900/80 rounded-xl p-3 border border-slate-800 text-center">
                  <div className={`text-2xl font-black ${accuracy >= 80 ? 'text-emerald-400' : accuracy >= 60 ? 'text-amber-400' : 'text-rose-400'}`}>
                    {accuracy}%
                  </div>
                  <div className="text-[10px] text-slate-400 uppercase font-bold mt-0.5">Decision Accuracy</div>
                </div>
                <div className="bg-slate-900/80 rounded-xl p-3 border border-slate-800 text-center">
                  <div className="text-2xl font-black text-rose-400">
                    {report.decisionsWithErrors}
                  </div>
                  <div className="text-[10px] text-slate-400 uppercase font-bold mt-0.5">Errors Made</div>
                </div>
                <div className="bg-slate-900/80 rounded-xl p-3 border border-slate-800 text-center">
                  <div className="text-2xl font-black text-orange-400">
                    {report.topLeaks.reduce((s, l) => s + l.totalEvLoss, 0).toFixed(1)}
                  </div>
                  <div className="text-[10px] text-slate-400 uppercase font-bold mt-0.5">Total EV Lost (BB)</div>
                </div>
              </div>

              {/* Top leaks */}
              {report.topLeaks.length === 0 && (
                <div className="text-center py-6 text-emerald-400 font-semibold">
                  🎉 No significant leaks detected — excellent play!
                </div>
              )}

              {report.topLeaks.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingDown className="w-4 h-4 text-rose-400" />
                    <h3 className="text-xs font-extrabold text-slate-300 uppercase tracking-wider">
                      Top Leaks by Cumulative EV Loss
                    </h3>
                  </div>

                  <div className="space-y-3">
                    {report.topLeaks.map((leak, idx) => {
                      const color = LEAK_COLORS[idx] ?? LEAK_COLORS[LEAK_COLORS.length - 1];
                      const barPct = maxEvLoss > 0 ? (leak.totalEvLoss / maxEvLoss) * 100 : 0;
                      return (
                        <div
                          key={leak.key}
                          className="bg-slate-900/60 rounded-xl p-3.5 border border-slate-800 space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${color.badge}`}>
                                #{idx + 1}
                              </span>
                              <span className="text-sm font-bold text-white">{leak.category}</span>
                            </div>
                            <div className="text-right">
                              <span className="text-sm font-black text-rose-400 font-mono">-{leak.totalEvLoss.toFixed(1)} BB</span>
                              <span className="text-[10px] text-slate-500 font-mono ml-1.5">
                                avg -{leak.avgEvLoss.toFixed(2)}/dec
                              </span>
                            </div>
                          </div>

                          {/* EV bar */}
                          <div className="w-full bg-slate-950 rounded-full h-1.5 border border-slate-800/60">
                            <div
                              className={`h-full rounded-full ${color.bar} transition-all duration-700`}
                              style={{ width: `${barPct}%` }}
                            />
                          </div>

                          <div className="flex items-center justify-between text-[11px] text-slate-500">
                            <span>{leak.decisionCount} decisions · {leak.mistakeCount} Mistakes/Blunders</span>
                            <span>Worst single: <span className="text-rose-300 font-mono">{leak.worstAction} (-{leak.worstEvLoss} BB)</span></span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Drill recommendations */}
              {report.drillRecommendations.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Target className="w-4 h-4 text-cyan-400" />
                    <h3 className="text-xs font-extrabold text-slate-300 uppercase tracking-wider">
                      Recommended Drills
                    </h3>
                  </div>

                  <div className="space-y-2">
                    {report.drillRecommendations.map((drill, idx) => (
                      <div
                        key={idx}
                        className="flex items-start justify-between gap-3 bg-slate-900/60 rounded-xl p-3.5 border border-slate-800 hover:border-cyan-800/60 transition-colors group"
                      >
                        <div className="flex-1">
                          <p className="text-sm font-bold text-cyan-300">{drill.title}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">{drill.description}</p>
                          {(drill.suggestedPosition || drill.suggestedBoardTexture || drill.suggestedStreet) && (
                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                              {drill.suggestedPosition && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                                  Position: {drill.suggestedPosition}
                                </span>
                              )}
                              {drill.suggestedStreet && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/30 text-purple-400">
                                  Street: {drill.suggestedStreet}
                                </span>
                              )}
                              {drill.suggestedBoardTexture && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400">
                                  Board: {drill.suggestedBoardTexture.replace('_', ' ')}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => { onApplyDrill(drill); onClose(); }}
                          className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 text-xs font-bold hover:bg-cyan-500/25 transition-all group-hover:scale-105"
                        >
                          Drill <ChevronRight className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
