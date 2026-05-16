import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { getUserWithRetry } from "../lib/authUser";
import SecureImage from "../components/SecureImage";
import TrainerModal from "../components/TrainerModal";
import TrainerDocsModal from "../components/TrainerDocsModal";
import TrainerDetailsModal from "../components/TrainerDetailsModal";

const TrainersPage = () => {
  const [trainers, setTrainers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDocsModalOpen, setIsDocsModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [editingTrainer, setEditingTrainer] = useState(null);
  const [activeTrainerPopup, setActiveTrainerPopup] = useState(null);
  const popupRef = useRef(null);
  const popupCancelRef = useRef(null);
  const previousFocusRef = useRef(null);

  const displayTrainers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return trainers;

    return trainers.filter((trainer) => {
      const fullName =
        `${trainer.first_name || ""} ${trainer.last_name || ""}`.toLowerCase();
      return (
        fullName.includes(q) ||
        String(trainer.email || "")
          .toLowerCase()
          .includes(q) ||
        String(trainer.phone || "")
          .toLowerCase()
          .includes(q)
      );
    });
  }, [trainers, searchQuery]);

  useEffect(() => {
    let active = true;

    const loadTrainers = async () => {
      setLoading(true);
      setError(null);

      try {
        const {
          data: { user },
          error: userError,
        } = await getUserWithRetry(supabase);

        if (userError) throw userError;
        if (!user?.id) throw new Error("User not authenticated");

        const { data, error: trainersError } = await supabase
          .from("trainers")
          .select("*")
          .eq("gym_id", user.id)
          .order("created_at", { ascending: false });

        if (trainersError) throw trainersError;

        if (!active) return;
        setTrainers(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("Failed to load trainers:", err);
        if (!active) return;
        setError(err.message || "Failed to load trainers");
      } finally {
        if (active) setLoading(false);
      }
    };

    loadTrainers();

    return () => {
      active = false;
    };
  }, []);

  const handleOpenNewModal = () => {
    setEditingTrainer(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (trainer) => {
    setEditingTrainer(trainer);
    setIsModalOpen(true);
    setActiveTrainerPopup(null);
  };

  const handleOpenDocsModal = (trainer) => {
    setEditingTrainer(trainer);
    setIsDocsModalOpen(true);
    setActiveTrainerPopup(null);
  };

  const handleOpenDetailsModal = (trainer) => {
    setEditingTrainer(trainer);
    setIsDetailsModalOpen(true);
    setActiveTrainerPopup(null);
  };

  const handleTrainerSaved = (saved) => {
    setTrainers((prev) => {
      const exists = prev.some((t) => t.id === saved.id);
      if (exists) {
        return prev.map((t) => (t.id === saved.id ? saved : t));
      }
      return [saved, ...prev];
    });
  };

  const handleDelete = async (trainerId) => {
    const ok = window.confirm("Remove this trainer?");
    if (!ok) return;

    try {
      const { error: deleteError } = await supabase
        .from("trainers")
        .delete()
        .eq("id", trainerId);

      if (deleteError) throw deleteError;
      setTrainers((prev) => prev.filter((t) => t.id !== trainerId));
      setActiveTrainerPopup(null);
    } catch (err) {
      console.error("Failed to delete trainer:", err);
      setError(err.message || "Failed to delete trainer");
    }
  };

  useEffect(() => {
    if (!activeTrainerPopup) return undefined;

    previousFocusRef.current = document.activeElement;
    popupCancelRef.current?.focus();

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setActiveTrainerPopup(null);
        return;
      }

      if (event.key !== "Tab") return;

      const focusable = popupRef.current?.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
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
  }, [activeTrainerPopup]);

  const openTrainerPopup = (trainer) => {
    // Don't open popup if user is selecting text
    if (window.getSelection().toString().length > 0) {
      return;
    }
    setActiveTrainerPopup(trainer);
  };

  return (
    <div
      className="app-page trainers-page-vibe p-4 md:p-8 lg:p-10 space-y-6 md:space-y-8"
      style={{
        "--app-theme-page-bg": "#ffffff",
        "--app-theme-card-bg": "#fbfbfb",
        "--app-theme-card-bg-alt": "#f4f4f4",
        color: "#0d0d0d",
      }}
    >
      <style>{`
        @import url("https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600&family=DM+Sans:wght@400;500;600&display=swap");
        .trainers-page-vibe {
          background: #ffffff !important;
          color: #0d0d0d !important;
          font-family: "DM Sans", system-ui, sans-serif;
          min-height: 100vh;
        }
        .trainers-page-vibe .trainers-header-title {
          font-family: "Playfair Display", Georgia, serif;
        }
        .trainers-page-vibe .trainers-card {
          background: #fafafa !important;
          border-color: rgba(0, 0, 0, 0.12) !important;
        }
        .trainers-page-vibe .trainers-subtle {
          color: #8a8a8a !important;
        }
        .trainers-page-vibe .trainers-card-title {
          color: #6b6b6b !important;
        }
        .trainers-page-vibe [class*="bg-white/"] {
          background: #fafafa !important;
        }
        .trainers-page-vibe [class*="text-white/"] {
          color: #8a8a8a !important;
        }
        .trainers-page-vibe .text-white {
          color: #0d0d0d !important;
        }
        .trainers-page-vibe [class*="border-white/"] {
          border-color: rgba(0, 0, 0, 0.12) !important;
        }
        .trainers-page-vibe input,
        .trainers-page-vibe select {
          background: #ffffff !important;
          color: #0d0d0d !important;
          border-color: #e0e0e0 !important;
        }
        .trainers-page-vibe input::placeholder {
          color: #a0a0a0 !important;
        }
      `}</style>

      <header className="mb-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 md:gap-6">
          <div>
            <h1 className="trainers-header-title text-4xl md:text-5xl font-medium tracking-tighter text-[#0d0d0d]">
              Trainer <span className="trainers-subtle">Directory</span>
            </h1>
            <p className="text-[10px] tracking-[0.08em] trainers-subtle dm-sans-light-008 mt-2">
              Trainer information and contact records
            </p>
          </div>

          <button
            onClick={handleOpenNewModal}
            className="native-inline-btn border border-white/20 px-4 py-3 text-[10px] tracking-[0.2em] text-white/80 w-full md:w-auto text-center"
          >
            Add Trainer
          </button>
        </div>

        <div className="mt-5 relative">
          <label htmlFor="trainer-search" className="sr-only">
            Search trainers
          </label>
          <input
            id="trainer-search"
            type="text"
            placeholder="Search trainer by name, email or phone"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white border border-[#e0e0e0] px-4 py-3 text-sm text-[#0d0d0d] placeholder:text-[#a0a0a0] outline-none rounded-xl"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              aria-label="Clear search"
              className="native-inline-btn absolute right-4 top-1/2 -translate-y-1/2 text-white/25"
            >
              x
            </button>
          )}
        </div>
      </header>

      <div className="trainers-card mb-6 border p-4 md:p-6 overflow-x-auto custom-scrollbar rounded-2xl shadow-lg shadow-black/5">
        {loading && trainers.length === 0 ? (
          <div className="p-14 text-center text-[10px] tracking-[0.08em] text-white/30 dm-sans-light-008">
            Loading trainers...
          </div>
        ) : error ? (
          <div className="p-8 text-center text-red-400 text-[10px] tracking-[0.08em] dm-sans-light-008">
            {error}
          </div>
        ) : (
          <>
            <div className="md:hidden divide-y divide-white/10">
              {displayTrainers.map((trainer) => (
                <div
                  key={`mobile-${trainer.id}`}
                  className="p-4 space-y-3 cursor-pointer"
                  onClick={() => openTrainerPopup(trainer)}
                  role="button"
                  tabIndex={0}
                  aria-label={`Open trainer actions for ${trainer.first_name || "this trainer"} ${trainer.last_name || ""}`}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openTrainerPopup(trainer);
                    }
                  }}
                >
                  <div className="flex items-center gap-3">
                    <SecureImage
                      filePath={trainer.photo_url}
                      className="w-10 h-10 rounded-full border border-white/10 flex-shrink-0"
                      fallback={
                        <div className="w-10 h-10 rounded-full border border-white/10 bg-white/5 flex-shrink-0 flex items-center justify-center font-mono text-white/40 text-[10px]">
                          {trainer.first_name?.[0]}
                          {trainer.last_name?.[0]}
                        </div>
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] text-white font-medium truncate">
                        {trainer.first_name} {trainer.last_name}
                      </p>
                      <p className="text-[9px] text-white/35 dm-sans-light-008 tracking-[0.08em] truncate">
                        Id:{" "}
                        {(trainer?.id != null
                          ? String(trainer.id)
                          : "-"
                        ).substring(0, 8)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openTrainerPopup(trainer);
                      }}
                      className="native-inline-btn text-white/45 hover:text-white p-1"
                      aria-label="Open trainer actions"
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 16 16"
                        fill="currentColor"
                      >
                        <circle cx="8" cy="3" r="1.5" />
                        <circle cx="8" cy="8" r="1.5" />
                        <circle cx="8" cy="13" r="1.5" />
                      </svg>
                    </button>
                  </div>

                  <div className="space-y-2 text-[11px]">
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-white/45 tracking-wide">Email</span>
                      <span className="text-white/75 text-right break-all">
                        {trainer.email || "-"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-white/45 tracking-wide">Phone</span>
                      <span className="text-white/75 text-right">
                        {trainer.phone || "-"}
                      </span>
                    </div>
                  </div>

                  <div className="pt-1">
                    <span className="text-[10px] tracking-[0.08em] text-white/45 dm-sans-light-008">
                      Tap trainer card for actions
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <table className="hidden md:table w-full text-left border-collapse table-fixed">
              <thead>
                <tr className="bg-white/5 border-b border-white/10">
                  <th className="p-4 text-[10px] tracking-[0.08em] dm-sans-light-008 text-white/40">
                    Name
                  </th>
                  <th className="p-4 text-[10px] tracking-[0.08em] dm-sans-light-008 text-white/40">
                    Email
                  </th>
                  <th className="p-4 text-[10px] tracking-[0.08em] dm-sans-light-008 text-white/40">
                    Phone
                  </th>
                  <th className="p-4 text-[10px] tracking-[0.08em] dm-sans-light-008 text-white/40 text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayTrainers.map((trainer) => (
                  <tr
                    key={trainer.id}
                    className="border-b border-white/5 hover:bg-white/[0.02] transition-colors cursor-pointer"
                    onClick={() => openTrainerPopup(trainer)}
                    role="button"
                    tabIndex={0}
                    aria-label={`Open trainer actions for ${trainer.first_name || "this trainer"} ${trainer.last_name || ""}`}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openTrainerPopup(trainer);
                      }
                    }}
                  >
                    <td className="p-4">
                      <div className="flex items-center gap-4">
                        <SecureImage
                          filePath={trainer.photo_url}
                          className="w-10 h-10 rounded-full border border-white/10 flex-shrink-0"
                          fallback={
                            <div className="w-10 h-10 rounded-full border border-white/10 bg-white/5 flex-shrink-0 flex items-center justify-center font-mono text-white/40 text-[10px]">
                              {trainer.first_name?.[0]}
                              {trainer.last_name?.[0]}
                            </div>
                          }
                        />
                        <div className="flex flex-col min-w-0">
                          <span className="text-[13px] font-medium tracking-tight text-white truncate">
                            {trainer.first_name} {trainer.last_name}
                          </span>
                          <span className="text-[9px] text-white/20 dm-sans-light-008 tracking-[0.08em] mt-1">
                            Id:{" "}
                            {(trainer?.id != null
                              ? String(trainer.id)
                              : "-"
                            ).substring(0, 8)}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 text-sm text-white/60 lowercase tracking-tight truncate">
                      {trainer.email || "-"}
                    </td>
                    <td className="p-4 text-sm text-white/60 font-mono tracking-tight whitespace-nowrap">
                      {trainer.phone || "-"}
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex justify-end gap-3 items-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openTrainerPopup(trainer);
                          }}
                          className="native-inline-btn text-white/40 hover:text-white transition-colors p-2"
                        >
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 16 16"
                            fill="currentColor"
                          >
                            <circle cx="8" cy="3" r="1.5" />
                            <circle cx="8" cy="8" r="1.5" />
                            <circle cx="8" cy="13" r="1.5" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {!loading && displayTrainers.length === 0 && (
              <div className="p-14 text-center text-white/25 flex flex-col items-center gap-3">
                <span className="text-[10px] tracking-[0.08em] dm-sans-light-008">
                  No trainer records found
                </span>
                <button
                  onClick={handleOpenNewModal}
                  className="native-inline-btn text-[10px] tracking-[0.15em] text-white/60 underline underline-offset-4"
                >
                  Create first trainer profile
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <TrainerModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onTrainerSaved={handleTrainerSaved}
        initialData={editingTrainer}
      />

      <TrainerDocsModal
        isOpen={isDocsModalOpen}
        onClose={() => setIsDocsModalOpen(false)}
        trainer={editingTrainer}
        onDocsUpdated={handleTrainerSaved}
      />

      <TrainerDetailsModal
        isOpen={isDetailsModalOpen}
        onClose={() => setIsDetailsModalOpen(false)}
        trainer={editingTrainer}
      />

      {activeTrainerPopup && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={() => setActiveTrainerPopup(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="trainer-actions-title"
        >
          <div
            ref={popupRef}
            className="w-full sm:max-w-md bg-[#0a0c10] border border-white/10 rounded-2xl p-4 sm:p-5 dm-sans-light-008 shadow-[0_22px_80px_rgba(0,0,0,0.55)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-1 pb-3 border-b border-white/10 mb-3">
              <p className="text-[10px] tracking-[0.08em] text-white/45 uppercase">
                Trainer Actions
              </p>
              <p id="trainer-actions-title" className="text-white text-[15px] tracking-[0.08em] font-light mt-0.5">
                {activeTrainerPopup.first_name} {activeTrainerPopup.last_name}
              </p>
            </div>

            <button
              type="button"
              onClick={() => handleOpenEditModal(activeTrainerPopup)}
              className="w-full text-left px-3 py-3 text-[11px] tracking-[0.08em] text-white/85 bg-white/[0.02] border border-white/10 rounded-xl hover:bg-white/[0.05] transition-colors"
            >
              Edit Information
            </button>
            <button
              type="button"
              onClick={() => handleOpenDocsModal(activeTrainerPopup)}
              className="mt-2 w-full text-left px-3 py-3 text-[11px] tracking-[0.08em] text-white/85 bg-white/[0.02] border border-white/10 rounded-xl hover:bg-white/[0.05] transition-colors"
            >
              Trainer Docs
            </button>
            <button
              type="button"
              onClick={() => handleOpenDetailsModal(activeTrainerPopup)}
              className="mt-2 w-full text-left px-3 py-3 text-[11px] tracking-[0.08em] text-white/85 bg-white/[0.02] border border-white/10 rounded-xl hover:bg-white/[0.05] transition-colors"
            >
              View Information
            </button>
            <button
              type="button"
              onClick={() => handleDelete(activeTrainerPopup.id)}
              className="mt-2 w-full text-left px-3 py-3 text-[11px] tracking-[0.08em] text-red-300/90 bg-red-400/[0.05] border border-red-300/15 rounded-xl hover:bg-red-400/[0.1] transition-colors"
            >
              Delete Trainer
            </button>

            <button
              type="button"
              onClick={() => setActiveTrainerPopup(null)}
              ref={popupCancelRef}
              className="mt-3 w-full text-center px-3 py-2.5 text-[10px] tracking-[0.08em] text-white/65 border border-white/10 rounded-xl hover:bg-white/[0.04] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TrainersPage;

