"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiRequest } from "@/lib/api";
import LocationPickerModal from "@/components/LocationPickerModal";

function AddressManager() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const redirectTo = searchParams.get("redirect") || "";
    const openNewForm = searchParams.get("action") === "new";

    const [customer, setCustomer] = useState(null);
    const [addresses, setAddresses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [successMsg, setSuccessMsg] = useState("");

    // Modal / Form state
    const [showForm, setShowForm] = useState(openNewForm);
    const [editingAddressId, setEditingAddressId] = useState(null);
    const [saving, setSaving] = useState(false);

    // Form inputs
    const [label, setLabel] = useState("Rumah");
    const [recipientName, setRecipientName] = useState("");
    const [phone, setPhone] = useState("");
    const [addressText, setAddressText] = useState("");
    const [province, setProvince] = useState("DKI Jakarta");
    const [city, setCity] = useState("Jakarta Selatan");
    const [district, setDistrict] = useState("");
    const [postalCode, setPostalCode] = useState("");
    const [isDefault, setIsDefault] = useState(false);

    // GPS coordinates
    const [gpsCoords, setGpsCoords] = useState(null);
    const [gpsLoading, setGpsLoading] = useState(false);
    const [gpsMsg, setGpsMsg] = useState("");
    const [showMapPicker, setShowMapPicker] = useState(false);

    function handlePinConfirmed({ lat, lon }) {
        setGpsCoords({ lat, lon });
        setGpsMsg(`✓ Titik pin terpasang di peta (${lat.toFixed(5)}, ${lon.toFixed(5)})`);
    }

    useEffect(() => {
        const token = localStorage.getItem("ava_eats_access_token");
        if (!token) {
            router.push(`/login?redirect=/addresses${redirectTo ? `?redirect=${encodeURIComponent(redirectTo)}` : ""}`);
            return;
        }

        async function init() {
            try {
                const profile = await apiRequest("/customers/me");
                setCustomer(profile);

                // Default recipient name & phone from profile
                setRecipientName(profile.name || "");
                setPhone(profile.phone || "");

                // Fetch addresses
                const res = await apiRequest(`/customers/${profile.id}/addresses`);
                setAddresses(res.addresses || []);
            } catch (err) {
                setError(err.message || "Gagal memuat daftar alamat.");
            } finally {
                setLoading(false);
            }
        }

        init();
    }, [router, redirectTo]);

    function openAddModal() {
        setEditingAddressId(null);
        setLabel("Rumah");
        setRecipientName(customer?.name || "");
        setPhone(customer?.phone || "");
        setAddressText("");
        setProvince("DKI Jakarta");
        setCity("Jakarta Selatan");
        setDistrict("");
        setPostalCode("");
        setIsDefault(addresses.length === 0);
        setGpsCoords(null);
        setGpsMsg("");
        setError("");
        setShowForm(true);
    }

    function openEditModal(addr) {
        setEditingAddressId(addr.id);
        setLabel(addr.label || "Rumah");
        setRecipientName(addr.recipient_name || "");
        setPhone(addr.phone || "");
        setAddressText(addr.address || "");
        setProvince(addr.province || "DKI Jakarta");
        setCity(addr.city || "Jakarta Selatan");
        setDistrict(addr.district || "");
        setPostalCode(addr.postal_code || "");
        setIsDefault(Boolean(addr.is_default));
        if (addr.latitude && addr.longitude) {
            setGpsCoords({ lat: addr.latitude, lon: addr.longitude });
            setGpsMsg(`Koordinat tersimpan: ${addr.latitude.toFixed(4)}, ${addr.longitude.toFixed(4)}`);
        } else {
            setGpsCoords(null);
            setGpsMsg("");
        }
        setError("");
        setShowForm(true);
    }

    function handleGetGPS() {
        if (!navigator.geolocation) {
            setGpsMsg("Perangkat lo tidak mendukung pendeteksi lokasi otomatis.");
            return;
        }

        setGpsLoading(true);
        setGpsMsg("Mendeteksi titik koordinat lo...");

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const lat = pos.coords.latitude;
                const lon = pos.coords.longitude;
                setGpsCoords({ lat, lon });
                setGpsLoading(false);
                setGpsMsg(`✓ Titik GPS akurat terdeteksi (${lat.toFixed(5)}, ${lon.toFixed(5)})!`);
            },
            (err) => {
                setGpsLoading(false);
                setGpsMsg("Izin GPS ditolak atau tidak ditemukan. Alamat tetap bisa disimpan via teks.");
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    }

    async function handleSaveAddress(e) {
        e.preventDefault();
        setError("");
        setSaving(true);

        const payload = {
            label: label.trim(),
            recipient_name: recipientName.trim(),
            phone: phone.trim(),
            address: addressText.trim(),
            province: province.trim(),
            city: city.trim(),
            district: district.trim(),
            postal_code: postalCode.trim(),
            is_default: isDefault,
        };

        if (gpsCoords) {
            payload.latitude = gpsCoords.lat;
            payload.longitude = gpsCoords.lon;
        }

        try {
            if (editingAddressId) {
                // Update address
                await apiRequest(`/customers/${customer.id}/addresses/${editingAddressId}`, {
                    method: "PUT",
                    body: JSON.stringify(payload),
                });
                setSuccessMsg("Alamat berhasil diperbarui!");
            } else {
                // Create address
                await apiRequest(`/customers/${customer.id}/addresses`, {
                    method: "POST",
                    body: JSON.stringify(payload),
                });
                setSuccessMsg("Alamat baru berhasil ditambahkan!");
            }

            // Refresh address list
            const res = await apiRequest(`/customers/${customer.id}/addresses`);
            setAddresses(res.addresses || []);
            setShowForm(false);

            // If coming from checkout, redirect back!
            if (redirectTo) {
                setTimeout(() => {
                    router.push(redirectTo);
                }, 1000);
            } else {
                setTimeout(() => setSuccessMsg(""), 3500);
            }
        } catch (err) {
            setError(err.message || "Gagal menyimpan alamat. Coba lagi.");
        } finally {
            setSaving(false);
        }
    }

    async function handleSetDefault(addrId) {
        try {
            await apiRequest(`/customers/${customer.id}/addresses/${addrId}/default`, {
                method: "PUT",
            });
            const res = await apiRequest(`/customers/${customer.id}/addresses`);
            setAddresses(res.addresses || []);
            setSuccessMsg("Alamat utama berhasil diganti.");
            setTimeout(() => setSuccessMsg(""), 3000);
        } catch (err) {
            setError(err.message || "Gagal mengatur alamat utama.");
        }
    }

    async function handleDelete(addrId, isDef) {
        if (isDef) {
            alert("Alamat utama tidak dapat dihapus langsung. Pilih alamat lain sebagai utama terlebih dahulu.");
            return;
        }

        if (!confirm("Apakah lo yakin ingin menghapus alamat ini?")) {
            return;
        }

        try {
            await apiRequest(`/customers/${customer.id}/addresses/${addrId}`, {
                method: "DELETE",
            });
            const res = await apiRequest(`/customers/${customer.id}/addresses`);
            setAddresses(res.addresses || []);
            setSuccessMsg("Alamat berhasil dihapus.");
            setTimeout(() => setSuccessMsg(""), 3000);
        } catch (err) {
            setError(err.message || "Gagal menghapus alamat.");
        }
    }

    if (loading) {
        return (
            <main className="flex min-h-screen items-center justify-center bg-[#F8F3E9]">
                <p className="text-sm font-medium text-[#6B6459]">Memuat buku alamat...</p>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-[#F8F3E9] px-4 py-8">
            <div className="mx-auto w-full max-w-[540px]">
                {/* Header Back & Action */}
                <div className="mb-6 flex items-center justify-between">
                    <Link
                        href={redirectTo || "/profile"}
                        className="inline-flex items-center gap-2 text-sm font-medium text-[#6B6459] hover:text-[#7A2E3A]"
                    >
                        <span aria-hidden="true">←</span>
                        {redirectTo ? "Kembali ke Checkout" : "Kembali ke Profil"}
                    </Link>

                    <button
                        type="button"
                        onClick={openAddModal}
                        className="rounded-xl bg-[#7A2E3A] px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[#652530]"
                    >
                        + Tambah Alamat
                    </button>
                </div>

                <div className="mb-6">
                    <h1 className="text-2xl font-bold text-[#2A2620]">
                        Buku Alamat Pengiriman
                    </h1>
                    <p className="mt-1 text-xs text-[#6B6459]">
                        Kelola alamat pengiriman untuk pemesanan kurir Paxel, Gojek, Grab, & Lalamove.
                    </p>
                </div>

                {successMsg && (
                    <div
                        role="status"
                        className="mb-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-800"
                    >
                        ✓ {successMsg}
                    </div>
                )}

                {error && (
                    <div
                        role="alert"
                        className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                    >
                        {error}
                    </div>
                )}

                {/* Daftar Alamat Tersimpan */}
                <div className="space-y-3.5">
                    {addresses.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-[#D9C8BE] bg-white p-8 text-center">
                            <span className="text-4xl">📍</span>
                            <h3 className="mt-3 text-base font-bold text-[#2A2620]">
                                Belum Ada Alamat Tersimpan
                            </h3>
                            <p className="mt-1 text-xs text-[#6B6459]">
                                Tambahkan alamat pengiriman lo agar pesanan dapat dikirim langsung ke rumah atau kantor.
                            </p>
                            <button
                                type="button"
                                onClick={openAddModal}
                                className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[#7A2E3A] px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-[#652530]"
                            >
                                + Tambah Alamat Pertama
                            </button>
                        </div>
                    ) : (
                        addresses.map((addr) => (
                            <div
                                key={addr.id}
                                className={`rounded-2xl border bg-white p-5 shadow-sm transition ${addr.is_default ? "border-[#7A2E3A] ring-1 ring-[#7A2E3A]/20" : "border-[#E8D6CE]"
                                    }`}
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                        <span className="rounded-lg bg-[#FAF0E6] px-2.5 py-1 text-xs font-bold text-[#7A2E3A]">
                                            {addr.label}
                                        </span>
                                        {addr.is_default && (
                                            <span className="rounded-lg bg-[#6E8F63]/15 px-2 py-0.5 text-[10px] font-semibold text-[#496442]">
                                                ★ Alamat Utama
                                            </span>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => openEditModal(addr)}
                                            className="text-xs font-semibold text-[#7A2E3A] hover:underline"
                                        >
                                            Ubah
                                        </button>
                                        {!addr.is_default && (
                                            <button
                                                type="button"
                                                onClick={() => handleDelete(addr.id, addr.is_default)}
                                                className="text-xs font-semibold text-red-600 hover:underline"
                                            >
                                                Hapus
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className="mt-3">
                                    <h4 className="text-sm font-bold text-[#2A2620]">
                                        {addr.recipient_name}
                                        <span className="ml-2 font-normal text-xs text-[#6B6459]">
                                            ({addr.phone})
                                        </span>
                                    </h4>
                                    <p className="mt-1 text-xs leading-relaxed text-[#504940]">
                                        {addr.address}
                                    </p>
                                    <p className="mt-0.5 text-xs text-[#78686A]">
                                        Kec. {addr.district}, {addr.city}, {addr.province} {addr.postal_code}
                                    </p>
                                    {addr.latitude && addr.longitude && (
                                        <span className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-[#496442]">
                                            📍 Titik Koordinat GPS Tersimpan
                                        </span>
                                    )}
                                </div>

                                {!addr.is_default && (
                                    <div className="mt-3.5 border-t border-[#F0E6DF] pt-3">
                                        <button
                                            type="button"
                                            onClick={() => handleSetDefault(addr.id)}
                                            className="text-xs font-semibold text-[#6B6459] transition hover:text-[#7A2E3A]"
                                        >
                                            Jadikan Alamat Utama
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>

                {/* MODAL FORM TAMBAH / UBAH ALAMAT */}
                {showForm && (
                    <div
                        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4 backdrop-blur-xs"
                        onClick={() => setShowForm(false)}
                    >
                        <div
                            className="relative max-h-[92dvh] sm:max-h-[90vh] w-full max-w-[480px] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white p-5 sm:p-6 pb-8 sm:pb-6 shadow-2xl"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between border-b border-[#E8D6CE] pb-3">
                                <h3 className="text-lg font-bold text-[#2A2620]">
                                    {editingAddressId ? "Ubah Alamat Pengiriman" : "Tambah Alamat Pengiriman"}
                                </h3>
                                <button
                                    type="button"
                                    onClick={() => setShowForm(false)}
                                    className="flex h-8 w-8 items-center justify-center rounded-full bg-[#FAF7F2] text-sm font-bold text-[#6B6459] hover:bg-[#E8D6CE]"
                                >
                                    ✕
                                </button>
                            </div>

                            <form onSubmit={handleSaveAddress} className="mt-4 space-y-3.5">
                                <div>
                                    <label className="mb-1 block text-xs font-semibold text-[#2A2620]">
                                        Label Alamat (Contoh: Rumah, Kantor, Kos)
                                    </label>
                                    <input
                                        type="text"
                                        value={label}
                                        onChange={(e) => setLabel(e.target.value)}
                                        placeholder="Rumah"
                                        required
                                        className="w-full rounded-xl border border-[#E8D6CE] bg-[#FAF7F2] px-3.5 py-2.5 text-sm text-[#2A2620] outline-none focus:border-[#7A2E3A] focus:bg-white"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="mb-1 block text-xs font-semibold text-[#2A2620]">
                                            Nama Penerima
                                        </label>
                                        <input
                                            type="text"
                                            value={recipientName}
                                            onChange={(e) => setRecipientName(e.target.value)}
                                            placeholder="Nama Lengkap"
                                            required
                                            className="w-full rounded-xl border border-[#E8D6CE] bg-[#FAF7F2] px-3.5 py-2.5 text-sm text-[#2A2620] outline-none focus:border-[#7A2E3A] focus:bg-white"
                                        />
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-xs font-semibold text-[#2A2620]">
                                            Nomor Telepon / WA
                                        </label>
                                        <input
                                            type="tel"
                                            value={phone}
                                            onChange={(e) => setPhone(e.target.value)}
                                            placeholder="0812..."
                                            required
                                            className="w-full rounded-xl border border-[#E8D6CE] bg-[#FAF7F2] px-3.5 py-2.5 text-sm text-[#2A2620] outline-none focus:border-[#7A2E3A] focus:bg-white"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="mb-1 block text-xs font-semibold text-[#2A2620]">
                                        Alamat Lengkap (Jalan, No Rumah, RT/RW, Patokan)
                                    </label>
                                    <textarea
                                        rows={2}
                                        value={addressText}
                                        onChange={(e) => setAddressText(e.target.value)}
                                        placeholder="Jl. Melati No. 4 RT 02 RW 05, Pagar Coklat"
                                        required
                                        className="w-full rounded-xl border border-[#E8D6CE] bg-[#FAF7F2] px-3.5 py-2.5 text-sm text-[#2A2620] outline-none focus:border-[#7A2E3A] focus:bg-white"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="mb-1 block text-xs font-semibold text-[#2A2620]">
                                            Provinsi
                                        </label>
                                        <input
                                            type="text"
                                            value={province}
                                            onChange={(e) => setProvince(e.target.value)}
                                            placeholder="DKI Jakarta"
                                            required
                                            className="w-full rounded-xl border border-[#E8D6CE] bg-[#FAF7F2] px-3.5 py-2.5 text-sm text-[#2A2620] outline-none focus:border-[#7A2E3A] focus:bg-white"
                                        />
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-xs font-semibold text-[#2A2620]">
                                            Kota / Kabupaten
                                        </label>
                                        <input
                                            type="text"
                                            value={city}
                                            onChange={(e) => setCity(e.target.value)}
                                            placeholder="Jakarta Selatan"
                                            required
                                            className="w-full rounded-xl border border-[#E8D6CE] bg-[#FAF7F2] px-3.5 py-2.5 text-sm text-[#2A2620] outline-none focus:border-[#7A2E3A] focus:bg-white"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="mb-1 block text-xs font-semibold text-[#2A2620]">
                                            Kecamatan
                                        </label>
                                        <input
                                            type="text"
                                            value={district}
                                            onChange={(e) => setDistrict(e.target.value)}
                                            placeholder="Kebayoran Baru"
                                            required
                                            className="w-full rounded-xl border border-[#E8D6CE] bg-[#FAF7F2] px-3.5 py-2.5 text-sm text-[#2A2620] outline-none focus:border-[#7A2E3A] focus:bg-white"
                                        />
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-xs font-semibold text-[#2A2620]">
                                            Kode Pos
                                        </label>
                                        <input
                                            type="text"
                                            value={postalCode}
                                            onChange={(e) => setPostalCode(e.target.value)}
                                            placeholder="12110"
                                            required
                                            className="w-full rounded-xl border border-[#E8D6CE] bg-[#FAF7F2] px-3.5 py-2.5 text-sm text-[#2A2620] outline-none focus:border-[#7A2E3A] focus:bg-white"
                                        />
                                    </div>
                                </div>

                                {/* 📍 Titik GPS Lokasi Interaktif (Geser & Tancep Pin) */}
                                <div className="rounded-2xl border border-[#E8D6CE] bg-[#FAF7F2] p-3.5 space-y-2.5">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-sm">📍</span>
                                                <span className="block text-xs font-bold text-[#2A2620]">
                                                    Titik GPS & Pin Peta
                                                </span>
                                            </div>
                                            <span className="block text-[11px] text-[#6B6459] mt-0.5">
                                                Tandai titik lokasi di peta agar kurir instan sampai tepat di depan pintu rumah Moms.
                                            </span>
                                        </div>
                                    </div>

                                    {gpsCoords ? (
                                        <div className="flex items-center justify-between gap-2 rounded-xl border border-emerald-300 bg-emerald-50/80 p-2.5 text-xs text-emerald-900">
                                            <div className="min-w-0 flex-1">
                                                <strong className="block text-[11px] font-bold text-emerald-800">
                                                    ✓ Pin Lokasi Terpasang
                                                </strong>
                                                <span className="block text-[10px] text-emerald-700 font-mono truncate">
                                                    {gpsCoords.lat.toFixed(5)}, {gpsCoords.lon.toFixed(5)}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-1.5 shrink-0">
                                                <button
                                                    type="button"
                                                    onClick={() => setShowMapPicker(true)}
                                                    className="rounded-lg bg-emerald-700 px-2.5 py-1 text-[11px] font-bold text-white transition hover:bg-emerald-800 shadow-xs"
                                                >
                                                    Ubah Pin
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setGpsCoords(null);
                                                        setGpsMsg("");
                                                    }}
                                                    className="rounded-lg border border-emerald-300 bg-white px-2 py-1 text-[11px] text-emerald-800 hover:bg-emerald-100"
                                                    title="Hapus koordinat"
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-0.5">
                                            <button
                                                type="button"
                                                onClick={() => setShowMapPicker(true)}
                                                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-[#7A2E3A] px-3 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-[#652530]"
                                            >
                                                <span>🗺️</span>
                                                <span>Buka Peta & Tancep Pin</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={handleGetGPS}
                                                disabled={gpsLoading}
                                                className="flex items-center justify-center gap-1 rounded-xl border border-[#E8D6CE] bg-white px-3 py-2 text-xs font-semibold text-[#7A2E3A] hover:bg-[#FAF7F2] disabled:opacity-50"
                                                title="Ambil GPS perangkat secara otomatis"
                                            >
                                                <span>{gpsLoading ? "⏳" : "🎯"}</span>
                                                <span>{gpsLoading ? "Mencari..." : "GPS Otomatis"}</span>
                                            </button>
                                        </div>
                                    )}

                                    {gpsMsg && (
                                        <p className="text-[11px] font-medium text-[#496442]">
                                            {gpsMsg}
                                        </p>
                                    )}
                                </div>

                                <label className="flex items-center gap-2 cursor-pointer pt-1">
                                    <input
                                        type="checkbox"
                                        checked={isDefault}
                                        onChange={(e) => setIsDefault(e.target.checked)}
                                        className="h-4 w-4 rounded text-[#7A2E3A] focus:ring-[#7A2E3A]"
                                    />
                                    <span className="text-xs font-medium text-[#2A2620]">
                                        Jadikan alamat utama untuk setiap pemesanan
                                    </span>
                                </label>

                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="mt-3 w-full rounded-xl bg-[#7A2E3A] py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#652530] disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {saving ? "Menyimpan Alamat..." : "Simpan Alamat"}
                                </button>
                            </form>
                        </div>
                    </div>
                )}

                {/* Modal Peta Interaktif (Geser & Tancep Pin) */}
                <LocationPickerModal
                    isOpen={showMapPicker}
                    onClose={() => setShowMapPicker(false)}
                    initialCoords={gpsCoords}
                    onConfirm={handlePinConfirmed}
                />
            </div>
        </main>
    );
}

export default function AddressesPage() {
    return (
        <Suspense fallback={
            <main className="flex min-h-screen items-center justify-center bg-[#F8F3E9]">
                <p className="text-sm text-[#6B6459]">Memuat halaman alamat...</p>
            </main>
        }>
            <AddressManager />
        </Suspense>
    );
}
