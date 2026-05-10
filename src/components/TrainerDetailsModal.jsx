import React, { useEffect, useState } from "react";
import { Mail, Phone, Calendar, Briefcase } from "lucide-react";

const TrainerDetailsModal = ({ isOpen, onClose, trainer }) => {
	useEffect(() => {
		const handleEsc = (event) => {
			if (event.key === "Escape") {
				onClose();
			}
		};

		if (isOpen) {
			window.addEventListener("keydown", handleEsc);
		}

		return () => {
			window.removeEventListener("keydown", handleEsc);
		};
	}, [isOpen, onClose]);

	if (!isOpen || !trainer) return null;

	const joinDate = (() => {
		if (!trainer?.created_at) return "N/A";
		const parsed = new Date(trainer.created_at);
		if (Number.isNaN(parsed.getTime())) return "N/A";
		return parsed.toLocaleDateString("en-US", {
			year: "numeric",
			month: "long",
			day: "numeric",
		});
	})();
	const trainerIdLabel = trainer?.id ? String(trainer.id).substring(0, 8) : "N/A";
	const fullName = `${trainer?.first_name || ""} ${trainer?.last_name || ""}`.trim() || "-";

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-300"
			onClick={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}
		>
			<div className="bg-[#1A1A1A] border border-white/10 w-full max-w-2xl rounded-2xl shadow-2xl p-8 flex flex-col max-h-[90vh]">
				<div className="flex justify-between items-start mb-8 border-b border-white/5 pb-6">
					<div>
						<h2 className="text-2xl font-bold tracking-tight text-white mb-2">
							Trainer Information
						</h2>
						<div className="flex items-center gap-3">
							<span className="text-[10px] tracking-widest text-white/40 font-mono">
								ID: {trainerIdLabel}
							</span>
							<span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-medium tracking-widest rounded">
								Active
							</span>
						</div>
					</div>
					<button
						onClick={onClose}
						className="text-white/40 hover:text-white transition-colors text-[10px] tracking-widest font-mono bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded"
					>
						Close [ESC]
					</button>
				</div>

				<div className="flex-1 overflow-y-auto pr-2 space-y-6 pb-4 custom-scrollbar">
					{/* Personal Information */}
					<div>
						<h3 className="text-[10px] font-mono tracking-widest text-white/60 mb-4 flex items-center gap-2">
							<Briefcase className="w-4 h-4" />
							Personal Information
						</h3>
						<div className="bg-[#151921] border border-white/5 rounded-xl overflow-hidden divide-y divide-white/5">
							<div className="p-4 flex items-start justify-between">
								<span className="text-[10px] tracking-widest text-white/40 font-mono">
									Full Name
								</span>
								<span className="text-sm text-white font-medium text-right">
									{fullName}
								</span>
							</div>
							<div className="p-4 flex items-start justify-between">
								<div className="flex items-center gap-2 text-white/40">
									<Mail className="w-4 h-4" />
									<span className="text-[10px] tracking-widest font-mono">
										Email
									</span>
								</div>
								<span className="text-sm text-white/80 text-right break-all">
									{trainer.email || "-"}
								</span>
							</div>
							<div className="p-4 flex items-start justify-between">
								<div className="flex items-center gap-2 text-white/40">
									<Phone className="w-4 h-4" />
									<span className="text-[10px] tracking-widest font-mono">
										Phone
									</span>
								</div>
								<span className="text-sm text-white/80 text-right">
									{trainer.phone || "-"}
								</span>
							</div>
							<div className="p-4 flex items-start justify-between">
								<div className="flex items-center gap-2 text-white/40">
									<Calendar className="w-4 h-4" />
									<span className="text-[10px] tracking-widest font-mono">
										Joined
									</span>
								</div>
								<span className="text-sm text-white/80 text-right">
									{joinDate}
								</span>
							</div>
						</div>
					</div>

					{/* Additional Notes */}
					{trainer.notes && (
						<div>
							<h3 className="text-[10px] font-mono tracking-widest text-white/60 mb-4">
								Notes
							</h3>
							<div className="bg-[#151921] border border-white/5 rounded-xl p-4">
								<p className="text-sm text-white/70 leading-relaxed">
									{trainer.notes}
								</p>
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	);
};

export default TrainerDetailsModal;
