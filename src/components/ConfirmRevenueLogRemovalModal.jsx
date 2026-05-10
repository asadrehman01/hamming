import React, { useEffect, useRef } from "react";
import { AlertCircle } from "lucide-react";

const ConfirmRevenueLogRemovalModal = ({
  isOpen,
  clientName,
  amountLabel,
  onConfirm,
  onCancel,
  isRemoving,
}) => {
  const modalRef = useRef(null);
  const cancelButtonRef = useRef(null);
  const previousFocusRef = useRef(null);
  const titleId = "revenueModalTitle";
  const descId = "revenueModalDesc";

  useEffect(() => {
    if (!isOpen) return undefined;
    previousFocusRef.current = document.activeElement;
    cancelButtonRef.current?.focus();

    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !isRemoving) {
        onCancel();
        return;
      }

      if (event.key !== "Tab") return;
      const focusable = modalRef.current?.querySelectorAll(
        'button:not([disabled]):not([aria-disabled="true"]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]):not([aria-disabled="true"])',
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (previousFocusRef.current?.focus) {
        previousFocusRef.current.focus();
      }
    };
  }, [isOpen, isRemoving, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-3 sm:px-4 animate-in fade-in duration-300"
      onClick={(event) => {
        if (event.target === event.currentTarget && !isRemoving) {
          onCancel();
        }
      }}
    >
      <div
        ref={modalRef}
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
                Delete Revenue Log?
              </h2>
              <p
                id={descId}
                className="text-[13px] sm:text-sm text-white/60 leading-relaxed"
              >
                This will permanently delete
                {amountLabel ? (
                  <>
                    {" "}
                    <span className="font-medium text-white">{amountLabel}</span>
                    {" "}revenue entry for
                    <span className="font-medium text-white"> {clientName || "this client"}</span>
                  </>
                ) : (
                  <>
                    {" "}the revenue log for
                    <span className="font-medium text-white"> {clientName || "this client"}</span>
                  </>
                )}
                . This action cannot be undone.
              </p>
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <button
              type="button"
              onClick={onCancel}
              disabled={isRemoving}
              ref={cancelButtonRef}
              className="flex-1 px-4 py-2.5 text-[12px] sm:text-[13px] tracking-wide font-medium border border-white/15 rounded-lg text-white/80 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={isRemoving}
              className="flex-1 px-4 py-2.5 text-[12px] sm:text-[13px] tracking-wide font-medium rounded-lg border border-red-300/15 bg-red-400/[0.04] hover:bg-red-400/[0.08] text-red-300/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isRemoving ? "Deleting..." : "Delete"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfirmRevenueLogRemovalModal;
