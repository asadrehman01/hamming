import React from 'react';

const StatCard = ({ title, value, trend, icon, onClick }) => {
  const isPositive = typeof trend === 'string' ? trend.startsWith('+') : trend > 0;
  const interactiveProps = onClick
    ? {
        role: 'button',
        tabIndex: 0,
        onClick,
        onKeyDown: (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onClick();
          }
        },
      }
    : {};

  return (
    <div
      className={`bg-[#151920] border border-white/10 px-4 py-3.5 rounded-xl transition-colors ${onClick ? 'cursor-pointer hover:border-white/20 hover:bg-[#171d27]' : ''}`}
      {...interactiveProps}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] tracking-[0.02em] text-white/65 font-light">
            {title}
          </p>
          <p className="mt-1 text-[34px] leading-none font-light text-white tracking-tight">
            {value}
          </p>
        </div>
        <div className="w-12 h-12 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-center">
          <span className="text-white/65">{icon}</span>
        </div>
      </div>
      {trend && (
        <p className="mt-2 text-[10px] tracking-[0.08em] text-white/40">
          {trend}
        </p>
      )}
    </div>
  );
};

export default StatCard;
