"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiRequest } from "@/lib/api";

// ── Inner component that reads searchParams ───────────────────────────────────
function LoginForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const redirectTo = searchParams.get("redirect") || "/";
    const isExpired = searchParams.get("expired") === "1";

    const [phone, setPhone] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [successMsg, setSuccessMsg] = useState("");

    async function handleLogin(event) {
        event.preventDefault();
        setError("");
        setSuccessMsg("");
        setLoading(true);

        try {
            // 1. Login menggunakan nomor WhatsApp dan password
            const result = await apiRequest("/customers/login", {
                method: "POST",
                body: JSON.stringify({
                    phone: phone.trim(),
                    password,
                }),
            });

            if (!result.access_token) {
                throw new Error("Token login tidak ditemukan.");
            }

            // 2. Simpan token untuk request berikutnya
            localStorage.setItem(
                "ava_eats_access_token",
                result.access_token
            );

            // 3. Ambil profil customer yang sedang login
            const customer = await apiRequest("/customers/me");

            localStorage.setItem(
                "ava_eats_customer",
                JSON.stringify(customer)
            );

            // 4. Berikan feedback sukses yang jelas
            const customerName = customer?.name ? ` ${customer.name}` : "";
            setSuccessMsg(`Login berhasil! Selamat datang kembali, Moms${customerName}! 🎉`);

            // Jika bukan diarahkan dari checkout, bersihkan sisa keranjang checkout lama
            if (redirectTo !== "/checkout") {
                localStorage.removeItem("ava_eats_checkout_cart");
                localStorage.removeItem("ava_eats_checkout_draft");
            }

            // 5. Redirect ke halaman tujuan (default: homepage /)
            setTimeout(() => {
                router.push(redirectTo);
            }, 1000);
        } catch (err) {
            localStorage.removeItem("ava_eats_access_token");
            localStorage.removeItem("ava_eats_customer");

            setError(
                err.message || "Login gagal. Periksa nomor WhatsApp dan password."
            );
            setLoading(false);
        }
    }

    return (
        <main className="min-h-screen bg-[#F8F3E9] px-5 py-8">
            <div className="mx-auto flex min-h-[85vh] w-full max-w-[440px] flex-col justify-center">
                <Link
                    href="/"
                    className="mb-8 inline-flex w-fit items-center gap-2 text-sm text-[#6B6459]"
                >
                    <span aria-hidden="true">←</span>
                    Kembali ke menu
                </Link>

                <div className="mb-8">
                    <div className="mb-5 flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl bg-white p-1 shadow-md shadow-[#7A2E3A]/10 ring-1 ring-[#E8D6CE]">
                        <img src="/logo.png" alt="Ava Eats" className="h-full w-full object-cover rounded-xl" />
                    </div>

                    <p className="mb-2 text-sm font-semibold tracking-[0.2em] text-[#7A2E3A]">
                        AVA EATS
                    </p>

                    <h1 className="text-3xl font-bold leading-tight text-[#2A2620]">
                        Selamat datang kembali!
                    </h1>

                    <p className="mt-3 text-sm leading-6 text-[#6B6459]">
                        Login untuk melanjutkan pesanan dan menggunakan alamat
                        pengiriman yang sudah tersimpan.
                    </p>
                </div>

                <form onSubmit={handleLogin} className="space-y-5">
                    {isExpired && !error && !successMsg && (
                        <div
                            role="status"
                            className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-sm font-semibold text-amber-800"
                        >
                            ⏳ Sesi loginmu telah berakhir. Silakan masuk kembali.
                        </div>
                    )}

                    {successMsg && (
                        <div
                            role="status"
                            className="rounded-xl border border-green-200 bg-green-50 px-4 py-3.5 text-sm font-semibold text-green-800"
                        >
                            ✓ {successMsg}
                        </div>
                    )}

                    {error && (
                        <div
                            role="alert"
                            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                        >
                            {error}
                        </div>
                    )}

                    <div>
                        <label
                            htmlFor="phone"
                            className="mb-2 block text-sm font-semibold text-[#2A2620]"
                        >
                            Nomor WhatsApp
                        </label>

                        <input
                            id="phone"
                            type="tel"
                            autoComplete="tel"
                            inputMode="tel"
                            placeholder="Contoh: 081234567890"
                            value={phone}
                            disabled={loading || Boolean(successMsg)}
                            onChange={(event) => setPhone(event.target.value)}
                            required
                            className="w-full rounded-xl border border-[#E8D6CE] bg-white px-4 py-3.5 text-base text-[#2A2620] outline-none transition focus:border-[#7A2E3A] focus:ring-2 focus:ring-[#7A2E3A]/10 disabled:opacity-60"
                        />
                    </div>

                    <div>
                        <label
                            htmlFor="password"
                            className="mb-2 block text-sm font-semibold text-[#2A2620]"
                        >
                            Password
                        </label>

                        <div className="flex items-center rounded-xl border border-[#E8D6CE] bg-white pr-4 transition focus-within:border-[#7A2E3A] focus-within:ring-2 focus-within:ring-[#7A2E3A]/10">
                            <input
                                id="password"
                                type={showPassword ? "text" : "password"}
                                autoComplete="current-password"
                                placeholder="Masukkan password"
                                value={password}
                                disabled={loading || Boolean(successMsg)}
                                onChange={(event) => setPassword(event.target.value)}
                                required
                                className="w-full rounded-xl bg-transparent px-4 py-3.5 text-base text-[#2A2620] outline-none disabled:opacity-60"
                            />

                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="shrink-0 text-sm font-semibold text-[#7A2E3A]"
                            >
                                {showPassword ? "Sembunyikan" : "Lihat"}
                            </button>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading || Boolean(successMsg)}
                        className="w-full rounded-xl bg-[#7A2E3A] px-4 py-4 font-semibold text-white transition hover:bg-[#652530] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {successMsg ? "Mengalihkan..." : loading ? "Sedang login..." : "Login"}
                    </button>
                </form>

                <div className="mt-6 rounded-2xl border border-[#E8D6CE] bg-[#FAF7F2] p-4 text-center">
                    <p className="text-sm text-[#6B6459]">
                        Belum punya akun Ava Eats?
                    </p>
                    <Link
                        href={redirectTo && redirectTo !== "/" ? `/register?redirect=${encodeURIComponent(redirectTo)}` : "/register"}
                        className="mt-1.5 inline-block text-sm font-bold text-[#7A2E3A] hover:underline"
                    >
                        Daftar Akun Baru Sekarang →
                    </Link>
                </div>

                <p className="mt-6 text-center text-xs leading-5 text-[#6B6459]">
                    Dengan login, lo bisa melanjutkan pemesanan menggunakan profil
                    dan alamat pengiriman customer.
                </p>
            </div>
        </main>
    );
}

// ── Page export — wraps form in Suspense for useSearchParams ─────────────────
export default function LoginPage() {
    return (
        <Suspense fallback={
            <main className="flex min-h-screen items-center justify-center bg-[#F8F3E9]">
                <p className="text-sm text-[#6B6459]">Memuat halaman login...</p>
            </main>
        }>
            <LoginForm />
        </Suspense>
    );
}
