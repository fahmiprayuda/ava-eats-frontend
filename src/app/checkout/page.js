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
    const [notifyWhatsapp, setNotifyWhatsapp] = useState(true);
    const [extraPackaging, setExtraPackaging] = useState(true);

    // ── promo / voucher state ─────────────────────────────────────────────
    const [promoInput, setPromoInput] = useState("");
    const [appliedPromo, setAppliedPromo] = useState(null);
    const [promoLoading, setPromoLoading] = useState(false);
    const [promoError, setPromoError] = useState("");
    const [availablePromos, setAvailablePromos] = useState([]);

    // Load available active promos for suggestion
    useEffect(() => {
        let isMounted = true;
        apiRequest("/promos/active")
            .then((res) => {
                if (isMounted) {
                    setAvailablePromos(Array.isArray(res) ? res : res?.promos || []);
                }
            })
            .catch(() => {
                if (isMounted) setAvailablePromos([]);
            });
        return () => {
            isMounted = false;
        };
    }, []);

    // ── shipping / courier state ──────────────────────────────────────────
    const [shippingRates, setShippingRates] = useState([]);
    const [shippingLoading, setShippingLoading] = useState(false);
    const [shippingError, setShippingError] = useState("");
    const [selectedCourierKey, setSelectedCourierKey] = useState("");

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

    // ── Fetch shipping rates when delivery & address selected ─────────────
    useEffect(() => {
        if (
            fulfillmentMethod !== "delivery" ||
            !selectedAddressId ||
            items.length === 0
        ) {
            const timer = setTimeout(() => {
                setShippingRates([]);
                setSelectedCourierKey("");
                setShippingError("");
            }, 0);
            return () => clearTimeout(timer);
        }

        let cancelled = false;

        async function fetchShippingRates() {
            try {
                setShippingLoading(true);
                setShippingError("");

                const result = await apiRequest("/shipping/rates", {
                    method: "POST",
                    body: JSON.stringify({
                        address_id: Number(selectedAddressId),
                        items: items.map((it) => ({
                            product_id: it.product_id,
                            quantity: it.quantity,
                        })),
                    }),
                });

                if (cancelled) return;

                const rates = result.pricing || [];
                setShippingRates(rates);

                if (rates.length > 0) {
                    setSelectedCourierKey((prev) => {
                        const exists = rates.some(
                            (r) => `${r.courier_code}:${r.courier_service_code}` === prev
                        );
                        if (exists) return prev;
                        return `${rates[0].courier_code}:${rates[0].courier_service_code}`;
                    });
                } else {
                    setSelectedCourierKey("");
                    setShippingError("Tidak ada layanan kurir yang tersedia untuk alamat ini.");
                }
            } catch (err) {
                if (!cancelled) {
                    setShippingError(err.message || "Gagal memuat pilihan kurir.");
                    setShippingRates([]);
                    setSelectedCourierKey("");
                }
            } finally {
                if (!cancelled) setShippingLoading(false);
            }
        }

        fetchShippingRates();

        return () => {
            cancelled = true;
        };
    }, [fulfillmentMethod, selectedAddressId, items]);

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

        if (fulfillmentMethod === "delivery") {
            if (!selectedAddress) {
                setMessage("Pilih alamat pengiriman terlebih dahulu.");
                setMessageType("error");
                return;
            }
            if (shippingLoading) {
                setMessage("Sedang menghitung tarif pengiriman. Harap tunggu sebentar.");
                setMessageType("info");
                return;
            }
            if (!selectedRate) {
                setMessage("Pilih layanan kurir pengiriman terlebih dahulu.");
                setMessageType("error");
                return;
            }
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
                    courier_code:
                        fulfillmentMethod === "delivery" && selectedRate
                            ? selectedRate.courier_code
                            : null,
                    service_code:
                        fulfillmentMethod === "delivery" && selectedRate
                            ? selectedRate.courier_service_code
                            : null,
                    shipping_cost: shippingCost,
                    packaging_fee: packagingFee,
                    promo_code: (appliedPromo && isPromoValidForOrder) ? appliedPromo.code : null,
                    notify_whatsapp: notifyWhatsapp,
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

    // ── Promo Code Actions ────────────────────────────────────────────────
    async function handleApplyPromo(customCode) {
        const code = (customCode || promoInput).trim().toUpperCase();
        if (!code) {
            setPromoError("Masukkan kode promo terlebih dahulu.");
            return;
        }

        try {
            setPromoLoading(true);
            setPromoError("");
            const res = await apiRequest("/promos/validate", {
                method: "POST",
                body: JSON.stringify({
                    code,
                    order_amount: totalPrice,
                    shipping_cost: shippingCost,
                }),
            });

            if (res.valid) {
                const promoData = res.promo || res;
                setAppliedPromo({
                    ...promoData,
                    code: promoData.code || res.promo_code,
                    name: promoData.name || res.name || res.description,
                    discount_type: promoData.discount_type || res.discount_type,
                    discount_value: promoData.discount_value || res.discount_value,
                    max_discount: promoData.max_discount || res.max_discount,
                    min_order_amount: promoData.min_order_amount || res.min_order_amount,
                });
                setPromoInput(promoData.code || res.promo_code);
            } else {
                setPromoError(res.message || "Kode promo tidak valid.");
            }
        } catch (err) {
            setPromoError(err.message || "Gagal menerapkan promo.");
        } finally {
            setPromoLoading(false);
        }
    }

    function handleRemovePromo() {
        setAppliedPromo(null);
        setPromoError("");
        setPromoInput("");
    }

    // ── Derived ───────────────────────────────────────────────────────────
    const selectedRate = useMemo(() => {
        if (!selectedCourierKey) return null;
        return (
            shippingRates.find(
                (r) =>
                    `${r.courier_code}:${r.courier_service_code}` ===
                    selectedCourierKey
            ) || null
        );
    }, [shippingRates, selectedCourierKey]);

    const shippingCost = useMemo(() => {
        if (fulfillmentMethod !== "delivery" || !selectedRate) return 0;
        return Number(selectedRate.price) || 0;
    }, [fulfillmentMethod, selectedRate]);

    const isPaxel = Boolean(
        fulfillmentMethod === "delivery" &&
        selectedRate &&
        (selectedRate.courier_code?.toLowerCase() === "paxel" ||
            selectedRate.courier_name?.toLowerCase().includes("paxel"))
    );

    const totalItems = useMemo(
        () => items.reduce((sum, item) => sum + item.quantity, 0),
        [items]
    );

    const totalPrice = useMemo(
        () => items.reduce((sum, item) => sum + item.price * item.quantity, 0),
        [items]
    );

    const isPromoValidForOrder = Boolean(
        appliedPromo && (!appliedPromo.min_order_amount || totalPrice >= appliedPromo.min_order_amount)
    );

    const isPackagingActive = isPaxel || extraPackaging;
    const packagingFee = isPackagingActive ? 2000 : 0;

    const discountAmount = useMemo(() => {
        if (!appliedPromo || !isPromoValidForOrder) return 0;
        let disc = 0;
        if (appliedPromo.discount_type === "percentage") {
            disc = Math.round((totalPrice * Number(appliedPromo.discount_value)) / 100);
            if (appliedPromo.max_discount && disc > Number(appliedPromo.max_discount)) {
                disc = Number(appliedPromo.max_discount);
            }
            disc = Math.min(disc, totalPrice);
        } else if (appliedPromo.discount_type === "fixed_amount") {
            disc = Math.min(Number(appliedPromo.discount_value), totalPrice);
        } else if (appliedPromo.discount_type === "shipping_discount") {
            disc = Math.min(Number(appliedPromo.discount_value), shippingCost);
        }
        return Math.max(0, disc);
    }, [appliedPromo, isPromoValidForOrder, totalPrice, shippingCost]);

    const grandTotal = useMemo(
        () => Math.max(0, totalPrice + shippingCost + packagingFee - discountAmount),
        [totalPrice, shippingCost, packagingFee, discountAmount]
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
                    <div className="checkout-logo">
                        <img src="/logo.png" alt="Ava Eats Logo" />
                    </div>
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
                                        <div className="mb-3 flex items-center justify-between">
                                            <h3 className="font-semibold text-[#2A2620]">
                                                Pilih Alamat Pengiriman
                                            </h3>
                                            <button
                                                type="button"
                                                onClick={() => router.push("/addresses?redirect=/checkout")}
                                                className="text-xs font-semibold text-[#7A2E3A] hover:underline"
                                            >
                                                + Tambah / Kelola Alamat
                                            </button>
                                        </div>

                                        {addresses.length === 0 ? (
                                            <div className="space-y-3">
                                                <p className="text-sm text-[#6B6459]">
                                                    Belum ada alamat tersimpan. Tambahkan alamat terlebih dahulu
                                                    sebelum melanjutkan checkout.
                                                </p>

                                                <button
                                                    type="button"
                                                    onClick={() => router.push("/addresses?action=new&redirect=/checkout")}
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

                                        {/* ── Pilihan Kurir & Ongkir ── */}
                                        <div className="mt-6 border-t border-[#E8D6CE] pt-5">
                                            <div className="mb-3 flex items-center justify-between">
                                                <h3 className="font-semibold text-[#2A2620]">
                                                    Pilih Layanan Pengiriman
                                                </h3>
                                                {selectedRate && (
                                                    <span className="rounded-full bg-[#E4EBDD] px-2.5 py-0.5 text-xs font-semibold text-[#496442]">
                                                        Ongkir: {formatRupiah(selectedRate.price)}
                                                    </span>
                                                )}
                                            </div>

                                            {shippingLoading ? (
                                                <div className="rounded-xl border border-[#E8D6CE] bg-[#FAF7F2] p-5 text-center">
                                                    <div className="mx-auto mb-2 h-5 w-5 animate-spin rounded-full border-2 border-[#7A2E3A] border-t-transparent" />
                                                    <p className="text-sm font-medium text-[#2A2620]">
                                                        Menghitung tarif ongkos kirim...
                                                    </p>
                                                    <p className="mt-0.5 text-xs text-[#78686A]">
                                                        Mengambil data kurir (Paxel, Gojek, Grab, Lalamove)
                                                    </p>
                                                </div>
                                            ) : shippingError ? (
                                                <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                                                    <p className="text-sm font-medium text-red-700">{shippingError}</p>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setSelectedCourierKey("");
                                                            setShippingLoading(true);
                                                            setShippingError("");
                                                            apiRequest("/shipping/rates", {
                                                                method: "POST",
                                                                body: JSON.stringify({
                                                                    address_id: Number(selectedAddressId),
                                                                    items: items.map((it) => ({
                                                                        product_id: it.product_id,
                                                                        quantity: it.quantity,
                                                                    })),
                                                                }),
                                                            })
                                                                .then((res) => {
                                                                    const rates = res.pricing || [];
                                                                    setShippingRates(rates);
                                                                    if (rates.length > 0) {
                                                                        setSelectedCourierKey(
                                                                            `${rates[0].courier_code}:${rates[0].courier_service_code}`
                                                                        );
                                                                    }
                                                                })
                                                                .catch((e) => setShippingError(e.message || "Gagal memuat tarif kurir."))
                                                                .finally(() => setShippingLoading(false));
                                                        }}
                                                        className="mt-2 text-xs font-semibold text-[#7A2E3A] underline"
                                                    >
                                                        Coba lagi
                                                    </button>
                                                </div>
                                            ) : shippingRates.length === 0 ? (
                                                <p className="text-sm text-[#78686A]">
                                                    Pilih alamat pengiriman terlebih dahulu untuk melihat opsi kurir.
                                                </p>
                                            ) : (
                                                <div className="space-y-2.5">
                                                    {shippingRates.map((rate) => {
                                                        const key = `${rate.courier_code}:${rate.courier_service_code}`;
                                                        const isSelected = selectedCourierKey === key;
                                                        return (
                                                            <label
                                                                key={key}
                                                                className={`flex cursor-pointer items-center justify-between rounded-xl border p-3.5 transition ${isSelected
                                                                    ? "border-[#7A2E3A] bg-[#F3E1DE]/40 shadow-sm"
                                                                    : "border-[#E8D6CE] bg-white hover:bg-[#FAF7F2]"
                                                                    }`}
                                                            >
                                                                <div className="flex min-w-0 items-center gap-3">
                                                                    <input
                                                                        type="radio"
                                                                        name="courier_option"
                                                                        value={key}
                                                                        checked={isSelected}
                                                                        onChange={() => setSelectedCourierKey(key)}
                                                                        className="h-4 w-4 accent-[#7A2E3A]"
                                                                    />
                                                                    <div className="min-w-0">
                                                                        <div className="flex items-center gap-2">
                                                                            <strong className="text-sm font-semibold text-[#2A2620]">
                                                                                {rate.courier_name}
                                                                            </strong>
                                                                            <span className="rounded bg-[#EAE2DC] px-2 py-0.5 text-xs font-medium text-[#5A4E4D]">
                                                                                {rate.courier_service_name}
                                                                            </span>
                                                                        </div>
                                                                        <p className="mt-0.5 truncate text-xs text-[#78686A]">
                                                                            {rate.description || `Estimasi tiba: ${rate.duration || "1-2 hari"}`}
                                                                        </p>
                                                                    </div>
                                                                </div>

                                                                <div className="shrink-0 pl-3 text-right">
                                                                    <strong className="text-sm font-bold text-[#7A2E3A]">
                                                                        {formatRupiah(rate.price)}
                                                                    </strong>
                                                                    {rate.duration && (
                                                                        <span className="block text-[11px] text-[#A08E8B]">
                                                                            {rate.duration}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </label>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
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
                            <span className="payment-icon">📱</span>
                            <span className="payment-copy">
                                <strong>QRIS & E-Wallet</strong>
                                <small>Scan QR via BCA, Livin, GoPay, ShopeePay, OVO dll</small>
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
                            <span className="payment-icon">🏦</span>
                            <span className="payment-copy">
                                <strong>Transfer Bank (Virtual Account)</strong>
                                <small>BCA, Mandiri Bill, BNI, BRI, Permata (Otomatis & Real-time via m-Banking)</small>
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

                        {/* Extra Packaging Checklist Toggle */}
                        <div className={`mt-4 rounded-2xl border p-3.5 sm:p-4 transition ${isPaxel
                            ? "border-amber-200 bg-amber-50/70 shadow-xs"
                            : isPackagingActive
                                ? "border-[#E8D6CE] bg-white shadow-xs"
                                : "border-[#EFE5E0] bg-[#FAF7F2]"
                            }`}>
                            <label className={`flex items-start gap-3 select-none ${isPaxel ? "cursor-default" : "cursor-pointer"}`}>
                                <input
                                    type="checkbox"
                                    checked={isPackagingActive}
                                    disabled={isPaxel}
                                    onChange={(e) => {
                                        if (!isPaxel) setExtraPackaging(e.target.checked);
                                    }}
                                    className="mt-0.5 h-4 w-4 rounded border-[#7A3545]/40 text-[#7A3545] focus:ring-[#7A3545] cursor-pointer accent-[#7A3545] disabled:cursor-not-allowed disabled:opacity-80"
                                />
                                <div className="text-xs flex-1">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="font-bold text-[#2A2620] flex items-center gap-1.5 flex-wrap">
                                            <span>❄️</span> Extra Packaging (Bag Thermal + Ice Gel)
                                            {isPaxel && (
                                                <span className="rounded-full bg-amber-200/90 px-2 py-0.5 text-[10px] font-extrabold text-amber-900">
                                                    Wajib untuk Paxel
                                                </span>
                                            )}
                                        </span>
                                        <span className="font-bold text-[#7A3545] text-xs">
                                            +Rp 2.000
                                        </span>
                                    </div>
                                    <p className="mt-1 text-[#665759] leading-relaxed text-[11px]">
                                        {isPaxel
                                            ? "Pengiriman Paxel wajib menggunakan extra packaging thermal & ice gel beku demi menjaga mutu frozen food tetap beku optimal selama perjalanan ekspedisi."
                                            : "Tambahkan tas pendingin thermal & ice gel beku agar kualitas makanan tetap segar, beku, dan higienis selama perjalanan kurir ke rumah Moms."}
                                    </p>
                                </div>
                            </label>
                        </div>

                        {/* WhatsApp Notification Opt-In Toggle */}
                        <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3.5 sm:p-4 transition">
                            <label className="flex items-start gap-3 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={notifyWhatsapp}
                                    onChange={(e) => setNotifyWhatsapp(e.target.checked)}
                                    className="mt-0.5 h-4 w-4 rounded border-emerald-400 text-emerald-600 focus:ring-emerald-500 cursor-pointer accent-emerald-600"
                                />
                                <div className="text-xs">
                                    <span className="font-bold text-emerald-950 flex items-center gap-1.5">
                                        <span>📲</span> Kirim update pesanan via WhatsApp
                                    </span>
                                    <p className="mt-1 text-emerald-800/90 leading-relaxed text-[11px]">
                                        Dapatkan notifikasi otomatis saat paket di-pickup kurir (lengkap dengan link lacak real-time) atau saat pesanan siap diambil di outlet. (Hilangkan centang jika tidak ingin menerima pesan).
                                    </p>
                                </div>
                            </label>
                        </div>

                        {/* ── Promo Code / Voucher Card ── */}
                        <div className="mt-4 rounded-2xl border border-[#E8D6CE] bg-[#FAF7F2] p-3.5 sm:p-4 transition">
                            <div className="flex items-center gap-2 mb-2.5">
                                <span className="text-base">🎟️</span>
                                <h3 className="text-xs font-bold uppercase tracking-wider text-[#7A2E3A]">Kupon & Kode Promo</h3>
                            </div>

                            {appliedPromo ? (
                                <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-300 bg-emerald-50/90 p-3">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="rounded bg-emerald-600 px-2 py-0.5 text-xs font-black uppercase text-white tracking-wide">
                                                {appliedPromo.code}
                                            </span>
                                            <strong className="text-xs text-emerald-950 font-bold truncate">
                                                {appliedPromo.name || "Promo Aktif"}
                                            </strong>
                                        </div>
                                        {isPromoValidForOrder ? (
                                            <p className="mt-1 text-[11px] text-emerald-800">
                                                Hemat <span className="font-bold">{formatRupiah(discountAmount)}</span> untuk pesanan ini!
                                            </p>
                                        ) : (
                                            <p className="mt-1 text-[11px] text-amber-700 font-semibold">
                                                ⚠️ Belanja minimal {formatRupiah(appliedPromo.min_order_amount)} untuk mengaktifkan promo ini.
                                            </p>
                                        )}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleRemovePromo}
                                        className="shrink-0 text-xs font-semibold text-red-600 hover:text-red-700 underline"
                                    >
                                        Hapus
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={promoInput}
                                            onChange={(e) => {
                                                setPromoInput(e.target.value.toUpperCase());
                                                if (promoError) setPromoError("");
                                            }}
                                            placeholder="Masukkan kode promo (misal: MOMSHEBAT)"
                                            className="flex-1 rounded-xl border border-[#E8D6CE] bg-white px-3.5 py-2 text-xs font-semibold text-[#2A2620] uppercase placeholder:normal-case placeholder:font-normal placeholder:text-[#9A8B88] outline-none focus:border-[#7A2E3A] focus:ring-1 focus:ring-[#7A2E3A]"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => handleApplyPromo()}
                                            disabled={promoLoading || !promoInput.trim()}
                                            className="rounded-xl bg-[#7A2E3A] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#60232E] disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            {promoLoading ? "Cek..." : "Pakai"}
                                        </button>
                                    </div>

                                    {promoError && (
                                        <p className="text-xs text-red-600 font-medium flex items-center gap-1">
                                            <span>⚠️</span> {promoError}
                                        </p>
                                    )}

                                    {/* Quick Available Promo Pills */}
                                    {availablePromos.length > 0 && (
                                        <div className="pt-1">
                                            <p className="text-[11px] font-semibold text-[#78686A] mb-1.5">
                                                Voucher yang bisa Moms gunakan:
                                            </p>
                                            <div className="flex flex-wrap gap-1.5">
                                                {availablePromos.map((promo) => (
                                                    <button
                                                        key={promo.id || promo.code}
                                                        type="button"
                                                        onClick={() => {
                                                            setPromoInput(promo.code);
                                                            handleApplyPromo(promo.code);
                                                        }}
                                                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#D9C4BD] bg-white px-2 py-1 text-left text-xs font-semibold text-[#7A2E3A] transition hover:bg-[#F9ECE9] hover:border-[#7A2E3A]"
                                                    >
                                                        <span className="font-extrabold uppercase">🏷️ {promo.code}</span>
                                                        <span className="text-[10px] text-[#806B6D] font-normal">
                                                            ({promo.discount_type === "percentage" ? `${promo.discount_value}%` : promo.discount_type === "shipping_discount" ? "Gratis Ongkir" : formatRupiah(promo.discount_value)})
                                                        </span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="checkout-total-row">
                            <span>Total item</span>
                            <strong>{totalItems} item</strong>
                        </div>

                        <div className="checkout-total-row">
                            <span>Subtotal produk</span>
                            <strong>{formatRupiah(totalPrice)}</strong>
                        </div>

                        <div className="checkout-total-row">
                            <span>Ongkos kirim</span>
                            <strong>
                                {fulfillmentMethod === "pickup" ? (
                                    <span className="font-semibold text-[#496442]">Gratis (Pickup)</span>
                                ) : shippingLoading ? (
                                    <span className="text-xs text-[#78686A]">Menghitung...</span>
                                ) : selectedRate ? (
                                    formatRupiah(selectedRate.price)
                                ) : (
                                    <span className="text-xs text-[#A08E8B]">Pilih kurir</span>
                                )}
                            </strong>
                        </div>

                        {isPackagingActive && (
                            <div className="checkout-total-row">
                                <div className="flex flex-col">
                                    <span className="flex items-center gap-1">
                                        <span>❄️</span> Extra Packaging
                                    </span>
                                    <span className="text-[11px] font-normal text-[#78686A]">
                                        {isPaxel ? "Bag Thermal + Ice Gel (Wajib Paxel)" : "Bag Thermal + Ice Gel beku"}
                                    </span>
                                </div>
                                <strong>{formatRupiah(packagingFee)}</strong>
                            </div>
                        )}

                        {discountAmount > 0 && (
                            <div className="checkout-total-row text-emerald-700">
                                <span className="flex items-center gap-1 font-semibold text-emerald-800">
                                    <span>🎟️</span> Diskon Promo ({appliedPromo?.code})
                                </span>
                                <strong className="font-bold text-emerald-700">-{formatRupiah(discountAmount)}</strong>
                            </div>
                        )}

                        <div className="checkout-total-row grand-total">
                            <span>Total Pembayaran</span>
                            <strong>{formatRupiah(grandTotal)}</strong>
                        </div>

                        <p className="checkout-footnote">
                            {fulfillmentMethod === "delivery" && selectedRate
                                ? `Sudah termasuk ongkir ${selectedRate.courier_name} (${selectedRate.courier_service_name}). Transaksi diproses aman via Midtrans.`
                                : "Pesanan siap diambil di lokasi outlet setelah pembayaran terkonfirmasi."}
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
