const API_BASE_URL =
    process.env.NEXT_PUBLIC_API_URL || "https://ava-eats-api-production.up.railway.app/api";

/**
 * Mengubah path relatif gambar (misal: /uploads/refunds/...) menjadi URL lengkap ke backend.
 */
export function getImageUrl(path) {
    if (!path || typeof path !== "string") return "";

    // Jika gambar tersimpan dengan URL localhost/127.0.0.1, arahkan ke URL live backend
    if (path.includes("localhost:8000") || path.includes("127.0.0.1:8000")) {
        const cleanPath = path.replace(/^https?:\/\/[^\/]+/, "");
        const backendRoot = API_BASE_URL.replace(/\/api\/?$/, "");
        return `${backendRoot}${cleanPath.startsWith("/") ? "" : "/"}${cleanPath}`;
    }

    if (
        path.startsWith("http://") ||
        path.startsWith("https://") ||
        path.startsWith("data:")
    ) {
        return path;
    }
    const backendRoot = API_BASE_URL.replace(/\/api\/?$/, "");
    return `${backendRoot}${path.startsWith("/") ? "" : "/"}${path}`;
}

/**
 * Mem-parse string tanggal/waktu dari backend UTC menjadi objek Date lokal (WIB / browser).
 * Menangani kasus di mana backend mengembalikan ISO string tanpa akhiran 'Z' (naive UTC).
 */
export function parseUtcDate(val) {
    if (!val) return null;
    if (val instanceof Date) return val;
    if (typeof val === "string") {
        const trimmed = val.trim();
        if (!trimmed) return null;
        // Jika belum ada 'Z' dan belum ada offset (+07:00 / -05:00), tambahkan 'Z' agar dibaca sebagai UTC
        if (!trimmed.endsWith("Z") && !/[+-]\d{2}(:\d{2})?$/.test(trimmed)) {
            return new Date(trimmed + "Z");
        }
        return new Date(trimmed);
    }
    return new Date(val);
}

/**
 * Memformat tanggal UTC ke string format lokal Indonesia (WIB).
 */
export function formatDateTime(val, options = {}) {
    const d = parseUtcDate(val);
    if (!d || isNaN(d.getTime())) return "-";
    return d.toLocaleString("id-ID", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        ...options,
    });
}

/**
 * Cek apakah JWT token sudah kedaluwarsa berdasarkan field 'exp' di payload.
 */
export function isTokenExpired(token) {
    if (!token || typeof token !== "string") return true;
    try {
        const parts = token.split(".");
        if (parts.length < 2) return true;

        const payloadBase64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
        const jsonPayload = decodeURIComponent(
            atob(payloadBase64)
                .split("")
                .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
                .join("")
        );

        const payload = JSON.parse(jsonPayload);
        if (!payload.exp) return false;

        // Expired jika waktu sekarang melebihi exp (dengan buffer 5 detik)
        return Date.now() >= payload.exp * 1000 - 5000;
    } catch {
        return false;
    }
}

/**
 * Hapus sesi login lokal dan arahkan user ke halaman login.
 */
export function handleSessionExpired(customRedirect) {
    if (typeof window === "undefined") return;

    localStorage.removeItem("ava_eats_access_token");
    localStorage.removeItem("ava_eats_customer");

    // Jangan redirect jika user memang sudah di halaman login
    if (window.location.pathname === "/login") return;

    const currentTarget =
        customRedirect ||
        (window.location.pathname + window.location.search);

    const loginUrl = `/login?redirect=${encodeURIComponent(currentTarget)}&expired=1`;
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = loginUrl;
}

export async function apiRequest(path, options = {}) {
    let token = null;
    if (typeof window !== "undefined") {
        if (options.useAdminToken || path.startsWith("/admins")) {
            token = localStorage.getItem("ava_eats_admin_token");
        } else {
            token = localStorage.getItem("ava_eats_access_token");
        }
    }

    // Jika token sudah expired secara lokal sebelum request dikirim
    if (token && isTokenExpired(token) && !path.startsWith("/admins")) {
        token = null;
        if (typeof window !== "undefined") {
            localStorage.removeItem("ava_eats_access_token");
            localStorage.removeItem("ava_eats_customer");

            // Jika endpoint butuh autentikasi customer, langsung arahkan ke login
            if (
                path.startsWith("/customers/me") ||
                path.startsWith("/orders") ||
                path.startsWith("/payments")
            ) {
                handleSessionExpired();
                const err = new Error(
                    "Sesi login telah berakhir. Silakan masuk kembali."
                );
                err.status = 401;
                throw err;
            }
        }
    }

    const isFormData =
        typeof FormData !== "undefined" && options.body instanceof FormData;

    const headers = {
        Accept: "application/json",
        ...(options.body && !isFormData ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
    };

    const response = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        headers,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        // Tangani 401 Unauthorized dari server (token expired / invalid)
        if (response.status === 401 && path !== "/customers/login" && path !== "/auth/login") {
            if (path.startsWith("/admins") || options.useAdminToken) {
                if (typeof window !== "undefined") {
                    localStorage.removeItem("ava_eats_admin_token");
                    localStorage.removeItem("ava_eats_admin_user");
                    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
                    window.location.href = "/admin/login?expired=1";
                }
            } else {
                handleSessionExpired();
            }
        }

        const message =
            data.detail || data.message || "Terjadi kesalahan pada server.";

        // Attach HTTP status to the error for auth guards
        const error = new Error(message);
        error.status = response.status;
        throw error;
    }

    return data;
}

export { API_BASE_URL };
