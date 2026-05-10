import React from "react";

const OnboardingProgressBar = ({ billingStepComplete = false, migrationStepComplete = false }) => {
  const billingPercent = billingStepComplete ? 100 : 0;
  const migrationPercent = migrationStepComplete ? 100 : 0;
  const allComplete = billingStepComplete && migrationStepComplete;
  const completedCount = Number(billingStepComplete) + Number(migrationStepComplete);
  const statusMessage = allComplete
    ? "Setup complete"
    : billingStepComplete && !migrationStepComplete
      ? "Billing complete - finish migration"
      : migrationStepComplete && !billingStepComplete
        ? "Migration complete - complete billing to finish setup"
        : "Complete billing first, then finish migration.";

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-10 w-[min(94vw,42rem)] pointer-events-none">
      <div className="bg-[#101214] border border-white/10 rounded-2xl px-5 py-4 shadow-2xl pointer-events-auto">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <p className="text-[10px] tracking-[0.2em] text-white/45 dm-sans-light-008 uppercase">
              Setup Progress
            </p>
            <p className="text-xs text-white/65 mt-1 dm-sans-light-008">
              {statusMessage}
            </p>
          </div>
          <div className="text-[10px] tracking-[0.12em] text-white/45 dm-sans-light-008 uppercase">
            {completedCount} / 2 done
          </div>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-3 text-[10px] dm-sans-light-008 text-white/65 uppercase tracking-[0.12em]">
              <span>Receipt Settings</span>
              <span>{billingStepComplete ? "Done" : "Pending"}</span>
            </div>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-2 bg-white transition-all duration-300"
                style={{ width: `${billingPercent}%` }}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={billingPercent}
                aria-label="Billing setup progress"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-3 text-[10px] dm-sans-light-008 text-white/65 uppercase tracking-[0.12em]">
              <span>Migration Setup</span>
              <span>{migrationStepComplete ? "Done" : "Pending"}</span>
            </div>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-2 bg-white transition-all duration-300"
                style={{ width: `${migrationPercent}%` }}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={migrationPercent}
                aria-label="Migration progress"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OnboardingProgressBar;
