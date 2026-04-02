import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import SecureImage from "../components/SecureImage";
import TrainerModal from "../components/TrainerModal";

const TrainersPage = () => {
  const [trainers, setTrainers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTrainer, setEditingTrainer] = useState(null);

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
        } = await supabase.auth.getUser();

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
    } catch (err) {
      console.error("Failed to delete trainer:", err);
      setError(err.message || "Failed to delete trainer");
    }
  };

  return (
    <div className="app-page p-4 md:p-8 lg:p-10 space-y-6 md:space-y-8">
      <div className="border border-white/10 bg-white/[0.02] p-4 md:p-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 md:gap-6">
          <div>
            <h1 className="text-xl md:text-2xl text-white tracking-tight normal-case">
              Trainer Directory
            </h1>
            <p className="text-[10px] tracking-[0.2em] text-white/35 font-mono mt-2">
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
            className="w-full bg-transparent border border-white/10 py-3 pl-4 pr-10 text-sm text-white/80 placeholder:text-white/20 outline-none"
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
      </div>

      <div className="border border-white/10 overflow-hidden">
        {loading && trainers.length === 0 ? (
          <div className="p-14 text-center text-[10px] tracking-[0.2em] text-white/30 font-mono">
            Loading trainers...
          </div>
        ) : error ? (
          <div className="p-8 text-center text-red-400 text-[10px] tracking-[0.15em] font-mono">
            {error}
          </div>
        ) : (
          <>
            <div className="md:hidden divide-y divide-white/10">
              {displayTrainers.map((trainer) => (
                <div key={`mobile-${trainer.id}`} className="p-4 space-y-3">
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
                      <p className="text-[9px] text-white/35 font-mono tracking-widest truncate">
                        Id:{" "}
                        {(trainer?.id != null
                          ? String(trainer.id)
                          : "-"
                        ).substring(0, 8)}
                      </p>
                    </div>
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

                  <div className="flex items-center gap-4 pt-1">
                    <button
                      onClick={() => handleOpenEditModal(trainer)}
                      className="native-inline-btn text-[10px] tracking-wider text-white/70"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(trainer.id)}
                      className="native-inline-btn text-[10px] tracking-wider text-red-400/85"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <table className="hidden md:table w-full text-left border-collapse table-fixed">
              <thead>
                <tr className="bg-white/5 border-b border-white/10">
                  <th className="p-4 text-[10px] tracking-[0.2em] font-mono text-white/40">
                    Name
                  </th>
                  <th className="p-4 text-[10px] tracking-[0.2em] font-mono text-white/40">
                    Email
                  </th>
                  <th className="p-4 text-[10px] tracking-[0.2em] font-mono text-white/40">
                    Phone
                  </th>
                  <th className="p-4 text-[10px] tracking-[0.2em] font-mono text-white/40 text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayTrainers.map((trainer) => (
                  <tr
                    key={trainer.id}
                    className="border-b border-white/5 hover:bg-white/[0.02] transition-colors"
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
                          <span className="text-[9px] text-white/20 font-mono tracking-widest mt-1">
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
                          onClick={() => handleOpenEditModal(trainer)}
                          className="native-inline-btn text-[10px] tracking-widest text-white/60"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(trainer.id)}
                          className="native-inline-btn text-[10px] tracking-widest text-red-500/70"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {!loading && displayTrainers.length === 0 && (
              <div className="p-14 text-center text-white/25 flex flex-col items-center gap-3">
                <span className="text-[10px] tracking-[0.2em] font-mono">
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
    </div>
  );
};

export default TrainersPage;
