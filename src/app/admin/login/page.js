"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/lib/api";

function AdminLoginForm() {
    const router = useRouter();

    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [successMsg, setSuccessMsg] = useState("");

    async function handleLogin(e) {
        e.preventDefault();
        setError("");
        setSuccessMsg("");
        setLoading(true);

        try {
            // Panggil endpoint login admin: POST /api/auth/login
            const result = await apiRequest("/auth/login", {
                method: "POST",
                body: JSON.stringify({
                    username: username.trim(),
                    password,
                }),
            });

            if (!result.access_token) {
                throw new Error("Token otorisasi admin tidak ditemukan.");
            }

            // Simpan token admin secara terpisah dari token customer
            localStorage.setItem("ava_eats_admin_token", result.access_token);
            localStorage.setItem(
                "ava_eats_admin_user",
                JSON.stringify(result.admin || { username: username.trim(), role: "admin" })
            );

            setSuccessMsg(`Login berhasil! Mengalihkan ke Dashboard Admin... 🚀`);

            setTimeout(() => {
                router.push("/admin");
            }, 1000);
        } catch (err) {
            setError(
                err.message || "Login admin gagal. Periksa username dan password lo."
            );
            setLoading(false);
        }
    }

    return (
        <main className="min-h-screen bg-[#1F191A] px-4 py-12 text-[#FAF7F2] flex items-center justify-center">
            <div className="w-full max-w-[420px]">
                {/* Brand Header */}
                <div className="text-center mb-8">
                    <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl bg-white p-1 shadow-lg shadow-[#7A2E3A]/40 ring-2 ring-[#E8A598]/40">
                        <img src="/logo.png" alt="Ava Eats Admin" className="h-full w-full object-cover rounded-xl" />
                    </div>
                    <span className="rounded-full bg-[#7A2E3A]/40 px-3 py-1 text-[11px] font-bold tracking-widest text-[#E8A598] uppercase">
                        Internal Portal
                    </span>
                    <h1 className="mt-3 text-2xl font-bold tracking-tight text-white">
                        Ava Eats Admin Portal
                    </h1>
                    <p className="mt-1 text-xs text-[#A89F97]">
                        Masuk untuk mengelola pesanan, stok menu, kurir & audit trail.
                    </p>
                </div>

                {/* Login Card */}
                <div className="rounded-3xl border border-[#3A2F31] bg-[#2A2224] p-7 shadow-2xl">
                    {successMsg && (
                        <div
                            role="status"
                            className="mb-5 rounded-xl border border-green-500/30 bg-green-950/50 px-4 py-3 text-xs font-semibold text-green-300"
                        >
                            ✓ {successMsg}
                        </div>
                    )}

                    {error && (
                        <div
                            role="alert"
                            className="mb-5 rounded-xl border border-red-500/30 bg-red-950/50 px-4 py-3 text-xs font-semibold text-red-300"
                        >
                            ✕ {error}
                        </div>
                    )}

                    <form onSubmit={handleLogin} className="space-y-4">
                        <div>
                            <label
                                htmlFor="admin-username"
                                className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[#D1C7BD]"
                            >
                                Username Admin
                            </label>
                            <input
                                id="admin-username"
                                type="text"
                                autoComplete="username"
                                placeholder="Contoh: admin_fahmi"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                required
                                disabled={loading || Boolean(successMsg)}
                                className="w-full rounded-xl border border-[#4A3C3E] bg-[#1E1719] px-4 py-3 text-sm text-white placeholder-[#786D6B] outline-none transition focus:border-[#E8A598] focus:ring-2 focus:ring-[#7A2E3A]/40 disabled:opacity-50"
                            />
                        </div>

                        <div>
                            <label
                                htmlFor="admin-password"
                                className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[#D1C7BD]"
                            >
                                Password Admin
                            </label>
                            <div className="flex items-center rounded-xl border border-[#4A3C3E] bg-[#1E1719] pr-3 transition focus-within:border-[#E8A598] focus-within:ring-2 focus-within:ring-[#7A2E3A]/40">
                                <input
                                    id="admin-password"
                                    type={showPassword ? "text" : "password"}
                                    autoComplete="current-password"
                                    placeholder="Masukkan password admin"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    disabled={loading || Boolean(successMsg)}
                                    className="w-full bg-transparent px-4 py-3 text-sm text-white placeholder-[#786D6B] outline-none disabled:opacity-50"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="text-xs font-semibold text-[#E8A598] hover:text-white"
                                >
                                    {showPassword ? "Tutup" : "Lihat"}
                                </button>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading || Boolean(successMsg)}
                            className="mt-2 w-full rounded-xl bg-[#7A2E3A] py-3.5 text-sm font-semibold text-white shadow-lg shadow-[#7A2E3A]/30 transition hover:bg-[#913745] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {successMsg ? "Mengalihkan..." : loading ? "Memverifikasi Otoritas..." : "Masuk ke Dashboard"}
                        </button>
                    </form>
                </div>

                {/* Footer link to public store */}
                <div className="mt-8 text-center">
                    <Link
                        href="/"
                        className="inline-flex items-center gap-1.5 text-xs text-[#8C827B] hover:text-white transition"
                    >
                        <span>←</span> Kembali ke Halaman Utama Pelanggan
                    </Link>
                </div>
            </div>
        </main>
    );
}

export default function AdminLoginPage() {
    return (
        <Suspense fallback={
            <main className="flex min-h-screen items-center justify-center bg-[#1F191A] text-white">
                <p className="text-sm">Memuat portal admin...</p>
            </main>
        }>
            <AdminLoginForm />
        </Suspense>
    );
}
