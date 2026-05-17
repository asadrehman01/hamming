import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import SecureImage from "./SecureImage";
import { Download } from "lucide-react";

const TrainerDocsModal = ({ isOpen, onClose, trainer, onDocsUpdated }) => {
	const [photo, setPhoto] = useState(null);
	const [aadhaar, setAadhaar] = useState(null);
	const [photoPreview, setPhotoPreview] = useState(null);
	const [aadhaarPreview, setAadhaarPreview] = useState(null);
	const [uploading, setUploading] = useState(false);
	const [error, setError] = useState(null);
	const [downloadingType, setDownloadingType] = useState(null);

	const sanitizeFilePart = (value) =>
		String(value || "")
			.trim()
			.replace(/[^a-z0-9_-]+/gi, "_")
			.replace(/^_+|_+$/g, "")
			.slice(0, 40) || "trainer";

	const getExtensionFromPath = (value) => {
		const raw = String(value || "").split("?")[0];
		const ext = raw.split(".").pop();
		return ext && ext !== raw ? ext.toLowerCase() : "";
	};

	const ensureExtension = (name, extension) => {
		if (!extension) return name;
		return name.endsWith(`.${extension}`) ? name : `${name}.${extension}`;
	};

	useEffect(() => {
		if (isOpen && trainer) {
			setPhotoPreview(trainer.photo_url);
			setAadhaarPreview(trainer.aadhaar_url);
			setPhoto(null);
			setAadhaar(null);
		}
	}, [trainer, isOpen]);

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

	const getDownloadSource = async (filePath) => {
		if (!filePath) return null;

		if (
			filePath.startsWith("blob:") ||
			filePath.startsWith("data:") ||
			filePath.startsWith("http://") ||
			filePath.startsWith("https://")
		) {
			return filePath;
		}

		try {
			const { data, error } = await supabase.storage
				.from("trainer-docs")
				.createSignedUrl(filePath, 3600);

			if (error) throw error;
			return data?.signedUrl || null;
		} catch (err) {
			console.error("Error getting signed URL:", err);
			return null;
		}
	};

	const handleDownload = async (type) => {
		setDownloadingType(type);
		try {
			const filePath = type === "photo" ? photoPreview : aadhaarPreview;
			const fileName = type === "photo" ? "photo" : "aadhaar";

			const source = await getDownloadSource(filePath);
			if (!source) {
				alert("Failed to download file");
				return;
			}

			const safeFirstName = sanitizeFilePart(trainer?.first_name);
			const safeLastName = sanitizeFilePart(trainer?.last_name);
			const nameRoot = [safeFirstName, safeLastName].filter(Boolean).join("_") || "trainer";
			const extFromPath = getExtensionFromPath(filePath || source);
			const fallbackExt = type === "aadhaar" ? "pdf" : "jpg";
			const finalExt = extFromPath || fallbackExt;

			const link = document.createElement("a");
			link.href = source;
			link.download = ensureExtension(`${nameRoot}_${fileName}`, finalExt);
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
		} finally {
			setDownloadingType(null);
		}
	};

	const handleFileChange = (e, type) => {
		const file = e.target.files[0];
		if (!file) return;

		const maxSize = 5 * 1024 * 1024; // 5MB
		if (file.size > maxSize) {
			setError(`File size should be less than 5MB`);
			return;
		}

		const isImage = file.type.startsWith("image/");
		const isPdf = file.type === "application/pdf";
		if (type === "photo" && !isImage) {
			setError("Photo must be an image file.");
			return;
		}
		if (type === "aadhaar" && !(isImage || isPdf)) {
			setError("Aadhaar must be an image or PDF file.");
			return;
		}

		setError(null);

		const reader = new FileReader();
		reader.onerror = () => {
			setError("Failed to read the selected file.");
		};
		reader.onloadend = () => {
			if (reader.error) return;
			if (typeof reader.result !== "string") {
				setError("Failed to read the selected file.");
				return;
			}
			if (type === "photo") {
				setPhoto(file);
				setPhotoPreview(reader.result);
			} else {
				setAadhaar(file);
				setAadhaarPreview(reader.result);
			}
		};
		reader.readAsDataURL(file);
	};

	const uploadFile = async (file, type) => {
		const folderPath = `${trainer.gym_id}/${trainer.id}`;
		const { data: existingFiles, error: listError } = await supabase.storage
			.from("trainer-docs")
			.list(folderPath, { search: `${type}_` });

		if (listError) throw listError;

		const toRemove = (existingFiles || [])
			.filter((entry) => entry.name?.startsWith(`${type}_`))
			.map((entry) => `${folderPath}/${entry.name}`);

		if (toRemove.length > 0) {
			const { error: removeError } = await supabase.storage
				.from("trainer-docs")
				.remove(toRemove);
			if (removeError) throw removeError;
		}

		const fileExt = file.name.split(".").pop();
		const fileName = `${trainer.id}/${type}_${Date.now()}.${fileExt}`;
		const filePath = `${trainer.gym_id}/${fileName}`;

		const { error: uploadError } = await supabase.storage
			.from("trainer-docs")
			.upload(filePath, file, { cacheControl: "3600", upsert: true });

		if (uploadError) throw uploadError;
		return filePath;
	};

	const handleSave = async () => {
		setUploading(true);
		setError(null);
		let uploadedPhotoPath = null;
		let uploadedAadhaarPath = null;

		try {
			let newPhotoUrl = trainer.photo_url;
			let newAadhaarUrl = trainer.aadhaar_url;

			if (photo) {
				newPhotoUrl = await uploadFile(photo, "photo");
				uploadedPhotoPath = newPhotoUrl;
			}

			if (aadhaar) {
				newAadhaarUrl = await uploadFile(aadhaar, "aadhaar");
				uploadedAadhaarPath = newAadhaarUrl;
			}

			const { data, error: updateError } = await supabase
				.from("trainers")
				.update({
					photo_url: newPhotoUrl,
					aadhaar_url: newAadhaarUrl,
					updated_at: new Date().toISOString(),
				})
				.eq("id", trainer.id)
				.select()
				.single();

			if (updateError) throw updateError;

			onDocsUpdated(data);
			onClose();
		} catch (err) {
			const cleanupTargets = [uploadedPhotoPath, uploadedAadhaarPath].filter(Boolean);
			if (cleanupTargets.length > 0) {
				try {
					await supabase.storage.from("trainer-docs").remove(cleanupTargets);
				} catch (cleanupError) {
					console.error("Failed to clean up uploaded trainer docs.");
				}
			}
			console.error("Error uploading trainer documents.");
			setError("Unable to upload documents. Please try again.");
		} finally {
			setUploading(false);
		}
	};

	return (
		<div
			className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/80 backdrop-blur-sm px-3 sm:px-4 pt-4 sm:pt-8 pb-[max(1rem,env(safe-area-inset-bottom))] animate-in fade-in duration-300 overflow-y-auto"
			onClick={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}
			role="dialog"
			aria-modal="true"
			aria-labelledby="trainer-docs-title"
		>
			<div className="bg-[#1A1A1A] border border-white/10 w-full max-w-2xl max-h-[calc(100dvh-6rem)] sm:max-h-[calc(100dvh-4rem)] shadow-2xl animate-in zoom-in-95 duration-300 flex flex-col overflow-hidden">
				<div className="sticky top-0 z-10 bg-[#1A1A1A] border-b border-white/10 px-4 sm:px-8 py-4 sm:py-6 flex justify-between items-start gap-3">
					<div className="min-w-0">
						<h2
							id="trainer-docs-title"
							className="font-logo text-2xl sm:text-3xl tracking-tight text-white"
						>
							Trainer Documents
						</h2>
						<p className="text-[9px] sm:text-[10px] tracking-widest text-white/40 font-mono mt-1 truncate">
							Trainer: {trainer.first_name} {trainer.last_name}
						</p>
					</div>
					<button
						onClick={onClose}
						className="native-inline-btn text-white/60 hover:text-white text-[10px] tracking-widest font-mono"
					>
						Close
					</button>
				</div>

				<div className="flex-1 overflow-y-auto px-4 sm:px-8 py-4 sm:py-6">
					{error && (
						<div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-red-500/10 border border-red-500/20 text-red-500 text-[10px] tracking-widest font-mono">
							{error}
						</div>
					)}

					<div className="space-y-6 sm:space-y-8">
						<div className="space-y-3 sm:space-y-4">
							<div className="flex items-center justify-between gap-3">
								<label
									id="trainer-photo-label"
									htmlFor="trainer-photo-upload"
									className="text-[10px] tracking-[0.2em] font-mono text-white/40 block"
								>
									Photo
								</label>
								<button
									type="button"
									onClick={() => handleDownload("photo")}
									disabled={!photoPreview || downloadingType === "photo"}
									className="native-inline-btn dm-sans-light-008 inline-flex items-center gap-2 text-[10px] tracking-[0.16em] text-white/55 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
								>
									<Download size={12} />
									{downloadingType === "photo" ? "Downloading" : "Download"}
								</button>
							</div>
							<div className="h-28 sm:h-auto sm:aspect-[1.58/1] bg-white/5 border border-dashed border-white/10 flex items-center justify-center relative overflow-hidden group">
								{photoPreview ? (
									photoPreview.startsWith("blob:") ? (
										<img
											src={photoPreview}
											alt="Preview"
											className="w-full h-full object-cover"
										/>
									) : (
										<SecureImage filePath={photoPreview} className="w-full h-full" />
									)
								) : (
									<div className="text-center p-4 sm:p-6 space-y-2">
										<svg
											className="mx-auto w-8 h-8 text-white/20"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
										>
											<path
												strokeLinecap="round"
												strokeLinejoin="round"
												strokeWidth={1}
												d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
											/>
										</svg>
										<span className="text-[9px] tracking-widest text-white/20 block">
											Select Image
										</span>
									</div>
								)}
								<input
									id="trainer-photo-upload"
									type="file"
									accept="image/*"
									onChange={(e) => handleFileChange(e, "photo")}
									className="absolute inset-0 opacity-0 cursor-pointer"
									aria-labelledby="trainer-photo-label"
								/>
							</div>
							<p className="text-[9px] text-white/35 tracking-wide">
								Tap image area to upload or replace photo.
							</p>
						</div>

						<div className="space-y-3 sm:space-y-4">
							<div className="flex items-center justify-between gap-3">
								<label
									id="trainer-aadhaar-label"
									htmlFor="trainer-aadhaar-upload"
									className="text-[10px] tracking-[0.2em] font-mono text-white/40 block"
								>
									Aadhaar Card (Front/Back)
								</label>
								<button
									type="button"
									onClick={() => handleDownload("aadhaar")}
									disabled={!aadhaarPreview || downloadingType === "aadhaar"}
									className="native-inline-btn dm-sans-light-008 inline-flex items-center gap-2 text-[10px] tracking-[0.16em] text-white/55 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
								>
									<Download size={12} />
									{downloadingType === "aadhaar" ? "Downloading" : "Download"}
								</button>
							</div>
							<div className="h-32 sm:h-auto sm:aspect-square bg-white/5 border border-dashed border-white/10 flex items-center justify-center relative overflow-hidden group">
								{aadhaarPreview ? (
									aadhaarPreview.startsWith("blob:") ? (
										<img
											src={aadhaarPreview}
											alt="Preview"
											className="w-full h-full object-cover"
										/>
									) : (
										<SecureImage filePath={aadhaarPreview} className="w-full h-full" />
									)
								) : (
									<div className="text-center p-4 sm:p-6 space-y-2">
										<svg
											className="mx-auto w-8 h-8 text-white/20"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
										>
											<path
												strokeLinecap="round"
												strokeLinejoin="round"
												strokeWidth={1}
												d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
											/>
										</svg>
										<span className="text-[9px] tracking-widest text-white/20 block">
											Select Document
										</span>
									</div>
								)}
								<input
									id="trainer-aadhaar-upload"
									type="file"
									accept="image/*,application/pdf"
									onChange={(e) => handleFileChange(e, "aadhaar")}
									className="absolute inset-0 opacity-0 cursor-pointer"
									aria-labelledby="trainer-aadhaar-label"
								/>
							</div>
							<p className="text-[9px] text-white/35 tracking-wide">
								Tap document area to upload or replace Aadhaar file.
							</p>
						</div>
					</div>
				</div>

				<div className="shrink-0 border-t border-white/10 bg-[#1A1A1A] px-4 sm:px-8 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
					<button
						onClick={handleSave}
						disabled={uploading || (!photo && !aadhaar)}
						className="modal-submit-btn w-full p-4 sm:p-5 text-[10px] tracking-[0.2em] font-medium transition-all active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed"
					>
						{uploading ? "Uploading..." : "Save documents"}
					</button>
					<p className="mt-2 text-[9px] tracking-[0.1em] text-center text-white/20 font-mono">
						All documents are encrypted and stored securely in our private workspace.
					</p>
				</div>
			</div>
		</div>
	);
};

export default TrainerDocsModal;
