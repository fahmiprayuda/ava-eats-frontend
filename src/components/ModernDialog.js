"use client";

import { useState, useEffect, useCallback } from "react";

// ── Global Helper Functions (Bisa dipanggil dari mana saja) ─────────────────
export function showToast(message, type = "success") {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
        new CustomEvent("ava_eats_toast", {
            detail: {
                id: `${Date.now()}-${Math.random()}`,
                message: typeof message === "string" ? message : JSON.stringify(message),
                type: ["success", "error", "warning", "info"].includes(type) ? type : "info",
            },
        })
    );
}

export function showAlert(message, options = {}) {
    if (typeof window === "undefined") return Promise.resolve();
    return new Promise((resolve) => {
        window.dispatchEvent(
            new CustomEvent("ava_eats_dialog", {
                detail: {
                    id: `${Date.now()}-${Math.random()}`,
                    mode: "alert",
                    title: options.title || "Perhatian",
                    message: typeof message === "string" ? message : JSON.stringify(message),
                    type: options.type || "warning",
                    confirmText: options.confirmText || "Mengerti",
                    onResolve: resolve,
                },
            })
        );
    });
}

export function showConfirm(message, options = {}) {
    if (typeof window === "undefined") return Promise.resolve(false);
    return new Promise((resolve) => {
        window.dispatchEvent(
            new CustomEvent("ava_eats_dialog", {
                detail: {
                    id: `${Date.now()}-${Math.random()}`,
                    mode: "confirm",
                    title: options.title || "Konfirmasi",
                    message: typeof message === "string" ? message : JSON.stringify(message),
                    type: options.type || "danger",
                    confirmText: options.confirmText || "Ya, Lanjutkan",
                    cancelText: options.cancelText || "Batal",
                    onResolve: resolve,
                },
            })
        );
    });
}

// ── Icons SVGs ───────────────────────────────────────────────────────────────
function CheckIcon({ className = "w-5 h-5" }) {
    return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
    );
}

function ExclamationIcon({ className = "w-5 h-5" }) {
    return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
    );
}

function CrossIcon({ className = "w-5 h-5" }) {
    return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
    );
}

function InfoIcon({ className = "w-5 h-5" }) {
    return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
    );
}

function TrashIcon({ className = "w-6 h-6" }) {
    return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
    );
}

