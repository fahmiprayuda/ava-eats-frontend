"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiRequest } from "@/lib/api";

const formatRupiah = (amount) =>
    new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0,
    }).format(amount ?? 0);

const formatDate = (value) => {
    if (!value) return "-";

    return new Date(value).toLocaleString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
};

const ORDER_STATUS_LABELS = {
    pending: "Menunggu diproses",
    paid: "Sudah dibayar",
    done: "Selesai",
    cancelled: "Dibatalkan",
};

const PAYMENT_STATUS_LABELS = {
    pending: "Menunggu pembayaran",
    approved: "Pembayaran berhasil",
    expired: "Pembayaran kedaluwarsa",
    rejected: "Pembayaran gagal",
};

// ── Inline cancel confirmation ────────────────────────────────────────────────
function CancelConfirmDialog({ orderCode, onConfirm, onDismiss, loading }) {
    return (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-semibold text-red-800">
                Batalkan pesanan {orderCode}?
            </p>
            <p className="mt-1 text-xs text-red-600">
                Pesanan yang dibatalkan tidak dapat dikembalikan.
            </p>
            <div className="mt-3 flex gap-2">
                <button
                    type="button"
                    disabled={loading}
                    onClick={onConfirm}
                    className="rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                >
                    {loading ? "Membatalkan..." : "Ya, batalkan"}
                </button>
                <button
                    type="button"
                    disabled={loading}
                    onClick={onDismiss}
                    className="rounded-xl border border-red-200 px-4 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
                >
                    Tidak
                </button>
            </div>
        </div>
    );
}

