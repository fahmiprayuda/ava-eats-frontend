"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiRequest } from "@/lib/api";

function RegisterForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const redirectTo = searchParams.get("redirect") || "/";

    const [name, setName] = useState("");
    const [phone, setPhone] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [successMsg, setSuccessMsg] = useState("");

    async function handleRegister(event) {
        event.preventDefault();
        setError("");
        setSuccessMsg("");

        const trimmedName = name.trim();
        const trimmedPhone = phone.trim();

        if (trimmedName.length < 2) {
            setError("Nama lengkap minimal 2 karakter.");
            return;
        }

        if (trimmedPhone.length < 10) {
            setError("Nomor WhatsApp minimal 10 digit.");
            return;
        }

        if (password.length < 6) {
            setError("Password minimal 6 karakter.");
            return;
        }

        if (password !== confirmPassword) {
            setError("Konfirmasi password tidak cocok.");
            return;
        }

        setLoading(true);

        try {
            // 1. Panggil endpoint register customer
            const result = await apiRequest("/customers/register", {
                method: "POST",
                body: JSON.stringify({
                    name: trimmedName,
                    phone: trimmedPhone,
                    password: password,
                }),
            });

            // 2. Simpan token jika backend mengembalikan token otomatis
            if (result.access_token) {
                localStorage.setItem("ava_eats_access_token", result.access_token);
                if (result.customer) {
                    localStorage.setItem("ava_eats_customer", JSON.stringify(result.customer));
                }
            } else {
                // Fallback: Login otomatis
                const loginRes = await apiRequest("/customers/login", {
                    method: "POST",
                    body: JSON.stringify({
                        phone: trimmedPhone,
                        password: password,
                    }),
                });
                if (loginRes.access_token) {
                    localStorage.setItem("ava_eats_access_token", loginRes.access_token);
                    const profile = await apiRequest("/customers/me");
                    localStorage.setItem("ava_eats_customer", JSON.stringify(profile));
                }
            }

            setSuccessMsg(`Pendaftaran berhasil! Selamat datang di Ava Eats, ${trimmedName}! 🎉`);

            // Redirect setelah 1 detik
            setTimeout(() => {
                router.push(redirectTo);
            }, 1200);
        } catch (err) {
            setError(err.message || "Pendaftaran gagal. Periksa kembali data lo.");
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
                    <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#7A2E3A] text-3xl">
                        🍱
                    </div>

                    <p className="mb-2 text-sm font-semibold tracking-[0.2em] text-[#7A2E3A]">
                        AVA EATS
                    </p>

                    <h1 className="text-3xl font-bold leading-tight text-[#2A2620]">
                        Daftar Akun Baru
                    </h1>

                    <p className="mt-3 text-sm leading-6 text-[#6B6459]">
                        Buat akun customer untuk simpan alamat pengiriman, lacak pesanan, dan checkout lebih praktis.
                    </p>
                </div>

                <form onSubmit={handleRegister} className="space-y-4">
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
                            htmlFor="reg-name"
                            className="mb-1.5 block text-sm font-semibold text-[#2A2620]"
                        >
                            Nama Lengkap
                        </label>
                        <input
                            id="reg-name"
                            type="text"
                            autoComplete="name"
                            placeholder="Contoh: Sarah Wijaya"
                            value={name}
                            disabled={loading || Boolean(successMsg)}
                            onChange={(e) => setName(e.target.value)}
                            required
                            className="w-full rounded-xl border border-[#E8D6CE] bg-white px-4 py-3 text-base text-[#2A2620] outline-none transition focus:border-[#7A2E3A] focus:ring-2 focus:ring-[#7A2E3A]/10 disabled:opacity-60"
                        />
                    </div>

                    <div>
                        <label
                            htmlFor="reg-phone"
                            className="mb-1.5 block text-sm font-semibold text-[#2A2620]"
                        >
                            Nomor WhatsApp
                        </label>
                        <input
                            id="reg-phone"
                            type="tel"
                            autoComplete="tel"
                            inputMode="tel"
                            placeholder="Contoh: 081234567890"
                            value={phone}
                            disabled={loading || Boolean(successMsg)}
                            onChange={(e) => setPhone(e.target.value)}
                            required
                            className="w-full rounded-xl border border-[#E8D6CE] bg-white px-4 py-3 text-base text-[#2A2620] outline-none transition focus:border-[#7A2E3A] focus:ring-2 focus:ring-[#7A2E3A]/10 disabled:opacity-60"
                        />
                        <span className="mt-1 block text-xs text-[#6B6459]">
                            Digunakan untuk login dan konfirmasi kurir/pengiriman.
                        </span>
                    </div>

                    <div>
                        <label
                            htmlFor="reg-password"
                            className="mb-1.5 block text-sm font-semibold text-[#2A2620]"
                        >
                            Password
                        </label>
                        <div className="flex items-center rounded-xl border border-[#E8D6CE] bg-white pr-4 transition focus-within:border-[#7A2E3A] focus-within:ring-2 focus-within:ring-[#7A2E3A]/10">
                            <input
                                id="reg-password"
                                type={showPassword ? "text" : "password"}
                                autoComplete="new-password"
                                placeholder="Minimal 6 karakter"
                                value={password}
                                disabled={loading || Boolean(successMsg)}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                minLength={6}
                                className="w-full rounded-xl bg-transparent px-4 py-3 text-base text-[#2A2620] outline-none disabled:opacity-60"
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

                    <div>
                        <label
                            htmlFor="reg-confirm-password"
                            className="mb-1.5 block text-sm font-semibold text-[#2A2620]"
                        >
                            Konfirmasi Password
                        </label>
                        <input
                            id="reg-confirm-password"
                            type={showPassword ? "text" : "password"}
                            autoComplete="new-password"
                            placeholder="Ulangi password di atas"
                            value={confirmPassword}
                            disabled={loading || Boolean(successMsg)}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required
                            minLength={6}
                            className="w-full rounded-xl border border-[#E8D6CE] bg-white px-4 py-3 text-base text-[#2A2620] outline-none transition focus:border-[#7A2E3A] focus:ring-2 focus:ring-[#7A2E3A]/10 disabled:opacity-60"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading || Boolean(successMsg)}
                        className="mt-2 w-full rounded-xl bg-[#7A2E3A] px-4 py-4 font-semibold text-white transition hover:bg-[#652530] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {successMsg ? "Mengalihkan..." : loading ? "Mendaftarkan akun..." : "Daftar Akun"}
                    </button>
                </form>

                <div className="mt-6 rounded-2xl border border-[#E8D6CE] bg-[#FAF7F2] p-4 text-center">
                    <p className="text-sm text-[#6B6459]">
                        Sudah punya akun Ava Eats?
                    </p>
                    <Link
                        href={redirectTo && redirectTo !== "/" ? `/login?redirect=${encodeURIComponent(redirectTo)}` : "/login"}
                        className="mt-1.5 inline-block text-sm font-bold text-[#7A2E3A] hover:underline"
                    >
                        Masuk ke Akun Saya →
                    </Link>
                </div>

                <p className="mt-6 text-center text-xs leading-5 text-[#6B6459]">
                    Dengan mendaftar, akun lo akan tersimpan dengan aman dan dapat digunakan di setiap pemesanan.
                </p>
            </div>
        </main>
    );
}

export default function RegisterPage() {
    return (
        <Suspense fallback={
            <main className="flex min-h-screen items-center justify-center bg-[#F8F3E9]">
                <p className="text-sm text-[#6B6459]">Memuat halaman pendaftaran...</p>
            </main>
        }>
            <RegisterForm />
        </Suspense>
    );
}
