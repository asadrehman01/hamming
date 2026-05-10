import React, { useMemo, useState } from "react";
import "./MembershipChart.css";

const months = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const fallbackData = months.map((month, idx) => ({
  month,
  new: 20 + (idx % 5) * 8,
  lost: 5 + (idx % 4) * 4,
}));

const MembershipChart = ({ data }) => {
  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear - 1, currentYear - 2];
  const [selectedYear, setSelectedYear] = useState(years[0]);

  const sourceData = useMemo(() => data ?? fallbackData, [data]);

  const yearFilteredData = useMemo(() => {
    return sourceData.filter((point) => {
      if (!Object.prototype.hasOwnProperty.call(point, "year")) {
        return true;
      }
      return Number(point.year) === Number(selectedYear);
    });
  }, [selectedYear, sourceData]);

  const chartData = yearFilteredData.length > 0 ? yearFilteredData : sourceData;
  const values = chartData.map((d) =>
    Math.max(Number(d.new) || 0, Number(d.lost) || 0),
  );
  const maxValue = values.length === 0 ? 10 : Math.max(...values) + 10;

  return (
    <div className="bg-[#151921] border border-white/5 p-4 md:p-10 rounded-2xl h-full flex flex-col shadow-2xl shadow-black/40 dashboard-page-vibe-chart">
      <div className="flex justify-between items-center mb-6 md:mb-12">
        <div>
          <h3 className="text-lg font-medium text-white tracking-tight dashboard-chart-title">
            Membership Movement
          </h3>
          <div className="flex gap-4 mt-2">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-white dashboard-chart-bar-new" />
              <span className="text-[10px] tracking-[0.08em] text-white/80 dm-sans-light-008 dashboard-chart-label">
                New Members
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-white/35 dashboard-chart-bar-lost" />
              <span className="text-[10px] tracking-[0.08em] text-white/80 dm-sans-light-008 dashboard-chart-label">
                No Longer Member
              </span>
            </div>
          </div>
        </div>
        <div className="relative group/select">
          <select
            aria-label="Select year"
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="appearance-none bg-white/5 border border-white/10 text-white text-[10px] tracking-[0.08em] dm-sans-light-008 pl-6 pr-10 py-2.5 rounded-xl focus:outline-none focus:border-white/30 transition-all cursor-pointer hover:bg-white/10 dashboard-chart-select"
          >
            {years.map((year) => (
              <option
                key={year}
                value={year}
                className="bg-[#151921] text-white dm-sans-light-008 dashboard-chart-option"
              >
                {year}
              </option>
            ))}
          </select>
          <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-white/40 group-hover/select:text-white/70 transition-colors dashboard-chart-arrow">
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-end justify-between px-1 md:px-2 gap-1 md:gap-4 h-[200px] md:h-[240px]">
        {chartData.map((d, index) => {
          const safeNew = Number(d.new) || 0;
          const safeLost = Number(d.lost) || 0;
          const safeMaxValue = maxValue || 1;

          return (
            <div
              key={`${d.year ?? "default"}-${d.month ?? "unknown"}-${index}`}
              className="flex-1 flex flex-col items-center group h-full justify-end"
            >
              <div className="w-full flex justify-center gap-1.5 h-full items-end mb-4">
                <div
                  className="w-1 md:w-1.5 bg-white rounded-t-full relative group/bar hover:bg-white/90 transition-all duration-500 dashboard-bar-new"
                  style={{ height: `${(safeNew / safeMaxValue) * 100}%` }}
                >
                  <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-white text-black text-[9px] tracking-[0.08em] dm-sans-light-008 px-3 py-1.5 rounded-lg opacity-0 group-hover/bar:opacity-100 transition-all whitespace-nowrap z-10 dashboard-tooltip">
                    {safeNew} New
                  </div>
                </div>

                <div
                  className="w-1 md:w-1.5 bg-white/35 rounded-t-full relative group/bar hover:bg-white/45 transition-all duration-500 dashboard-bar-lost"
                  style={{ height: `${(safeLost / safeMaxValue) * 100}%` }}
                >
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-white text-black text-[9px] tracking-[0.08em] dm-sans-light-008 px-2 py-1 rounded opacity-0 group-hover/bar:opacity-100 transition-opacity whitespace-nowrap z-10 dashboard-tooltip">
                    {safeLost} Lost
                  </div>
                </div>
              </div>

              <span className="text-[10px] tracking-[0.08em] text-white/60 dm-sans-light-008 group-hover:text-white transition-colors dashboard-month-label">
                {d.month}
              </span>
            </div>
          );
        })}
      </div>

    </div>
  );
};

export default MembershipChart;
