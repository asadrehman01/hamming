import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient";
const SecureImage = ({ filePath, className, alt = "", fallback = null }) => {
  const [signedUrl, setSignedUrl] = useState(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const fetchSignedUrl = async () => {
      setError(false);
      setSignedUrl(null);
      if (!filePath) {
        return;
      }
      // If it's already a full URL (blob or data), use it directly
      if (
        filePath.startsWith("blob:") ||
        filePath.startsWith("data:") ||
        filePath.startsWith("http://") ||
        filePath.startsWith("https://")
      ) {
        if (!controller.signal.aborted) {
          setSignedUrl(filePath);
        }
        return;
      }
      try {
        const { data, error: signedError } = await supabase.storage
          .from("customer-docs")
          .createSignedUrl(filePath, 3600);
        // 1 hour expiry
        if (controller.signal.aborted) return;
        if (signedError) throw signedError;
        setSignedUrl(data.signedUrl);
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error("Error fetching signed URL for secure image:", err);
        setError(true);
      }
    };
    fetchSignedUrl();
    return () => {
      controller.abort();
    };
  }, [filePath]);
  if (error || (!signedUrl && !filePath)) return fallback;
  if (!signedUrl)
    return <div className={`${className} bg-white/5 animate-pulse`} />;
  return (
    <img
      src={signedUrl}
      alt={alt}
      className={`${className} object-cover`}
      onError={(event) => {
        event.currentTarget.onerror = null;
        if (fallback) {
          setError(true);
          return;
        }
        event.currentTarget.src =
          "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='180'%3E%3Crect width='100%25' height='100%25' fill='%23151921'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23888' font-size='14'%3EImage unavailable%3C/text%3E%3C/svg%3E";
      }}
    />
  );
};
export default SecureImage;