// ── Inner component (uses hooks that need Suspense) ───────────────────────────
function OrdersContent() {
    const router = useRouter();
    const searchParams = useSearchParams();

    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");

    // Per-order busy state for payment & cancel
    const [busyOrderId, setBusyOrderId] = useState(null);

    // Inline cancel confirm: which order is pending confirmation
    const [cancelConfirmId, setCancelConfirmId] = useState(null);

    // Track which pending orders need polling
    const pollingRef = useRef({});

    // ── Pagination state (5 orders per page) ─────────────────────────────
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 5;

    const totalPages = Math.max(1, Math.ceil(orders.length / ITEMS_PER_PAGE));
    const validCurrentPage = Math.min(currentPage, totalPages);
    const startIndex = (validCurrentPage - 1) * ITEMS_PER_PAGE;
    const paginatedOrders = orders.slice(
        startIndex,
        startIndex + ITEMS_PER_PAGE
    );

    const handlePageChange = (newPage) => {
        setCurrentPage(newPage);
        if (typeof window !== "undefined") {
            window.scrollTo({ top: 0, behavior: "smooth" });
        }
    };

    // ── Load orders ───────────────────────────────────────────────────────
    const loadOrders = useCallback(async () => {
        setLoading(true);
        setError("");

        try {
            const data = await apiRequest("/customers/me/orders");
            setOrders(Array.isArray(data) ? data : []);
        } catch (err) {
            // If unauthenticated, redirect to login
            if (/401|unauthorized|unauthenticated/i.test(err.message)) {
                router.replace("/login?redirect=/orders");
                return;
            }
            setError(err.message || "Gagal memuat pesanan.");
        } finally {
            setLoading(false);
        }
    }, [router]);

    useEffect(() => {
        const timer = setTimeout(() => {
            loadOrders();
        }, 0);
        try {
            localStorage.removeItem("ava_eats_checkout_cart");
            localStorage.removeItem("ava_eats_checkout_draft");
            if (typeof window !== "undefined") {
                window.dispatchEvent(new Event("ava_eats_cart_updated"));
            }
        } catch {
            // ignore
        }
        return () => clearTimeout(timer);
    }, [loadOrders]);

    // Derived success notice from URL param if no explicit notice set
    const displayNotice =
        notice ||
        (searchParams.get("success")
            ? "🎉 Pesanan berhasil dibuat! Terima kasih Moms."
            : "");

    // ── Auto-poll pending orders every 5 s ────────────────────────────────
    useEffect(() => {
        const pendingOrders = orders.filter(
            (o) =>
                (o.status || "").toLowerCase() === "pending" &&
                (o.payment_status || "").toLowerCase() === "pending"
        );

        pendingOrders.forEach((order) => {
            if (pollingRef.current[order.id]) return; // already polling

            let cancelled = false;

            async function poll() {
                if (cancelled) return;

                try {
                    const result = await apiRequest(
                        `/payments/orders/${order.id}`
                    );
                    const payments = Array.isArray(result)
                        ? result
                        : result.payments || [];

                    if (payments.length > 0) {
                        const latest = [...payments].sort((a, b) => b.id - a.id)[0];

                        if (
                            latest.status === "approved" ||
                            latest.status === "expired" ||
                            latest.status === "rejected"
                        ) {
                            cancelled = true;
                            delete pollingRef.current[order.id];
                            await loadOrders(); // refresh list
                            return;
                        }
                    }
                } catch {
                    // silently skip polling errors
                }

                if (!cancelled) {
                    pollingRef.current[order.id] = setTimeout(poll, 5000);
                }
            }

            pollingRef.current[order.id] = setTimeout(poll, 5000);
        });

        // Return cleanup for unmount
        const activeTimers = pollingRef.current;
        return () => {
            Object.values(activeTimers).forEach((t) => clearTimeout(t));
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [orders]);

    // ── Open Midtrans Snap popup ──────────────────────────────────────────
    function openSnapPopup(token, fallbackUrl) {
        if (typeof window !== "undefined" && window.snap) {
            window.snap.pay(token, {
                onSuccess: async () => {
                    setNotice("🎉 Pembayaran berhasil!");
                    await loadOrders();
                },
                onPending: () => {
                    setNotice("Pembayaran sedang diproses. Harap tunggu konfirmasi.");
                },
                onError: (result) => {
                    setError(
                        "Pembayaran gagal: " +
                        (result?.status_message || "Silakan coba kembali.")
                    );
                },
                onClose: () => {
                    setNotice(
                        'Popup ditutup. Klik "Lanjutkan Pembayaran" untuk melanjutkan.'
                    );
                },
            });
            return;
        }

        // Fallback jika window.snap belum ready
        if (fallbackUrl) {
            window.open(fallbackUrl, "_blank", "noopener,noreferrer");
            setNotice("Membuka halaman pembayaran Midtrans di tab baru...");
        } else {
            setNotice("SDK pembayaran sedang memuat, silakan klik sekali lagi.");
        }
    }

    // ── Retry / create new payment ────────────────────────────────────────
    const handleRetryPayment = async (order) => {
        setBusyOrderId(order.id);
        setError("");
        setNotice("");

        try {
            const payment = await apiRequest(
                `/payments/orders/${order.id}/gateway`,
                {
                    method: "POST",
                    body: JSON.stringify({ payment_method: "other_qris" }),
                }
            );

            const token =
                payment.gateway_token || payment.snap_token;
            const url = payment.payment_url;

            if (token) {
                openSnapPopup(token, url);
            } else if (url) {
                window.open(url, "_blank", "noopener,noreferrer");
                setNotice("Halaman pembayaran dibuka di tab baru.");
            } else {
                throw new Error("Token/link pembayaran tidak tersedia.");
            }

            await loadOrders();
        } catch (err) {
            setError(err.message || "Gagal menyiapkan pembayaran.");
        } finally {
            setBusyOrderId(null);
        }
    };

    // ── Cancel order (inline confirm) ─────────────────────────────────────
    const handleCancelConfirm = async (order) => {
        setBusyOrderId(order.id);
        setError("");
        setNotice("");
        setCancelConfirmId(null);

        try {
            await apiRequest(`/orders/${order.id}/cancel`, {
                method: "POST",
            });

            setNotice(`Pesanan ${order.order_code} berhasil dibatalkan.`);
            await loadOrders();
        } catch (err) {
            setError(err.message || "Gagal membatalkan pesanan.");
        } finally {
            setBusyOrderId(null);
        }
    };

    // ─────────────────────────────────────────────────────────────────────
    return (
        <main className="min-h-screen bg-[#FAF7F2] px-4 py-6 text-[#382629]">
            <div className="mx-auto max-w-[520px]">
                <header className="mb-6">
                    <Link
                        href="/"
                        className="text-sm font-medium text-[#80515A] hover:underline"
                    >
                        ← Kembali ke menu
                    </Link>

                    <h1 className="mt-4 text-2xl font-bold">
                        Pesanan Saya
                    </h1>
                    <p className="mt-1 text-sm text-[#78686A]">
                        Pantau pesanan dan status pembayaranmu di sini.
                    </p>
                </header>

                {error && (
                    <div
                        role="alert"
                        className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
                    >
                        {error}
                    </div>
                )}

                {displayNotice && (
                    <div className="mb-4 rounded-xl border border-[#D8E2D5] bg-[#EDF3E9] p-3 text-sm text-[#456044]">
                        {displayNotice}
                    </div>
                )}

                {loading ? (
                    <div className="rounded-2xl bg-white p-6 text-center text-sm text-[#78686A]">
                        Memuat pesanan...
                    </div>
                ) : orders.length === 0 ? (
                    <div className="rounded-2xl bg-white p-6 text-center">
                        <p className="font-semibold">Belum ada pesanan</p>
                        <p className="mt-2 text-sm text-[#78686A]">
                            Pesanan yang kamu buat akan muncul di halaman ini.
                        </p>
                        <Link
                            href="/"
                            className="mt-4 inline-flex rounded-xl bg-[#7A3545] px-5 py-3 text-sm font-semibold text-white"
                        >
                            Lihat Menu
                        </Link>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {paginatedOrders.map((order) => {
                            const isBusy = busyOrderId === order.id;
                            const orderStatus = (order.status || "").toLowerCase();
                            const paymentStatus = (
                                order.payment_status || ""
                            ).toLowerCase();

                            const canRetryPayment =
                                orderStatus === "pending" &&
                                ["", "pending", "expired", "rejected"].includes(paymentStatus);

                            const canCancel =
                                orderStatus === "pending" &&
                                ["", "expired", "rejected"].includes(paymentStatus);

                            const isPendingPayment =
                                orderStatus === "pending" && paymentStatus === "pending";

                            return (
                                <article
                                    key={order.id}
                                    className="rounded-2xl border border-[#EEE5DF] bg-white p-4 shadow-sm"
                                >
                                    {/* ── Header ── */}
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <p className="text-xs text-[#8A7778]">
                                                Kode pesanan
                                            </p>
                                            <h2 className="mt-1 font-bold">
                                                {order.order_code}
                                            </h2>
                                            <p className="mt-1 text-xs text-[#8A7778]">
                                                {formatDate(order.created_at)}
                                            </p>
                                        </div>

                                        <span className="rounded-full bg-[#F5E8E8] px-3 py-1 text-xs font-semibold text-[#7A3545]">
                                            {ORDER_STATUS_LABELS[orderStatus] || order.status}
                                        </span>
                                    </div>

                                    <div className="my-4 border-t border-dashed border-[#E8DDD7]" />

                                    {/* ── Items ── */}
                                    <div className="space-y-3">
                                        {(order.items || []).map((item) => (
                                            <div
                                                key={item.id}
                                                className="flex justify-between gap-3 text-sm"
                                            >
                                                <div>
                                                    <p className="font-medium">
                                                        {item.product_name}
                                                    </p>
                                                    <p className="mt-1 text-xs text-[#8A7778]">
                                                        {item.quantity} × {formatRupiah(item.price)}
                                                    </p>
                                                </div>
                                                <p className="whitespace-nowrap font-medium">
                                                    {formatRupiah(item.subtotal)}
                                                </p>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="my-4 border-t border-[#EEE5DF]" />

                                    {/* ── Totals ── */}
                                    <div className="flex justify-between gap-3 text-sm">
                                        <span className="text-[#78686A]">
                                            {order.fulfillment_method === "pickup"
                                                ? "Ambil di tempat"
                                                : "Pengiriman"}
                                        </span>
                                        <span className="font-medium">
                                            {formatRupiah(order.shipping_cost)}
                                        </span>
                                    </div>

                                    <div className="mt-2 flex justify-between gap-3">
                                        <span className="font-semibold">Total</span>
                                        <span className="text-lg font-bold text-[#7A3545]">
                                            {formatRupiah(order.grand_total)}
                                        </span>
                                    </div>

                                    {/* ── Payment status ── */}
                                    <div className="mt-4 rounded-xl bg-[#FAF7F2] p-3">
                                        <p className="text-xs text-[#8A7778]">
                                            Status pembayaran
                                        </p>
                                        <div className="mt-1 flex items-center gap-2">
                                            {isPendingPayment && (
                                                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-400" />
                                            )}
                                            <p className="text-sm font-semibold">
                                                {PAYMENT_STATUS_LABELS[paymentStatus] ||
                                                    (paymentStatus ? paymentStatus : "Belum ada pembayaran")}
                                            </p>
                                        </div>
                                    </div>

                                    {/* ── Retry payment ── */}
                                    {canRetryPayment && (
                                        <button
                                            type="button"
                                            disabled={isBusy}
                                            onClick={() => handleRetryPayment(order)}
                                            className="mt-4 w-full rounded-xl bg-[#7A3545] px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            {isBusy
                                                ? "Memproses..."
                                                : paymentStatus === "pending"
                                                    ? "Lanjutkan Pembayaran"
                                                    : "Bayar Sekarang"}
                                        </button>
                                    )}

                                    {/* ── Cancel order (inline confirm) ── */}
                                    {canCancel && cancelConfirmId !== order.id && (
                                        <button
                                            type="button"
                                            disabled={isBusy}
                                            onClick={() => setCancelConfirmId(order.id)}
                                            className="mt-2 w-full rounded-xl border border-[#E4D5D5] px-4 py-3 text-sm font-semibold text-[#7A3545] disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            Batalkan Pesanan
                                        </button>
                                    )}

                                    {cancelConfirmId === order.id && (
                                        <CancelConfirmDialog
                                            orderCode={order.order_code}
                                            loading={isBusy}
                                            onConfirm={() => handleCancelConfirm(order)}
                                            onDismiss={() => setCancelConfirmId(null)}
                                        />
                                    )}
                                </article>
                            );
                        })}
                    </div>
                )}

                {/* ── Pagination Controls ── */}
                {!loading && totalPages > 1 && (
                    <div className="mt-6 flex flex-col items-center gap-3">
                        <p className="text-xs text-[#78686A]">
                            Menampilkan {startIndex + 1} -{" "}
                            {Math.min(startIndex + ITEMS_PER_PAGE, orders.length)}{" "}
                            dari {orders.length} pesanan
                        </p>

                        <div className="flex items-center gap-1.5">
                            <button
                                type="button"
                                onClick={() => handlePageChange(validCurrentPage - 1)}
                                disabled={validCurrentPage === 1}
                                className="rounded-xl border border-[#DCCBC5] bg-white px-3 py-2 text-xs font-semibold text-[#7A3545] transition hover:bg-[#FAF7F2] disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                ← Sebelumnya
                            </button>

                            <div className="flex items-center gap-1">
                                {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNumber) => (
                                    <button
                                        key={pageNumber}
                                        type="button"
                                        onClick={() => handlePageChange(pageNumber)}
                                        className={`h-8 w-8 rounded-xl text-xs font-bold transition ${
                                            validCurrentPage === pageNumber
                                                ? "bg-[#7A3545] text-white shadow-sm"
                                                : "border border-[#EEE5DF] bg-white text-[#503E40] hover:bg-[#FAF7F2]"
                                        }`}
                                    >
                                        {pageNumber}
                                    </button>
                                ))}
                            </div>

                            <button
                                type="button"
                                onClick={() => handlePageChange(validCurrentPage + 1)}
                                disabled={validCurrentPage === totalPages}
                                className="rounded-xl border border-[#DCCBC5] bg-white px-3 py-2 text-xs font-semibold text-[#7A3545] transition hover:bg-[#FAF7F2] disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                Selanjutnya →
                            </button>
                        </div>
                    </div>
                )}

                <button
                    type="button"
                    onClick={loadOrders}
                    disabled={loading}
                    className="mt-5 w-full rounded-xl border border-[#DCCBC5] px-4 py-3 text-sm font-semibold text-[#7A3545] disabled:opacity-60"
                >
                    Muat Ulang Pesanan
                </button>
            </div>
        </main>
    );
}

// ── Page export — wraps in Suspense for useSearchParams ──────────────────────
export default function OrdersPage() {
    return (
        <Suspense fallback={
            <main className="flex min-h-screen items-center justify-center bg-[#FAF7F2]">
                <p className="text-sm text-[#78686A]">Memuat pesanan...</p>
            </main>
        }>
            <OrdersContent />
        </Suspense>
    );
}
