const API_BASE_URL =
    process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api";

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
    let token =
        typeof window !== "undefined"
            ? localStorage.getItem("ava_eats_access_token")
            : null;

    // Jika token sudah expired secara lokal sebelum request dikirim
    if (token && isTokenExpired(token)) {
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

    const headers = {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
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
        if (response.status === 401 && path !== "/customers/login") {
            handleSessionExpired();
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