// ── Modern Dialog Provider (Mount di RootLayout) ────────────────────────────
export function ModernDialogProvider({ children }) {
    const [toasts, setToasts] = useState([]);
    const [dialog, setDialog] = useState(null);

    // Tangani Custom Events
    useEffect(() => {
        function handleToastEvent(e) {
            const newToast = e.detail;
            setToasts((prev) => [...prev, newToast]);

            // Auto dismiss setelah 4 detik
            setTimeout(() => {
                setToasts((prev) => prev.filter((t) => t.id !== newToast.id));
            }, 4000);
        }

        function handleDialogEvent(e) {
            setDialog(e.detail);
        }

        // Intercept native window.alert agar panggilan alert() lama otomatis tampil modern
        const originalAlert = window.alert;
        window.alert = (msg) => {
            showToast(String(msg), "warning");
        };

        window.addEventListener("ava_eats_toast", handleToastEvent);
        window.addEventListener("ava_eats_dialog", handleDialogEvent);

        return () => {
            window.alert = originalAlert;
            window.removeEventListener("ava_eats_toast", handleToastEvent);
            window.removeEventListener("ava_eats_dialog", handleDialogEvent);
        };
    }, []);

    const dismissToast = useCallback((id) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    const handleConfirm = useCallback(() => {
        if (!dialog) return;
        if (dialog.onResolve) dialog.onResolve(true);
        setDialog(null);
    }, [dialog]);

    const handleCancel = useCallback(() => {
        if (!dialog) return;
        if (dialog.onResolve) dialog.onResolve(false);
        setDialog(null);
    }, [dialog]);

    return (
        <>
            {children}

            {/* ── Floating Toasts Stack (Responsif HP & Desktop) ───────────────── */}
            <div
                className="fixed inset-x-3 sm:inset-x-auto sm:right-6 sm:w-full sm:max-w-sm z-[99999] flex flex-col gap-2 pointer-events-none"
                style={{ top: "max(12px, env(safe-area-inset-top))" }}
            >
                {toasts.map((t) => {
                    let borderClass = "border-emerald-500/40 bg-[#14261C]/95 text-emerald-100 shadow-emerald-950/40";
                    let IconBadge = <CheckIcon className="w-4 h-4 text-emerald-400" />;
                    let titleText = "Berhasil";

                    if (t.type === "error") {
                        borderClass = "border-rose-500/40 bg-[#2B1417]/95 text-rose-100 shadow-rose-950/40";
                        IconBadge = <CrossIcon className="w-4 h-4 text-rose-400" />;
                        titleText = "Gagal";
                    } else if (t.type === "warning") {
                        borderClass = "border-amber-500/40 bg-[#2B1F12]/95 text-amber-100 shadow-amber-950/40";
                        IconBadge = <ExclamationIcon className="w-4 h-4 text-amber-400" />;
                        titleText = "Perhatian";
                    } else if (t.type === "info") {
                        borderClass = "border-sky-500/40 bg-[#12212B]/95 text-sky-100 shadow-sky-950/40";
                        IconBadge = <InfoIcon className="w-4 h-4 text-sky-400" />;
                        titleText = "Informasi";
                    }

                    return (
                        <div
                            key={t.id}
                            className={`pointer-events-auto flex items-start gap-3 rounded-2xl border p-3.5 shadow-2xl backdrop-blur-md transition-all duration-300 transform translate-y-0 opacity-100 ${borderClass}`}
                        >
                            <div className="rounded-full bg-white/10 p-1 shrink-0 mt-0.5">
                                {IconBadge}
                            </div>
                            <div className="flex-1 min-w-0 pr-1">
                                <p className="text-[10.5px] font-bold uppercase tracking-wider opacity-75">
                                    {titleText}
                                </p>
                                <p className="text-xs font-medium leading-snug mt-0.5 break-words">
                                    {t.message}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => dismissToast(t.id)}
                                className="text-white/50 hover:text-white p-1 rounded-lg transition shrink-0 active:scale-95"
                                aria-label="Tutup"
                            >
                                <CrossIcon className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    );
                })}
            </div>

            {/* ── Modern Modal Dialog (Alert / Confirm - Responsif HP) ───────────── */}
            {dialog && (
                <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs transition-opacity">
                    <div
                        className="fixed inset-0"
                        onClick={dialog.mode === "confirm" ? handleCancel : handleConfirm}
                    />

                    <div className="relative z-10 w-full max-w-[360px] sm:max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-[#3E3234] bg-[#221B1D] p-5 sm:p-6 text-white shadow-2xl transition-all">
                        <div className="flex items-start gap-3 sm:gap-3.5">
                            {/* Icon Box */}
                            <div
                                className={`rounded-2xl p-2.5 sm:p-3 shrink-0 ${
                                    dialog.type === "danger"
                                        ? "bg-rose-500/15 border border-rose-500/30 text-rose-400"
                                        : dialog.type === "warning"
                                        ? "bg-amber-500/15 border border-amber-500/30 text-amber-400"
                                        : dialog.type === "success"
                                        ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-400"
                                        : "bg-[#7A2E3A]/20 border border-[#7A2E3A]/40 text-[#E8A598]"
                                }`}
                            >
                                {dialog.type === "danger" ? (
                                    <TrashIcon className="w-5 h-5 sm:w-6 sm:h-6" />
                                ) : dialog.type === "warning" ? (
                                    <ExclamationIcon className="w-5 h-5 sm:w-6 sm:h-6" />
                                ) : dialog.type === "success" ? (
                                    <CheckIcon className="w-5 h-5 sm:w-6 sm:h-6" />
                                ) : (
                                    <InfoIcon className="w-5 h-5 sm:w-6 sm:h-6" />
                                )}
                            </div>

                            {/* Text Info */}
                            <div className="flex-1 min-w-0 pt-0.5">
                                <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
                                    {dialog.title}
                                </h3>
                                <p className="text-xs sm:text-[13px] text-[#D1C7BD] mt-1.5 leading-relaxed break-words whitespace-pre-line">
                                    {dialog.message}
                                </p>
                            </div>
                        </div>

                        {/* Action Buttons (Ergonomis untuk Jempol HP & Desktop) */}
                        <div className="mt-5 sm:mt-6 flex items-center justify-end gap-2.5 pt-3 border-t border-[#342A2C]">
                            {dialog.mode === "confirm" && (
                                <button
                                    type="button"
                                    onClick={handleCancel}
                                    className="flex-1 sm:flex-none rounded-xl border border-[#3E3234] bg-[#2E2527] px-4 py-2.5 text-xs font-semibold text-[#D1C7BD] hover:bg-[#382E30] hover:text-white transition text-center active:scale-95"
                                >
                                    {dialog.cancelText || "Batal"}
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={handleConfirm}
                                autoFocus
                                className={`flex-1 sm:flex-none rounded-xl px-5 py-2.5 text-xs font-bold text-white shadow-lg transition text-center active:scale-95 ${
                                    dialog.type === "danger"
                                        ? "bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 shadow-rose-950/50"
                                        : "bg-[#7A2E3A] hover:bg-[#64252F] shadow-[#7A2E3A]/30"
                                }`}
                            >
                                {dialog.confirmText || "Mengerti"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
