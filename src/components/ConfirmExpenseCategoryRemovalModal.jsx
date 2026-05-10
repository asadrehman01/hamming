import React, { useEffect } from "react";
import { AlertCircle } from "lucide-react";

const ConfirmExpenseCategoryRemovalModal = ({
  isOpen,
  categoryName,
  onConfirm,
  onCancel,
  isRemoving,
}) => {
  if (!isOpen) return null;

  useEffect(() => {
    if (!isOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !isRemoving) {
        onCancel();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, isRemoving, onCancel]);

  const titleId = "confirm-expense-category-delete-title";
  const descId = "confirm-expense-category-delete-desc";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-3 sm:px-4 animate-in fade-in duration-300"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isRemoving) onCancel();
      }}
    >
      <div
        className="bg-[#1A1A1A] border border-white/10 w-full max-w-sm shadow-2xl animate-in zoom-in-95 duration-300 overflow-hidden rounded-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
      >
        <div className="p-6 sm:p-8">
          <div className="flex items-start gap-4 mb-4">
            <div className="flex-shrink-0">
              <AlertCircle size={24} className="text-red-500/80" />
            </div>
            <div className="flex-1 min-w-0">
              <h2
                id={titleId}
                className="text-lg sm:text-xl font-semibold text-white mb-2"
              >
                Delete Ledger Field?
              </h2>
              <p
                id={descId}
                className="text-[13px] sm:text-sm text-white/60 leading-relaxed"
              >
                This will permanently delete
                <span className="font-medium text-white"> {categoryName}</span>
                . This action cannot be undone.
              </p>
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <button
              type="button"
              onClick={onCancel}
              disabled={isRemoving}
              className="flex-1 px-4 py-2.5 text-[12px] sm:text-[13px] tracking-wide font-medium border border-white/15 rounded-lg text-white/80 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={isRemoving}
              className="flex-1 px-4 py-2.5 text-[12px] sm:text-[13px] tracking-wide font-medium rounded-lg bg-red-600/90 hover:bg-red-500 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isRemoving ? "Deleting..." : "Delete"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfirmExpenseCategoryRemovalModal;