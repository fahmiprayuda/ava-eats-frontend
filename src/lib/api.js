const API_BASE_URL =
    process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api";

export async function apiRequest(path, options = {}) {
    const token =
        typeof window !== "undefined"
            ? localStorage.getItem("ava_eats_access_token")
            : null;

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
