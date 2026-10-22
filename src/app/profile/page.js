"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/lib/api";

export default function ProfilePage() {
    const router = useRouter();

    const [customer, setCustomer] = useState(null);
    const [name, setName] = useState("");
    const [phone, setPhone] = useState("");

    // Form Ganti Password
    const [isChangingPassword, setIsChangingPassword] = useState(false);
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmNewPassword, setConfirmNewPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [successMsg, setSuccessMsg] = useState("");

    useEffect(() => {
        const token = localStorage.getItem("ava_eats_access_token");
        if (!token) {
            router.push("/login?redirect=/profile");
            return;
        }

        async function fetchProfile() {
            try {
                const data = await apiRequest("/customers/me");
                setCustomer(data);
                setName(data.name || "");
                setPhone(data.phone || "");
                localStorage.setItem("ava_eats_customer", JSON.stringify(data));
            } catch (err) {
                setError(err.message || "Gagal memuat profil customer.");
            } finally {
                setLoading(false);
            }
        }

        fetchProfile();
    }, [router]);

    async function handleUpdateProfile(e) {
        e.preventDefault();
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

        const payload = {
            name: trimmedName,
            phone: trimmedPhone,
        };

        if (isChangingPassword) {
            if (!currentPassword) {
                setError("Masukkan password saat ini untuk melakukan perubahan password.");
                return;
            }
            if (newPassword.length < 6) {
                setError("Password baru minimal 6 karakter.");
                return;
            }
            if (newPassword !== confirmNewPassword) {
                setError("Konfirmasi password baru tidak cocok.");
                return;
            }
            payload.current_password = currentPassword;
            payload.new_password = newPassword;
        }

        setSaving(true);

        try {
            const res = await apiRequest("/customers/me", {
                method: "PUT",
                body: JSON.stringify(payload),
            });

            if (res.access_token) {
                localStorage.setItem("ava_eats_access_token", res.access_token);
            }
            if (res.customer) {
                setCustomer(res.customer);
                setName(res.customer.name);
                setPhone(res.customer.phone);
                localStorage.setItem("ava_eats_customer", JSON.stringify(res.customer));
            }

            // Reset password inputs
            setCurrentPassword("");
            setNewPassword("");
            setConfirmNewPassword("");
            setIsChangingPassword(false);

            setSuccessMsg("Profil berhasil diperbarui! ✨");
            setTimeout(() => setSuccessMsg(""), 4000);
        } catch (err) {
            setError(err.message || "Gagal memperbarui profil.");
        } finally {
            setSaving(false);
        }
    }

    function handleLogout() {
        const cName = customer?.name || "Moms";
        localStorage.removeItem("ava_eats_access_token");
        localStorage.removeItem("ava_eats_customer");
        localStorage.removeItem("ava_eats_checkout_cart");
        localStorage.removeItem("ava_eats_checkout_draft");
        router.push(`/?logout=1&name=${encodeURIComponent(cName)}`);
    }

    if (loading) {
        return (
            <main className="flex min-h-screen items-center justify-center bg-[#F8F3E9]">
                <p className="text-sm font-medium text-[#6B6459]">Memuat profil Moms...</p>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-[#F8F3E9] px-4 py-8">
            <div className="mx-auto w-full max-w-[500px]">
                {/* Header Nav */}
                <div className="mb-6 flex items-center justify-between">
                    <Link
                        href="/"
                        className="inline-flex items-center gap-2 text-sm font-medium text-[#6B6459] hover:text-[#7A2E3A]"
                    >
                        <span aria-hidden="true">←</span>
                        Kembali ke Menu
                    </Link>

                    <div className="flex items-center gap-2">
                        <Link
                            href="/addresses"
                            className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-[#7A2E3A] border border-[#E8D6CE] hover:bg-[#FAF7F2]"
                        >
                            📍 Buku Alamat
                        </Link>
                        <Link
                            href="/orders"
                            className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-[#7A2E3A] border border-[#E8D6CE] hover:bg-[#FAF7F2]"
                        >
                            📦 Pesanan
                        </Link>
                    </div>
                </div>

                {/* Profile Header Card */}
                <div className="mb-4 rounded-2xl border border-[#E8D6CE] bg-white p-6 shadow-sm">
                    <div className="flex items-center gap-4">
                        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[#7A2E3A] text-2xl font-bold text-white shadow-inner">
                            {customer?.name ? customer.name.charAt(0).toUpperCase() : "M"}
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                                <h1 className="truncate text-xl font-bold text-[#2A2620]">
                                    {customer?.name || "Customer"}
                                </h1>
                                <span className="shrink-0 rounded-full bg-[#6E8F63]/15 px-2.5 py-0.5 text-xs font-semibold text-[#496442]">
                                    Member
                                </span>
                            </div>
                            <p className="mt-0.5 text-sm text-[#6B6459]">
                                {customer?.phone || "-"}
                            </p>
                            <p className="mt-1 text-xs text-[#80515A]">
                                Pelanggan Terdaftar Ava Eats
                            </p>
                        </div>
                    </div>
                </div>

                {/* Quick Link Alamat */}
                <Link
                    href="/addresses"
                    className="mb-6 flex items-center justify-between rounded-2xl border border-[#E8D6CE] bg-white p-4 shadow-sm transition hover:bg-[#FAF7F2]"
                >
                    <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FAF0E6] text-lg">
                            📍
                        </span>
                        <div>
                            <strong className="block text-sm text-[#2A2620]">
                                Buku Alamat Pengiriman
                            </strong>
                            <span className="text-xs text-[#6B6459]">
                                Kelola alamat rumah, kantor, dan titik GPS kurir
                            </span>
                        </div>
                    </div>
                    <span className="text-xs font-bold text-[#7A2E3A]">Kelola →</span>
                </Link>

                {/* Form Edit Profile */}
                <div className="rounded-2xl border border-[#E8D6CE] bg-white p-6 shadow-sm">
                    <h2 className="mb-1 text-lg font-bold text-[#2A2620]">
                        Edit Informasi Profil
                    </h2>
                    <p className="mb-6 text-xs text-[#6B6459]">
                        Perbarui nama akun, nomor WhatsApp, atau ubah kata sandi lo.
                    </p>

                    {successMsg && (
                        <div
                            role="status"
                            className="mb-5 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-800"
                        >
                            ✓ {successMsg}
                        </div>
                    )}

                    {error && (
                        <div
                            role="alert"
                            className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                        >
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleUpdateProfile} className="space-y-4">
                        <div>
                            <label
                                htmlFor="prof-name"
                                className="mb-1.5 block text-sm font-semibold text-[#2A2620]"
                            >
                                Nama Lengkap
                            </label>
                            <input
                                id="prof-name"
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                required
                                disabled={saving}
                                className="w-full rounded-xl border border-[#E8D6CE] bg-[#FAF7F2] px-4 py-3 text-base text-[#2A2620] outline-none transition focus:border-[#7A2E3A] focus:bg-white focus:ring-2 focus:ring-[#7A2E3A]/10"
                            />
                        </div>

                        <div>
                            <label
                                htmlFor="prof-phone"
                                className="mb-1.5 block text-sm font-semibold text-[#2A2620]"
                            >
                                Nomor WhatsApp
                            </label>
                            <input
                                id="prof-phone"
                                type="tel"
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                required
                                disabled={saving}
                                className="w-full rounded-xl border border-[#E8D6CE] bg-[#FAF7F2] px-4 py-3 text-base text-[#2A2620] outline-none transition focus:border-[#7A2E3A] focus:bg-white focus:ring-2 focus:ring-[#7A2E3A]/10"
                            />
                            <span className="mt-1 block text-xs text-[#6B6459]">
                                Nomor WhatsApp digunakan untuk verifikasi login dan komunikasi kurir.
                            </span>
                        </div>

                        {/* Toggle Ganti Password */}
                        <div className="pt-2">
                            <button
                                type="button"
                                onClick={() => setIsChangingPassword(!isChangingPassword)}
                                className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#7A2E3A] hover:underline"
                            >
                                {isChangingPassword ? "✕ Batal ubah password" : "🔒 Ingin ganti password?"}
                            </button>
                        </div>

                        {isChangingPassword && (
                            <div className="space-y-3.5 rounded-xl border border-[#E8D6CE] bg-[#FAF7F2] p-4">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold uppercase tracking-wider text-[#7A2E3A]">
                                        Ubah Kata Sandi
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="text-xs font-semibold text-[#6B6459] hover:text-[#2A2620]"
                                    >
                                        {showPassword ? "Sembunyikan" : "Lihat Kata Sandi"}
                                    </button>
                                </div>

                                <div>
                                    <label
                                        htmlFor="prof-cur-pw"
                                        className="mb-1 block text-xs font-semibold text-[#2A2620]"
                                    >
                                        Password Saat Ini
                                    </label>
                                    <input
                                        id="prof-cur-pw"
                                        type={showPassword ? "text" : "password"}
                                        placeholder="Masukkan password saat ini"
                                        value={currentPassword}
                                        onChange={(e) => setCurrentPassword(e.target.value)}
                                        className="w-full rounded-lg border border-[#E8D6CE] bg-white px-3 py-2 text-sm text-[#2A2620] outline-none focus:border-[#7A2E3A]"
                                    />
                                </div>

                                <div>
                                    <label
                                        htmlFor="prof-new-pw"
                                        className="mb-1 block text-xs font-semibold text-[#2A2620]"
                                    >
                                        Password Baru
                                    </label>
                                    <input
                                        id="prof-new-pw"
                                        type={showPassword ? "text" : "password"}
                                        placeholder="Minimal 6 karakter"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        className="w-full rounded-lg border border-[#E8D6CE] bg-white px-3 py-2 text-sm text-[#2A2620] outline-none focus:border-[#7A2E3A]"
                                    />
                                </div>

                                <div>
                                    <label
                                        htmlFor="prof-confirm-pw"
                                        className="mb-1 block text-xs font-semibold text-[#2A2620]"
                                    >
                                        Konfirmasi Password Baru
                                    </label>
                                    <input
                                        id="prof-confirm-pw"
                                        type={showPassword ? "text" : "password"}
                                        placeholder="Ulangi password baru"
                                        value={confirmNewPassword}
                                        onChange={(e) => setConfirmNewPassword(e.target.value)}
                                        className="w-full rounded-lg border border-[#E8D6CE] bg-white px-3 py-2 text-sm text-[#2A2620] outline-none focus:border-[#7A2E3A]"
                                    />
                                </div>
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={saving}
                            className="mt-3 w-full rounded-xl bg-[#7A2E3A] px-4 py-3.5 font-semibold text-white transition hover:bg-[#652530] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {saving ? "Menyimpan Perubahan..." : "Simpan Perubahan"}
                        </button>
                    </form>
                </div>

                {/* Additional Action / Logout */}
                <div className="mt-6 flex flex-col items-center gap-3">
                    <button
                        type="button"
                        onClick={handleLogout}
                        className="rounded-xl border border-red-200 bg-red-50/60 px-5 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-100"
                    >
                        🚪 Keluar dari Akun (Logout)
                    </button>

                    <p className="text-xs text-[#6B6459]">
                        Ava Eats Customer Management &copy; {new Date().getFullYear()}
                    </p>
                </div>
            </div>
        </main>
    );
}
