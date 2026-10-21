"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/lib/api";

const formatRupiah = (amount) =>
    new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0,
    }).format(amount);

// ─── payment method → Midtrans payment_method param ───────────────────────
const PAYMENT_METHOD_MAP = {
    qris: "other_qris",
    bank_transfer: "bank_transfer",
};

export default function CheckoutPage() {
    const router = useRouter();

    // ── cart ──────────────────────────────────────────────────────────────
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);

    // ── customer / auth ───────────────────────────────────────────────────
    const [customer, setCustomer] = useState(null);
    const [addresses, setAddresses] = useState([]);
    const [selectedAddressId, setSelectedAddressId] = useState("");
    const [profileLoading, setProfileLoading] = useState(true);
    const [profileError, setProfileError] = useState("");

    // ── form ──────────────────────────────────────────────────────────────
    const [notes, setNotes] = useState("");
    const [paymentMethod, setPaymentMethod] = useState("qris");
    const [fulfillmentMethod, setFulfillmentMethod] = useState("delivery");

    // ── checkout state ────────────────────────────────────────────────────
    const [submitting, setSubmitting] = useState(false);
    const [message, setMessage] = useState("");
    const [messageType, setMessageType] = useState("info"); // "info" | "error" | "success"

    // ── payment state ─────────────────────────────────────────────────────
    const [activeOrderId, setActiveOrderId] = useState(null);
    const [paymentStatus, setPaymentStatus] = useState("");
    const [snapToken, setSnapToken] = useState("");

    const selectedAddress = addresses.find(
        (a) => String(a.id) === String(selectedAddressId)
    );

    // ── Load cart from localStorage ───────────────────────────────────────
    useEffect(() => {
        const timer = setTimeout(() => {
            try {
                const savedCart = localStorage.getItem("ava_eats_checkout_cart");
                const parsedCart = savedCart ? JSON.parse(savedCart) : [];
                setItems(Array.isArray(parsedCart) ? parsedCart : []);
            } catch {
                setItems([]);
            } finally {
                setLoading(false);
            }
        }, 0);

        return () => clearTimeout(timer);
    }, []);

    // ── Load customer profile + addresses ─────────────────────────────────
    useEffect(() => {
        let cancelled = false;

        async function loadCustomerData() {
            try {
                setProfileLoading(true);
                setProfileError("");

                const profile = await apiRequest("/customers/me");
                if (cancelled) return;
                setCustomer(profile);

                const result = await apiRequest(
                    `/customers/${profile.id}/addresses`
                );
                if (cancelled) return;

                const customerAddresses = result.addresses || [];
                setAddresses(customerAddresses);

                // Auto-select default address
                const defaultAddress = customerAddresses.find((a) => a.is_default);
                if (defaultAddress) {
                    setSelectedAddressId(String(defaultAddress.id));
                } else if (customerAddresses.length > 0) {
                    setSelectedAddressId(String(customerAddresses[0].id));
                }
            } catch (error) {
                if (!cancelled) {
                    // If 401 / unauthenticated → redirect to login
                    const isAuthError =
                        error.status === 401 ||
                        /401|unauthorized|unauthenticated/i.test(error.message);

                    if (isAuthError) {
                        router.replace("/login?redirect=/checkout");
                        return;
                    }

                    setProfileError(
                        error.message || "Gagal mengambil data profil."
                    );
                }
            } finally {
                if (!cancelled) setProfileLoading(false);
            }
        }

        loadCustomerData();
        return () => { cancelled = true; };
    }, [router]);

    // ── Payment status polling (after order created) ──────────────────────
    useEffect(() => {
        if (!activeOrderId || ["approved", "expired", "rejected"].includes(paymentStatus)) return;

        let cancelled = false;
        let timer;

        async function poll() {
            try {
                const result = await apiRequest(
                    `/payments/orders/${activeOrderId}`
                );
                if (cancelled) return;

                const payments = Array.isArray(result)
                    ? result
                    : result.payments || [];

                if (payments.length > 0) {
                    const latest = [...payments].sort((a, b) => b.id - a.id)[0];
                    setPaymentStatus(latest.status);

                    if (latest.status === "approved") {
                        setMessage("🎉 Pembayaran berhasil! Pesananmu sedang diproses.");
                        setMessageType("success");
                        clearCheckoutCart();
                        return; // stop polling
                    }
                }
            } catch (err) {
                console.warn("Polling payment status failed:", err);
            }

            if (!cancelled) {
                timer = setTimeout(poll, 5000);
            }
        }

        // Start polling with a small initial delay
        timer = setTimeout(poll, 3000);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [activeOrderId, paymentStatus]);

    function clearCheckoutCart() {
        try {
            localStorage.removeItem("ava_eats_checkout_cart");
            localStorage.removeItem("ava_eats_checkout_draft");
            setItems([]);
            if (typeof window !== "undefined") {
                window.dispatchEvent(new Event("ava_eats_cart_updated"));
                window.dispatchEvent(new Event("storage"));
            }
        } catch {
            setItems([]);
        }
    }

    // ── Open Midtrans Snap popup ──────────────────────────────────────────
    function openSnapPopup(token, orderId) {
        if (!window.snap) {
            // Snap.js not yet loaded; fall back to URL redirect
            setMessage("Halaman pembayaran siap. Klik tombol untuk melanjutkan.");
            setMessageType("info");
            return;
        }

        window.snap.pay(token, {
            onSuccess: () => {
                setPaymentStatus("approved");
                clearCheckoutCart();
                router.push(`/orders?success=1`);
            },
            onPending: () => {
                setPaymentStatus("pending");
                clearCheckoutCart();
                router.push(`/orders`);
            },
            onError: (result) => {
                setPaymentStatus("rejected");
                clearCheckoutCart();
                router.push(`/orders`);
            },
            onClose: () => {
                clearCheckoutCart();
                router.push(`/orders`);
            },
        });
    }

    // ── Submit checkout ───────────────────────────────────────────────────
    async function handleSubmit(event) {
        event.preventDefault();
        setMessage("");

        if (!items.length) {
            setMessage("Keranjang belanja masih kosong.");
            setMessageType("error");
            return;
        }

        if (!customer) {
            router.push("/login?redirect=/checkout");
            return;
        }

        if (fulfillmentMethod === "delivery" && !selectedAddress) {
            setMessage("Pilih alamat pengiriman terlebih dahulu.");
            setMessageType("error");
            return;
        }

        try {
            setSubmitting(true);
            setMessage("Membuat pesanan...");
            setMessageType("info");

            // ── Step 1: Create order ──────────────────────────────────────
            const orderResult = await apiRequest("/orders", {
                method: "POST",
                body: JSON.stringify({
                    fulfillment_method: fulfillmentMethod,
                    address_id:
                        fulfillmentMethod === "delivery" ? selectedAddress.id : null,
                    items: items.map((item) => ({
                        product_id: item.product_id,
                        quantity: item.quantity,
                    })),
                    notes: notes.trim() || null,
                    payment_method: paymentMethod,
                }),
            });

            const order = orderResult.order ?? orderResult;

            if (!order?.id) {
                throw new Error(
                    "Pesanan berhasil dikirim, tetapi ID order tidak ditemukan."
                );
            }

            setActiveOrderId(order.id);

            // Bersihkan keranjang belanja seketika agar tidak terjadi double order
            clearCheckoutCart();

            // ── Step 2: Create Midtrans gateway transaction ───────────────
            setMessage("Menyiapkan pembayaran...");

            const paymentResult = await apiRequest(
                `/payments/orders/${order.id}/gateway`,
                {
                    method: "POST",
                    body: JSON.stringify({
                        payment_method: PAYMENT_METHOD_MAP[paymentMethod] ?? "other_qris",
                    }),
                }
            );

            const token = paymentResult.gateway_token || paymentResult.snap_token;
            const paymentUrl = paymentResult.payment_url || "";

            setPaymentStatus(paymentResult.status || "pending");

            // Store token for re-opening popup after close
            if (token) {
                setSnapToken(token);
                localStorage.setItem("ava_eats_created_order", JSON.stringify(order));
                setMessage("");
                openSnapPopup(token, order.id);
            } else if (paymentUrl) {
                // Fallback: buka tab baru dan arahkan halaman ini ke /orders
                window.open(paymentUrl, "_blank", "noopener,noreferrer");
                router.push("/orders");
            } else {
                throw new Error("Link/token pembayaran tidak ditemukan dari server.");
            }
        } catch (error) {
            setMessage(
                error.message || "Terjadi kesalahan saat membuat pesanan."
            );
            setMessageType("error");
        } finally {
            setSubmitting(false);
        }
    }

    function handleClearCart() {
        clearCheckoutCart();
        router.push("/");
    }

    // ── Derived ───────────────────────────────────────────────────────────
    const totalItems = useMemo(
        () => items.reduce((sum, item) => sum + item.quantity, 0),
        [items]
    );

    const totalPrice = useMemo(
        () => items.reduce((sum, item) => sum + item.price * item.quantity, 0),
        [items]
    );

    const isPaymentFinal = ["approved", "expired", "rejected"].includes(paymentStatus);
    const isOrderCreated = Boolean(activeOrderId);

    // ── Message color ─────────────────────────────────────────────────────
    const messageClass =
        messageType === "error"
            ? "rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
            : messageType === "success"
                ? "rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-700"
                : "rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800";

    // ─────────────────────────────────────────────────────────────────────
    if (loading) {
        return (
            <main className="checkout-page">
                <p className="checkout-loading">Memuat keranjang...</p>
            </main>
        );
    }

    return (
        <main className="checkout-page">
            <header className="checkout-header">
                <Link href="/" className="back-link">
                    ← Kembali ke menu
                </Link>

                <div className="checkout-brand">
                    <div className="checkout-logo">A</div>
                    <div>
                        <p className="eyebrow">AVA EATS</p>
                        <h1>Checkout</h1>
                    </div>
                </div>

                <p className="checkout-intro">
                    Satu langkah lagi menuju makanan favoritmu.
                </p>
            </header>

            {items.length === 0 ? (
                <section className="checkout-empty">
                    <span>🛒</span>
                    <h2>Keranjangmu masih kosong</h2>
                    <p>Yuk, pilih menu yang Moms suka terlebih dahulu.</p>
                    <Link href="/" className="checkout-primary-link">
                        Pilih Menu
                    </Link>
                </section>
            ) : (
                <form className="checkout-content" onSubmit={handleSubmit}>

                    {/* ── Step 1: Metode Penerimaan ── */}
                    <section className="checkout-card">
                        <div className="checkout-section-title">
                            <span className="step-number">1</span>
                            <div>
                                <h2>Metode Penerimaan</h2>
                                <p>Pilih bagaimana Moms ingin menerima pesanan.</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <button
                                type="button"
                                onClick={() => setFulfillmentMethod("delivery")}
                                className={`rounded-xl border p-4 text-left transition ${fulfillmentMethod === "delivery"
                                    ? "border-[#7A2E3A] bg-[#F3E1DE]/40"
                                    : "border-[#E8D6CE] bg-white"
                                    }`}
                            >
                                <span className="mb-3 block text-2xl">🛵</span>
                                <strong className="block text-sm text-[#2A2620]">
                                    Dikirim
                                </strong>
                                <span className="mt-1 block text-xs text-[#6B6459]">
                                    Ke alamatmu
                                </span>
                            </button>

                            <button
                                type="button"
                                onClick={() => setFulfillmentMethod("pickup")}
                                className={`rounded-xl border p-4 text-left transition ${fulfillmentMethod === "pickup"
                                    ? "border-[#6E8F63] bg-[#E4EBDD]/50"
                                    : "border-[#E8D6CE] bg-white"
                                    }`}
                            >
                                <span className="mb-3 block text-2xl">🏪</span>
                                <strong className="block text-sm text-[#2A2620]">
                                    Ambil Sendiri
                                </strong>
                                <span className="mt-1 block text-xs text-[#6B6459]">
                                    Pickup di lokasi
                                </span>
                            </button>
                        </div>

                        {fulfillmentMethod === "pickup" && (
                            <div className="mt-4 rounded-xl border border-[#D5E2CF] bg-[#E4EBDD]/50 p-4">
                                <div className="flex items-start gap-3">
                                    <span className="text-2xl">📍</span>

                                    <div className="min-w-0 flex-1">
                                        <p className="font-bold text-[#2A2620]">
                                            {process.env.NEXT_PUBLIC_STORE_NAME || "Ava Eats"}
                                        </p>

                                        <p className="mt-2 text-sm leading-6 text-[#496442]">
                                            {process.env.NEXT_PUBLIC_STORE_ADDRESS ||
                                                "Cluster The Awa, Blok B1 No 27, Ciriung, Kec. Cibinong, Kabupaten Bogor, Jawa Barat"}
                                            {", "}
                                            {process.env.NEXT_PUBLIC_STORE_POSTAL_CODE || "16918"}
                                        </p>

                                        <p className="mt-3 text-sm text-[#496442]">
                                            📞{" "}
                                            {process.env.NEXT_PUBLIC_STORE_PHONE || "082213232456"}
                                        </p>

                                        <a
                                            href={`https://www.google.com/maps/dir/?api=1&destination=${process.env.NEXT_PUBLIC_STORE_LATITUDE || "-6.459818049304167"},${process.env.NEXT_PUBLIC_STORE_LONGITUDE || "106.87384403716149"}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#6E8F63] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#58764F]"
                                        >
                                            Buka Google Maps ↗
                                        </a>
                                    </div>
                                </div>

                                <div className="mt-4 rounded-lg bg-white/80 p-3 text-sm text-[#496442]">
                                    Pesanan pickup tidak dikenakan ongkos kirim.
                                    Informasi waktu pengambilan akan dikonfirmasi setelah
                                    pesanan diproses.
                                </div>
                            </div>
                        )}
                    </section>

                    {/* ── Delivery: Data Penerima & Alamat ── */}
                    {fulfillmentMethod === "delivery" && (
                        <section className="rounded-2xl border border-[#E8D6CE] bg-white p-5">
                            <h2 className="text-lg font-bold text-[#2A2620]">
                                Data Penerima
                            </h2>

                            {profileLoading ? (
                                <p className="mt-3 text-sm text-[#6B6459]">
                                    Memuat profil dan alamat...
                                </p>
                            ) : profileError ? (
                                <div className="mt-3 space-y-3">
                                    <p className="text-sm text-red-600">{profileError}</p>

                                    <button
                                        type="button"
                                        onClick={() => router.push("/login?redirect=/checkout")}
                                        className="rounded-xl bg-[#7A2E3A] px-4 py-2 text-sm font-semibold text-white"
                                    >
                                        Login kembali
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <div className="mt-3 space-y-1 text-sm">
                                        <p className="font-semibold text-[#2A2620]">
                                            {customer?.name}
                                        </p>
                                        <p className="text-[#6B6459]">{customer?.phone}</p>
                                    </div>

                                    <div className="mt-5">
                                        <h3 className="mb-3 font-semibold text-[#2A2620]">
                                            Pilih Alamat Pengiriman
                                        </h3>

                                        {addresses.length === 0 ? (
                                            <div className="space-y-3">
                                                <p className="text-sm text-[#6B6459]">
                                                    Belum ada alamat tersimpan. Tambahkan alamat terlebih dahulu
                                                    sebelum melanjutkan checkout.
                                                </p>

                                                <button
                                                    type="button"
                                                    onClick={() => router.push("/addresses/new")}
                                                    className="rounded-xl bg-[#7A2E3A] px-4 py-3 text-sm font-semibold text-white"
                                                >
                                                    + Tambah Alamat
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="space-y-3">
                                                {addresses.map((addr) => (
                                                    <label
                                                        key={addr.id}
                                                        className={`block cursor-pointer rounded-xl border p-4 ${String(selectedAddressId) === String(addr.id)
                                                            ? "border-[#7A2E3A] bg-[#F3E1DE]/40"
                                                            : "border-[#E8D6CE]"
                                                            }`}
                                                    >
                                                        <div className="flex items-start gap-3">
                                                            <input
                                                                type="radio"
                                                                name="shipping_address"
                                                                value={addr.id}
                                                                checked={
                                                                    String(selectedAddressId) === String(addr.id)
                                                                }
                                                                onChange={() =>
                                                                    setSelectedAddressId(String(addr.id))
                                                                }
                                                                className="mt-1 accent-[#7A2E3A]"
                                                            />

                                                            <div className="min-w-0 text-sm">
                                                                <div className="flex flex-wrap items-center gap-2">
                                                                    <span className="font-semibold text-[#2A2620]">
                                                                        {addr.label || "Alamat"}
                                                                    </span>

                                                                    {addr.is_default && (
                                                                        <span className="rounded-full bg-[#6E8F63]/15 px-2 py-1 text-xs text-[#496442]">
                                                                            Alamat utama
                                                                        </span>
                                                                    )}
                                                                </div>

                                                                <p className="mt-2 font-medium text-[#2A2620]">
                                                                    {addr.recipient_name}
                                                                </p>
                                                                <p className="text-[#6B6459]">{addr.phone}</p>

                                                                <p className="mt-1 leading-5 text-[#6B6459]">
                                                                    {addr.address}
                                                                    {addr.district ? `, ${addr.district}` : ""}
                                                                    {addr.city ? `, ${addr.city}` : ""}
                                                                    {addr.province ? `, ${addr.province}` : ""}
                                                                    {addr.postal_code ? ` ${addr.postal_code}` : ""}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </label>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}
                        </section>
                    )}

                    {/* ── Step 2: Metode Pembayaran ── */}
                    <section className="checkout-card">
                        <div className="checkout-section-title">
                            <span className="step-number">2</span>
                            <div>
                                <h2>Metode Pembayaran</h2>
                                <p>Pilih metode yang akan Moms gunakan.</p>
                            </div>
                        </div>

                        <label
                            className={`payment-option ${paymentMethod === "qris" ? "selected" : ""}`}
                        >
                            <input
                                type="radio"
                                name="payment"
                                value="qris"
                                checked={paymentMethod === "qris"}
                                onChange={(e) => setPaymentMethod(e.target.value)}
                            />
                            <span className="payment-icon">▦</span>
                            <span className="payment-copy">
                                <strong>QRIS</strong>
                                <small>Scan kode QR untuk membayar</small>
                            </span>
                            <span className="payment-check">
                                {paymentMethod === "qris" ? "✓" : ""}
                            </span>
                        </label>

                        <label
                            className={`payment-option ${paymentMethod === "bank_transfer" ? "selected" : ""}`}
                        >
                            <input
                                type="radio"
                                name="payment"
                                value="bank_transfer"
                                checked={paymentMethod === "bank_transfer"}
                                onChange={(e) => setPaymentMethod(e.target.value)}
                            />
                            <span className="payment-icon">▤</span>
                            <span className="payment-copy">
                                <strong>Transfer Bank</strong>
                                <small>Transfer ke rekening yang tersedia</small>
                            </span>
                            <span className="payment-check">
                                {paymentMethod === "bank_transfer" ? "✓" : ""}
                            </span>
                        </label>
                    </section>

                    {/* ── Step 3: Catatan & Ringkasan Pesanan ── */}
                    <section className="checkout-card">
                        <div className="checkout-section-title flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <span className="step-number">3</span>
                                <div>
                                    <h2>Ringkasan Pesanan</h2>
                                    <p>Periksa menu dan jumlah pesananmu.</p>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={handleClearCart}
                                className="text-xs font-semibold text-[#7A2E3A] hover:underline"
                            >
                                Kosongkan
                            </button>
                        </div>

                        <div className="checkout-item-list">
                            {items.map((item) => (
                                <div
                                    className="checkout-item"
                                    key={item.product_id}
                                >
                                    <div className="checkout-item-info">
                                        <strong>{item.name}</strong>
                                        <span>
                                            {item.quantity} × {formatRupiah(item.price)}
                                        </span>
                                    </div>
                                    <strong>
                                        {formatRupiah(item.price * item.quantity)}
                                    </strong>
                                </div>
                            ))}
                        </div>

                        {/* Catatan pesanan */}
                        <div className="mt-4">
                            <label
                                htmlFor="order-notes"
                                className="mb-2 block text-sm font-medium text-[#2A2620]"
                            >
                                Catatan (opsional)
                            </label>
                            <textarea
                                id="order-notes"
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                rows={2}
                                placeholder="Contoh: Tidak pakai bawang, extra sambal..."
                                className="w-full rounded-xl border border-[#E8D6CE] bg-white px-4 py-3 text-sm text-[#2A2620] outline-none focus:border-[#7A2E3A] focus:ring-1 focus:ring-[#7A2E3A]"
                            />
                        </div>

                        <div className="checkout-total-row">
                            <span>Total item</span>
                            <strong>{totalItems} item</strong>
                        </div>

                        <div className="checkout-total-row grand-total">
                            <span>Total sementara</span>
                            <strong>{formatRupiah(totalPrice)}</strong>
                        </div>

                        <p className="checkout-footnote">
                            Ongkir belum termasuk dan akan dihitung saat pengiriman.
                        </p>
                    </section>

                    {/* ── Status messages ── */}
                    {message && (
                        <div className={messageClass} role="status">
                            {message}
                        </div>
                    )}

                    {/* ── Payment status banners ── */}
                    {paymentStatus === "approved" && (
                        <div className="rounded-xl border border-green-200 bg-green-50 p-4">
                            <p className="font-semibold text-green-800">
                                🎉 Pembayaran Berhasil!
                            </p>
                            <p className="mt-1 text-sm text-green-700">
                                Pesananmu sedang diproses. Terima kasih Moms! 💚
                            </p>
                            <button
                                type="button"
                                onClick={() => router.push("/orders")}
                                className="mt-3 inline-flex rounded-xl bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800"
                            >
                                Lihat Pesanan →
                            </button>
                        </div>
                    )}

                    {paymentStatus === "pending" && isOrderCreated && !message && (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                            <p className="font-semibold text-amber-800">
                                Menunggu Pembayaran
                            </p>
                            <p className="mt-1 text-sm text-amber-700">
                                Popup pembayaran telah dibuka. Selesaikan pembayaranmu di sana.
                            </p>
                        </div>
                    )}

                    {paymentStatus === "expired" && (
                        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                            <p className="font-semibold text-red-800">
                                Pembayaran Sudah Kedaluwarsa
                            </p>
                            <p className="mt-1 text-sm text-red-700">
                                Waktu pembayaran habis. Silahkan cek di halaman Riwayat Pesanan.
                            </p>
                        </div>
                    )}

                    {paymentStatus === "rejected" && (
                        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                            <p className="font-semibold text-red-800">
                                Pembayaran Gagal
                            </p>
                            <p className="mt-1 text-sm text-red-700">
                                Pembayaran tidak berhasil. Coba lagi atau pilih metode lain.
                            </p>
                        </div>
                    )}

                    {/* ── Re-open Snap popup (after user closes it) ── */}
                    {snapToken && paymentStatus === "pending" && (
                        <button
                            type="button"
                            onClick={() => openSnapPopup(snapToken, activeOrderId)}
                            className="block w-full rounded-full bg-[#702D3D] px-6 py-4 text-center font-semibold text-white transition hover:bg-[#5A2332]"
                        >
                            Lanjutkan Pembayaran →
                        </button>
                    )}

                    {/* ── Submit button ── */}
                    {!isOrderCreated && (
                        <button
                            type="submit"
                            disabled={submitting || profileLoading}
                            className="checkout-submit disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {submitting
                                ? "Memproses..."
                                : "Pesan & Bayar Sekarang →"}
                        </button>
                    )}

                    <p className="checkout-secure-note">
                        🔒 Transaksimu diproses dengan aman melalui Midtrans.
                    </p>
                </form>
            )}
        </main>
    );
}
