
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/lib/api";

const formatRupiah = (amount) =>
    new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0,
    }).format(amount);

export default function CheckoutPage() {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [recipientName, setRecipientName] = useState("");
    const [whatsapp, setWhatsapp] = useState("");
    const [address, setAddress] = useState("");
    const [notes, setNotes] = useState("");
    const [paymentMethod, setPaymentMethod] = useState("qris");
    const [message, setMessage] = useState("");

    const router = useRouter();

    const [customer, setCustomer] = useState(null);
    const [addresses, setAddresses] = useState([]);
    const [selectedAddressId, setSelectedAddressId] = useState("");
    const [profileLoading, setProfileLoading] = useState(true);
    const [profileError, setProfileError] = useState("");

    const selectedAddress = addresses.find(
        (address) => String(address.id) === String(selectedAddressId)
    );

    const [fulfillmentMethod, setFulfillmentMethod] = useState("delivery");

    useEffect(() => {
        try {
            const savedCart = localStorage.getItem("ava_eats_checkout_cart");
            const parsedCart = savedCart ? JSON.parse(savedCart) : [];

            setItems(Array.isArray(parsedCart) ? parsedCart : []);
        } catch {
            setItems([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        let cancelled = false;

        async function loadCustomerData() {
            try {
                setProfileLoading(true);
                setProfileError("");

                // Ambil profil customer dari backend
                const profile = await apiRequest("/customers/me");

                if (cancelled) return;
                setCustomer(profile);

                // Ambil alamat milik customer tersebut
                const result = await apiRequest(
                    `/customers/${profile.id}/addresses`
                );

                if (cancelled) return;

                const customerAddresses = result.addresses || [];
                setAddresses(customerAddresses);

                // Prioritaskan alamat utama
                const defaultAddress = customerAddresses.find(
                    (address) => address.is_default
                );

                if (defaultAddress) {
                    setSelectedAddressId(String(defaultAddress.id));
                } else if (customerAddresses.length > 0) {
                    setSelectedAddressId(String(customerAddresses[0].id));
                }
            } catch (error) {
                if (!cancelled) {
                    setProfileError(error.message || "Gagal mengambil data customer.");
                }
            } finally {
                if (!cancelled) setProfileLoading(false);
            }
        }

        loadCustomerData();

        return () => {
            cancelled = true;
        };
    }, []);

    const totalItems = useMemo(
        () => items.reduce((sum, item) => sum + item.quantity, 0),
        [items]
    );

    const totalPrice = useMemo(
        () =>
            items.reduce(
                (sum, item) => sum + item.price * item.quantity,
                0
            ),
        [items]
    );


    function handleSubmit(event) {
        event.preventDefault();
        setMessage("");

        if (items.length === 0) {
            setMessage("Keranjang masih kosong. Silakan pilih menu dahulu.");
            return;
        }

        if (profileLoading) {
            setMessage("Tunggu sampai profil customer selesai dimuat.");
            return;
        }

        if (profileError || !customer) {
            setMessage("Profil customer belum berhasil dimuat. Silakan login kembali.");
            return;
        }


        if (fulfillmentMethod === "delivery" && !selectedAddress) {
            setMessage("Pilih alamat pengiriman terlebih dahulu.");
            return;
        }

        const checkoutData = {
            // Hanya kirim ID produk dan jumlah dari frontend.
            // Harga final akan divalidasi oleh backend.
            items: items.map((item) => ({
                product_id: item.product_id,
                quantity: item.quantity,
            })),
            fulfillment_method: fulfillmentMethod,
            address_id:
                fulfillmentMethod === "delivery"
                    ? selectedAddress.id
                    : null,
            recipient_name:
                fulfillmentMethod === "delivery"
                    ? selectedAddress.recipient_name
                    : customer.name,
            phone:
                fulfillmentMethod === "delivery"
                    ? selectedAddress.phone
                    : customer.phone,
            notes: notes.trim(),
            payment_method: paymentMethod,
        };

        localStorage.setItem(
            "ava_eats_checkout_draft",
            JSON.stringify(checkoutData)
        );

        setMessage(
            "Data checkout tersimpan. Pesanan belum dibuat di server."
        );
    }


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
                <a href="/" className="back-link">
                    ← Kembali ke menu
                </a>

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
                    <p>Yuk, pilih menu yang kamu suka terlebih dahulu.</p>
                    <a href="/" className="checkout-primary-link">
                        Pilih Menu
                    </a>
                </section>
            ) : (
                <form className="checkout-content" onSubmit={handleSubmit}>

                    <section className="checkout-card">
                        <div className="checkout-section-title">
                            <span className="step-number">1</span>
                            <div>
                                <h2>Metode Penerimaan</h2>
                                <p>Pilih bagaimana kamu ingin menerima pesanan.</p>
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

                    {fulfillmentMethod === "delivery" && (
                        <>
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
                                            onClick={() => router.push("/login")}
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
                                                    {addresses.map((address) => (
                                                        <label
                                                            key={address.id}
                                                            className={`block cursor-pointer rounded-xl border p-4 ${String(selectedAddressId) === String(address.id)
                                                                ? "border-[#7A2E3A] bg-[#F3E1DE]/40"
                                                                : "border-[#E8D6CE]"
                                                                }`}
                                                        >
                                                            <div className="flex items-start gap-3">
                                                                <input
                                                                    type="radio"
                                                                    name="shipping_address"
                                                                    value={address.id}
                                                                    checked={
                                                                        String(selectedAddressId) === String(address.id)
                                                                    }
                                                                    onChange={() =>
                                                                        setSelectedAddressId(String(address.id))
                                                                    }
                                                                    className="mt-1 accent-[#7A2E3A]"
                                                                />

                                                                <div className="min-w-0 text-sm">
                                                                    <div className="flex flex-wrap items-center gap-2">
                                                                        <span className="font-semibold text-[#2A2620]">
                                                                            {address.label || "Alamat"}
                                                                        </span>

                                                                        {address.is_default && (
                                                                            <span className="rounded-full bg-[#6E8F63]/15 px-2 py-1 text-xs text-[#496442]">
                                                                                Alamat utama
                                                                            </span>
                                                                        )}
                                                                    </div>

                                                                    <p className="mt-2 font-medium text-[#2A2620]">
                                                                        {address.recipient_name}
                                                                    </p>
                                                                    <p className="text-[#6B6459]">{address.phone}</p>

                                                                    <p className="mt-1 leading-5 text-[#6B6459]">
                                                                        {address.address}
                                                                        {address.district ? `, ${address.district}` : ""}
                                                                        {address.city ? `, ${address.city}` : ""}
                                                                        {address.province ? `, ${address.province}` : ""}
                                                                        {address.postal_code
                                                                            ? ` ${address.postal_code}`
                                                                            : ""}
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
                        </>
                    )}

                    <section className="checkout-card">
                        <div className="checkout-section-title">
                            <span className="step-number">2</span>
                            <div>
                                <h2>Metode Pembayaran</h2>
                                <p>Pilih metode yang akan kamu gunakan.</p>
                            </div>
                        </div>

                        <label
                            className={`payment-option ${paymentMethod === "qris" ? "selected" : ""
                                }`}
                        >
                            <input
                                type="radio"
                                name="payment"
                                value="qris"
                                checked={paymentMethod === "qris"}
                                onChange={(event) => setPaymentMethod(event.target.value)}
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
                            className={`payment-option ${paymentMethod === "bank_transfer" ? "selected" : ""
                                }`}
                        >
                            <input
                                type="radio"
                                name="payment"
                                value="bank_transfer"
                                checked={paymentMethod === "bank_transfer"}
                                onChange={(event) => setPaymentMethod(event.target.value)}
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

                        <p className="payment-disclaimer">
                            Pilihan ini masih berupa UI. QRIS dan detail rekening asli
                            akan ditampilkan setelah integrasi pembayaran.
                        </p>
                    </section>

                    <section className="checkout-card">
                        <div className="checkout-section-title">
                            <span className="step-number">3</span>
                            <div>
                                <h2>Ringkasan Pesanan</h2>
                                <p>Periksa menu dan jumlah pesananmu.</p>
                            </div>
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

                        <div className="checkout-total-row">
                            <span>Total item</span>
                            <strong>{totalItems} item</strong>
                        </div>

                        <div className="checkout-total-row grand-total">
                            <span>Total sementara</span>
                            <strong>{formatRupiah(totalPrice)}</strong>
                        </div>

                        <p className="checkout-footnote">
                            Ongkir belum termasuk dan akan mengikuti perhitungan
                            pengiriman saat integrasi backend.
                        </p>
                    </section>

                    {message && (
                        <div className="checkout-message" role="status">
                            {message}
                        </div>
                    )}

                    <button type="submit" className="checkout-submit">
                        Simpan Data Checkout <span>→</span>
                    </button>

                    <p className="checkout-secure-note">
                        🔒 Data ini sementara tersimpan di browser perangkatmu.
                    </p>
                </form>
            )}
        </main>
    );
}
