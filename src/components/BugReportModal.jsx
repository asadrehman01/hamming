import React, { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { sendBugReport } from "../lib/backendApi";

const BugReportModal = ({ isOpen, onClose, accountEmail = "" }) => {
  const location = useLocation();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [stepsToReproduce, setStepsToReproduce] = useState("");
  const [severity, setSeverity] = useState("Medium");
  const [reporterName, setReporterName] = useState("");
  const [reporterEmail, setReporterEmail] = useState(accountEmail || "");
  const [emailConsent, setEmailConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState({ type: "", message: "" });
  const modalRef = useRef(null);
  const firstFieldRef = useRef(null);
  const previousFocusRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    setStatus({ type: "", message: "" });
    setReporterEmail(accountEmail || "");
    setEmailConsent(false);
  }, [isOpen, accountEmail]);

  useEffect(() => {
    if (!isOpen) return;

    previousFocusRef.current = document.activeElement;
    if (firstFieldRef.current) {
      firstFieldRef.current.focus();
    }

    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !submitting) {
        onClose();
        return;
      }

      if (event.key !== "Tab") return;

      const focusable = modalRef.current?.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
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
  }, [isOpen, submitting, onClose]);

  if (!isOpen) return null;

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setStepsToReproduce("");
    setSeverity("Medium");
    setReporterName("");
    setReporterEmail(accountEmail || "");
    setEmailConsent(false);
  };

  const resetAndClose = () => {
    setStatus({ type: "", message: "" });
    resetForm();
    onClose();
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setStatus({ type: "", message: "" });

    try {
      await sendBugReport({
        title,
        description,
        stepsToReproduce,
        severity,
        reporterName,
        ...(emailConsent ? { reporterEmail } : {}),
        pagePath: location.pathname,
        pageUrl: window.location.href,
      });

      setStatus({
        type: "success",
        message: "Bug report sent successfully. Thank you.",
      });

      resetForm();
    } catch (error) {
      setStatus({
        type: "error",
        message: error?.message || "Failed to send bug report.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) resetAndClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="bug-report-title"
    >
      <div
        ref={modalRef}
        className="w-full max-w-xl bg-[#151921] border border-white/10 rounded-2xl shadow-2xl p-4 sm:p-5 dm-sans-light-008"
      >
        <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-3 mb-4">
          <div>
            <p className="text-[10px] tracking-[0.08em] text-white/45 uppercase">Support</p>
            <h2
              id="bug-report-title"
              className="text-[15px] text-white font-light tracking-[0.08em] mt-0.5"
            >
              Report a Bug
            </h2>
          </div>
          <button
            type="button"
            onClick={resetAndClose}
            disabled={submitting}
            className="text-white/50 hover:text-white transition-colors text-[10px] tracking-[0.08em]"
          >
            Close
          </button>
        </div>

        {status.message && (
          <div
            className={`mb-4 px-3 py-2 rounded-lg border text-[10px] tracking-[0.08em] ${
              status.type === "success"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                : "border-red-500/30 bg-red-500/10 text-red-400"
            }`}
          >
            {status.message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Bug title"
            required
            ref={firstFieldRef}
            className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2.5 text-[11px] text-white placeholder:text-white/30 focus:outline-none focus:border-white/30"
          />

          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is happening?"
            required
            rows={4}
            className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2.5 text-[11px] text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 resize-y min-h-[110px] app-scrollbar"
          />

          <textarea
            value={stepsToReproduce}
            onChange={(e) => setStepsToReproduce(e.target.value)}
            placeholder="Steps to reproduce (optional)"
            rows={3}
            className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2.5 text-[11px] text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 resize-y min-h-[90px] app-scrollbar"
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
              className="bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2.5 text-[11px] text-white focus:outline-none focus:border-white/30 app-scrollbar"
            >
              <option value="Low" className="bg-[#0a0c10] text-white">Low</option>
              <option value="Medium" className="bg-[#0a0c10] text-white">Medium</option>
              <option value="High" className="bg-[#0a0c10] text-white">High</option>
              <option value="Critical" className="bg-[#0a0c10] text-white">Critical</option>
            </select>

            <input
              type="text"
              value={reporterName}
              onChange={(e) => setReporterName(e.target.value)}
              placeholder="Your name (optional)"
              className="sm:col-span-2 bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2.5 text-[11px] text-white placeholder:text-white/30 focus:outline-none focus:border-white/30"
            />
          </div>

          <input
            type="email"
            value={reporterEmail}
            onChange={(e) => setReporterEmail(e.target.value)}
            placeholder="Your email"
            className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2.5 text-[11px] text-white placeholder:text-white/30 focus:outline-none focus:border-white/30"
          />

          <div className="space-y-2">
            <div className="text-[10px] text-white/55 tracking-[0.08em]">
              We only include your email if you consent so support can follow up. Avoid sharing secrets in the report.
            </div>
            <label className="flex items-center gap-2 text-[10px] text-white/70 tracking-[0.08em]">
              <input
                type="checkbox"
                checked={emailConsent}
                onChange={(e) => setEmailConsent(e.target.checked)}
                className="accent-white"
                required
              />
              I consent to include my email with this report.
            </label>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-[10px] text-white/50 tracking-[0.08em]">
            Current page: {location.pathname}
          </div>

          <button
            type="submit"
            disabled={submitting || !emailConsent}
            className="modal-submit-btn w-full px-4 py-3 text-[11px] tracking-[0.08em] transition-colors disabled:opacity-50"
          >
            {submitting ? "Sending..." : "Send Bug Report"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default BugReportModal;
