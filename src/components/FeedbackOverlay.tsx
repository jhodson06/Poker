import React from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Skull, X } from 'lucide-react';
import { DecisionGrading } from '../pedagogy/evCalculator';
import { GtoNodeStrategy } from '../gto/strategyDatabase';

interface FeedbackOverlayProps {
  grading: DecisionGrading;
  strategy: GtoNodeStrategy;
  onDismiss: () => void;
}

export const FeedbackOverlay: React.FC<FeedbackOverlayProps> = ({ grading, strategy, onDismiss }) => {
  const getIcon = () => {
    switch (grading.grade) {
      case 'Correct':
        return <CheckCircle2 className="w-8 h-8 text-emerald-400" />;
      case 'Inaccuracy':
        return <AlertTriangle className="w-8 h-8 text-amber-400" />;
      case 'Mistake':
        return <XCircle className="w-8 h-8 text-rose-400" />;
      case 'Blunder':
        return <Skull className="w-8 h-8 text-rose-500 animate-bounce" />;
    }
  };

  return (
    <div className="fixed bottom-28 right-6 z-50 max-w-md w-full glass-panel p-5 rounded-2xl border border-slate-700 shadow-2xl animate-in slide-in-from-bottom-5 duration-300">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {getIcon()}
          <div>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-extrabold uppercase px-2.5 py-0.5 rounded-full border ${grading.badgeBgClass}`}>
                {grading.grade}
              </span>
              <span className="text-xs font-mono font-bold text-slate-300">
                EV Loss: -{grading.evLoss} BB
              </span>
            </div>
            <h4 className="text-sm font-bold text-white mt-1">
              Your Choice: <span className="text-cyan-400">{grading.userActionLabel}</span>
            </h4>
          </div>
        </div>

        <button
          onClick={onDismiss}
          className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-all"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <p className="text-xs text-slate-300 mt-2 font-medium leading-relaxed">
        {grading.explanation}
      </p>

      {/* Solver Frequencies Breakdown */}
      <div className="mt-4 pt-3 border-t border-slate-800/80">
        <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 mb-2">
          <span>GTO SOLVER FREQUENCIES [{strategy.handKey}]</span>
          <span>Optimal: {grading.optimalActionLabel}</span>
        </div>

        <div className="space-y-1.5">
          {strategy.frequencies.map((item, idx) => (
            <div key={idx} className="flex items-center justify-between text-xs">
              <span className="text-slate-300 font-medium">{item.label}</span>
              <div className="flex items-center gap-3">
                <div className="w-24 bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800">
                  <div
                    className={`h-full rounded-full ${
                      item.action === 'fold'
                        ? 'bg-slate-500'
                        : item.action === 'check'
                        ? 'bg-blue-500'
                        : item.action === 'call'
                        ? 'bg-emerald-500'
                        : 'bg-rose-500'
                    }`}
                    style={{ width: `${item.frequency * 100}%` }}
                  />
                </div>
                <span className="text-[11px] font-mono font-bold text-slate-200 min-w-[36px] text-right">
                  {(item.frequency * 100).toFixed(0)}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
