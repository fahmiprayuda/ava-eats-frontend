"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiRequest, getImageUrl } from "@/lib/api";

export default function AdminDashboardPage() {
    const router = useRouter();
    const fileInputRef = useRef(null);

    const [adminUser] = useState(() => {
        if (typeof window === "undefined") return null;
        try {
            const userStr = localStorage.getItem("ava_eats_admin_user");
            return userStr ? JSON.parse(userStr) : null;
        } catch {
            return null;
        }
    });
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState("orders"); // "orders", "products", "audit"

    // Orders state
    const [orders, setOrders] = useState([]);
    const [ordersLoading, setOrdersLoading] = useState(false);
    const [orderFilter, setOrderFilter] = useState("all");

    // Products state
    const [products, setProducts] = useState([]);
    const [productsLoading, setProductsLoading] = useState(false);

    // Stock adjustments draft state (prodId -> temporary pending stock)
    const [stockEdits, setStockEdits] = useState({});

    // Product Modal state (Add / Edit)
    const [showProductModal, setShowProductModal] = useState(false);
    const [editingProduct, setEditingProduct] = useState(null);
    const [prodName, setProdName] = useState("");
    const [prodDescription, setProdDescription] = useState("");
    const [prodPrice, setProdPrice] = useState(35000);
    const [prodWeight, setProdWeight] = useState(350);
    const [prodStock, setProdStock] = useState(10);
    const [prodImage, setProdImage] = useState("");
    const [prodAvailable, setProdAvailable] = useState(true);
    const [savingProduct, setSavingProduct] = useState(false);
    const [uploadingImage, setUploadingImage] = useState(false);
    const [showCustomUrl, setShowCustomUrl] = useState(false);

    // Audit trails state
    const [auditTrails, setAuditTrails] = useState([]);
    const [auditTotal, setAuditTotal] = useState(0);
    const [auditLoading, setAuditLoading] = useState(false);
    const [auditSearch, setAuditSearch] = useState("");

    // Cancellation & Refund Modal states
    const [cancelModalOrder, setCancelModalOrder] = useState(null);
    const [cancelReasonPreset, setCancelReasonPreset] = useState("Stok menu habis mendadak");
    const [cancelCustomReason, setCancelCustomReason] = useState("");
    const [cancelSubmitting, setCancelSubmitting] = useState(false);

    const [refundModalOrder, setRefundModalOrder] = useState(null);
    const [refundNoteInput, setRefundNoteInput] = useState("Transfer manual via m-Banking");
    const [refundProofUrl, setRefundProofUrl] = useState("");
    const [uploadingRefundProof, setUploadingRefundProof] = useState(false);
    const [refundSubmitting, setRefundSubmitting] = useState(false);
    const [previewImageModal, setPreviewImageModal] = useState("");
    const refundFileInputRef = useRef(null);

    // Feedback
    const [toast, setToast] = useState("");
    const [errorMsg, setErrorMsg] = useState("");

    const showToast = (msg) => {
        setToast(msg);
        setTimeout(() => setToast(""), 3500);
    };

    const fetchOrders = useCallback(async () => {
        setOrdersLoading(true);
        try {
            const data = await apiRequest("/orders", { useAdminToken: true });
            setOrders(Array.isArray(data) ? data : []);
        } catch (err) {
            setErrorMsg(err.message || "Gagal memuat daftar pesanan.");
        } finally {
            setOrdersLoading(false);
        }
    }, []);

    const fetchProducts = useCallback(async () => {
        setProductsLoading(true);
        try {
            const data = await apiRequest("/products");
            setProducts(data.products || (Array.isArray(data) ? data : []));
        } catch (err) {
            setErrorMsg(err.message || "Gagal memuat daftar menu.");
        } finally {
            setProductsLoading(false);
        }
    }, []);

    const fetchAuditTrails = useCallback(async (searchQuery = "") => {
        setAuditLoading(true);
        try {
            const query = searchQuery.trim()
                ? `&search=${encodeURIComponent(searchQuery.trim())}`
                : "";
            const res = await apiRequest(`/admins/audit-trails?limit=50${query}`, { useAdminToken: true });
            setAuditTrails(res.audit_trails || []);
            setAuditTotal(res.total || 0);
        } catch (err) {
            setErrorMsg(err.message || "Gagal memuat log audit trail.");
        } finally {
            setAuditLoading(false);
        }
    }, []);

    useEffect(() => {
        const token = localStorage.getItem("ava_eats_admin_token");

        if (!token) {
            router.push("/admin/login");
            return;
        }

        const timer = setTimeout(() => {
            setLoading(false);
            fetchOrders();
            fetchProducts();
            fetchAuditTrails();
        }, 0);

        return () => clearTimeout(timer);
    }, [router, fetchOrders, fetchProducts, fetchAuditTrails]);

    function handleLogout() {
        localStorage.removeItem("ava_eats_admin_token");
        localStorage.removeItem("ava_eats_admin_user");
        router.push("/admin/login");
    }

    async function handleUpdateOrderStatus(orderId, newStatus) {
        try {
            await apiRequest(`/orders/${orderId}/status`, {
                method: "PUT",
                useAdminToken: true,
                body: JSON.stringify({ status: newStatus }),
            });
            showToast(`Status pesanan #${orderId} berhasil diubah ke ${newStatus.toUpperCase()}`);
            fetchOrders();
            fetchAuditTrails();
        } catch (err) {
            alert(err.message || "Gagal memperbarui status pesanan.");
        }
    }

    async function handleSimulatePickup(orderId) {
        try {
            await apiRequest(`/shipping/simulate/${orderId}`, {
                method: "POST",
                useAdminToken: true,
            });
            showToast(`Simulasi kurir pickup berhasil! Status pesanan otomatis: DELIVERED (Dikirim)`);
            fetchOrders();
            fetchAuditTrails();
        } catch (err) {
            alert(err.message || "Gagal menjalankan simulasi kurir.");
        }
    }

    async function handleSimulateDelivered(orderId) {
        try {
            await apiRequest(`/shipping/simulate-delivered/${orderId}`, {
                method: "POST",
                useAdminToken: true,
            });
            showToast(`Simulasi paket tiba berhasil! Status pesanan otomatis: COMPLETED (Selesai)`);
            fetchOrders();
            fetchAuditTrails();
        } catch (err) {
            alert(err.message || "Gagal menjalankan simulasi paket tiba.");
        }
    }

    function openCancelModal(order) {
        setCancelModalOrder(order);
        setCancelReasonPreset("Stok menu habis mendadak");
        setCancelCustomReason("");
    }

    async function handleConfirmCancel() {
        if (!cancelModalOrder) return;
        const finalReason = cancelReasonPreset === "Lainnya"
            ? (cancelCustomReason.trim() || "Dibatalkan oleh Admin")
            : cancelReasonPreset;

        setCancelSubmitting(true);
        try {
            await apiRequest(`/orders/${cancelModalOrder.id}/status`, {
                method: "PUT",
                useAdminToken: true,
                body: JSON.stringify({
                    status: "cancelled",
                    cancellation_reason: finalReason,
                }),
            });
            showToast(`Pesanan #${cancelModalOrder.id} berhasil dibatalkan. Stok telah dikembalikan.`);
            setCancelModalOrder(null);
            fetchOrders();
            fetchAuditTrails();
        } catch (err) {
            alert(err.message || "Gagal membatalkan pesanan.");
        } finally {
            setCancelSubmitting(false);
        }
    }

    function openRefundModal(order) {
        setRefundModalOrder(order);
        setRefundNoteInput("");
        setRefundProofUrl("");
    }

    async function handleRefundProofUpload(e) {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith("image/")) {
            alert("File harus berupa gambar bukti transfer (JPG, PNG, WEBP).");
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            alert("Ukuran bukti transfer maksimal 5 MB.");
            return;
        }

        setUploadingRefundProof(true);
        try {
            const formData = new FormData();
            formData.append("file", file);

            const res = await apiRequest("/orders/upload-refund-proof", {
                method: "POST",
                useAdminToken: true,
                body: formData,
            });

            if (res.proof_url) {
                setRefundProofUrl(res.proof_url);
                showToast("Bukti transfer berhasil diunggah! 🧾");
            }
        } catch (err) {
            alert(err.message || "Gagal mengunggah bukti transfer.");
        } finally {
            setUploadingRefundProof(false);
        }
    }

    async function handleConfirmRefund() {
        if (!refundModalOrder) return;
        setRefundSubmitting(true);
        try {
            await apiRequest(`/orders/${refundModalOrder.id}/refund`, {
                method: "PUT",
                useAdminToken: true,
                body: JSON.stringify({
                    refund_note: refundNoteInput.trim() || "Dana berhasil ditransfer ke pelanggan",
                    refund_proof_url: refundProofUrl || null,
                }),
            });
            showToast(`Pengembalian dana (refund) untuk pesanan #${refundModalOrder.id} berhasil dikonfirmasi!`);
            setRefundModalOrder(null);
            setRefundProofUrl("");
            fetchOrders();
            fetchAuditTrails();
        } catch (err) {
            alert(err.message || "Gagal mengonfirmasi refund.");
        } finally {
            setRefundSubmitting(false);
        }
    }

    async function handleToggleAvailability(productId, currentAvailability, stock) {
        if (!currentAvailability && stock <= 0) {
            alert("Produk tidak bisa diaktifkan karena stok 0. Tambah stok terlebih dahulu.");
            return;
        }

        try {
            await apiRequest(`/products/${productId}/availability`, {
                method: "PUT",
                useAdminToken: true,
                body: JSON.stringify({ is_available: !currentAvailability }),
            });
            showToast(`Ketersediaan menu berhasil diperbarui!`);
            fetchProducts();
            fetchAuditTrails();
        } catch (err) {
            alert(err.message || "Gagal memperbarui ketersediaan.");
        }
    }

    // Modal Add / Edit Product handlers
    function openAddProductModal() {
        setEditingProduct(null);
        setProdName("");
        setProdDescription("");
        setProdPrice(35000);
        setProdWeight(350);
        setProdStock(15);
        setProdImage("");
        setProdAvailable(true);
        setShowCustomUrl(false);
        setShowProductModal(true);
    }

    function openEditProductModal(p) {
        setEditingProduct(p);
        setProdName(p.name || "");
        setProdDescription(p.description || "");
        setProdPrice(p.price || 0);
        setProdWeight(p.weight_grams || 350);
        setProdStock(p.stock || 0);
        setProdImage(p.image || "");
        setProdAvailable(Boolean(p.is_available));
        setShowCustomUrl(Boolean(p.image && !p.image.includes("/uploads/")));
        setShowProductModal(true);
    }

    // Device Image Upload Handler
    async function handleImageFileUpload(e) {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith("image/")) {
            alert("File harus berupa gambar (JPG, PNG, WEBP, GIF).");
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            alert("Ukuran foto maksimal 5 MB.");
            return;
        }

        setUploadingImage(true);
        try {
            const formData = new FormData();
            formData.append("file", file);

            const res = await apiRequest("/products/upload-image", {
                method: "POST",
                useAdminToken: true,
                body: formData,
            });

            if (res.image_url) {
                setProdImage(res.image_url);
                showToast("Foto berhasil diunggah dari perangkat! 📸");
            }
        } catch (err) {
            alert(err.message || "Gagal mengunggah gambar produk.");
        } finally {
            setUploadingImage(false);
        }
    }

    async function handleSaveProduct(e) {
        e.preventDefault();
        setErrorMsg("");

        if (prodName.trim().length < 3) {
            alert("Nama produk minimal 3 karakter.");
            return;
        }

        if (Number(prodPrice) <= 0) {
            alert("Harga produk harus lebih dari 0.");
            return;
        }

        if (Number(prodWeight) <= 0) {
            alert("Berat produk harus lebih dari 0 gram.");
            return;
        }

        const payload = {
            name: prodName.trim(),
            description: prodDescription.trim(),
            price: Number(prodPrice),
            weight_grams: Number(prodWeight),
            stock: Math.max(0, Number(prodStock)),
            image: prodImage.trim() || null,
            is_available: Number(prodStock) === 0 ? false : prodAvailable,
        };

        setSavingProduct(true);

        try {
            if (editingProduct) {
                // Update
                await apiRequest(`/products/${editingProduct.id}`, {
                    method: "PUT",
                    useAdminToken: true,
                    body: JSON.stringify(payload),
                });
                showToast(`Menu '${payload.name}' berhasil diperbarui! ✨`);
            } else {
                // Create
                await apiRequest(`/products`, {
                    method: "POST",
                    useAdminToken: true,
                    body: JSON.stringify(payload),
                });
                showToast(`Menu baru '${payload.name}' berhasil ditambahkan! 🎉`);
            }

            setShowProductModal(false);
            fetchProducts();
            fetchAuditTrails();
        } catch (err) {
            alert(err.message || "Gagal menyimpan produk.");
        } finally {
            setSavingProduct(false);
        }
    }

    async function handleDeleteProduct(p) {
        if (!confirm(`Hapus permanen menu '${p.name}'?`)) return;

        try {
            await apiRequest(`/products/${p.id}`, {
                method: "DELETE",
                useAdminToken: true,
            });
            showToast(`Menu '${p.name}' berhasil dihapus.`);
            fetchProducts();
            fetchAuditTrails();
        } catch (err) {
            alert(err.message || "Gagal menghapus produk.");
        }
    }

    // Local adjustment of stock without calling API immediately
    function adjustPendingStock(productId, currentVal, delta) {
        const nextVal = Math.max(0, currentVal + delta);
        setStockEdits((prev) => ({
            ...prev,
            [productId]: nextVal,
        }));
    }

    // Save stock adjustment to database with a SINGLE audit log entry
    async function handleCommitStock(p, newStock) {
        const payload = {
            name: p.name,
            description: p.description,
            price: p.price,
            weight_grams: p.weight_grams,
            stock: newStock,
            image: p.image,
            is_available: newStock > 0 ? p.is_available : false,
        };

        try {
            await apiRequest(`/products/${p.id}`, {
                method: "PUT",
                useAdminToken: true,
                body: JSON.stringify(payload),
            });
            showToast(`Stok '${p.name}' berhasil disimpan menjadi ${newStock} porsi! 💾`);

            // Clear draft state for this product
            setStockEdits((prev) => {
                const next = { ...prev };
                delete next[p.id];
                return next;
            });

            fetchProducts();
            fetchAuditTrails();
        } catch (err) {
            alert(err.message || "Gagal menyimpan stok.");
        }
    }

    if (loading) {
        return (
            <main className="flex min-h-screen items-center justify-center bg-[#191415] text-white">
                <p className="text-sm">Memeriksa hak akses admin...</p>
            </main>
        );
    }

    const pendingRefundCount = orders.filter(
        (o) => o.status === "cancelled" && o.refund_status === "refund_pending"
    ).length;

    const unprocessedOrdersCount = orders.filter((o) => o.status === "paid").length;

    const filteredOrders = orders.filter((o) => {
        if (orderFilter === "all") return true;
        if (orderFilter === "refund") {
            return o.status === "cancelled" && o.refund_status === "refund_pending";
        }
        return o.status === orderFilter;
    });

    const pendingCookCount = orders.filter((o) => o.status === "paid" || o.status === "processing").length;
    const totalRevenue = orders
        .filter((o) => o.status === "paid" || o.status === "completed" || o.status === "delivered")
        .reduce((sum, o) => sum + (o.grand_total || o.total_amount || 0), 0);

    return (
        <main className="min-h-screen bg-[#191415] text-[#F5EFEB] pb-24 sm:pb-16">
            {/* Topbar - Mobile First Sticky Header */}
            <header className="sticky top-0 z-40 border-b border-[#2E2527] bg-[#221B1D]/95 backdrop-blur-md px-3.5 py-3">
                <div className="mx-auto flex max-w-7xl items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#7A2E3A] text-lg font-bold text-white shadow-sm">
                            🛡️
                        </div>
                        <div className="min-w-0">
                            <span className="block text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-[#E8A598] truncate">
                                AVA EATS ADMIN
                            </span>
                            <h1 className="text-xs sm:text-sm font-bold text-white leading-tight truncate">
                                Operations Portal
                            </h1>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <Link
                            href="/"
                            target="_blank"
                            className="hidden sm:inline-flex items-center gap-1 rounded-xl border border-[#3E3234] px-3 py-1.5 text-xs font-semibold text-[#D1C7BD] hover:bg-[#2E2527] transition"
                        >
                            <span>↗</span> Buka Toko
                        </Link>
                        <div className="flex items-center gap-1.5 rounded-xl bg-[#2E2527] px-2.5 py-1.5">
                            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                            <span className="text-xs font-medium text-white max-w-[80px] sm:max-w-none truncate">
                                {adminUser?.username || "Admin"}
                            </span>
                        </div>
                        <button
                            type="button"
                            onClick={handleLogout}
                            className="rounded-xl border border-red-500/30 bg-red-950/40 px-2.5 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-900/60 transition"
                        >
                            Keluar
                        </button>
                    </div>
                </div>
            </header>

            <div className="mx-auto max-w-7xl px-3 sm:px-4 pt-4 sm:pt-6">
                {/* Toast & Error Notifications */}
                {toast && (
                    <div className="mb-4 rounded-xl border border-emerald-500/40 bg-emerald-950/80 p-3 text-xs font-semibold text-emerald-200 shadow-lg">
                        ✓ {toast}
                    </div>
                )}
                {errorMsg && (
                    <div className="mb-4 rounded-xl border border-red-500/40 bg-red-950/80 p-3 text-xs font-semibold text-red-200 shadow-lg flex items-center justify-between">
                        <span>✕ {errorMsg}</span>
                        <button type="button" onClick={() => setErrorMsg("")} className="text-sm font-bold">×</button>
                    </div>
                )}

                {/* Metric Summary Cards */}
                <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-5 mb-4 sm:mb-6">
                    <div className="rounded-2xl border border-[#342A2C] bg-[#221B1D] p-3.5 sm:p-4">
                        <span className="text-[10px] sm:text-[11px] font-semibold text-[#A89F97] uppercase tracking-wider">
                            Total Omset
                        </span>
                        <p className="mt-1 text-base sm:text-xl font-bold text-white truncate">
                            Rp {totalRevenue.toLocaleString("id-ID")}
                        </p>
                        <span className="text-[9px] sm:text-[10px] text-emerald-400">Order Berhasil</span>
                    </div>

                    <div className="rounded-2xl border border-[#342A2C] bg-[#221B1D] p-3.5 sm:p-4">
                        <span className="text-[10px] sm:text-[11px] font-semibold text-[#A89F97] uppercase tracking-wider">
                            Antrean Siap / Kemas
                        </span>
                        <p className="mt-1 text-base sm:text-xl font-bold text-amber-400">
                            {pendingCookCount} Order
                        </p>
                        <span className="text-[9px] sm:text-[10px] text-[#A89F97]">Paid & Processing</span>
                    </div>

                    <div className={`rounded-2xl border p-3.5 sm:p-4 transition ${pendingRefundCount > 0
                        ? "border-amber-500/50 bg-amber-950/20 shadow-sm shadow-amber-950/40"
                        : "border-[#342A2C] bg-[#221B1D]"
                        }`}>
                        <span className="text-[10px] sm:text-[11px] font-semibold text-[#A89F97] uppercase tracking-wider">
                            Perlu Refund
                        </span>
                        <p className={`mt-1 text-base sm:text-xl font-bold ${pendingRefundCount > 0 ? "text-amber-400" : "text-white"
                            }`}>
                            {pendingRefundCount} Order
                        </p>
                        <span className="text-[9px] sm:text-[10px] text-[#A89F97]">Dana Batal</span>
                    </div>

                    <div className="rounded-2xl border border-[#342A2C] bg-[#221B1D] p-3.5 sm:p-4">
                        <span className="text-[10px] sm:text-[11px] font-semibold text-[#A89F97] uppercase tracking-wider">
                            Menu Aktif
                        </span>
                        <p className="mt-1 text-base sm:text-xl font-bold text-white">
                            {products.filter((p) => p.is_available).length} / {products.length}
                        </p>
                        <span className="text-[9px] sm:text-[10px] text-[#A89F97]">Siap Dipesan</span>
                    </div>

                    <div className="rounded-2xl border border-[#342A2C] bg-[#221B1D] p-3.5 sm:p-4">
                        <span className="text-[10px] sm:text-[11px] font-semibold text-[#A89F97] uppercase tracking-wider">
                            Audit Trail
                        </span>
                        <p className="mt-1 text-base sm:text-xl font-bold text-sky-400">
                            {auditTotal} Log
                        </p>
                        <span className="text-[9px] sm:text-[10px] text-[#A89F97]">Aktivitas Sistem</span>
                    </div>
                </div>

                {/* Mobile Friendly Tabs */}
                <div className="mb-4 sm:mb-6 overflow-x-auto no-scrollbar border-b border-[#2E2527] pb-2 flex gap-2">
                    <button
                        type="button"
                        onClick={() => setActiveTab("orders")}
                        className={`shrink-0 rounded-xl px-3.5 py-2 text-xs font-bold transition inline-flex items-center gap-2 ${activeTab === "orders"
                            ? "bg-[#7A2E3A] text-white shadow-md shadow-[#7A2E3A]/40"
                            : "bg-[#251E20] text-[#A89F97] hover:bg-[#2E2527] hover:text-white"
                            }`}
                    >
                        <span>📦 Pesanan</span>
                        {unprocessedOrdersCount > 0 ? (
                            <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-extrabold text-[#191415] shadow-xs animate-pulse">
                                {unprocessedOrdersCount} Baru
                            </span>
                        ) : null}
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab("products")}
                        className={`shrink-0 rounded-xl px-3.5 py-2 text-xs font-bold transition ${activeTab === "products"
                            ? "bg-[#7A2E3A] text-white shadow-md shadow-[#7A2E3A]/40"
                            : "bg-[#251E20] text-[#A89F97] hover:bg-[#2E2527] hover:text-white"
                            }`}
                    >
                        🍱 Menu & Stok ({products.length})
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab("audit")}
                        className={`shrink-0 rounded-xl px-3.5 py-2 text-xs font-bold transition ${activeTab === "audit"
                            ? "bg-[#7A2E3A] text-white shadow-md shadow-[#7A2E3A]/40"
                            : "bg-[#251E20] text-[#A89F97] hover:bg-[#2E2527] hover:text-white"
                            }`}
                    >
                        📜 Audit Trail ({auditTotal})
                    </button>
                </div>

                {/* ── TAB 1: ORDERS ─────────────────────────────────────────── */}
                {activeTab === "orders" && (
                    <div className="space-y-4">
                        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
                            {[
                                { id: "all", label: "Semua" },
                                ...(pendingRefundCount > 0
                                    ? [{ id: "refund", label: `⚠️ Perlu Refund (${pendingRefundCount})` }]
                                    : []),
                                { id: "paid", label: "Perlu Disiapkan" },
                                { id: "processing", label: "Sedang Disiapkan" },
                                { id: "delivered", label: "Dikirim / Siap Ambil" },
                                { id: "completed", label: "Selesai" },
                                { id: "pending", label: "Menunggu Bayar" },
                                { id: "cancelled", label: "Batal" },
                            ].map((f) => (
                                <button
                                    key={f.id}
                                    type="button"
                                    onClick={() => setOrderFilter(f.id)}
                                    className={`shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${orderFilter === f.id
                                        ? "bg-white text-[#191415]"
                                        : "bg-[#261F21] text-[#9E938C] hover:bg-[#342A2C]"
                                        }`}
                                >
                                    {f.label}
                                </button>
                            ))}
                        </div>

                        {ordersLoading ? (
                            <p className="py-12 text-center text-xs text-[#A89F97]">Memuat daftar pesanan...</p>
                        ) : filteredOrders.length === 0 ? (
                            <div className="rounded-2xl border border-[#342A2C] bg-[#221B1D] p-8 sm:p-12 text-center">
                                <span className="text-3xl">📭</span>
                                <p className="mt-2 text-sm text-[#A89F97]">Tidak ada pesanan dengan filter ini.</p>
                            </div>
                        ) : (
                            <div className="grid gap-3">
                                {filteredOrders.map((ord) => (
                                    <div
                                        key={ord.id}
                                        className="rounded-2xl border border-[#342A2C] bg-[#221B1D] p-4 sm:p-5 shadow-sm transition hover:border-[#4E3E41]"
                                    >
                                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#2E2527] pb-3">
                                            <div className="flex items-center gap-2">
                                                <span className="font-mono text-sm font-bold text-white">
                                                    #{ord.id}
                                                </span>
                                                <span
                                                    className={`rounded-lg px-2 py-0.5 text-[9px] sm:text-[10px] font-bold uppercase tracking-wider ${ord.status === "paid"
                                                        ? "bg-amber-500/20 text-amber-300"
                                                        : ord.status === "processing"
                                                            ? "bg-sky-500/20 text-sky-300"
                                                            : ord.status === "completed" || ord.status === "delivered"
                                                                ? "bg-emerald-500/20 text-emerald-300"
                                                                : ord.status === "cancelled"
                                                                    ? "bg-red-500/20 text-red-300"
                                                                    : "bg-stone-500/20 text-stone-300"
                                                        }`}
                                                >
                                                    {ord.status}
                                                </span>
                                                <span className="rounded-lg bg-[#342A2C] px-2 py-0.5 text-[9px] text-[#A89F97]">
                                                    {((ord.fulfillment_method || ord.order_type) === "delivery") ? "🛵 Delivery" : "🛍️ Pickup"}
                                                </span>
                                            </div>

                                            <div className="text-right">
                                                <span className="text-xs sm:text-sm font-bold text-white">
                                                    Rp {(ord.grand_total || ord.total_amount || 0).toLocaleString("id-ID")}
                                                </span>
                                                <span className="block text-[9px] text-[#A89F97]">
                                                    {ord.created_at ? new Date(ord.created_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "-"}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Items & Notes */}
                                        <div className="mt-3">
                                            <div className="space-y-1">
                                                {(ord.items || []).map((it, idx) => (
                                                    <p key={idx} className="text-xs text-[#D1C7BD]">
                                                        • <span className="font-semibold text-white">{it.quantity}x</span> {it.product_name || `Produk #${it.product_id}`}
                                                        <span className="text-[#A89F97] ml-2">(@ Rp {(it.price || 0).toLocaleString("id-ID")})</span>
                                                    </p>
                                                ))}
                                            </div>
                                            {ord.notes && (
                                                <p className="mt-2 text-[11px] italic text-amber-300/80 bg-amber-950/20 rounded-lg p-2">
                                                    Catatan: &ldquo;{ord.notes}&rdquo;
                                                </p>
                                            )}
                                        </div>

                                        {/* Mobile Action Buttons */}
                                        <div className="mt-3 pt-3 border-t border-[#2E2527] flex flex-wrap items-center justify-between gap-2">
                                            {/* Status / Shipping info indicator */}
                                            <div className="text-[11px]">
                                                {((ord.fulfillment_method || ord.order_type) === "delivery") ? (
                                                    ord.status === "processing" ? (
                                                        <span className="inline-flex items-center gap-1.5 text-amber-300 font-medium">
                                                            <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                                                            Menunggu Kurir Pickup
                                                        </span>
                                                    ) : ord.status === "delivered" ? (
                                                        <span className="inline-flex items-center gap-1.5 text-emerald-300 font-medium">
                                                            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                                                            Sedang Diantar Kurir
                                                        </span>
                                                    ) : ord.status === "completed" ? (
                                                        <span className="text-emerald-400 font-semibold">
                                                            ✓ Pesanan Selesai (Terkirim)
                                                        </span>
                                                    ) : null
                                                ) : (
                                                    ord.status === "delivered" ? (
                                                        <span className="text-emerald-300 font-medium">
                                                            Siap Diambil di Outlet
                                                        </span>
                                                    ) : ord.status === "completed" ? (
                                                        <span className="text-emerald-400 font-semibold">
                                                            ✓ Selesai Diambil
                                                        </span>
                                                    ) : null
                                                )}
                                            </div>

                                            {/* Action Buttons */}
                                            <div className="flex flex-wrap items-center gap-2">
                                                {/* Paid: Siapkan Pesanan */}
                                                {ord.status === "paid" && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleUpdateOrderStatus(ord.id, "processing")}
                                                        className="rounded-xl bg-sky-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-sky-500 transition shadow-sm"
                                                    >
                                                        Siapkan Pesanan (Packing) →
                                                    </button>
                                                )}

                                                {/* DELIVERY ORDER: Status otomatis ikut kurir / biteship */}
                                                {((ord.fulfillment_method || ord.order_type) === "delivery") ? (
                                                    <>
                                                        {ord.status === "processing" && (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleSimulatePickup(ord.id)}
                                                                title="Simulasi kurir menjemput paket (Status otomatis jadi DELIVERED)"
                                                                className="rounded-xl border border-sky-500/40 bg-sky-950/40 px-3 py-2 text-xs font-bold text-sky-300 hover:bg-sky-900/60 transition"
                                                            >
                                                                ⚡ Simulasi Kurir Pickup
                                                            </button>
                                                        )}
                                                        {ord.status === "delivered" && (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleSimulateDelivered(ord.id)}
                                                                title="Simulasi paket telah diterima pembeli (Status otomatis jadi COMPLETED)"
                                                                className="rounded-xl border border-emerald-500/40 bg-emerald-950/40 px-3 py-2 text-xs font-bold text-emerald-300 hover:bg-emerald-900/60 transition"
                                                            >
                                                                ⚡ Simulasi Paket Tiba
                                                            </button>
                                                        )}
                                                    </>
                                                ) : (
                                                    /* PICKUP ORDER: Admin kontrol langsung */
                                                    <>
                                                        {ord.status === "processing" && (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleUpdateOrderStatus(ord.id, "delivered")}
                                                                className="rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-amber-500 transition"
                                                            >
                                                                Siap Diambil di Outlet →
                                                            </button>
                                                        )}
                                                        {ord.status === "delivered" && (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleUpdateOrderStatus(ord.id, "completed")}
                                                                className="rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-500 transition"
                                                            >
                                                                Pesanan Sudah Diambil ✓
                                                            </button>
                                                        )}
                                                    </>
                                                )}

                                                {ord.status !== "completed" && ord.status !== "cancelled" && (
                                                    <button
                                                        type="button"
                                                        onClick={() => openCancelModal(ord)}
                                                        className="rounded-xl border border-red-500/30 px-3 py-2 text-xs font-semibold text-red-300 hover:bg-red-950/60 transition"
                                                    >
                                                        Batalkan
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {/* Cancellation & Refund Status Info */}
                                        {ord.status === "cancelled" && (
                                            <div className="mt-3 pt-3 border-t border-[#2E2527]">
                                                {ord.refund_status === "refund_pending" ? (
                                                    <div className="rounded-xl border border-amber-500/40 bg-amber-950/30 p-3 sm:p-3.5 flex flex-wrap items-center justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <div className="flex items-center gap-2">
                                                                <span className="flex h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                                                                <p className="text-xs font-bold text-amber-300">
                                                                    PERLU PENGEMBALIAN DANA (REFUND): Rp {(ord.grand_total || ord.total_amount || 0).toLocaleString("id-ID")}
                                                                </p>
                                                            </div>
                                                            <p className="mt-1 text-[11px] text-[#D1C7BD]">
                                                                Alasan Batal: <span className="font-semibold text-white">&ldquo;{ord.cancellation_reason || "Dibatalkan oleh Admin"}&rdquo;</span>
                                                            </p>
                                                            <p className="mt-0.5 text-[10px] text-[#A89F97]">
                                                                Tujuan Transfer: <span className="font-medium text-white">{ord.recipient_name}</span> (No. HP/WA: <a href={`https://wa.me/${(ord.phone || '').replace(/^0/, '62')}`} target="_blank" rel="noreferrer" className="text-emerald-400 underline font-semibold">{ord.phone}</a>)
                                                            </p>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => openRefundModal(ord)}
                                                            className="rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-bold text-white shadow-md shadow-amber-600/30 hover:bg-amber-500 transition"
                                                        >
                                                            💸 Konfirmasi Refund Selesai ✓
                                                        </button>
                                                    </div>
                                                ) : ord.refund_status === "refunded" ? (
                                                    <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3">
                                                        <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                                                            <span>✓</span> Refund Selesai (Rp {(ord.grand_total || ord.total_amount || 0).toLocaleString("id-ID")})
                                                        </div>
                                                        <p className="mt-0.5 text-[11px] text-[#D1C7BD]">
                                                            Catatan: &ldquo;{ord.refund_note || "Dana berhasil ditransfer"}&rdquo;
                                                        </p>
                                                        <p className="mt-0.5 text-[10px] text-[#A89F97]">
                                                            Alasan Batal: &ldquo;{ord.cancellation_reason || "-"}&rdquo;
                                                        </p>
                                                        {ord.refund_proof_url && (
                                                            <button
                                                                type="button"
                                                                onClick={() => setPreviewImageModal(ord.refund_proof_url)}
                                                                className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-950/40 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-900/60 transition"
                                                            >
                                                                <span>🧾</span> Lihat Bukti Transfer
                                                            </button>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div className="rounded-xl bg-[#261F21] p-2.5 text-[11px] text-[#A89F97]">
                                                        Dibatalkan sebelum dibayar. Alasan: &ldquo;{ord.cancellation_reason || "Dibatalkan"}&rdquo;
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* ── TAB 2: PRODUCTS (MENU & STOK) ─────────────────────────── */}
                {activeTab === "products" && (
                    <div className="space-y-4">
                        {/* Header Action Button */}
                        <div className="flex items-center justify-between">
                            <div>
                                <h2 className="text-sm font-bold text-white">Daftar Menu & Stok</h2>
                                <p className="text-[11px] text-[#A89F97]">Atur ketersediaan dan stok harian dapur.</p>
                            </div>
                            <button
                                type="button"
                                onClick={openAddProductModal}
                                className="inline-flex items-center gap-1.5 rounded-xl bg-[#7A2E3A] px-3.5 py-2 text-xs font-bold text-white shadow-md shadow-[#7A2E3A]/40 transition hover:bg-[#913745]"
                            >
                                <span>+</span> Tambah Menu Baru
                            </button>
                        </div>

                        {productsLoading ? (
                            <p className="py-12 text-center text-xs text-[#A89F97]">Memuat menu...</p>
                        ) : (
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                {products.map((prod) => {
                                    const currentStock =
                                        stockEdits[prod.id] !== undefined
                                            ? stockEdits[prod.id]
                                            : prod.stock;
                                    const isStockModified =
                                        stockEdits[prod.id] !== undefined &&
                                        stockEdits[prod.id] !== prod.stock;

                                    return (
                                        <div
                                            key={prod.id}
                                            className="rounded-2xl border border-[#342A2C] bg-[#221B1D] p-4 shadow-sm flex flex-col justify-between"
                                        >
                                            <div>
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        {prod.image ? (
                                                            // eslint-disable-next-line @next/next/no-img-element
                                                            <img
                                                                src={getImageUrl(prod.image)}
                                                                alt={prod.name}
                                                                className="h-12 w-12 rounded-xl object-cover shrink-0 border border-[#3E3234]"
                                                            />
                                                        ) : (
                                                            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#2E2527] text-xl shrink-0">
                                                                🍽️
                                                            </div>
                                                        )}
                                                        <div className="min-w-0">
                                                            <h3 className="font-bold text-sm text-white truncate">{prod.name}</h3>
                                                            <span className="block font-semibold text-xs text-emerald-400 mt-0.5">
                                                                Rp {prod.price?.toLocaleString("id-ID")}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    <span
                                                        className={`shrink-0 rounded-lg px-2 py-0.5 text-[10px] font-bold ${prod.is_available && prod.stock > 0
                                                            ? "bg-emerald-500/20 text-emerald-300"
                                                            : "bg-red-500/20 text-red-300"
                                                            }`}
                                                    >
                                                        {prod.is_available && prod.stock > 0 ? "Ready" : "Habis"}
                                                    </span>
                                                </div>

                                                <p className="mt-2 text-xs text-[#A89F97] line-clamp-2">
                                                    {prod.description || "-"}
                                                </p>

                                                <div className="mt-2 text-[11px] text-[#A89F97]">
                                                    ⚖️ Berat Makanan: <strong className="text-white">{prod.weight_grams || 350}g</strong>
                                                </div>
                                            </div>

                                            {/* Local Stepper: Click freely without spamming audit logs */}
                                            <div className="mt-3 rounded-xl border border-[#342A2C] bg-[#1E1719] p-2.5">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[11px] font-semibold text-[#A89F97]">
                                                        Stok:{" "}
                                                        <strong className={`text-sm ${isStockModified ? "text-amber-400 font-bold" : "text-white"}`}>
                                                            {currentStock} porsi
                                                        </strong>
                                                    </span>
                                                    <div className="flex items-center gap-1.5">
                                                        <button
                                                            type="button"
                                                            onClick={() => adjustPendingStock(prod.id, currentStock, -1)}
                                                            className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#2E2527] text-xs font-bold text-white hover:bg-[#3E3234]"
                                                            title="Kurang 1"
                                                        >
                                                            -
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => adjustPendingStock(prod.id, currentStock, 1)}
                                                            className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#2E2527] text-xs font-bold text-white hover:bg-[#3E3234]"
                                                            title="Tambah 1"
                                                        >
                                                            +
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => adjustPendingStock(prod.id, currentStock, 5)}
                                                            className="rounded-lg bg-[#2E2527] px-2 py-1 text-[11px] font-bold text-[#E8A598] hover:bg-[#3E3234]"
                                                            title="Tambah 5"
                                                        >
                                                            +5
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Button Save: Hanya muncul saat stok diubah, 1x klik = 1x audit trail */}
                                                {isStockModified && (
                                                    <div className="mt-2 pt-2 border-t border-[#342A2C] flex items-center justify-between gap-2">
                                                        <span className="text-[10px] text-amber-300 font-medium">
                                                            {prod.stock} ➔ <strong className="text-white font-bold">{currentStock}</strong>
                                                        </span>
                                                        <div className="flex items-center gap-1.5">
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setStockEdits((prev) => {
                                                                        const next = { ...prev };
                                                                        delete next[prod.id];
                                                                        return next;
                                                                    });
                                                                }}
                                                                className="rounded-lg px-2 py-1 text-[10px] text-[#A89F97] hover:text-white"
                                                            >
                                                                Batal
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleCommitStock(prod, currentStock)}
                                                                className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-bold text-white shadow-sm hover:bg-emerald-500 transition"
                                                            >
                                                                💾 Simpan Stok
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Action buttons */}
                                            <div className="mt-3 pt-3 border-t border-[#2E2527] flex items-center justify-between gap-2">
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => openEditProductModal(prod)}
                                                        className="rounded-lg border border-[#3E3234] px-2.5 py-1.5 text-xs font-semibold text-[#D1C7BD] hover:bg-[#2E2527]"
                                                    >
                                                        ✏️ Edit
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeleteProduct(prod)}
                                                        className="text-xs text-red-400 hover:text-red-300"
                                                        title="Hapus Menu"
                                                    >
                                                        Hapus
                                                    </button>
                                                </div>

                                                <button
                                                    type="button"
                                                    onClick={() => handleToggleAvailability(prod.id, prod.is_available, prod.stock)}
                                                    className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${prod.is_available
                                                        ? "bg-red-950/60 border border-red-500/30 text-red-300 hover:bg-red-900/60"
                                                        : "bg-emerald-950/60 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-900/60"
                                                        }`}
                                                >
                                                    {prod.is_available ? "Set Habis" : "Set Ready"}
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* ── TAB 3: AUDIT TRAIL ────────────────────────────────────── */}
                {activeTab === "audit" && (
                    <div className="space-y-4">
                        {/* Audit Search Bar & Controls */}
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                            <div className="relative flex-1 max-w-md">
                                <input
                                    type="text"
                                    value={auditSearch}
                                    onChange={(e) => {
                                        setAuditSearch(e.target.value);
                                        fetchAuditTrails(e.target.value);
                                    }}
                                    placeholder="🔍 Cari log (ID order, aksi, nama admin, keyword)..."
                                    className="w-full rounded-xl border border-[#3E3234] bg-[#221B1D] pl-3.5 pr-8 py-2.5 text-xs text-white placeholder-[#786D6B] outline-none focus:border-[#E8A598]"
                                />
                                {auditSearch && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setAuditSearch("");
                                            fetchAuditTrails("");
                                        }}
                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-[#A89F97] hover:text-white"
                                    >
                                        ✕
                                    </button>
                                )}
                            </div>

                            <div className="flex items-center justify-between sm:justify-end gap-3">
                                <span className="text-[11px] text-[#A89F97]">
                                    {auditTrails.length} dari {auditTotal} aktivitas
                                </span>
                                <button
                                    type="button"
                                    onClick={() => fetchAuditTrails(auditSearch)}
                                    className="rounded-xl border border-[#3E3234] bg-[#221B1D] px-3 py-2 text-xs font-semibold text-[#D1C7BD] hover:bg-[#2E2527] transition"
                                >
                                    ↻ Refresh Log
                                </button>
                            </div>
                        </div>

                        {auditLoading ? (
                            <p className="py-12 text-center text-xs text-[#A89F97]">Memuat audit trail...</p>
                        ) : auditTrails.length === 0 ? (
                            <p className="py-12 text-center text-xs text-[#A89F97]">Belum ada aktivitas audit tersimpan.</p>
                        ) : (
                            <div className="rounded-2xl border border-[#342A2C] bg-[#221B1D] overflow-hidden">
                                <div className="divide-y divide-[#2E2527]">
                                    {auditTrails.map((trail) => (
                                        <div key={trail.id} className="p-3 sm:p-3.5 hover:bg-[#261E20] transition">
                                            <div className="flex flex-wrap items-center justify-between gap-1.5">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="rounded-md bg-[#342A2C] px-1.5 py-0.5 font-mono text-[9px] sm:text-[10px] text-sky-300">
                                                        {trail.action}
                                                    </span>
                                                    <span className="text-xs font-semibold text-white">
                                                        {trail.user_type}:{trail.user_id}
                                                    </span>
                                                    <span className="rounded-md bg-[#7A2E3A]/40 px-1.5 py-0.5 text-[9px] text-[#E8A598]">
                                                        #{trail.entity_id}
                                                    </span>
                                                </div>
                                                <span className="text-[9px] sm:text-[10px] text-[#A89F97] font-mono">
                                                    {trail.created_at ? new Date(trail.created_at).toLocaleString("id-ID") : "-"}
                                                </span>
                                            </div>
                                            <p className="mt-1 text-xs text-[#D1C7BD] leading-relaxed">
                                                {trail.description || "Tidak ada rincian catatan."}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ── MODAL TAMBAH / EDIT MENU (DENGAN UPLOAD FOTO DARI PERANGKAT) ─ */}
            {showProductModal && (
                <div
                    className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4 backdrop-blur-sm"
                    onClick={() => setShowProductModal(false)}
                >
                    <div
                        className="relative max-h-[90vh] w-full max-w-[500px] overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-[#3E3234] bg-[#221B1D] p-5 sm:p-6 shadow-2xl text-white"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between border-b border-[#2E2527] pb-3">
                            <h3 className="text-base font-bold text-white">
                                {editingProduct ? "Edit Menu & Penyesuaian Stok" : "Tambah Menu Makanan Baru"}
                            </h3>
                            <button
                                type="button"
                                onClick={() => setShowProductModal(false)}
                                className="flex h-8 w-8 items-center justify-center rounded-full bg-[#2E2527] text-sm text-[#A89F97] hover:bg-[#3E3234]"
                            >
                                ✕
                            </button>
                        </div>

                        <form onSubmit={handleSaveProduct} className="mt-4 space-y-3.5">
                            <div>
                                <label className="mb-1 block text-xs font-semibold text-[#D1C7BD]">
                                    Nama Menu Makanan
                                </label>
                                <input
                                    type="text"
                                    value={prodName}
                                    onChange={(e) => setProdName(e.target.value)}
                                    placeholder="Contoh: Salmon Mentai Rice"
                                    required
                                    className="w-full rounded-xl border border-[#3E3234] bg-[#191415] px-3.5 py-2.5 text-sm text-white placeholder-[#786D6B] outline-none focus:border-[#E8A598]"
                                />
                            </div>

                            <div>
                                <label className="mb-1 block text-xs font-semibold text-[#D1C7BD]">
                                    Deskripsi Makanan
                                </label>
                                <textarea
                                    rows={2}
                                    value={prodDescription}
                                    onChange={(e) => setProdDescription(e.target.value)}
                                    placeholder="Penjelasan menu, komposisi, atau catatan porsi anak"
                                    className="w-full rounded-xl border border-[#3E3234] bg-[#191415] px-3.5 py-2.5 text-sm text-white placeholder-[#786D6B] outline-none focus:border-[#E8A598]"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="mb-1 block text-xs font-semibold text-[#D1C7BD]">
                                        Harga Jual (IDR)
                                    </label>
                                    <input
                                        type="number"
                                        min={1000}
                                        step={500}
                                        value={prodPrice}
                                        onChange={(e) => setProdPrice(e.target.value)}
                                        placeholder="35000"
                                        required
                                        className="w-full rounded-xl border border-[#3E3234] bg-[#191415] px-3.5 py-2.5 text-sm text-white outline-none focus:border-[#E8A598]"
                                    />
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs font-semibold text-[#D1C7BD]">
                                        Berat Paket (Gram)
                                    </label>
                                    <input
                                        type="number"
                                        min={50}
                                        step={10}
                                        value={prodWeight}
                                        onChange={(e) => setProdWeight(e.target.value)}
                                        placeholder="350"
                                        required
                                        className="w-full rounded-xl border border-[#3E3234] bg-[#191415] px-3.5 py-2.5 text-sm text-white outline-none focus:border-[#E8A598]"
                                    />
                                    <span className="text-[10px] text-[#A89F97] mt-0.5 block">Untuk hitung ongkir kurir</span>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="mb-1 block text-xs font-semibold text-[#D1C7BD]">
                                        Jumlah Stok Porsi
                                    </label>
                                    <input
                                        type="number"
                                        min={0}
                                        value={prodStock}
                                        onChange={(e) => setProdStock(e.target.value)}
                                        placeholder="15"
                                        required
                                        className="w-full rounded-xl border border-[#3E3234] bg-[#191415] px-3.5 py-2.5 text-sm text-white outline-none focus:border-[#E8A598]"
                                    />
                                </div>

                                <div>
                                    <label className="mb-1 block text-xs font-semibold text-[#D1C7BD]">
                                        Status Siap Pesan
                                    </label>
                                    <div className="h-[42px] flex items-center">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={prodAvailable}
                                                onChange={(e) => setProdAvailable(e.target.checked)}
                                                className="h-4 w-4 rounded text-[#7A2E3A]"
                                            />
                                            <span className="text-xs font-medium text-white">
                                                Siap Dipesan (Ready)
                                            </span>
                                        </label>
                                    </div>
                                </div>
                            </div>

                            {/* UPLOAD FOTO DARI PERANGKAT (MOBILE/LAPTOP LOCAL STORAGE) */}
                            <div className="rounded-2xl border border-[#3E3234] bg-[#191415] p-3.5 space-y-2.5">
                                <label className="block text-xs font-semibold text-[#D1C7BD]">
                                    Foto Menu Makanan
                                </label>

                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    onChange={handleImageFileUpload}
                                    className="hidden"
                                />

                                {prodImage ? (
                                    <div className="flex items-center gap-3">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={getImageUrl(prodImage)}
                                            alt="Preview"
                                            className="h-16 w-16 rounded-xl object-cover border border-[#4E3E41]"
                                        />
                                        <div className="min-w-0 flex-1">
                                            <span className="block text-[11px] text-emerald-400 font-semibold truncate">
                                                ✓ Foto berhasil dipilih
                                            </span>
                                            <div className="mt-1 flex gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => fileInputRef.current?.click()}
                                                    disabled={uploadingImage}
                                                    className="rounded-lg border border-[#4E3E41] bg-[#2E2527] px-2.5 py-1 text-[11px] text-[#D1C7BD] hover:bg-[#3E3234]"
                                                >
                                                    Ganti Foto
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setProdImage("")}
                                                    className="rounded-lg px-2 py-1 text-[11px] text-red-400 hover:text-red-300"
                                                >
                                                    Hapus
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => fileInputRef.current?.click()}
                                        disabled={uploadingImage}
                                        className="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-[#5A484B] bg-[#221B1D] py-3 text-xs font-semibold text-[#E8A598] hover:bg-[#2A2123] transition"
                                    >
                                        <span>📷</span>
                                        {uploadingImage ? "Mengunggah Foto dari Perangkat..." : "Pilih Foto dari Galeri / File HP"}
                                    </button>
                                )}

                                <div>
                                    <button
                                        type="button"
                                        onClick={() => setShowCustomUrl(!showCustomUrl)}
                                        className="text-[10px] text-[#A89F97] hover:underline"
                                    >
                                        {showCustomUrl ? "▲ Sembunyikan input URL teks" : "▼ Atau masukkan link URL gambar manual"}
                                    </button>
                                    {showCustomUrl && (
                                        <input
                                            type="text"
                                            value={prodImage}
                                            onChange={(e) => setProdImage(e.target.value)}
                                            placeholder="https://images.unsplash.com/..."
                                            className="mt-1.5 w-full rounded-xl border border-[#3E3234] bg-[#1E1719] px-3 py-2 text-xs text-white placeholder-[#786D6B] outline-none"
                                        />
                                    )}
                                </div>
                            </div>

                            <div className="mt-5 flex gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowProductModal(false)}
                                    className="flex-1 rounded-xl border border-[#3E3234] py-3 text-xs font-bold text-[#D1C7BD] hover:bg-[#2E2527]"
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    disabled={savingProduct || uploadingImage}
                                    className="flex-1 rounded-xl bg-[#7A2E3A] py-3 text-xs font-bold text-white shadow-md shadow-[#7A2E3A]/40 transition hover:bg-[#913745] disabled:opacity-60"
                                >
                                    {savingProduct ? "Menyimpan..." : editingProduct ? "Simpan Perubahan" : "Tambah Menu"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── Cancel Order Modal with Reason ─────────────────────────────────────── */}
            {cancelModalOrder && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div
                        className="fixed inset-0 bg-black/75 backdrop-blur-xs"
                        onClick={() => !cancelSubmitting && setCancelModalOrder(null)}
                    />
                    <div className="relative z-10 w-full max-w-md rounded-2xl border border-red-500/30 bg-[#221B1D] p-5 shadow-2xl">
                        <div className="flex items-center justify-between border-b border-[#2E2527] pb-3">
                            <h3 className="text-sm font-bold text-red-400 flex items-center gap-2">
                                <span>⚠️</span> Batalkan Pesanan #{cancelModalOrder.id}
                            </h3>
                            <button
                                type="button"
                                disabled={cancelSubmitting}
                                onClick={() => setCancelModalOrder(null)}
                                className="text-sm font-bold text-[#A89F97] hover:text-white"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="mt-3 space-y-3">
                            {/* Order Info */}
                            <div className="rounded-xl bg-[#1E1719] p-3 border border-[#342A2C] text-xs space-y-1">
                                <p className="text-[#D1C7BD]">
                                    Kode: <span className="font-mono font-bold text-white">{cancelModalOrder.order_code}</span>
                                </p>
                                <p className="text-[#D1C7BD]">
                                    Customer: <span className="font-semibold text-white">{cancelModalOrder.recipient_name}</span> ({cancelModalOrder.phone})
                                </p>
                                <p className="text-[#D1C7BD]">
                                    Total: <span className="font-bold text-emerald-400">Rp {(cancelModalOrder.grand_total || cancelModalOrder.total_amount || 0).toLocaleString("id-ID")}</span>
                                    <span className="ml-2 rounded-md bg-[#342A2C] px-1.5 py-0.5 text-[9px] uppercase font-bold text-amber-300">
                                        {cancelModalOrder.status}
                                    </span>
                                </p>
                            </div>

                            {/* Warning if already paid */}
                            {["paid", "processing", "delivered"].includes(cancelModalOrder.status) && (
                                <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-3 text-[11px] text-amber-200">
                                    <strong>Perhatian:</strong> Pesanan ini sudah dibayar. Membatalkannya akan otomatis mengembalikan stok ke katalog menu dan menandai pesanan sebagai <strong>REFUND PENDING</strong>.
                                </div>
                            )}

                            {/* Reason Presets */}
                            <div>
                                <label className="block text-[11px] font-semibold text-[#D1C7BD] mb-1.5">
                                    Pilih Alasan Pembatalan:
                                </label>
                                <div className="space-y-1.5">
                                    {[
                                        "Stok menu habis mendadak",
                                        "Outlet tutup lebih awal / kendala dapur",
                                        "Alamat pengiriman di luar jangkauan kurir",
                                        "Permintaan pembatalan dari pelanggan via WhatsApp",
                                        "Lainnya",
                                    ].map((preset) => (
                                        <label
                                            key={preset}
                                            className={`flex items-center gap-2 rounded-xl p-2.5 text-xs cursor-pointer border transition ${cancelReasonPreset === preset
                                                ? "border-red-500/50 bg-red-950/30 text-white font-medium"
                                                : "border-[#342A2C] bg-[#1E1719] text-[#A89F97] hover:bg-[#2E2527]"
                                                }`}
                                        >
                                            <input
                                                type="radio"
                                                name="cancelReason"
                                                value={preset}
                                                checked={cancelReasonPreset === preset}
                                                onChange={(e) => setCancelReasonPreset(e.target.value)}
                                                className="accent-red-500"
                                            />
                                            <span>{preset}</span>
                                        </label>
                                    ))}
                                </div>

                                {cancelReasonPreset === "Lainnya" && (
                                    <textarea
                                        rows={2}
                                        value={cancelCustomReason}
                                        onChange={(e) => setCancelCustomReason(e.target.value)}
                                        placeholder="Tuliskan alasan pembatalan..."
                                        className="mt-2 w-full rounded-xl border border-[#3E3234] bg-[#1E1719] p-2.5 text-xs text-white placeholder-[#786D6B] outline-none focus:border-red-500"
                                    />
                                )}
                            </div>
                        </div>

                        <div className="mt-4 flex gap-2 pt-2 border-t border-[#2E2527]">
                            <button
                                type="button"
                                disabled={cancelSubmitting}
                                onClick={() => setCancelModalOrder(null)}
                                className="flex-1 rounded-xl border border-[#3E3234] py-2.5 text-xs font-bold text-[#D1C7BD] hover:bg-[#2E2527]"
                            >
                                Kembali
                            </button>
                            <button
                                type="button"
                                disabled={cancelSubmitting}
                                onClick={handleConfirmCancel}
                                className="flex-1 rounded-xl bg-red-600 py-2.5 text-xs font-bold text-white shadow-md shadow-red-600/30 hover:bg-red-500 transition disabled:opacity-60"
                            >
                                {cancelSubmitting ? "Membatalkan..." : "Ya, Batalkan Pesanan"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Confirm Refund Modal ───────────────────────────────────────────────── */}
            {refundModalOrder && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div
                        className="fixed inset-0 bg-black/75 backdrop-blur-xs"
                        onClick={() => !refundSubmitting && setRefundModalOrder(null)}
                    />
                    <div className="relative z-10 w-full max-w-md rounded-2xl border border-amber-500/40 bg-[#221B1D] p-5 shadow-2xl">
                        <div className="flex items-center justify-between border-b border-[#2E2527] pb-3">
                            <h3 className="text-sm font-bold text-amber-300 flex items-center gap-2">
                                <span>💸</span> Konfirmasi Pengembalian Dana (Refund)
                            </h3>
                            <button
                                type="button"
                                disabled={refundSubmitting}
                                onClick={() => setRefundModalOrder(null)}
                                className="text-sm font-bold text-[#A89F97] hover:text-white"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="mt-3 space-y-3">
                            <div className="rounded-xl bg-[#1E1719] p-3 border border-[#342A2C] text-xs space-y-1">
                                <p className="text-[#D1C7BD]">
                                    Pesanan: <span className="font-mono font-bold text-white">{refundModalOrder.order_code}</span>
                                </p>
                                <p className="text-[#D1C7BD]">
                                    Penerima: <span className="font-semibold text-white">{refundModalOrder.recipient_name}</span> ({refundModalOrder.phone})
                                </p>
                                <p className="text-sm font-bold text-amber-400 mt-1">
                                    Nominal Refund: Rp {(refundModalOrder.grand_total || refundModalOrder.total_amount || 0).toLocaleString("id-ID")}
                                </p>
                            </div>

                            <p className="text-[11px] text-[#A89F97]">
                                Pastikan dana telah Anda transfer via m-Banking atau E-Wallet ke pelanggan sebelum menandai refund ini selesai.
                            </p>

                            {/* UPLOAD FOTO BUKTI TRANSFER DARI PERANGKAT */}
                            <div className="rounded-2xl border border-[#3E3234] bg-[#191415] p-3.5 space-y-2">
                                <label className="block text-xs font-semibold text-[#D1C7BD]">
                                    Upload Bukti Transfer Refund (Struk m-Banking)
                                </label>

                                <input
                                    ref={refundFileInputRef}
                                    type="file"
                                    accept="image/*"
                                    onChange={handleRefundProofUpload}
                                    className="hidden"
                                />

                                {refundProofUrl ? (
                                    <div className="flex items-center gap-3">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={getImageUrl(refundProofUrl)}
                                            alt="Bukti Transfer"
                                            className="h-16 w-16 rounded-xl object-cover border border-emerald-500/40"
                                        />
                                        <div className="min-w-0 flex-1">
                                            <span className="block text-[11px] text-emerald-400 font-semibold truncate">
                                                ✓ Bukti transfer terunggah
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => refundFileInputRef.current?.click()}
                                                className="mt-1 text-[10px] text-sky-400 underline hover:text-sky-300"
                                            >
                                                Ganti foto bukti
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <button
                                        type="button"
                                        disabled={uploadingRefundProof}
                                        onClick={() => refundFileInputRef.current?.click()}
                                        className="w-full flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-[#5A484B] bg-[#221B1D] py-4 px-3 text-center transition hover:border-amber-400/60 hover:bg-[#2A2123]"
                                    >
                                        <span className="text-2xl">🧾</span>
                                        <span className="text-xs font-bold text-amber-300">
                                            {uploadingRefundProof ? "Mengunggah bukti..." : "+ Upload Screenshot / Foto Bukti Transfer"}
                                        </span>
                                        <span className="text-[10px] text-[#A89F97]">
                                            Ambil dari galeri / kamera (JPG, PNG, maks. 5MB)
                                        </span>
                                    </button>
                                )}
                            </div>

                            <div>
                                <label className="block text-[11px] font-semibold text-[#D1C7BD] mb-1">
                                    Catatan Transfer (Opsional):
                                </label>
                                <input
                                    type="text"
                                    value={refundNoteInput}
                                    onChange={(e) => setRefundNoteInput(e.target.value)}
                                    placeholder="Contoh: Transfer BCA a/n Shavazia"
                                    className="w-full rounded-xl border border-[#3E3234] bg-[#1E1719] px-3 py-2 text-xs text-white placeholder-[#786D6B] outline-none focus:border-amber-500"
                                />
                            </div>
                        </div>

                        <div className="mt-4 flex gap-2 pt-2 border-t border-[#2E2527]">
                            <button
                                type="button"
                                disabled={refundSubmitting}
                                onClick={() => setRefundModalOrder(null)}
                                className="flex-1 rounded-xl border border-[#3E3234] py-2.5 text-xs font-bold text-[#D1C7BD] hover:bg-[#2E2527]"
                            >
                                Batal
                            </button>
                            <button
                                type="button"
                                disabled={refundSubmitting || uploadingRefundProof}
                                onClick={handleConfirmRefund}
                                className="flex-1 rounded-xl bg-amber-600 py-2.5 text-xs font-bold text-white shadow-md shadow-amber-600/30 hover:bg-amber-500 transition disabled:opacity-60"
                            >
                                {refundSubmitting ? "Menyimpan..." : "✓ Konfirmasi Refund Selesai"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Lightbox Image Preview Modal ────────────────────────────────────────── */}
            {previewImageModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div
                        className="fixed inset-0 bg-black/85 backdrop-blur-sm"
                        onClick={() => setPreviewImageModal("")}
                    />
                    <div className="relative z-10 max-w-lg w-full rounded-2xl border border-[#3E3234] bg-[#221B1D] p-4 shadow-2xl">
                        <div className="flex items-center justify-between border-b border-[#2E2527] pb-2 mb-3">
                            <span className="text-xs font-bold text-white">Bukti Transfer Refund</span>
                            <button
                                type="button"
                                onClick={() => setPreviewImageModal("")}
                                className="text-xs text-[#A89F97] hover:text-white"
                            >
                                ✕ Tutup
                            </button>
                        </div>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={getImageUrl(previewImageModal)}
                            alt="Bukti Transfer Refund"
                            className="max-h-[70vh] w-full rounded-xl object-contain bg-black/40"
                        />
                    </div>
                </div>
            )}
        </main>
    );
}
