import React, { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, Trash2, X } from "lucide-react";

interface DeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  title?: string;
  itemName?: string;
  itemMeta?: string;
  isDeleting?: boolean;
}

export default function DeleteModal({
  isOpen,
  onClose,
  onConfirm,
  title = "Delete Document",
  itemName,
  itemMeta,
  isDeleting = false,
}: DeleteModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isDeleting) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isDeleting, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => !isDeleting && onClose()}
            className="absolute inset-0 bg-black/75 backdrop-blur-md"
          />

          {/* Dialog Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 14 }}
            transition={{ type: "spring", stiffness: 320, damping: 26 }}
            className="relative w-full max-w-md rounded-2xl border border-red-500/25 bg-[#0f1220] p-6 shadow-2xl overflow-hidden"
            style={{
              boxShadow: "0 0 50px rgba(239, 68, 68, 0.15), 0 20px 40px rgba(0,0,0,0.6)",
            }}
          >
            {/* Top red glow accent */}
            <div className="absolute -top-16 left-1/2 -translate-x-1/2 w-48 h-24 bg-red-500/15 blur-3xl rounded-full pointer-events-none" />

            {/* Header */}
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400 flex-shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white tracking-tight">{title}</h3>
                  <p className="text-xs text-slate-400 mt-0.5">This action cannot be undone</p>
                </div>
              </div>
              <button
                onClick={onClose}
                disabled={isDeleting}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content preview */}
            <div className="mb-6 rounded-xl border border-slate-800/80 bg-slate-950/60 p-3.5">
              <div className="flex items-center gap-2.5 text-sm font-medium text-slate-200 truncate">
                <Trash2 className="w-4 h-4 text-red-400 flex-shrink-0" />
                <span className="truncate">{itemName || "Untitled Document"}</span>
              </div>
              {itemMeta && (
                <div className="text-xs text-slate-400 mt-1 pl-6">{itemMeta}</div>
              )}
              <p className="text-xs text-slate-400 mt-2.5 pt-2.5 border-t border-slate-800/60 leading-relaxed">
                Revokes active worker tasks, purges cached Redis streams, and deletes the physical file from storage.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={isDeleting}
                className="px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-900/60 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={isDeleting}
                className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-sm font-semibold text-white shadow-lg shadow-red-600/30 flex items-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
              >
                {isDeleting ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Delete Permanently
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
