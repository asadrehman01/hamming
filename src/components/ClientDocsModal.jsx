import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import SecureImage from "./SecureImage";

const MIME_EXTENSION_MAP = {
	"image/png": "png",
	"image/jpeg": "jpg",
	"image/jpg": "jpg",
	"image/webp": "webp",
	"image/gif": "gif",
	"application/pdf": "pdf",
};

const ensureFileExtension = (fileName, mimeType) => {
	const expectedExtension = MIME_EXTENSION_MAP[String(mimeType || "").toLowerCase()] || "bin";
	const baseName = String(fileName || "").trim();
	if (!baseName) return `download.${expectedExtension}`;

	const lastDotIndex = baseName.lastIndexOf(".");
	if (lastDotIndex <= 0) {
		return `${baseName}.${expectedExtension}`;
	}

	const currentExtension = baseName.slice(lastDotIndex + 1).toLowerCase();
	if (currentExtension !== expectedExtension) {
		return `${baseName.slice(0, lastDotIndex)}.${expectedExtension}`;
	}

	return baseName;
};

const ClientDocsModal = ({ isOpen, onClose, customer, onDocsUpdated }) => {
	const [photo, setPhoto] = useState(null);
	const [aadhaar, setAadhaar] = useState(null);
	const [photoPreview, setPhotoPreview] = useState(null);
	const [aadhaarPreview, setAadhaarPreview] = useState(null);
	const [uploading, setUploading] = useState(false);
	const [error, setError] = useState(null);

	useEffect(() => {
		if (isOpen && customer) {
			setPhotoPreview(customer.photo_url);
			setAadhaarPreview(customer.aadhaar_url);
			setPhoto(null);
			setAadhaar(null);
		}
	}, [customer, isOpen]);

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

	if (!isOpen || !customer) return null;

	const handleFileChange = (e, type) => {
		const file = e.target.files[0];
		if (!file) return;

		if (type === "photo") {
			setPhoto(file);
			setPhotoPreview(URL.createObjectURL(file));
			return;
		}

		setAadhaar(file);
		setAadhaarPreview(URL.createObjectURL(file));
	};

	const uploadFile = async (file, type) => {
		const fileExt = file.name.split(".").pop();
		const fileName = `${customer.id}/${type}_${Date.now()}.${fileExt}`;
		const filePath = `${customer.gym_id}/${fileName}`;

		const { error: uploadError } = await supabase.storage
			.from("customer-docs")
			.upload(filePath, file, { cacheControl: "3600", upsert: true });

		if (uploadError) throw uploadError;
		return filePath;
	};

	const handleSave = async () => {
		setUploading(true);
		setError(null);

		try {
			let newPhotoUrl = customer.photo_url;
			let newAadhaarUrl = customer.aadhaar_url;

			if (photo) {
				newPhotoUrl = await uploadFile(photo, "photo");
			}

			if (aadhaar) {
				newAadhaarUrl = await uploadFile(aadhaar, "aadhaar");
			}

			const { data, error: updateError } = await supabase
				.from("customers")
				.update({
					photo_url: newPhotoUrl,
					aadhaar_url: newAadhaarUrl,
					updated_at: new Date().toISOString(),
				})
				.eq("id", customer.id)
				.select()
				.single();

			if (updateError) throw updateError;

			onDocsUpdated(data);
			onClose();
		} catch (err) {
			console.error("Error uploading docs:", err);
			setError(err.message);
		} finally {
			setUploading(false);
		}
	};

	const triggerDownload = (blob, fileName) => {
		const objectUrl = URL.createObjectURL(blob);
		const anchor = document.createElement("a");
		anchor.href = objectUrl;
		anchor.download = fileName;
		document.body.appendChild(anchor);
		anchor.click();
		anchor.remove();
		URL.revokeObjectURL(objectUrl);
	};

	const handleDownload = async (type) => {
		const filePath = type === "photo" ? photoPreview : aadhaarPreview;
		if (!filePath) return;

		try {
			if (filePath.startsWith("blob:")) {
				const response = await fetch(filePath);
				const blob = await response.blob();
				const fileName = ensureFileExtension(`${type}_${customer.id}`, blob.type);
				triggerDownload(blob, fileName);
				return;
			}

			const { data, error: downloadError } = await supabase.storage
				.from("customer-docs")
				.download(filePath);

			if (downloadError) throw downloadError;

			const fileNameFromPath = filePath.split("/").pop() || `${type}_${customer.id}`;
			const fileName = ensureFileExtension(fileNameFromPath, data?.type);
			triggerDownload(data, fileName);
		} catch (err) {
			console.error(`Error downloading ${type}:`, err);
			setError(`Could not download ${type}. Please try again.`);
		}
	};

	return (
		<div
			className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/80 backdrop-blur-sm px-3 sm:px-4 pt-4 sm:pt-8 pb-[max(1rem,env(safe-area-inset-bottom))] animate-in fade-in duration-300 overflow-y-auto"
			onClick={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}
		>
			<div className="bg-[#1A1A1A] border border-white/10 w-full max-w-2xl max-h-[calc(100dvh-6rem)] sm:max-h-[calc(100dvh-4rem)] shadow-2xl animate-in zoom-in-95 duration-300 flex flex-col overflow-hidden">
				<div className="sticky top-0 z-10 bg-[#1A1A1A] border-b border-white/10 px-4 sm:px-8 py-4 sm:py-6 flex justify-between items-start gap-3">
					<div className="min-w-0">
						<h2 className="font-logo text-2xl sm:text-3xl tracking-tight text-white">
							Client Documents
						</h2>
						<p className="text-[9px] sm:text-[10px] tracking-widest text-white/40 font-mono mt-1 truncate">
							Customer: {customer.first_name} {customer.last_name}
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

					<div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-8">
						<div className="space-y-3 sm:space-y-4">
							<label className="text-[10px] tracking-[0.2em] font-mono text-white/40 block">
								Client Photo
							</label>
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
									type="file"
									accept="image/*"
									onChange={(e) => handleFileChange(e, "photo")}
									className="absolute inset-0 opacity-0 cursor-pointer"
								/>
							</div>
							<div className="flex items-center justify-between gap-3">
								<p className="text-[9px] text-white/35 tracking-wide">
									Tap image area to upload or replace photo.
								</p>
								<button
									type="button"
									onClick={() => handleDownload("photo")}
									disabled={!photoPreview}
									className="text-[9px] tracking-[0.08em] text-white/70 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
								>
									Download
								</button>
							</div>
						</div>

						<div className="space-y-3 sm:space-y-4">
							<label className="text-[10px] tracking-[0.2em] font-mono text-white/40 block">
								Aadhaar Card (Front/Back)
							</label>
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
									type="file"
									accept="image/*,application/pdf"
									onChange={(e) => handleFileChange(e, "aadhaar")}
									className="absolute inset-0 opacity-0 cursor-pointer"
								/>
							</div>
							<div className="flex items-center justify-between gap-3">
								<p className="text-[9px] text-white/35 tracking-wide">
									Tap document area to upload or replace Aadhaar file.
								</p>
								<button
									type="button"
									onClick={() => handleDownload("aadhaar")}
									disabled={!aadhaarPreview}
									className="text-[9px] tracking-[0.08em] text-white/70 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
								>
									Download
								</button>
							</div>
						</div>
					</div>
				</div>

				<div className="shrink-0 border-t border-white/10 bg-[#1A1A1A] px-4 sm:px-8 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
					<button
						onClick={handleSave}
						disabled={uploading || (!photo && !aadhaar)}
						className="w-full bg-white text-black p-4 sm:p-5 text-[10px] tracking-[0.2em] font-medium hover:bg-white/90 transition-all active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed"
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

export default ClientDocsModal;
