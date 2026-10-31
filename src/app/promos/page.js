"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiRequest, parseUtcDate } from "@/lib/api";

const formatRupiah = (amount) =>
    new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0,
    }).format(amount || 0);

function formatDate(dateStr) {
    if (!dateStr) return null;
    const d = parseUtcDate(dateStr);
    if (!d || isNaN(d.getTime())) return null;
    return d.toLocaleString("id-ID", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

export default function PromosPage() {
    const router = useRouter();
    const [promos, setPromos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [copiedCode, setCopiedCode] = useState("");

    useEffect(() => {
        let isMounted = true;
        apiRequest("/promos/active")
            .then((data) => {
                if (isMounted) {
                    setPromos(Array.isArray(data) ? data : data?.promos || []);
                }
            })
            .catch(() => {
                if (isMounted) setPromos([]);
            })
            .finally(() => {
                if (isMounted) setLoading(false);
            });

        return () => {
            isMounted = false;
        };
    }, []);

    function handleCopy(code) {
        if (!code) return;
        navigator.clipboard.writeText(code);
        setCopiedCode(code);
        setTimeout(() => setCopiedCode(""), 2500);
    }

    function handleUsePromo(promo) {
        if (!promo || !promo.code) return;
        try {
            localStorage.setItem("ava_eats_selected_promo", JSON.stringify(promo));
            localStorage.setItem("ava_eats_promo_code", promo.code);
        } catch {}
        router.push(`/checkout?promo=${encodeURIComponent(promo.code)}`);
    }

    return (
        <main className="min-h-screen bg-[#FAF7F2] text-[#2A2620]">
            {/* Top Navigation */}
            <header className="border-b border-[#E8D6CE] bg-white sticky top-0 z-30 shadow-xs">
                <div className="mx-auto max-w-3xl px-4 py-3.5 flex items-center justify-between">
                    <Link
                        href="/"
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#7A2E3A] hover:underline"
                    >
                        <span>←</span> Kembali ke Menu
                    </Link>
                    <span className="text-xs font-extrabold uppercase tracking-wider text-[#7A2E3A]">
                        Ava Eats Promo
                    </span>
                </div>
            </header>

            <div className="mx-auto max-w-3xl px-4 py-6 sm:py-8">
                {/* Hero Banner */}
                <div className="rounded-3xl border border-[#E8D6CE] bg-gradient-to-br from-[#7A2E3A] to-[#5C1F2B] p-6 text-white shadow-md relative overflow-hidden mb-6">
                    <div className="absolute right-[-20px] bottom-[-20px] text-8xl opacity-10 select-none pointer-events-none">
                        🎟️
                    </div>
                    <span className="inline-block rounded-full bg-white/20 px-3 py-1 text-[11px] font-bold tracking-wide uppercase text-white mb-2 backdrop-blur-xs">
                        Kupon & Voucher Hemat
                    </span>
                    <h1 className="text-xl sm:text-2xl font-black">
                        Diskon & Voucher Spesial Moms
                    </h1>
                    <p className="mt-1.5 text-xs sm:text-sm text-white/90 max-w-lg leading-relaxed">
                        Gunakan kode promo berikut saat checkout untuk mendapatkan potongan harga menu dan subsidi ongkos kirim.
                    </p>
                </div>

                {/* Voucher List */}
                {loading ? (
                    <div className="rounded-2xl border border-[#E8D6CE] bg-white p-12 text-center text-xs text-[#78686A]">
                        <span className="inline-block animate-spin text-2xl mb-2">⏳</span>
                        <p className="font-semibold">Memuat voucher yang tersedia...</p>
                    </div>
                ) : promos.length === 0 ? (
                    <div className="rounded-2xl border border-[#E8D6CE] bg-white p-12 text-center">
                        <span className="text-4xl block mb-2">🎟️</span>
                        <h3 className="font-bold text-sm text-[#2A2620]">
                            Belum ada voucher aktif saat ini
                        </h3>
                        <p className="mt-1 text-xs text-[#78686A]">
                            Nantikan promo menarik lainnya dari Ava Eats segera ya Moms!
                        </p>
                        <Link
                            href="/"
                            className="mt-4 inline-flex rounded-xl bg-[#7A2E3A] px-4 py-2 text-xs font-bold text-white hover:bg-[#60232E]"
                        >
                            Mulai Belanja
                        </Link>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {promos.map((promo) => {
                            const isPercentage = promo.discount_type === "percentage";
                            const isShipping = promo.discount_type === "shipping_discount";
                            const isFixed = promo.discount_type === "fixed_amount";
                            const isCopied = copiedCode === promo.code;

                            return (
                                <div
                                    key={promo.id || promo.code}
                                    className="rounded-2xl border border-[#E8D6CE] bg-white p-4 sm:p-5 shadow-xs transition hover:shadow-sm"
                                >
                                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                                        <div className="flex-1">
                                            {/* Badge tipe diskon & status audiens */}
                                            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                                <span className="rounded-full bg-[#FAF0E6] px-2.5 py-0.5 text-[10px] font-bold text-[#7A2E3A] border border-[#E8D6CE]">
                                                    {isPercentage
                                                        ? "Diskon Persen"
                                                        : isShipping
                                                        ? "Subsidi Ongkir"
                                                        : "Potongan Langsung"}
                                                </span>
                                                {promo.target_type === "specific" && (
                                                    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-extrabold text-amber-800 border border-amber-300">
                                                        ⭐ Khusus Untuk Anda
                                                    </span>
                                                )}
                                                {promo.usage_limit && (
                                                    <span className="text-[10px] text-[#806B6D]">
                                                        Sisa kuota: {Math.max(0, promo.usage_limit - (promo.used_count || 0))} voucher
                                                    </span>
                                                )}
                                            </div>

                                            {/* Headline Diskon */}
                                            <h2 className="text-lg sm:text-xl font-black text-[#7A2E3A]">
                                                {isPercentage && `Diskon ${promo.discount_value}%`}
                                                {isFixed && `Potongan ${formatRupiah(promo.discount_value)}`}
                                                {isShipping && `Subsidi Ongkir s.d. ${formatRupiah(promo.discount_value)}`}
                                            </h2>

                                            <p className="mt-1 text-xs text-[#2A2620] font-semibold">
                                                {promo.name || promo.description}
                                            </p>

                                            {promo.description && promo.name !== promo.description && (
                                                <p className="mt-0.5 text-[11px] text-[#78686A]">
                                                    {promo.description}
                                                </p>
                                            )}
                                        </div>

                                        {/* Voucher Code Box & Copy Button */}
                                        <div className="sm:text-right shrink-0">
                                            <div className="inline-flex items-center gap-2 rounded-xl border border-dashed border-[#7A2E3A] bg-[#FAF4F2] px-3 py-1.5">
                                                <span className="font-mono text-sm font-black uppercase tracking-wider text-[#7A2E3A]">
                                                    {promo.code}
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => handleCopy(promo.code)}
                                                    className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                                                        isCopied
                                                            ? "bg-emerald-600 text-white"
                                                            : "bg-[#7A2E3A] text-white hover:bg-[#60232E]"
                                                    }`}
                                                >
                                                    {isCopied ? "Tersalin! ✓" : "Salin"}
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Syarat & Ketentuan (T&C) */}
                                    <div className="mt-3.5 pt-3 border-t border-[#F0E4DE] text-[11px] text-[#6E5E60] space-y-1">
                                        <strong className="block text-[11px] font-bold text-[#2A2620] uppercase tracking-wider mb-1">
                                            Syarat & Ketentuan:
                                        </strong>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                                            <p className="flex items-center gap-1.5">
                                                <span>🛒</span> Min. Belanja:{" "}
                                                <strong className="text-[#2A2620]">
                                                    {promo.min_order_amount > 0 ? formatRupiah(promo.min_order_amount) : "Tanpa minimal"}
                                                </strong>
                                            </p>
                                            {isPercentage && promo.max_discount && (
                                                <p className="flex items-center gap-1.5">
                                                    <span>🏷️</span> Maks. Potongan:{" "}
                                                    <strong className="text-[#2A2620]">{formatRupiah(promo.max_discount)}</strong>
                                                </p>
                                            )}
                                            <p className="flex items-center gap-1.5">
                                                <span>👤</span> Batas Pemakaian:{" "}
                                                <strong className="text-[#2A2620]">{promo.usage_limit_per_user || 1}x per akun</strong>
                                            </p>
                                            <p className="flex items-center gap-1.5">
                                                <span>📅</span> Periode Berlaku:{" "}
                                                <strong className="text-[#2A2620]">
                                                    {promo.end_date
                                                        ? `${formatDate(promo.start_date) ? `Mulai ${formatDate(promo.start_date)} - ` : "s.d. "}${formatDate(promo.end_date)}`
                                                        : "Selama kuota tersedia"}
                                                </strong>
                                            </p>
                                        </div>
                                    </div>

                                    {/* Action Link to Shopping */}
                                    <div className="mt-3.5 pt-2.5 border-t border-dashed border-[#F0E4DE] flex items-center justify-between gap-2">
                                        <span className="text-[10px] text-[#9A8B88]">
                                            *Otomatis terpasang langsung di Checkout.
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => handleUsePromo(promo)}
                                            className="rounded-xl bg-[#7A2E3A] px-3.5 py-1.5 text-xs font-bold text-white shadow-xs transition hover:bg-[#60232E] inline-flex items-center gap-1.5 active:scale-95 cursor-pointer shrink-0"
                                        >
                                            <span>Gunakan Kupon</span>
                                            <span>→</span>
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Panduan Cara Menggunakan */}
                <div className="mt-8 rounded-2xl border border-[#E8D6CE] bg-white p-5 shadow-xs">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#7A2E3A] flex items-center gap-1.5">
                        <span>💡</span> Cara Menggunakan Kupon Promo di Ava Eats:
                    </h3>
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-[#524446]">
                        <div className="rounded-xl bg-[#FAF7F2] p-3 border border-[#EFE5E0]">
                            <strong className="block text-[#7A2E3A] font-bold text-sm mb-1">1. Salin Kode</strong>
                            <p className="text-[11px] leading-relaxed">
                                Klik tombol <strong>&ldquo;Salin&rdquo;</strong> pada kupon voucher yang Moms inginkan di halaman ini.
                            </p>
                        </div>
                        <div className="rounded-xl bg-[#FAF7F2] p-3 border border-[#EFE5E0]">
                            <strong className="block text-[#7A2E3A] font-bold text-sm mb-1">2. Pilih Menu Favorit</strong>
                            <p className="text-[11px] leading-relaxed">
                                Tambahkan menu frozen food kesukaan si kecil ke keranjang, lalu lanjut ke <strong>Checkout</strong>.
                            </p>
                        </div>
                        <div className="rounded-xl bg-[#FAF7F2] p-3 border border-[#EFE5E0]">
                            <strong className="block text-[#7A2E3A] font-bold text-sm mb-1">3. Terapkan Kupon</strong>
                            <p className="text-[11px] leading-relaxed">
                                Tempel kode promo di kolom <strong>Kupon & Promo</strong> dan klik <strong>Pakai</strong>. Total bayar otomatis berkurang!
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    );
}
