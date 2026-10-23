"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiRequest, getImageUrl } from "@/lib/api";

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
    pending: "Menunggu Pembayaran",
    paid: "Pembayaran Diterima",
    processing: "Sedang Disiapkan",
    delivered: "Dalam Pengiriman",
    completed: "Selesai",
    done: "Selesai",
    cancelled: "Dibatalkan",
};

const PAYMENT_STATUS_LABELS = {
    pending: "Menunggu pembayaran",
    approved: "Pembayaran berhasil",
    expired: "Pembayaran kedaluwarsa",
    rejected: "Pembayaran gagal",
};

function getOrderLifecycleInfo(order) {
    const status = (order.status || "").toLowerCase();
    const isDelivery = order.fulfillment_method === "delivery";

    const steps = [
        { label: "Bayar", icon: "💳" },
        { label: "Diterima", icon: "📋" },
        { label: "Disiapkan", icon: "📦" },
        { label: isDelivery ? "Dikirim" : "Siap Ambil", icon: isDelivery ? "🛵" : "🛍️" },
        { label: "Selesai", icon: "🎉" },
    ];

    if (status === "cancelled") {
        const isRefundPending = order.refund_status === "refund_pending";
        const isRefunded = order.refund_status === "refunded";

        return {
            isCancelled: true,
            isRefundPending,
            isRefunded,
            currentStep: -1,
            steps,
            emoji: isRefunded ? "✓" : isRefundPending ? "💸" : "✕",
            title: isRefunded
                ? "Pesanan Dibatalkan — Refund Selesai"
                : isRefundPending
                ? "Pesanan Dibatalkan — Refund Diproses"
                : "Pesanan Dibatalkan",
            desc: isRefunded
                ? `Dana telah berhasil dikembalikan ke rekening/e-wallet Anda. ${order.refund_note ? `Catatan: "${order.refund_note}"` : ""}`
                : isRefundPending
                ? `Pengembalian dana sebesar ${formatRupiah(order.grand_total || order.total_amount)} sedang diproses oleh admin Ava Eats.`
                : (order.cancellation_reason ? `Alasan: "${order.cancellation_reason}"` : "Pesanan ini telah dibatalkan sebelum pembayaran."),
            badgeBg: isRefunded
                ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                : isRefundPending
                ? "bg-amber-50 text-amber-800 border-amber-300"
                : "bg-red-50 text-red-700 border-red-200",
        };
    }

    if (status === "paid") {
        return {
            isCancelled: false,
            currentStep: 1,
            steps,
            emoji: "📋",
            title: "Pembayaran Berhasil! Pesanan Siap Dikemas",
            desc: "Pesanan Moms sudah masuk antrean Ava Eats dan siap dikemas (frozen food & ice pack).",
            badgeBg: "bg-amber-50 text-amber-800 border-amber-200",
        };
    }

    if (status === "processing") {
        return {
            isCancelled: false,
            currentStep: 2,
            steps,
            emoji: "📦",
            title: "Pesanan Sedang Dikemas & Disiapkan",
            desc: "Tim Ava Eats sedang menyiapkan produk frozen food & ice pack agar kualitas tetap terjaga prima.",
            badgeBg: "bg-sky-50 text-sky-800 border-sky-200",
        };
    }

    if (status === "delivered") {
        return {
            isCancelled: false,
            currentStep: 3,
            steps,
            emoji: isDelivery ? "🛵" : "🛍️",
            title: isDelivery ? "Pesanan Sedang Diantar Kurir" : "Pesanan Siap Diambil!",
            desc: isDelivery
                ? `Kurir ${(order.courier || "").toUpperCase()} sedang meluncur menuju alamat pengiriman Moms.`
                : "Pesanan frozen food Moms sudah siap diambil di outlet Ava Eats.",
            badgeBg: "bg-emerald-50 text-emerald-800 border-emerald-200",
        };
    }

    if (status === "completed" || status === "done") {
        return {
            isCancelled: false,
            currentStep: 4,
            steps,
            emoji: "🎉",
            title: "Pesanan Selesai & Diterima",
            desc: "Terima kasih sudah memesan di Ava Eats! Simpan di freezer atau hangatkan untuk dinikmati bersama keluarga.",
            badgeBg: "bg-emerald-50 text-emerald-800 border-emerald-200",
        };
    }

    // Default: pending
    return {
        isCancelled: false,
        currentStep: 0,
        steps,
        emoji: "⏳",
        title: "Menunggu Pembayaran",
        desc: "Selesaikan pembayaran melalui QRIS/Transfer agar pesanan Moms dapat segera disiapkan.",
        badgeBg: "bg-amber-50 text-amber-800 border-amber-200",
    };
}

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
    const [copiedResi, setCopiedResi] = useState("");
    const [customerPreviewProof, setCustomerPreviewProof] = useState("");
    const [repeatLoadingId, setRepeatLoadingId] = useState(null);
    const [repeatOrderModal, setRepeatOrderModal] = useState(null);

    function handleCopyResi(resi) {
        if (typeof navigator !== "undefined" && navigator.clipboard) {
            navigator.clipboard.writeText(resi);
            setCopiedResi(resi);
            setTimeout(() => setCopiedResi(""), 2500);
        }
    }

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

    // ── Repeat Order handler ─────────────────────────────────────────────
    const handleRepeatOrder = async (order) => {
        if (!order || !order.items || order.items.length === 0) {
            alert("Tidak ada item dalam pesanan ini.");
            return;
        }

        setRepeatLoadingId(order.id);
        try {
            // Ambil daftar menu & stok live dari database
            const res = await apiRequest("/products");
            const productList = Array.isArray(res) ? res : (res?.products || []);
            const productMap = new Map(productList.map((p) => [Number(p.id), p]));

            const itemsReport = [];
            const validCartItems = [];

            for (const orderItem of order.items) {
                const pid = Number(orderItem.product_id || orderItem.product?.id);
                const prod =
                    productMap.get(pid) ||
                    productList.find(
                        (p) =>
                            p.name &&
                            orderItem.product_name &&
                            p.name.trim().toLowerCase() === orderItem.product_name.trim().toLowerCase()
                    );
                const reqQty = Number(orderItem.quantity) || 1;

                if (!prod || !prod.is_available || Number(prod.stock || 0) <= 0) {
                    itemsReport.push({
                        productId: pid || orderItem.id,
                        name: orderItem.product_name || prod?.name || "Menu",
                        requestedQty: reqQty,
                        availableQty: 0,
                        price: Number(prod?.price || orderItem.price || 0),
                        imageUrl: prod?.image || prod?.image_url,
                        status: "out_of_stock",
                        reason: "Stok habis / tidak tersedia",
                    });
                } else if (Number(prod.stock) < reqQty) {
                    itemsReport.push({
                        productId: prod.id,
                        name: prod.name,
                        requestedQty: reqQty,
                        availableQty: Number(prod.stock),
                        price: Number(prod.price),
                        imageUrl: prod.image || prod.image_url,
                        status: "partial",
                        reason: `Tersedia ${prod.stock} pcs (sebelumnya pesan ${reqQty} pcs)`,
                    });
                    validCartItems.push({
                        product_id: prod.id,
                        name: prod.name,
                        price: Number(prod.price),
                        quantity: Number(prod.stock),
                        image_url: prod.image || prod.image_url,
                    });
                } else {
                    itemsReport.push({
                        productId: prod.id,
                        name: prod.name,
                        requestedQty: reqQty,
                        availableQty: reqQty,
                        price: Number(prod.price),
                        imageUrl: prod.image || prod.image_url,
                        status: "ok",
                    });
                    validCartItems.push({
                        product_id: prod.id,
                        name: prod.name,
                        price: Number(prod.price),
                        quantity: reqQty,
                        image_url: prod.image || prod.image_url,
                    });
                }
            }

            const hasIssue = itemsReport.some((it) => it.status !== "ok");

            if (hasIssue) {
                // Ada menu yang stoknya berkurang / habis -> Munculkan pop-up pemberitahuan
                setRepeatOrderModal({
                    orderCode: order.order_code,
                    itemsReport,
                    validCartItems,
                    availableCount: validCartItems.length,
                });
            } else {
                // Semua menu 100% lengkap dan tersedia -> Langsung arahkan ke checkout
                localStorage.setItem(
                    "ava_eats_checkout_cart",
                    JSON.stringify(validCartItems)
                );
                if (typeof window !== "undefined") {
                    window.dispatchEvent(new Event("ava_eats_cart_updated"));
                }
                router.push("/checkout");
            }
        } catch (err) {
            console.error("Gagal memeriksa ketersediaan menu:", err);
            alert("Gagal memeriksa ketersediaan menu. Silakan coba kembali beberapa saat lagi.");
        } finally {
            setRepeatLoadingId(null);
        }
    };

    const handleConfirmRepeatCheckout = () => {
        if (!repeatOrderModal || !repeatOrderModal.validCartItems || repeatOrderModal.validCartItems.length === 0) {
            setRepeatOrderModal(null);
            return;
        }

        localStorage.setItem(
            "ava_eats_checkout_cart",
            JSON.stringify(repeatOrderModal.validCartItems)
        );
        if (typeof window !== "undefined") {
            window.dispatchEvent(new Event("ava_eats_cart_updated"));
        }
        setRepeatOrderModal(null);
        router.push("/checkout");
    };

    // ─────────────────────────────────────────────────────────────────────
    return (
        <main className="min-h-screen bg-[#FAF7F2] px-4 py-6 text-[#382629]">
            <div className="mx-auto max-w-[520px]">
                <header className="mb-6 flex items-start justify-between">
                    <div>
                        <Link
                            href="/"
                            className="text-sm font-medium text-[#80515A] hover:underline"
                        >
                            ← Kembali ke menu
                        </Link>

                        <h1 className="mt-3 text-2xl font-bold text-[#2A2620]">
                            Pesanan Saya
                        </h1>
                        <p className="mt-1 text-sm text-[#78686A]">
                            Pantau proses penyiapan & pengiriman real-time.
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={loadOrders}
                        className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-[#E8D6CE] bg-white px-3 py-2 text-xs font-semibold text-[#7A3545] shadow-sm hover:bg-[#FAF7F2] transition"
                        title="Segarkan status pesanan"
                    >
                        <span>↻</span> Refresh
                    </button>
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

                            const lifecycle = getOrderLifecycleInfo(order);

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

                                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                            order.status === "cancelled" && order.refund_status === "refund_pending"
                                                ? "bg-amber-100 text-amber-800 border border-amber-300"
                                                : order.status === "cancelled" && order.refund_status === "refunded"
                                                ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                                                : "bg-[#F5E8E8] text-[#7A3545]"
                                        }`}>
                                            {order.status === "cancelled" && order.refund_status === "refund_pending"
                                                ? "Batal (Refund Diproses)"
                                                : order.status === "cancelled" && order.refund_status === "refunded"
                                                ? "Batal (Refund Selesai)"
                                                : (ORDER_STATUS_LABELS[orderStatus] || order.status)}
                                        </span>
                                    </div>

                                    {/* ── Order Lifecycle Stepper ── */}
                                    <div className="mt-3.5 rounded-2xl border border-[#E8D6CE] bg-[#FAF7F2] p-3.5">
                                        {!lifecycle.isCancelled ? (
                                            <>
                                                {/* Stepper bar */}
                                                <div className="relative mb-3.5 px-2">
                                                    <div className="absolute left-4 right-4 top-3 h-[2px] bg-[#E8DDD7]" />
                                                    <div
                                                        className="absolute left-4 top-3 h-[2px] bg-[#6E8F63] transition-all duration-500"
                                                        style={{ width: `${(Math.min(lifecycle.currentStep, 4) / 4) * 100}%` }}
                                                    />
                                                    <div className="flex items-center justify-between relative z-10">
                                                        {lifecycle.steps.map((st, i) => {
                                                            const isDone = i < lifecycle.currentStep;
                                                            const isCurrent = i === lifecycle.currentStep;
                                                            return (
                                                                <div key={i} className="flex flex-col items-center">
                                                                    <div
                                                                        className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold transition-all ${
                                                                            isDone
                                                                                ? "bg-[#6E8F63] text-white"
                                                                                : isCurrent
                                                                                ? "bg-[#7A2E3A] text-white ring-4 ring-[#7A2E3A]/20 animate-pulse"
                                                                                : "bg-[#E8DDD7] text-[#8A7778]"
                                                                        }`}
                                                                    >
                                                                        {isDone ? "✓" : st.icon}
                                                                    </div>
                                                                    <span
                                                                        className={`mt-1.5 text-[9px] font-semibold text-center whitespace-nowrap ${
                                                                            isCurrent
                                                                                ? "text-[#7A2E3A] font-bold"
                                                                                : isDone
                                                                                ? "text-[#456044]"
                                                                                : "text-[#A89F97]"
                                                                        }`}
                                                                    >
                                                                        {st.label}
                                                                    </span>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>

                                                {/* Current Active Status Box */}
                                                <div className="flex items-center gap-3 rounded-xl bg-white p-3 border border-[#EEE5DF] shadow-xs">
                                                    <span className="text-2xl shrink-0">{lifecycle.emoji}</span>
                                                    <div className="min-w-0 flex-1">
                                                        <strong className="block text-xs font-bold text-[#2A2620]">
                                                            {lifecycle.title}
                                                        </strong>
                                                        <p className="text-[11px] text-[#6B6459] leading-snug mt-0.5">
                                                            {lifecycle.desc}
                                                        </p>
                                                    </div>
                                                </div>
                                            </>
                                        ) : (
                                            <div>
                                                {order.refund_status === "refund_pending" ? (
                                                    <div className="rounded-xl bg-amber-50 p-3.5 border border-amber-300">
                                                        <div className="flex items-start gap-2.5">
                                                            <span className="text-2xl shrink-0">💸</span>
                                                            <div className="flex-1 min-w-0">
                                                                <strong className="block text-xs font-bold text-amber-900">
                                                                    Pesanan Dibatalkan — Refund Sedang Diproses
                                                                </strong>
                                                                {order.cancellation_reason && (
                                                                    <p className="text-[11px] text-amber-800 mt-1">
                                                                        Alasan: <span className="font-semibold">&ldquo;{order.cancellation_reason}&rdquo;</span>
                                                                    </p>
                                                                )}
                                                                <p className="text-[11px] text-amber-700 mt-1">
                                                                    Total dana <span className="font-bold">{formatRupiah(order.grand_total || order.total_amount)}</span> akan dikembalikan oleh admin Ava Eats ke nomor WhatsApp Anda ({order.phone}).
                                                                </p>
                                                                <a
                                                                    href={`https://wa.me/6282213232456?text=${encodeURIComponent(
                                                                        `Halo Admin Ava Eats, saya mau konfirmasi pengembalian dana (refund) untuk pesanan saya #${order.order_code} (Rp ${(order.grand_total || order.total_amount || 0).toLocaleString("id-ID")}).`
                                                                    )}`}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-[#25D366] px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-[#20ba59] transition"
                                                                >
                                                                    <span>💬</span> Chat WhatsApp Admin Toko
                                                                </a>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ) : order.refund_status === "refunded" ? (
                                                    <div className="rounded-xl bg-emerald-50 p-3.5 border border-emerald-300">
                                                        <div className="flex items-start gap-2.5">
                                                            <span className="text-2xl shrink-0">✓</span>
                                                            <div className="flex-1 min-w-0">
                                                                <strong className="block text-xs font-bold text-emerald-900">
                                                                    Pengembalian Dana (Refund) Selesai
                                                                </strong>
                                                                <p className="text-[11px] text-emerald-800 mt-1">
                                                                    Dana sebesar <span className="font-bold">{formatRupiah(order.grand_total || order.total_amount)}</span> telah berhasil ditransfer kembali ke rekening/e-wallet Anda.
                                                                </p>
                                                                {order.refund_note && (
                                                                    <p className="text-[11px] text-emerald-700 italic mt-0.5">
                                                                        Catatan: &ldquo;{order.refund_note}&rdquo;
                                                                    </p>
                                                                )}
                                                                {order.cancellation_reason && (
                                                                    <p className="text-[10px] text-[#8A7778] mt-1">
                                                                        Alasan Batal: &ldquo;{order.cancellation_reason}&rdquo;
                                                                    </p>
                                                                )}
                                                                {order.refund_proof_url && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setCustomerPreviewProof(order.refund_proof_url)}
                                                                        className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-emerald-800 shadow-xs hover:bg-emerald-50 transition"
                                                                    >
                                                                        <span>🧾</span> Lihat Bukti Transfer Refund
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-2.5 rounded-xl bg-red-50 p-3 border border-red-200">
                                                        <span className="text-xl shrink-0">✕</span>
                                                        <div>
                                                            <strong className="block text-xs font-bold text-red-800">
                                                                Pesanan Dibatalkan
                                                            </strong>
                                                            <p className="text-[11px] text-red-600 mt-0.5">
                                                                {order.cancellation_reason
                                                                    ? `Alasan: "${order.cancellation_reason}"`
                                                                    : "Pesanan ini dibatalkan sebelum pembayaran selesai."}
                                                            </p>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
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
                                    <div className="space-y-1.5 text-xs sm:text-sm">
                                        <div className="flex justify-between gap-3 text-[#78686A]">
                                            <span>Subtotal Menu</span>
                                            <span className="font-medium text-[#2A2620]">
                                                {formatRupiah(order.total_amount)}
                                            </span>
                                        </div>

                                        <div className="flex justify-between gap-3 text-[#78686A]">
                                            <span>
                                                {order.fulfillment_method === "pickup"
                                                    ? "Ambil di tempat"
                                                    : order.courier
                                                        ? `Pengiriman (${order.courier.toUpperCase()}${order.courier_service ? ` ${order.courier_service.toUpperCase()}` : ""})`
                                                        : "Ongkos Kirim"}
                                            </span>
                                            <span className="font-medium text-[#2A2620]">
                                                {order.fulfillment_method === "pickup"
                                                    ? "Gratis"
                                                    : formatRupiah(order.shipping_cost || 0)}
                                            </span>
                                        </div>

                                        {Boolean(order.packaging_fee && order.packaging_fee > 0) && (
                                            <div className="flex justify-between gap-3 text-[#78686A]">
                                                <span className="flex items-center gap-1">
                                                    <span>❄️</span> Extra Packaging (Bag+Ice)
                                                </span>
                                                <span className="font-medium text-[#2A2620]">
                                                    {formatRupiah(order.packaging_fee)}
                                                </span>
                                            </div>
                                        )}

                                        <div className="pt-2 border-t border-dashed border-[#EEE5DF] flex justify-between gap-3 text-sm sm:text-base">
                                            <span className="font-bold text-[#2A2620]">Total Pembayaran</span>
                                            <span className="font-bold text-[#7A3545]">
                                                {formatRupiah(order.grand_total || order.total_amount)}
                                            </span>
                                        </div>
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

                                    {/* ── Status Pelacakan Pengiriman (Tracking) ── */}
                                    {order.fulfillment_method === "delivery" && order.courier && (
                                        <div className="mt-4 rounded-xl border border-[#E8D6CE] bg-[#FAF7F2] p-3.5">
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs font-semibold uppercase tracking-wider text-[#78686A]">
                                                    Info Pengiriman
                                                </span>
                                                <span className="rounded bg-[#EAE2DC] px-2 py-0.5 text-[11px] font-bold text-[#5A4E4D]">
                                                    {order.courier.toUpperCase()}{order.courier_service ? ` • ${order.courier_service.toUpperCase()}` : ""}
                                                </span>
                                            </div>

                                            {/* Kurir Ekspedisi (Paxel) -> No. Resi */}
                                            {(order.courier.toLowerCase() === "paxel" || (!["gojek", "grab", "lalamove"].includes(order.courier.toLowerCase()))) && (
                                                <div className="mt-2.5">
                                                    {order.tracking_number ? (
                                                        <div>
                                                            <p className="text-xs text-[#78686A]">Nomor Resi Pengiriman:</p>
                                                            <div className="mt-1 flex items-center justify-between rounded-lg border border-[#E0D3CC] bg-white px-3 py-2">
                                                                <code className="font-mono text-sm font-bold text-[#2A2620]">
                                                                    {order.tracking_number}
                                                                </code>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleCopyResi(order.tracking_number)}
                                                                    className="rounded bg-[#F3E1DE] px-2.5 py-1 text-xs font-semibold text-[#7A2E3A] hover:bg-[#EBD2CD] transition"
                                                                >
                                                                    {copiedResi === order.tracking_number ? "✓ Tersalin" : "Salin"}
                                                                </button>
                                                            </div>
                                                            {order.tracking_url && (
                                                                <a
                                                                    href={order.tracking_url}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="mt-2.5 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#6E8F63] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#58764F]"
                                                                >
                                                                    📦 Lacak Paket Paxel ↗
                                                                </a>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <div className="text-xs text-[#78686A]">
                                                            <p>
                                                                {order.status === "paid" || order.status === "processing"
                                                                    ? "⏳ Pesanan sedang disiapkan. Resi Paxel akan otomatis muncul saat kurir menjemput paket."
                                                                    : "Resi akan terbit setelah pembayaran berhasil dikonfirmasi."}
                                                            </p>
                                                            <button
                                                                type="button"
                                                                onClick={async () => {
                                                                    try {
                                                                        await apiRequest(`/shipping/simulate/${order.id}`, { method: "POST" });
                                                                        loadOrders();
                                                                    } catch (e) {
                                                                        alert("Simulasi gagal: " + e.message);
                                                                    }
                                                                }}
                                                                className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-[#D5C2B8] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#7A3545] shadow-xs hover:bg-[#FAF7F2] transition"
                                                            >
                                                                🧪 Simulasi Resi Paxel (Demo)
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* Kurir Instan (Gojek / Grab / Lalamove) -> Info Driver & Live Map */}
                                            {["gojek", "grab", "lalamove"].includes(order.courier.toLowerCase()) && (
                                                <div className="mt-2.5 space-y-2">
                                                    {order.driver_name ? (
                                                        <div className="rounded-lg border border-[#E0D3CC] bg-white p-2.5 text-xs">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-base">🛵</span>
                                                                <div>
                                                                    <p className="font-bold text-[#2A2620]">{order.driver_name}</p>
                                                                    <p className="text-[#78686A]">
                                                                        {order.driver_plate_number || "Roda dua (motor)"}
                                                                        {order.driver_phone ? ` • Telp: ${order.driver_phone}` : ""}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="text-xs text-[#78686A]">
                                                            <p>
                                                                {order.status === "paid" || order.status === "processing"
                                                                    ? "⏳ Dapur sedang menyiapkan makanan. Driver instan akan dipanggil sesaat sebelum pesanan siap diantar."
                                                                    : "Driver instan akan dialokasikan setelah pembayaran dikonfirmasi."}
                                                            </p>
                                                            <button
                                                                type="button"
                                                                onClick={async () => {
                                                                    try {
                                                                        await apiRequest(`/shipping/simulate/${order.id}`, { method: "POST" });
                                                                        loadOrders();
                                                                    } catch (e) {
                                                                        alert("Simulasi gagal: " + e.message);
                                                                    }
                                                                }}
                                                                className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-[#D5C2B8] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#7A3545] shadow-xs hover:bg-[#FAF7F2] transition"
                                                            >
                                                                🧪 Simulasi Driver Instan (Demo)
                                                            </button>
                                                        </div>
                                                    )}

                                                    {order.tracking_url ? (
                                                        <a
                                                            href={order.tracking_url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#7A3545] px-3.5 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#642835]"
                                                        >
                                                            📍 Pantau Lokasi Driver Live (Peta) ↗
                                                        </a>
                                                    ) : null}
                                                </div>
                                            )}
                                        </div>
                                    )}

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

                                    {/* ── Repeat Order (Pesan Lagi) Button ── */}
                                    <button
                                        type="button"
                                        disabled={isBusy || repeatLoadingId === order.id}
                                        onClick={() => handleRepeatOrder(order)}
                                        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-[#7A3545]/25 bg-[#FAF7F2] px-4 py-2.5 text-xs font-bold text-[#7A3545] hover:bg-[#7A3545] hover:text-white transition shadow-2xs disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        <span>🔄</span>
                                        {repeatLoadingId === order.id
                                            ? "Memeriksa ketersediaan menu..."
                                            : "Pesan Lagi (Repeat Order)"}
                                    </button>
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

            {/* ── Lightbox Modal for Customer Refund Proof ── */}
            {customerPreviewProof && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div
                        className="fixed inset-0 bg-black/80 backdrop-blur-sm"
                        onClick={() => setCustomerPreviewProof("")}
                    />
                    <div className="relative z-10 max-w-md w-full rounded-2xl border border-[#E8D6CE] bg-white p-4 shadow-2xl">
                        <div className="flex items-center justify-between border-b border-[#EEE5DF] pb-2 mb-3">
                            <span className="text-sm font-bold text-[#2A2620]">Bukti Transfer Refund</span>
                            <button
                                type="button"
                                onClick={() => setCustomerPreviewProof("")}
                                className="text-xs text-[#8A7778] hover:text-[#2A2620] font-bold"
                            >
                                ✕ Tutup
                            </button>
                        </div>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={getImageUrl(customerPreviewProof)}
                            alt="Bukti Transfer Refund"
                            className="max-h-[70vh] w-full rounded-xl object-contain bg-stone-100"
                        />
                        <div className="mt-3 text-center">
                            <a
                                href={getImageUrl(customerPreviewProof)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-[#7A3545] underline font-semibold"
                            >
                                Buka gambar di tab baru ↗
                            </a>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Repeat Order Stock Adjustment Modal ── */}
            {repeatOrderModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div
                        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
                        onClick={() => setRepeatOrderModal(null)}
                    />
                    <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-[#E8D6CE] bg-white p-5 shadow-2xl">
                        <div className="flex items-center gap-2.5 border-b border-[#F0E6E1] pb-3">
                            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-lg">
                                ⚠️
                            </span>
                            <div>
                                <h3 className="text-sm font-bold text-[#2A2620]">
                                    Penyesuaian Stok Menu
                                </h3>
                                <p className="text-[11px] text-[#78686A]">
                                    Pesan Ulang #{repeatOrderModal.orderCode}
                                </p>
                            </div>
                        </div>

                        <p className="mt-3 text-xs text-[#524446] leading-relaxed">
                            Beberapa menu dari pesanan sebelumnya mengalami perubahan ketersediaan saat ini:
                        </p>

                        <div className="mt-3 max-h-60 overflow-y-auto space-y-2 pr-1">
                            {repeatOrderModal.itemsReport.map((it, idx) => (
                                <div
                                    key={idx}
                                    className={`flex items-start justify-between rounded-xl p-2.5 text-xs ${
                                        it.status === "out_of_stock"
                                            ? "border border-red-200 bg-red-50/80 text-red-900"
                                            : it.status === "partial"
                                            ? "border border-amber-200 bg-amber-50/80 text-amber-900"
                                            : "border border-emerald-100 bg-emerald-50/50 text-emerald-900"
                                    }`}
                                >
                                    <div className="min-w-0 pr-2">
                                        <p className="font-bold truncate">{it.name}</p>
                                        <p className="text-[11px] mt-0.5 opacity-90">
                                            {it.status === "out_of_stock" ? (
                                                <span className="text-red-700 font-semibold">❌ {it.reason}</span>
                                            ) : it.status === "partial" ? (
                                                <span className="text-amber-800 font-semibold">
                                                    ⚠️ {it.reason}
                                                </span>
                                            ) : (
                                                <span className="text-emerald-700 font-medium">
                                                    ✓ Tersedia lengkap ({it.availableQty} pcs)
                                                </span>
                                            )}
                                        </p>
                                    </div>
                                    <span className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-extrabold uppercase ${
                                        it.status === "out_of_stock"
                                            ? "bg-red-200 text-red-800"
                                            : it.status === "partial"
                                            ? "bg-amber-200 text-amber-900"
                                            : "bg-emerald-200 text-emerald-800"
                                    }`}>
                                        {it.status === "out_of_stock" ? "Habis" : `${it.availableQty}x`}
                                    </span>
                                </div>
                            ))}
                        </div>

                        {repeatOrderModal.availableCount > 0 ? (
                            <div className="mt-5 space-y-2">
                                <p className="text-[11px] text-[#78686A]">
                                    Menu yang tersedia akan dimasukkan ke keranjang belanja Anda dengan jumlah yang telah disesuaikan.
                                </p>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setRepeatOrderModal(null)}
                                        className="flex-1 rounded-xl border border-[#D5C2B8] py-2.5 text-xs font-bold text-[#78686A] hover:bg-[#FAF7F2] transition"
                                    >
                                        Batal
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleConfirmRepeatCheckout}
                                        className="flex-1 rounded-xl bg-[#7A3545] py-2.5 text-xs font-bold text-white shadow-md shadow-[#7A3545]/20 hover:bg-[#642835] transition"
                                    >
                                        Lanjutkan ({repeatOrderModal.availableCount} Menu) →
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="mt-5 space-y-3">
                                <div className="rounded-xl bg-red-100/70 p-3 text-center text-xs font-medium text-red-800">
                                    Mohon maaf, semua menu dari pesanan ini sedang tidak tersedia saat ini.
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setRepeatOrderModal(null)}
                                    className="w-full rounded-xl bg-[#7A3545] py-2.5 text-xs font-bold text-white transition"
                                >
                                    Tutup
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
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
