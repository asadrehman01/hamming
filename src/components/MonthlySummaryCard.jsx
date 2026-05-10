import React from "react";
import { IndianRupee, TrendingUp, Users, AlertCircle, X } from "lucide-react";

const MonthlySummaryCard = ({ summary, isLoading, error, onRemove, isRemoving }) => {
  if (isLoading) {
    return (
      <div className="bg-[#151921] rounded-lg p-4 border border-white/10 animate-pulse">
        <div className="h-4 bg-white/10 rounded w-32 mb-4"></div>
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 bg-white/10 rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 rounded-lg p-4 border border-red-500/20 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-red-400 font-medium">Error loading summary</p>
          <p className="text-red-400/80 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="bg-[#151921] rounded-lg p-4 border border-white/10 text-center text-white/40">
        No summary data available
      </div>
    );
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("en-IN", {
      currency: "INR",
      style: "currency",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount || 0);
  };

  const formatMonth = (dateString) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    } catch {
      return dateString;
    }
  };

  const profitBgColor = "bg-white/5";
  const profitBorderColor = "border-white/10";

  return (
    <div className="bg-[#151921] rounded-lg border border-white/5 overflow-hidden shadow-lg shadow-black/20">
      {/* Header */}
      <div className="bg-[#0a0c10] px-4 py-3 border-b border-white/5 flex items-center justify-between gap-2">
        <h3 className="font-normal text-white tracking-tight">{formatMonth(summary.month_year)}</h3>
        {typeof onRemove === "function" && (
          <button
            type="button"
            onClick={() => onRemove(summary)}
            disabled={isRemoving}
            aria-label="Remove summary"
            className="native-inline-btn p-1 text-white/45 hover:text-red-300 transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Grid of metrics */}
      <div className="grid grid-cols-2 gap-4 p-4">
        {/* Total Revenue */}
        <div className="bg-white/5 rounded-lg p-4 border border-white/10">
          <div className="flex items-center justify-between mb-2">
            <p className="text-white/60 text-xs font-light tracking-[0.08em]">Total Revenue</p>
            <IndianRupee className="w-4 h-4 text-white/60" />
          </div>
          <p className="text-lg font-medium text-white">
            {formatCurrency(summary.total_revenue)}
          </p>
        </div>

        {/* Total Expenses */}
        <div className="bg-white/5 rounded-lg p-4 border border-white/10">
          <div className="flex items-center justify-between mb-2">
            <p className="text-white/60 text-xs font-light tracking-[0.08em]">Total Expenses</p>
            <IndianRupee className="w-4 h-4 text-white/60" />
          </div>
          <p className="text-lg font-medium text-white">
            {formatCurrency(summary.total_expenses)}
          </p>
        </div>

        {/* Total Subscriptions */}
        <div className="bg-white/5 rounded-lg p-4 border border-white/10">
          <div className="flex items-center justify-between mb-2">
            <p className="text-white/60 text-xs font-light tracking-[0.08em]">Subscriptions</p>
            <Users className="w-4 h-4 text-white/60" />
          </div>
          <p className="text-lg font-medium text-white">
            {summary.total_subscriptions}
          </p>
        </div>

        {/* Net Profit */}
        <div className={`rounded-lg p-4 border ${profitBgColor} ${profitBorderColor}`}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-white/60 text-xs font-light tracking-[0.08em]">Net Profit</p>
            <TrendingUp className="w-4 h-4 text-white/60" />
          </div>
          <p className="text-lg font-medium text-white">
            {formatCurrency(summary.net_profit)}
          </p>
        </div>
      </div>

      {/* Footer metadata */}
      <div className="px-4 py-3 bg-[#0a0c10] border-t border-white/5">
        <p className="text-xs text-white/40">
          Generated on {new Date(summary.created_at || Date.now()).toLocaleDateString()}
        </p>
      </div>
    </div>
  );
};

export default MonthlySummaryCard;
