"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiRequest, getImageUrl } from "@/lib/api";
import ThermalReceiptModal from "@/components/ThermalReceiptModal";

const formatRupiah = (amount) =>
    new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0,
    }).format(amount || 0);

export default function AdminDashboardPage() {
    const router = useRouter();
    const fileInputRef = useRef(null);

    const [adminUser, setAdminUser] = useState(() => {
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
    const [prodCategoryId, setProdCategoryId] = useState("");
    const [savingProduct, setSavingProduct] = useState(false);
    const [uploadingImage, setUploadingImage] = useState(false);
    const [showCustomUrl, setShowCustomUrl] = useState(false);

    // Categories state
    const [categoriesList, setCategoriesList] = useState([]);
    const [categoriesLoading, setCategoriesLoading] = useState(false);
    const [showCategoryManager, setShowCategoryManager] = useState(false);
    const [showCategoryModal, setShowCategoryModal] = useState(false);
    const [editingCategory, setEditingCategory] = useState(null);
    const [categoryFormName, setCategoryFormName] = useState("");
    const [categoryFormIcon, setCategoryFormIcon] = useState("🍽️");
    const [categoryFormDescription, setCategoryFormDescription] = useState("");
    const [categoryFormProductIds, setCategoryFormProductIds] = useState([]);
    const [savingCategory, setSavingCategory] = useState(false);

    // Audit trails state
    const [auditTrails, setAuditTrails] = useState([]);
    const [auditTotal, setAuditTotal] = useState(0);
    const [auditLoading, setAuditLoading] = useState(false);
    const [auditSearch, setAuditSearch] = useState("");
    const auditSearchRef = useRef(auditSearch);
    useEffect(() => {
        auditSearchRef.current = auditSearch;
    }, [auditSearch]);

    // User Management state
    const [userSubTab, setUserSubTab] = useState("admins"); // "admins" | "customers"
    const [adminList, setAdminList] = useState([]);
    const [adminsLoading, setAdminsLoading] = useState(false);
    const [customerList, setCustomerList] = useState([]);
    const [customersLoading, setCustomersLoading] = useState(false);
    const [customerSearch, setCustomerSearch] = useState("");
    const customerSearchRef = useRef(customerSearch);
    useEffect(() => {
        customerSearchRef.current = customerSearch;
    }, [customerSearch]);

    // Admin Modal State
    const [showAdminModal, setShowAdminModal] = useState(false);
    const [editingAdmin, setEditingAdmin] = useState(null);
    const [adminFormUsername, setAdminFormUsername] = useState("");
    const [adminFormName, setAdminFormName] = useState("");
    const [adminFormRole, setAdminFormRole] = useState("admin");
    const [adminFormPassword, setAdminFormPassword] = useState("");
    const [savingAdmin, setSavingAdmin] = useState(false);

    // Customer Modal State
    const [showCustomerModal, setShowCustomerModal] = useState(false);
    const [editingCustomer, setEditingCustomer] = useState(null);
    const [customerFormName, setCustomerFormName] = useState("");
    const [customerFormPhone, setCustomerFormPhone] = useState("");
    const [customerFormPassword, setCustomerFormPassword] = useState("");
    const [savingCustomer, setSavingCustomer] = useState(false);
    const [selectedHistoryCustomer, setSelectedHistoryCustomer] = useState(null);

    // Auto Refresh state (10 detik)
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [refreshCounter, setRefreshCounter] = useState(10);

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
    const [printOrder, setPrintOrder] = useState(null);
    const refundFileInputRef = useRef(null);

    // Feedback
    const [toast, setToast] = useState("");
    const [errorMsg, setErrorMsg] = useState("");

    // Promo / Voucher State
    const [promosList, setPromosList] = useState([]);
    const [promosLoading, setPromosLoading] = useState(false);
    const [promoSearch, setPromoSearch] = useState("");
    const [showPromoModal, setShowPromoModal] = useState(false);
    const [editingPromo, setEditingPromo] = useState(null);
    const [promoCode, setPromoCode] = useState("");
    const [promoName, setPromoName] = useState("");
    const [promoDescription, setPromoDescription] = useState("");
    const [promoDiscountType, setPromoDiscountType] = useState("percentage");
    const [promoDiscountValue, setPromoDiscountValue] = useState(10);
    const [promoMaxDiscount, setPromoMaxDiscount] = useState("");
    const [promoMinOrderAmount, setPromoMinOrderAmount] = useState(50000);
    const [promoUsageLimit, setPromoUsageLimit] = useState("");
    const [promoUsageLimitPerUser, setPromoUsageLimitPerUser] = useState(1);
    const [promoStartDate, setPromoStartDate] = useState("");
    const [promoEndDate, setPromoEndDate] = useState("");
    const [promoIsActive, setPromoIsActive] = useState(true);
    const [promoTargetType, setPromoTargetType] = useState("all"); // "all" | "specific"
    const [promoSelectedCustomerIds, setPromoSelectedCustomerIds] = useState([]);
    const [promoCustomerSearch, setPromoCustomerSearch] = useState("");
    const [savingPromo, setSavingPromo] = useState(false);

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

    const fetchAdmins = useCallback(async () => {
        setAdminsLoading(true);
        try {
            const data = await apiRequest("/admins", { useAdminToken: true });
            setAdminList(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error(err);
        } finally {
            setAdminsLoading(false);
        }
    }, []);

    const fetchCustomers = useCallback(async (searchQuery = "") => {
        setCustomersLoading(true);
        try {
            const query = searchQuery.trim()
                ? `?search=${encodeURIComponent(searchQuery.trim())}`
                : "";
            const data = await apiRequest(`/customers${query}`, { useAdminToken: true });
            setCustomerList(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error(err);
        } finally {
            setCustomersLoading(false);
        }
    }, []);

    const fetchPromos = useCallback(async () => {
        setPromosLoading(true);
        try {
            const data = await apiRequest("/promos", { useAdminToken: true });
            setPromosList(Array.isArray(data) ? data : data?.promos || []);
        } catch (err) {
            console.error(err);
        } finally {
            setPromosLoading(false);
        }
    }, []);

    const fetchCategories = useCallback(async () => {
        setCategoriesLoading(true);
        try {
            const data = await apiRequest("/categories/admin", { useAdminToken: true });
            setCategoriesList(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error("Gagal memuat kategori:", err);
        } finally {
            setCategoriesLoading(false);
        }
    }, []);

    useEffect(() => {
        const token = localStorage.getItem("ava_eats_admin_token");

        if (!token) {
            router.push("/admin/login");
            return;
        }

        // Ambil profil admin terkini untuk selalu mendapatkan Nama Lengkap & Role terupdate
        apiRequest("/admins/me", { useAdminToken: true })
            .then((me) => {
                if (me && me.name) {
                    setAdminUser(me);
                    localStorage.setItem("ava_eats_admin_user", JSON.stringify(me));
                }
            })
            .catch(() => { });

        const timer = setTimeout(() => {
            setLoading(false);
            fetchOrders();
            fetchProducts();
            fetchCategories();
            fetchPromos();
            fetchAuditTrails();
            if (adminUser?.role !== "staff") {
                fetchAdmins();
                fetchCustomers();
            }
        }, 0);

        return () => clearTimeout(timer);
    }, [router, fetchOrders, fetchProducts, fetchCategories, fetchPromos, fetchAuditTrails, fetchAdmins, fetchCustomers, adminUser?.role]);

    // Jika akun adalah staff, pastikan tidak bisa berada di tab User Management
    useEffect(() => {
        if (adminUser?.role === "staff" && activeTab === "users") {
            const t = setTimeout(() => setActiveTab("orders"), 0);
            return () => clearTimeout(t);
        }
    }, [adminUser?.role, activeTab]);

    // ── Live Auto Refresh /10 detik ──────────────────────────────────────────
    useEffect(() => {
        if (!autoRefresh) return;

        const countdownInterval = setInterval(() => {
            setRefreshCounter((prev) => {
                if (prev <= 1) {
                    // Waktu habis: refresh data secara seamless di background
                    fetchOrders();
                    fetchProducts();
                    fetchCategories();
                    fetchPromos();
                    if (!auditSearchRef.current) {
                        fetchAuditTrails();
                    }
                    if (adminUser?.role !== "staff") {
                        fetchAdmins();
                        if (!customerSearchRef.current) {
                            fetchCustomers();
                        }
                    }
                    return 10;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(countdownInterval);
    }, [autoRefresh, fetchOrders, fetchProducts, fetchCategories, fetchPromos, fetchAuditTrails, fetchAdmins, fetchCustomers, adminUser?.role]);

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
        setProdCategoryId("");
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
        setProdCategoryId(p.category_id ? String(p.category_id) : "");
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
            category_id: prodCategoryId ? Number(prodCategoryId) : null,
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

    // ── Menu Category Handlers ───────────────────────────────────────────────
    function openAddCategoryModal() {
        setEditingCategory(null);
        setCategoryFormName("");
        setCategoryFormIcon("🍽️");
        setCategoryFormDescription("");
        setCategoryFormProductIds([]);
        setShowCategoryModal(true);
    }

    function openEditCategoryModal(cat) {
        setEditingCategory(cat);
        setCategoryFormName(cat.name || "");
        setCategoryFormIcon(cat.icon || "🍽️");
        setCategoryFormDescription(cat.description || "");
        setCategoryFormProductIds(cat.product_ids || []);
        setShowCategoryModal(true);
    }

    async function handleSaveCategory(e) {
        e.preventDefault();
        if (!categoryFormName.trim()) {
            alert("Nama kategori tidak boleh kosong.");
            return;
        }

        setSavingCategory(true);
        try {
            const payload = {
                name: categoryFormName.trim(),
                icon: categoryFormIcon.trim() || "🍽️",
                description: categoryFormDescription.trim() || null,
                product_ids: categoryFormProductIds,
            };

            if (editingCategory) {
                await apiRequest(`/categories/${editingCategory.id}`, {
                    method: "PUT",
                    useAdminToken: true,
                    body: JSON.stringify(payload),
                });
                showToast(`Kategori '${payload.name}' berhasil diperbarui! 📁`);
            } else {
                await apiRequest("/categories", {
                    method: "POST",
                    useAdminToken: true,
                    body: JSON.stringify(payload),
                });
                showToast(`Kategori baru '${payload.name}' berhasil dibuat! 🎉`);
            }

            setShowCategoryModal(false);
            fetchCategories();
            fetchProducts();
            fetchAuditTrails();
        } catch (err) {
            alert(err.message || "Gagal menyimpan kategori.");
        } finally {
            setSavingCategory(false);
        }
    }

    async function handleDeleteCategory(cat) {
        if (!confirm(`Hapus kategori '${cat.name}'? Menu di dalamnya tidak akan terhapus, melainkan diubah menjadi tanpa kategori.`)) {
            return;
        }

        try {
            await apiRequest(`/categories/${cat.id}`, {
                method: "DELETE",
                useAdminToken: true,
            });
            showToast(`Kategori '${cat.name}' berhasil dihapus.`);
            fetchCategories();
            fetchProducts();
            fetchAuditTrails();
        } catch (err) {
            alert(err.message || "Gagal menghapus kategori.");
        }
    }

    // ── User Management (Admin & Customer) Handlers ──────────────────────────
    function openAddAdminModal() {
        setEditingAdmin(null);
        setAdminFormUsername("");
        setAdminFormName("");
        setAdminFormRole("admin");
        setAdminFormPassword("");
        setShowAdminModal(true);
    }

    function openEditAdminModal(adm) {
        setEditingAdmin(adm);
        setAdminFormUsername(adm.username);
        setAdminFormName(adm.name);
        setAdminFormRole(adm.role || "admin");
        setAdminFormPassword("");
        setShowAdminModal(true);
    }

    async function handleSaveAdmin(e) {
        e.preventDefault();
        setSavingAdmin(true);
        setErrorMsg("");

        try {
            if (editingAdmin) {
                const payload = {
                    username: adminFormUsername.trim(),
                    name: adminFormName.trim(),
                    role: adminFormRole,
                };
                if (adminFormPassword.trim()) {
                    payload.password = adminFormPassword.trim();
                }

                await apiRequest(`/admins/${editingAdmin.id}`, {
                    method: "PUT",
                    useAdminToken: true,
                    body: JSON.stringify(payload),
                });
                showToast(`Data admin '${adminFormUsername}' berhasil diperbarui! 👤`);
            } else {
                if (!adminFormPassword || adminFormPassword.length < 6) {
                    alert("Password minimal 6 karakter.");
                    setSavingAdmin(false);
                    return;
                }
                await apiRequest("/admins", {
                    method: "POST",
                    useAdminToken: true,
                    body: JSON.stringify({
                        username: adminFormUsername.trim(),
                        name: adminFormName.trim(),
                        role: adminFormRole,
                        password: adminFormPassword.trim(),
                    }),
                });
                showToast(`Admin baru '${adminFormUsername}' berhasil dibuat! 🎉`);
            }

            setShowAdminModal(false);
            fetchAdmins();
            fetchAuditTrails();
        } catch (err) {
            alert(err.message || "Gagal menyimpan data admin.");
        } finally {
            setSavingAdmin(false);
        }
    }

    async function handleDeleteAdmin(adminId, username) {
        if (!confirm(`Yakin ingin menghapus akun admin '${username}'?`)) return;

        try {
            await apiRequest(`/admins/${adminId}`, {
                method: "DELETE",
                useAdminToken: true,
            });
            showToast(`Admin '${username}' berhasil dihapus.`);
            fetchAdmins();
            fetchAuditTrails();
        } catch (err) {
            alert(err.message || "Gagal menghapus admin.");
        }
    }

    // Customer Handlers
    function openAddCustomerModal() {
        setEditingCustomer(null);
        setCustomerFormName("");
        setCustomerFormPhone("");
        setCustomerFormPassword("");
        setShowCustomerModal(true);
    }

    function openEditCustomerModal(cust) {
        setEditingCustomer(cust);
        setCustomerFormName(cust.name);
        setCustomerFormPhone(cust.phone);
        setCustomerFormPassword("");
        setShowCustomerModal(true);
    }

    async function handleSaveCustomer(e) {
        e.preventDefault();
        setSavingCustomer(true);
        setErrorMsg("");

        try {
            if (editingCustomer) {
                const payload = {
                    name: customerFormName.trim(),
                    phone: customerFormPhone.trim(),
                };
                if (customerFormPassword.trim()) {
                    payload.password = customerFormPassword.trim();
                }
                await apiRequest(`/customers/admin/${editingCustomer.id}`, {
                    method: "PUT",
                    useAdminToken: true,
                    body: JSON.stringify(payload),
                });
                showToast(`Data pelanggan '${customerFormName}' berhasil diperbarui! 👤`);
            } else {
                if (!customerFormPassword || customerFormPassword.length < 6) {
                    alert("Password minimal 6 karakter.");
                    setSavingCustomer(false);
                    return;
                }
                await apiRequest("/customers/admin", {
                    method: "POST",
                    useAdminToken: true,
                    body: JSON.stringify({
                        name: customerFormName.trim(),
                        phone: customerFormPhone.trim(),
                        password: customerFormPassword.trim(),
                    }),
                });
                showToast(`Pelanggan baru '${customerFormName}' berhasil ditambahkan! 🎉`);
            }

            setShowCustomerModal(false);
            fetchCustomers();
            fetchAuditTrails();
        } catch (err) {
            alert(err.message || "Gagal menyimpan data pelanggan.");
        } finally {
            setSavingCustomer(false);
        }
    }

    async function handleDeleteCustomer(customerId, name) {
        if (!confirm(`Yakin ingin menghapus akun pelanggan '${name}'?`)) return;

        try {
            await apiRequest(`/customers/admin/${customerId}`, {
                method: "DELETE",
                useAdminToken: true,
            });
            showToast(`Pelanggan '${name}' berhasil dihapus.`);
            fetchCustomers();
            fetchAuditTrails();
        } catch (err) {
            alert(err.message || "Gagal menghapus pelanggan.");
        }
    }

    // ── Promo Code Handlers ──────────────────────────────────────────────────
    function openAddPromoModal() {
        setEditingPromo(null);
        setPromoCode("");
        setPromoName("");
        setPromoDescription("");
        setPromoDiscountType("percentage");
        setPromoDiscountValue(10);
        setPromoMaxDiscount("");
        setPromoMinOrderAmount(50000);
        setPromoUsageLimit("");
        setPromoUsageLimitPerUser(1);
        setPromoStartDate("");
        setPromoEndDate("");
        setPromoIsActive(true);
        setPromoTargetType("all");
        setPromoSelectedCustomerIds([]);
        setPromoCustomerSearch("");
        if (customerList.length === 0) {
            fetchCustomers();
        }
        setShowPromoModal(true);
    }

    function formatToInputDate(val) {
        if (!val) return "";
        if (typeof val === "string") {
            if (!val.endsWith("Z") && !val.includes("+")) {
                return val.substring(0, 16);
            }
            const d = new Date(val);
            if (isNaN(d.getTime())) return "";
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, "0");
            const day = String(d.getDate()).padStart(2, "0");
            const hours = String(d.getHours()).padStart(2, "0");
            const minutes = String(d.getMinutes()).padStart(2, "0");
            return `${year}-${month}-${day}T${hours}:${minutes}`;
        }
        return "";
    }

    function formatLocalInputToISO(val) {
        if (!val) return null;
        if (val.length === 16) {
            return `${val}:00`;
        }
        return val;
    }

    function openEditPromoModal(promo) {
        setEditingPromo(promo);
        setPromoCode(promo.code || "");
        setPromoName(promo.name || promo.description || promo.code || "");
        setPromoDescription(promo.description || "");
        setPromoDiscountType(promo.discount_type || "percentage");
        setPromoDiscountValue(promo.discount_value || 0);
        setPromoMaxDiscount(promo.max_discount ?? "");
        setPromoMinOrderAmount(promo.min_order_amount ?? 0);
        setPromoUsageLimit(promo.usage_limit ?? "");
        setPromoUsageLimitPerUser(promo.usage_limit_per_user ?? 1);
        setPromoStartDate(formatToInputDate(promo.start_date));
        setPromoEndDate(formatToInputDate(promo.end_date));
        setPromoIsActive(promo.is_active ?? true);
        setPromoTargetType(promo.target_type || "all");
        setPromoSelectedCustomerIds(
            promo.target_customer_ids?.length
                ? promo.target_customer_ids
                : promo.target_customers?.map((c) => c.id) || []
        );
        setPromoCustomerSearch("");
        if (customerList.length === 0) {
            fetchCustomers();
        }
        setShowPromoModal(true);
    }

    async function handleSavePromo(e) {
        e.preventDefault();
        const codeClean = promoCode.trim().toUpperCase();
        if (!codeClean) {
            alert("Kode promo tidak boleh kosong.");
            return;
        }
        if (!promoName.trim()) {
            alert("Nama promo tidak boleh kosong.");
            return;
        }
        if (Number(promoDiscountValue) <= 0) {
            alert("Nilai diskon harus lebih besar dari 0.");
            return;
        }
        if (promoTargetType === "specific" && promoSelectedCustomerIds.length === 0) {
            alert("Silakan pilih minimal 1 pelanggan untuk kupon bertarget khusus.");
            return;
        }

        setSavingPromo(true);
        try {
            const payload = {
                code: codeClean,
                name: promoName.trim(),
                description: promoDescription.trim() || null,
                discount_type: promoDiscountType,
                discount_value: Number(promoDiscountValue),
                max_discount: promoMaxDiscount ? Number(promoMaxDiscount) : null,
                min_order_amount: Number(promoMinOrderAmount) || 0,
                usage_limit: promoUsageLimit ? Number(promoUsageLimit) : null,
                usage_limit_per_user: Number(promoUsageLimitPerUser) || 1,
                start_date: formatLocalInputToISO(promoStartDate),
                end_date: formatLocalInputToISO(promoEndDate),
                is_active: promoIsActive,
                target_type: promoTargetType,
                customer_ids: promoTargetType === "specific" ? promoSelectedCustomerIds : [],
            };

            if (editingPromo) {
                await apiRequest(`/promos/${editingPromo.id}`, {
                    method: "PUT",
                    useAdminToken: true,
                    body: JSON.stringify(payload),
                });
                showToast(`Promo '${payload.code}' berhasil diperbarui! 🎟️`);
            } else {
                await apiRequest("/promos", {
                    method: "POST",
                    useAdminToken: true,
                    body: JSON.stringify(payload),
                });
                showToast(`Promo baru '${payload.code}' berhasil dibuat! 🎟️`);
            }

            setShowPromoModal(false);
            fetchPromos();
            fetchAuditTrails();
        } catch (err) {
            alert(err.message || "Gagal menyimpan kode promo.");
        } finally {
            setSavingPromo(false);
        }
    }

    async function handleTogglePromo(promo) {
        try {
            await apiRequest(`/promos/${promo.id}/toggle`, {
                method: "PATCH",
                useAdminToken: true,
            });
            showToast(`Status promo '${promo.code}' berhasil diperbarui.`);
            fetchPromos();
            fetchAuditTrails();
        } catch (err) {
            alert(err.message || "Gagal mengubah status promo.");
        }
    }

    async function handleDeletePromo(promo) {
        if (!confirm(`Hapus voucher promo '${promo.code}'?`)) return;

        try {
            await apiRequest(`/promos/${promo.id}`, {
                method: "DELETE",
                useAdminToken: true,
            });
            showToast(`Promo '${promo.code}' berhasil dihapus.`);
            fetchPromos();
            fetchAuditTrails();
        } catch (err) {
            alert(err.message || "Gagal menghapus promo.");
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
    const processingOrdersCount = orders.filter((o) => o.status === "processing").length;
    const deliveredOrdersCount = orders.filter((o) => o.status === "delivered" || o.status === "shipped").length;

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
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-white/20">
                            <img src="/logo.png" alt="Ava Eats Admin" className="h-full w-full object-cover" />
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
                        {/* Auto Refresh 10s Indicator & Manual Sync Button */}
                        <button
                            type="button"
                            onClick={() => {
                                fetchOrders();
                                fetchProducts();
                                fetchAuditTrails();
                                fetchAdmins();
                                fetchCustomers();
                                setRefreshCounter(10);
                                showToast("Data dashboard berhasil di-refresh! 🔄");
                            }}
                            title="Auto-refresh setiap 10 detik. Klik untuk sync sekarang."
                            className="inline-flex items-center gap-1.5 rounded-xl border border-[#3E3234] bg-[#2A2123] px-2.5 py-1.5 text-xs font-semibold text-[#D1C7BD] hover:bg-[#342A2C] hover:text-white transition"
                        >
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                            </span>
                            <span className="text-[11px] font-mono font-bold text-emerald-400">Sync: {refreshCounter}s</span>
                        </button>

                        <Link
                            href="/"
                            target="_blank"
                            className="hidden sm:inline-flex items-center gap-1 rounded-xl border border-[#3E3234] px-3 py-1.5 text-xs font-semibold text-[#D1C7BD] hover:bg-[#2E2527] transition"
                        >
                            <span>↗</span> Buka Toko
                        </Link>
                        <div className="flex items-center gap-1.5 rounded-xl bg-[#2E2527] px-2.5 py-1.5">
                            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                            <span className="text-xs font-bold text-white max-w-[130px] sm:max-w-none truncate">
                                {adminUser?.name || "Admin"}
                            </span>
                            {adminUser?.role && (
                                <span className={`hidden sm:inline-block rounded-md px-1.5 py-0.5 text-[9px] font-bold ${adminUser.role === "admin"
                                    ? "bg-[#7A2E3A]/60 text-[#E8A598]"
                                    : "bg-sky-500/20 text-sky-300"
                                    }`}>
                                    {adminUser.role === "admin" ? "Super Admin" : "Staff"}
                                </span>
                            )}
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
                        🍱 Menu & Stok
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab("promos")}
                        className={`shrink-0 rounded-xl px-3.5 py-2 text-xs font-bold transition flex items-center gap-1.5 ${activeTab === "promos"
                            ? "bg-[#7A2E3A] text-white shadow-md shadow-[#7A2E3A]/40"
                            : "bg-[#251E20] text-[#A89F97] hover:bg-[#2E2527] hover:text-white"
                            }`}
                    >
                        <span>🎟️ Promo & Voucher</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab("audit")}
                        className={`shrink-0 rounded-xl px-3.5 py-2 text-xs font-bold transition ${activeTab === "audit"
                            ? "bg-[#7A2E3A] text-white shadow-md shadow-[#7A2E3A]/40"
                            : "bg-[#251E20] text-[#A89F97] hover:bg-[#2E2527] hover:text-white"
                            }`}
                    >
                        📜 Audit Trail
                    </button>
                    {adminUser?.role !== "staff" && (
                        <button
                            type="button"
                            onClick={() => setActiveTab("users")}
                            className={`shrink-0 rounded-xl px-3.5 py-2 text-xs font-bold transition ${activeTab === "users"
                                ? "bg-[#7A2E3A] text-white shadow-md shadow-[#7A2E3A]/40"
                                : "bg-[#251E20] text-[#A89F97] hover:bg-[#2E2527] hover:text-white"
                                }`}
                        >
                            👥 User Management
                        </button>
                    )}
                </div>

                {/* ── TAB 1: ORDERS ─────────────────────────────────────────── */}
                {activeTab === "orders" && (
                    <div className="space-y-4">
                        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
                            {[
                                { id: "all", label: "Semua" },
                                ...(pendingRefundCount > 0
                                    ? [{ id: "refund", label: "Perlu Refund", count: pendingRefundCount, countBadge: "bg-red-500 text-white" }]
                                    : []),
                                { id: "paid", label: "Perlu Disiapkan", count: unprocessedOrdersCount, countBadge: "bg-amber-400 text-[#191415]" },
                                { id: "processing", label: "Sedang Disiapkan", count: processingOrdersCount, countBadge: "bg-sky-400 text-[#191415]" },
                                { id: "delivered", label: "Dikirim / Siap Ambil", count: deliveredOrdersCount, countBadge: "bg-emerald-400 text-[#191415]" },
                                { id: "pending", label: "Menunggu Bayar" },
                                { id: "cancelled", label: "Batal" },
                                { id: "completed", label: "Selesai" },
                            ].map((f) => (
                                <button
                                    key={f.id}
                                    type="button"
                                    onClick={() => setOrderFilter(f.id)}
                                    className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold transition inline-flex items-center gap-1.5 ${orderFilter === f.id
                                        ? "bg-white text-[#191415] font-bold shadow-xs"
                                        : "bg-[#261F21] text-[#9E938C] hover:bg-[#342A2C] hover:text-white"
                                        }`}
                                >
                                    <span>{f.id === "refund" ? `⚠️ ${f.label}` : f.label}</span>
                                    {f.count > 0 && (
                                        <span className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${f.countBadge || "bg-amber-400 text-black"}`}>
                                            {f.count}
                                        </span>
                                    )}
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
                                                {Boolean(ord.packaging_fee && ord.packaging_fee > 0) && (
                                                    <span className="rounded-lg bg-sky-950/60 border border-sky-500/30 px-2 py-0.5 text-[9px] font-bold text-sky-300">
                                                        ❄️ Bag Thermal + Ice
                                                    </span>
                                                )}
                                            </div>

                                            <div className="flex items-center gap-2.5">
                                                <button
                                                    type="button"
                                                    onClick={() => setPrintOrder(ord)}
                                                    className="rounded-lg border border-[#3E3234] bg-[#2A2123] px-2.5 py-1 text-xs font-semibold text-[#D1C7BD] hover:bg-[#342A2C] hover:text-white transition inline-flex items-center gap-1 shadow-xs"
                                                    title="Cetak Struk & Label Thermal (58mm / 80mm)"
                                                >
                                                    <span>🖨️</span> Cetak Struk
                                                </button>
                                                <div className="text-right">
                                                    <span className="text-xs sm:text-sm font-bold text-white">
                                                        Rp {(ord.grand_total || ord.total_amount || 0).toLocaleString("id-ID")}
                                                    </span>
                                                    <span className="block text-[9px] text-[#A89F97]">
                                                        {ord.created_at ? new Date(ord.created_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "-"}
                                                    </span>
                                                </div>
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
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div>
                                <h2 className="text-sm font-bold text-white">Daftar Menu & Stok</h2>
                                <p className="text-[11px] text-[#A89F97]">Atur menu makanan, kategori hidangan, dan stok dapur.</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setShowCategoryManager(true)}
                                    className="inline-flex items-center gap-1.5 rounded-xl border border-[#524245] bg-[#2E2527] px-3 py-2 text-xs font-bold text-[#E8A598] hover:bg-[#3E3234] transition"
                                >
                                    <span>📁</span> Kelola Kategori ({categoriesList.length})
                                </button>
                                <button
                                    type="button"
                                    onClick={openAddProductModal}
                                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#7A2E3A] px-3.5 py-2 text-xs font-bold text-white shadow-md shadow-[#7A2E3A]/40 transition hover:bg-[#913745]"
                                >
                                    <span>+</span> Tambah Menu Baru
                                </button>
                            </div>
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
                                                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                                                <span className="font-semibold text-xs text-emerald-400">
                                                                    Rp {prod.price?.toLocaleString("id-ID")}
                                                                </span>
                                                                <span className="rounded-md bg-[#2A2022] border border-[#3E3234] px-1.5 py-0.2 text-[10px] text-[#E8A598] font-medium">
                                                                    {prod.category || "Tanpa Kategori"}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <span
                                                        className={`shrink-0 rounded-lg px-2 py-0.5 text-[10px] font-bold ${prod.is_available && prod.stock > 0
                                                            ? "bg-emerald-500/20 text-emerald-300"
                                                            : "bg-red-500/20 text-red-300"
                                                            }`}
                                                    >
                                                        {prod.is_available && prod.stock > 0 ? "Tersedia" : "Tidak Tersedia"}
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
                                                    {prod.is_available ? "Set Tidak Tersedia" : "Set Tersedia"}
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* ── TAB: PROMOS & VOUCHERS ───────────────────────────────── */}
                {activeTab === "promos" && (
                    <div className="space-y-4">
                        {/* Header & Search */}
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                            <div>
                                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                                    <span>🎟️</span> Kode Promo & Kupon Diskon
                                </h2>
                                <p className="text-xs text-[#A89F97] mt-0.5">
                                    Kelola voucher diskon belanja, kupon subsidi ongkir, dan batas kuota pengguna.
                                </p>
                            </div>

                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    value={promoSearch}
                                    onChange={(e) => setPromoSearch(e.target.value)}
                                    placeholder="🔍 Cari kode promo..."
                                    className="rounded-xl border border-[#3E3234] bg-[#221B1D] px-3.5 py-2 text-xs text-white placeholder-[#786D6B] outline-none focus:border-[#E8A598]"
                                />
                                <button
                                    type="button"
                                    onClick={openAddPromoModal}
                                    className="rounded-xl bg-[#7A2E3A] px-3.5 py-2 text-xs font-bold text-white shadow-md shadow-[#7A2E3A]/40 transition hover:bg-[#60232E] shrink-0"
                                >
                                    + Buat Promo Baru
                                </button>
                            </div>
                        </div>

                        {/* Promo List Cards */}
                        {promosLoading ? (
                            <div className="rounded-2xl border border-[#2E2527] bg-[#1E1719] p-8 text-center text-xs text-[#A89F97]">
                                Memuat data promo...
                            </div>
                        ) : promosList.length === 0 ? (
                            <div className="rounded-2xl border border-[#2E2527] bg-[#1E1719] p-8 text-center text-xs text-[#A89F97]">
                                <span className="text-3xl block mb-2">🎟️</span>
                                <p className="font-semibold text-white">Belum ada kode promo</p>
                                <p className="mt-1">Klik tombol &quot;+ Buat Promo Baru&quot; untuk menambahkan voucher diskon pertama.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                {promosList
                                    .filter((p) => {
                                        if (!promoSearch.trim()) return true;
                                        const q = promoSearch.toLowerCase();
                                        return (
                                            p.code?.toLowerCase().includes(q) ||
                                            p.name?.toLowerCase().includes(q) ||
                                            p.description?.toLowerCase().includes(q)
                                        );
                                    })
                                    .map((promo) => {
                                        const isExpired = promo.end_date && new Date(promo.end_date) < new Date();
                                        const isQuotaFull = promo.usage_limit && promo.used_count >= promo.usage_limit;

                                        return (
                                            <div
                                                key={promo.id}
                                                className={`rounded-2xl border p-4 transition flex flex-col justify-between ${promo.is_active && !isExpired && !isQuotaFull
                                                    ? "border-[#3E3234] bg-[#221B1D] hover:border-[#524245]"
                                                    : "border-[#2E2527] bg-[#1A1416] opacity-75"
                                                    }`}
                                            >
                                                <div>
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="flex items-center gap-2">
                                                            <span className="rounded-lg bg-emerald-950/80 border border-emerald-500/40 px-2.5 py-1 text-xs font-black tracking-wider text-emerald-300 uppercase">
                                                                {promo.code}
                                                            </span>
                                                            <span
                                                                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${promo.is_active && !isExpired && !isQuotaFull
                                                                    ? "bg-emerald-950 text-emerald-400 border border-emerald-500/30"
                                                                    : isExpired
                                                                        ? "bg-red-950 text-red-400 border border-red-500/30"
                                                                        : isQuotaFull
                                                                            ? "bg-amber-950 text-amber-400 border border-amber-500/30"
                                                                            : "bg-gray-800 text-gray-400 border border-gray-700"
                                                                    }`}
                                                            >
                                                                {isExpired
                                                                    ? "Kedaluwarsa"
                                                                    : isQuotaFull
                                                                        ? "Kuota Habis"
                                                                        : promo.is_active
                                                                            ? "Aktif"
                                                                            : "Nonaktif"}
                                                            </span>
                                                        </div>

                                                        {/* Status toggle button */}
                                                        <button
                                                            type="button"
                                                            onClick={() => handleTogglePromo(promo)}
                                                            className={`rounded-lg px-2 py-1 text-[11px] font-bold transition border ${promo.is_active
                                                                ? "border-amber-500/30 text-amber-300 hover:bg-amber-950/40"
                                                                : "border-emerald-500/30 text-emerald-300 hover:bg-emerald-950/40"
                                                                }`}
                                                            title={promo.is_active ? "Nonaktifkan promo" : "Aktifkan promo"}
                                                        >
                                                            {promo.is_active ? "Matikan" : "Aktifkan"}
                                                        </button>
                                                    </div>

                                                    <h3 className="text-sm font-bold text-white mt-2.5 truncate">
                                                        {promo.name}
                                                    </h3>
                                                    {promo.description && (
                                                        <p className="text-xs text-[#A89F97] mt-1 line-clamp-2">
                                                            {promo.description}
                                                        </p>
                                                    )}

                                                    {/* Promo Info badges */}
                                                    <div className="mt-3 space-y-1.5 text-xs">
                                                        <div className="flex justify-between text-[#D1C7BD]">
                                                            <span>Tipe Diskon:</span>
                                                            <strong className="text-emerald-400">
                                                                {promo.discount_type === "percentage"
                                                                    ? `${promo.discount_value}% ${promo.max_discount ? `(Maks. ${formatRupiah(promo.max_discount)})` : ""}`
                                                                    : promo.discount_type === "shipping_discount"
                                                                        ? `Ongkir s.d. ${formatRupiah(promo.discount_value)}`
                                                                        : formatRupiah(promo.discount_value)}
                                                            </strong>
                                                        </div>

                                                        <div className="flex justify-between text-[#A89F97]">
                                                            <span>Min. Belanja:</span>
                                                            <span className="text-[#D1C7BD]">
                                                                {promo.min_order_amount > 0 ? formatRupiah(promo.min_order_amount) : "Tanpa minimal"}
                                                            </span>
                                                        </div>

                                                        <div className="flex justify-between text-[#A89F97]">
                                                            <span>Pemakaian:</span>
                                                            <span className="text-[#D1C7BD]">
                                                                <strong className="text-white">{promo.used_count || 0}</strong> / {promo.usage_limit || "∞"} kali
                                                                <span className="text-[10px] text-[#A89F97] ml-1">({promo.usage_limit_per_user}x/user)</span>
                                                            </span>
                                                        </div>

                                                        <div className="flex justify-between text-[#A89F97] text-[11px] pt-1 border-t border-[#2E2527]">
                                                            <span>Periode:</span>
                                                            <span className="text-[#A89F97]">
                                                                {promo.end_date
                                                                    ? `s.d. ${new Date(promo.end_date).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}`
                                                                    : "Selalu Aktif"}
                                                            </span>
                                                        </div>

                                                        <div className="flex justify-between items-center text-[#A89F97] text-[11px] pt-1 border-t border-[#2E2527]">
                                                            <span>Target:</span>
                                                            {promo.target_type === "specific" ? (
                                                                <span
                                                                    className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-400 border border-amber-500/20"
                                                                    title={promo.target_customers?.map((c) => `${c.name} (${c.phone})`).join(", ") || "Pelanggan Terpilih"}
                                                                >
                                                                    🎯 Khusus ({promo.target_customers?.length || promo.target_customer_ids?.length || 0} Pelanggan)
                                                                </span>
                                                            ) : (
                                                                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/20">
                                                                    🌐 Semua Pelanggan
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Action buttons */}
                                                <div className="mt-4 pt-3 border-t border-[#2E2527] flex items-center justify-between">
                                                    <button
                                                        type="button"
                                                        onClick={() => openEditPromoModal(promo)}
                                                        className="rounded-lg border border-[#3E3234] px-2.5 py-1 text-xs font-semibold text-[#D1C7BD] hover:bg-[#2E2527] transition"
                                                    >
                                                        ✏️ Edit
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeletePromo(promo)}
                                                        className="text-xs text-red-400 hover:text-red-300 transition"
                                                    >
                                                        Hapus
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

                {/* ── TAB 4: USER MANAGEMENT (ADMIN & CUSTOMER) ─────────────── */}
                {activeTab === "users" && adminUser?.role !== "staff" && (
                    <div className="space-y-4">
                        {/* Sub-tab Switcher: Admins vs Customers */}
                        <div className="flex items-center justify-between flex-wrap gap-3 border-b border-[#2E2527] pb-3">
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setUserSubTab("admins")}
                                    className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition flex items-center gap-1.5 ${userSubTab === "admins"
                                        ? "bg-[#7A2E3A] text-white shadow-sm"
                                        : "bg-[#251E20] text-[#A89F97] hover:bg-[#2E2527] hover:text-white"
                                        }`}
                                >
                                    <span>🛡️ Admin & Staff</span>
                                    <span className="rounded-full bg-white/20 px-1.5 py-0.2 text-[10px]">
                                        {adminList.length}
                                    </span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setUserSubTab("customers")}
                                    className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition flex items-center gap-1.5 ${userSubTab === "customers"
                                        ? "bg-[#7A2E3A] text-white shadow-sm"
                                        : "bg-[#251E20] text-[#A89F97] hover:bg-[#2E2527] hover:text-white"
                                        }`}
                                >
                                    <span>👤 Pelanggan / Customer</span>
                                    <span className="rounded-full bg-white/20 px-1.5 py-0.2 text-[10px]">
                                        {customerList.length}
                                    </span>
                                </button>
                            </div>

                            {userSubTab === "admins" ? (
                                adminUser?.role !== "staff" ? (
                                    <button
                                        type="button"
                                        onClick={openAddAdminModal}
                                        className="rounded-xl bg-[#7A2E3A] px-3.5 py-2 text-xs font-bold text-white shadow-md shadow-[#7A2E3A]/40 transition hover:bg-[#64252F] flex items-center gap-1.5"
                                    >
                                        <span>+</span> Tambah Admin / Staff
                                    </button>
                                ) : null
                            ) : (
                                <button
                                    type="button"
                                    onClick={openAddCustomerModal}
                                    className="rounded-xl bg-[#7A2E3A] px-3.5 py-2 text-xs font-bold text-white shadow-md shadow-[#7A2E3A]/40 transition hover:bg-[#64252F] flex items-center gap-1.5"
                                >
                                    <span>+</span> Tambah Pelanggan
                                </button>
                            )}
                        </div>

                        {/* ── SUBTAB 1: ADMIN & STAFF ── */}
                        {userSubTab === "admins" && (
                            <div className="space-y-3">
                                {adminsLoading && adminList.length === 0 ? (
                                    <div className="rounded-2xl border border-[#2E2527] bg-[#221B1D] p-8 text-center text-xs text-[#A89F97]">
                                        Memuat data admin & staff...
                                    </div>
                                ) : adminList.length === 0 ? (
                                    <div className="rounded-2xl border border-[#2E2527] bg-[#221B1D] p-8 text-center text-xs text-[#A89F97]">
                                        Belum ada admin terdaftar.
                                    </div>
                                ) : (
                                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                        {adminList.map((adm) => {
                                            const isSelf = adminUser?.username === adm.username || adminUser?.id === adm.id;
                                            return (
                                                <div
                                                    key={adm.id}
                                                    className="rounded-2xl border border-[#2E2527] bg-[#221B1D] p-4 transition hover:border-[#3E3234] flex flex-col justify-between gap-3"
                                                >
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="flex items-center gap-3">
                                                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#7A2E3A]/30 text-base font-bold text-[#E8A598] ring-1 ring-[#7A2E3A]/50">
                                                                {adm.role === "admin" ? "🛡️" : "👤"}
                                                            </div>
                                                            <div className="min-w-0">
                                                                <h4 className="font-bold text-sm text-white truncate">
                                                                    {adm.name || adm.username}
                                                                </h4>
                                                                <p className="text-xs text-[#A89F97] truncate">
                                                                    @{adm.username}
                                                                </p>
                                                            </div>
                                                        </div>

                                                        <span
                                                            className={`shrink-0 rounded-lg px-2 py-0.5 text-[10px] font-bold ${adm.role === "admin"
                                                                ? "bg-[#7A2E3A]/40 text-[#E8A598] border border-[#7A2E3A]/60"
                                                                : "bg-sky-500/20 text-sky-300 border border-sky-500/30"
                                                                }`}
                                                        >
                                                            {adm.role === "admin" ? "Super Admin" : "Staff"}
                                                        </span>
                                                    </div>

                                                    <div className="pt-2 border-t border-[#2E2527] flex items-center justify-between text-[11px] text-[#A89F97]">
                                                        <span>
                                                            {isSelf ? (
                                                                <strong className="text-emerald-400">● Akun Anda</strong>
                                                            ) : (
                                                                <span>ID: #{adm.id}</span>
                                                            )}
                                                        </span>

                                                        <div className="flex items-center gap-1.5">
                                                            {adminUser?.role !== "staff" && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => openEditAdminModal(adm)}
                                                                    className="rounded-lg border border-[#3E3234] px-2.5 py-1 text-xs font-semibold text-[#D1C7BD] hover:bg-[#2E2527] transition"
                                                                >
                                                                    ✏️ Edit
                                                                </button>
                                                            )}
                                                            {!isSelf && adminUser?.role !== "staff" && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleDeleteAdmin(adm.id, adm.username)}
                                                                    className="rounded-lg border border-red-500/30 px-2 py-1 text-xs font-semibold text-red-400 hover:bg-red-950/40 transition"
                                                                    title="Hapus Admin"
                                                                >
                                                                    Hapus
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ── SUBTAB 2: CUSTOMERS ── */}
                        {userSubTab === "customers" && (
                            <div className="space-y-3">
                                {/* Search Bar Pelanggan */}
                                <div className="relative max-w-md">
                                    <input
                                        type="text"
                                        value={customerSearch}
                                        onChange={(e) => {
                                            setCustomerSearch(e.target.value);
                                            fetchCustomers(e.target.value);
                                        }}
                                        placeholder="Cari nama atau nomor WhatsApp pelanggan..."
                                        className="w-full rounded-xl border border-[#3E3234] bg-[#221B1D] px-3.5 py-2 pl-9 text-xs text-white placeholder-[#78686A] focus:border-[#7A2E3A] focus:outline-none"
                                    />
                                    <span className="absolute left-3 top-2.5 text-xs text-[#78686A]">
                                        🔍
                                    </span>
                                </div>

                                {customersLoading && customerList.length === 0 ? (
                                    <div className="rounded-2xl border border-[#2E2527] bg-[#221B1D] p-8 text-center text-xs text-[#A89F97]">
                                        Memuat data pelanggan...
                                    </div>
                                ) : customerList.length === 0 ? (
                                    <div className="rounded-2xl border border-[#2E2527] bg-[#221B1D] p-8 text-center text-xs text-[#A89F97]">
                                        {customerSearch
                                            ? `Tidak ada pelanggan yang cocok dengan "${customerSearch}".`
                                            : "Belum ada pelanggan terdaftar."}
                                    </div>
                                ) : (
                                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                        {customerList.map((cust) => {
                                            const cleanPhone = cust.phone.replace(/^0/, "62");
                                            return (
                                                <div
                                                    key={cust.id}
                                                    className="rounded-2xl border border-[#2E2527] bg-[#221B1D] p-4 transition hover:border-[#3E3234] flex flex-col justify-between gap-3"
                                                >
                                                    <div>
                                                        <div className="flex items-start justify-between gap-2">
                                                            <div className="flex items-center gap-3">
                                                                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-950/40 text-base font-bold text-emerald-300 ring-1 ring-emerald-500/30">
                                                                    👤
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <h4 className="font-bold text-sm text-white truncate">
                                                                        {cust.name}
                                                                    </h4>
                                                                    <p className="text-xs text-[#A89F97] font-mono">
                                                                        {cust.phone}
                                                                    </p>
                                                                </div>
                                                            </div>

                                                            <a
                                                                href={`https://wa.me/${cleanPhone}`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                title="Chat WhatsApp"
                                                                className="rounded-lg bg-emerald-600/30 border border-emerald-500/40 px-2 py-1 text-[11px] font-bold text-emerald-300 hover:bg-emerald-600/50 transition inline-flex items-center gap-1"
                                                            >
                                                                <span>WA</span> ↗
                                                            </a>
                                                        </div>

                                                        {/* Customer summary */}
                                                        <div
                                                            onClick={() => setSelectedHistoryCustomer(cust)}
                                                            className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-[#1A1416] p-2.5 text-center cursor-pointer hover:bg-[#251D20] transition border border-transparent hover:border-[#3E3234]"
                                                            title="Klik untuk melihat riwayat pesanan pelanggan ini"
                                                        >
                                                            <div>
                                                                <span className="block text-[10px] text-[#A89F97]">Total Pesanan</span>
                                                                <strong className="text-xs text-white hover:underline">
                                                                    {cust.orders_count || 0} Order ↗
                                                                </strong>
                                                            </div>
                                                            <div>
                                                                <span className="block text-[10px] text-[#A89F97]">Total Belanja</span>
                                                                <strong className="text-xs text-emerald-400">
                                                                    Rp {(cust.total_spent || 0).toLocaleString("id-ID")}
                                                                </strong>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="pt-2 border-t border-[#2E2527] flex items-center justify-between text-[11px] text-[#A89F97]">
                                                        <span>ID: #{cust.id}</span>
                                                        <div className="flex items-center gap-1.5">
                                                            <button
                                                                type="button"
                                                                onClick={() => setSelectedHistoryCustomer(cust)}
                                                                className="rounded-lg border border-[#4E3539] bg-[#2A1D20] px-2 py-1 text-xs font-bold text-[#E8A598] hover:bg-[#3A252A] transition"
                                                                title="Lihat Riwayat Pesanan Customer"
                                                            >
                                                                📦 Riwayat
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => openEditCustomerModal(cust)}
                                                                className="rounded-lg border border-[#3E3234] px-2 py-1 text-xs font-semibold text-[#D1C7BD] hover:bg-[#2E2527] transition"
                                                            >
                                                                ✏️ Edit
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleDeleteCustomer(cust.id, cust.name)}
                                                                className="rounded-lg border border-red-500/30 px-2 py-1 text-xs font-semibold text-red-400 hover:bg-red-950/40 transition"
                                                                title="Hapus Pelanggan"
                                                            >
                                                                Hapus
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
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
                                    Nama Menu Makanan *
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
                                    Kategori Menu
                                </label>
                                <select
                                    value={prodCategoryId}
                                    onChange={(e) => setProdCategoryId(e.target.value)}
                                    className="w-full rounded-xl border border-[#3E3234] bg-[#191415] px-3.5 py-2.5 text-xs text-white outline-none focus:border-[#E8A598]"
                                >
                                    <option value="">-- Tanpa Kategori (Lainnya) --</option>
                                    {categoriesList.map((cat) => (
                                        <option key={cat.id} value={cat.id}>
                                            {cat.icon ? `${cat.icon} ` : ""}{cat.name}
                                        </option>
                                    ))}
                                </select>
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
                                                Tersedia (Siap Dipesan)
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

            {/* ── MODAL TAMBAH / EDIT ADMIN & STAFF ─────────────────────────── */}
            {showAdminModal && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
                    onClick={() => !savingAdmin && setShowAdminModal(false)}
                >
                    <div
                        className="relative w-full max-w-md rounded-2xl border border-[#3E3234] bg-[#221B1D] p-5 shadow-2xl text-white"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between border-b border-[#2E2527] pb-3">
                            <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                <span>🛡️</span> {editingAdmin ? "Edit Data Admin" : "Tambah Admin / Staff Baru"}
                            </h3>
                            <button
                                type="button"
                                disabled={savingAdmin}
                                onClick={() => setShowAdminModal(false)}
                                className="text-xs text-[#A89F97] hover:text-white"
                            >
                                ✕
                            </button>
                        </div>

                        <form onSubmit={handleSaveAdmin} className="mt-4 space-y-3.5">
                            <div>
                                <label className="block text-[11px] font-semibold text-[#D1C7BD] mb-1">
                                    Username <span className="text-red-400">*</span>
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={adminFormUsername}
                                    onChange={(e) => setAdminFormUsername(e.target.value)}
                                    placeholder="e.g. admin_budi"
                                    className="w-full rounded-xl border border-[#3E3234] bg-[#1A1416] px-3.5 py-2.5 text-xs text-white placeholder-[#78686A] focus:border-[#7A2E3A] focus:outline-none"
                                />
                            </div>

                            <div>
                                <label className="block text-[11px] font-semibold text-[#D1C7BD] mb-1">
                                    Nama Lengkap <span className="text-red-400">*</span>
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={adminFormName}
                                    onChange={(e) => setAdminFormName(e.target.value)}
                                    placeholder="e.g. Budi Santoso"
                                    className="w-full rounded-xl border border-[#3E3234] bg-[#1A1416] px-3.5 py-2.5 text-xs text-white placeholder-[#78686A] focus:border-[#7A2E3A] focus:outline-none"
                                />
                            </div>

                            <div>
                                <label className="block text-[11px] font-semibold text-[#D1C7BD] mb-1">
                                    Role / Hak Akses
                                </label>
                                <select
                                    value={adminFormRole}
                                    onChange={(e) => setAdminFormRole(e.target.value)}
                                    className="w-full rounded-xl border border-[#3E3234] bg-[#1A1416] px-3.5 py-2.5 text-xs text-white focus:border-[#7A2E3A] focus:outline-none"
                                >
                                    <option value="admin">Super Admin (Akses Penuh)</option>
                                    <option value="staff">Staff Operasional</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-[11px] font-semibold text-[#D1C7BD] mb-1">
                                    Password {editingAdmin ? "(Kosongkan jika tidak diubah)" : <span className="text-red-400">*</span>}
                                </label>
                                <input
                                    type="password"
                                    required={!editingAdmin}
                                    value={adminFormPassword}
                                    onChange={(e) => setAdminFormPassword(e.target.value)}
                                    placeholder={editingAdmin ? "•••••••• (Biarkan kosong jika tidak ganti)" : "Minimal 6 karakter"}
                                    className="w-full rounded-xl border border-[#3E3234] bg-[#1A1416] px-3.5 py-2.5 text-xs text-white placeholder-[#78686A] focus:border-[#7A2E3A] focus:outline-none"
                                />
                            </div>

                            <div className="mt-5 flex gap-2 pt-2 border-t border-[#2E2527]">
                                <button
                                    type="button"
                                    disabled={savingAdmin}
                                    onClick={() => setShowAdminModal(false)}
                                    className="flex-1 rounded-xl border border-[#3E3234] py-2.5 text-xs font-bold text-[#D1C7BD] hover:bg-[#2E2527]"
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    disabled={savingAdmin}
                                    className="flex-1 rounded-xl bg-[#7A2E3A] py-2.5 text-xs font-bold text-white shadow-md shadow-[#7A2E3A]/40 hover:bg-[#64252F] transition disabled:opacity-60"
                                >
                                    {savingAdmin ? "Menyimpan..." : editingAdmin ? "Simpan Perubahan" : "Buat Akun Admin"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── MODAL TAMBAH / EDIT PELANGGAN ──────────────────────────────── */}
            {showCustomerModal && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
                    onClick={() => !savingCustomer && setShowCustomerModal(false)}
                >
                    <div
                        className="relative w-full max-w-md rounded-2xl border border-[#3E3234] bg-[#221B1D] p-5 shadow-2xl text-white"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between border-b border-[#2E2527] pb-3">
                            <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                <span>👤</span> {editingCustomer ? "Edit Pelanggan & Reset Sandi" : "Tambah Pelanggan Baru"}
                            </h3>
                            <button
                                type="button"
                                disabled={savingCustomer}
                                onClick={() => setShowCustomerModal(false)}
                                className="text-xs text-[#A89F97] hover:text-white"
                            >
                                ✕
                            </button>
                        </div>

                        <form onSubmit={handleSaveCustomer} className="mt-4 space-y-3.5">
                            <div>
                                <label className="block text-[11px] font-semibold text-[#D1C7BD] mb-1">
                                    Nama Lengkap <span className="text-red-400">*</span>
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={customerFormName}
                                    onChange={(e) => setCustomerFormName(e.target.value)}
                                    placeholder="e.g. Shavazia Fralia"
                                    className="w-full rounded-xl border border-[#3E3234] bg-[#1A1416] px-3.5 py-2.5 text-xs text-white placeholder-[#78686A] focus:border-[#7A2E3A] focus:outline-none"
                                />
                            </div>

                            <div>
                                <label className="block text-[11px] font-semibold text-[#D1C7BD] mb-1">
                                    Nomor WhatsApp <span className="text-red-400">*</span>
                                </label>
                                <input
                                    type="tel"
                                    required
                                    value={customerFormPhone}
                                    onChange={(e) => setCustomerFormPhone(e.target.value)}
                                    placeholder="e.g. 08123456789"
                                    className="w-full rounded-xl border border-[#3E3234] bg-[#1A1416] px-3.5 py-2.5 text-xs text-white placeholder-[#78686A] focus:border-[#7A2E3A] focus:outline-none"
                                />
                            </div>

                            <div>
                                <label className="block text-[11px] font-semibold text-[#D1C7BD] mb-1">
                                    Password {editingCustomer ? "(Kosongkan jika tidak di-reset)" : <span className="text-red-400">*</span>}
                                </label>
                                <input
                                    type="password"
                                    required={!editingCustomer}
                                    value={customerFormPassword}
                                    onChange={(e) => setCustomerFormPassword(e.target.value)}
                                    placeholder={editingCustomer ? "•••••••• (Biarkan kosong jika tidak reset)" : "Minimal 6 karakter"}
                                    className="w-full rounded-xl border border-[#3E3234] bg-[#1A1416] px-3.5 py-2.5 text-xs text-white placeholder-[#78686A] focus:border-[#7A2E3A] focus:outline-none"
                                />
                            </div>

                            <div className="mt-5 flex gap-2 pt-2 border-t border-[#2E2527]">
                                <button
                                    type="button"
                                    disabled={savingCustomer}
                                    onClick={() => setShowCustomerModal(false)}
                                    className="flex-1 rounded-xl border border-[#3E3234] py-2.5 text-xs font-bold text-[#D1C7BD] hover:bg-[#2E2527]"
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    disabled={savingCustomer}
                                    className="flex-1 rounded-xl bg-[#7A2E3A] py-2.5 text-xs font-bold text-white shadow-md shadow-[#7A2E3A]/40 hover:bg-[#64252F] transition disabled:opacity-60"
                                >
                                    {savingCustomer ? "Menyimpan..." : editingCustomer ? "Simpan Perubahan" : "Daftarkan Pelanggan"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── MODAL RIWAYAT PESANAN CUSTOMER ──────────────────────────── */}
            {selectedHistoryCustomer && (() => {
                const customerOrders = orders.filter(
                    (o) => Number(o.customer_id) === Number(selectedHistoryCustomer.id)
                );
                const totalCustomerSpent = customerOrders
                    .filter((o) => ["paid", "processing", "shipped", "delivered", "completed", "done"].includes(String(o.status || "").toLowerCase()))
                    .reduce((sum, o) => sum + (o.grand_total || o.total_amount || 0), 0);

                return (
                    <div
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-4 backdrop-blur-sm"
                        onClick={() => setSelectedHistoryCustomer(null)}
                    >
                        <div
                            className="relative max-h-[90vh] w-full max-w-2xl flex flex-col overflow-hidden rounded-2xl sm:rounded-3xl border border-[#3E3234] bg-[#221B1D] shadow-2xl text-white"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Modal Header */}
                            <div className="flex items-center justify-between border-b border-[#2E2527] px-5 py-4 bg-[#1F191A]">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-950/60 text-base font-bold text-emerald-300 ring-1 ring-emerald-500/40">
                                        👤
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                            {selectedHistoryCustomer.name}
                                            <span className="text-[11px] font-normal text-[#A89F97]">
                                                (#{selectedHistoryCustomer.id})
                                            </span>
                                        </h3>
                                        <p className="text-xs text-[#A89F97] font-mono">
                                            📱 {selectedHistoryCustomer.phone}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setSelectedHistoryCustomer(null)}
                                    className="rounded-lg p-1.5 text-sm text-[#A89F97] hover:bg-[#2E2527] hover:text-white"
                                >
                                    ✕
                                </button>
                            </div>

                            {/* Summary Stats bar */}
                            <div className="grid grid-cols-2 gap-3 border-b border-[#2E2527] bg-[#191415] px-5 py-3">
                                <div className="text-center sm:text-left">
                                    <span className="text-[10px] text-[#A89F97] uppercase tracking-wider block">
                                        Total Riwayat Pesanan
                                    </span>
                                    <strong className="text-sm font-bold text-white">
                                        {customerOrders.length} Order
                                    </strong>
                                </div>
                                <div className="text-center sm:text-right">
                                    <span className="text-[10px] text-[#A89F97] uppercase tracking-wider block">
                                        Total Belanja Valid (Lunas)
                                    </span>
                                    <strong className="text-sm font-bold text-emerald-400">
                                        {formatRupiah(totalCustomerSpent)}
                                    </strong>
                                </div>
                            </div>

                            {/* Orders List Content */}
                            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
                                {customerOrders.length === 0 ? (
                                    <div className="rounded-xl border border-[#2E2527] bg-[#1A1416] p-8 text-center text-xs text-[#A89F97]">
                                        <span className="text-2xl block mb-1">📦</span>
                                        Pelanggan ini belum memiliki riwayat pesanan.
                                    </div>
                                ) : (
                                    customerOrders.map((order) => {
                                        const isCancelled = order.status === "cancelled";
                                        const isPaid = ["paid", "processing", "shipped", "delivered", "completed", "done"].includes(order.status);

                                        return (
                                            <div
                                                key={order.id}
                                                className={`rounded-xl border p-3.5 transition ${
                                                    isCancelled
                                                        ? "border-red-900/40 bg-[#1D1416] opacity-80"
                                                        : "border-[#342A2C] bg-[#1A1416]"
                                                }`}
                                            >
                                                <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                                                    <div className="flex items-center gap-2">
                                                        <strong className="font-mono text-xs font-bold text-white">
                                                            #{order.order_code || order.id}
                                                        </strong>
                                                        <span
                                                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                                                isCancelled
                                                                    ? "bg-red-950 text-red-400 border border-red-500/30"
                                                                    : isPaid
                                                                    ? "bg-emerald-950 text-emerald-400 border border-emerald-500/30"
                                                                    : "bg-amber-950 text-amber-400 border border-amber-500/30"
                                                            }`}
                                                        >
                                                            {(order.status || "pending").toUpperCase()}
                                                        </span>
                                                        <span className="text-[10px] text-[#A89F97]">
                                                            {order.fulfillment_method === "pickup" ? "🛍️ Pickup" : "🛵 Delivery"}
                                                        </span>
                                                    </div>

                                                    <span className="text-[10px] text-[#A89F97]">
                                                        {order.created_at
                                                            ? new Date(order.created_at).toLocaleString("id-ID", {
                                                                  day: "numeric",
                                                                  month: "short",
                                                                  year: "numeric",
                                                                  hour: "2-digit",
                                                                  minute: "2-digit",
                                                              })
                                                            : "-"}
                                                    </span>
                                                </div>

                                                {/* Item details */}
                                                <div className="text-xs text-[#D1C7BD] space-y-1 mb-2.5">
                                                    {(order.items || []).map((it, idx) => (
                                                        <div key={idx} className="flex justify-between items-center text-[11px]">
                                                            <span>
                                                                <strong className="text-white">{it.quantity}x</strong> {it.product_name || it.name || "Menu"}
                                                            </span>
                                                            <span className="text-[#A89F97]">
                                                                {formatRupiah((it.price || 0) * (it.quantity || 1))}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>

                                                {/* Totals & Struk Action */}
                                                <div className="pt-2 border-t border-[#2E2527] flex items-center justify-between text-xs">
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-[11px] text-[#A89F97]">Total:</span>
                                                        <strong className="font-bold text-[#E8A598]">
                                                            {formatRupiah(order.grand_total || order.total_amount || 0)}
                                                        </strong>
                                                        {order.discount_amount > 0 && (
                                                            <span className="text-[10px] text-emerald-400">
                                                                (Diskon {formatRupiah(order.discount_amount)})
                                                            </span>
                                                        )}
                                                    </div>

                                                    <button
                                                        type="button"
                                                        onClick={() => setPrintOrder(order)}
                                                        className="rounded-lg border border-[#3E3234] px-2.5 py-1 text-[11px] font-semibold text-[#D1C7BD] hover:bg-[#2E2527] transition flex items-center gap-1"
                                                    >
                                                        <span>🖨️</span> Cetak Struk
                                                    </button>
                                                </div>

                                                {isCancelled && order.cancellation_reason && (
                                                    <p className="mt-2 text-[10px] text-red-400 italic bg-red-950/30 p-1.5 rounded-lg border border-red-900/30">
                                                        Alasan batal: &ldquo;{order.cancellation_reason}&rdquo;
                                                    </p>
                                                )}
                                            </div>
                                        );
                                    })
                                )}
                            </div>

                            {/* Modal Footer */}
                            <div className="border-t border-[#2E2527] bg-[#191415] px-5 py-3 flex justify-end">
                                <button
                                    type="button"
                                    onClick={() => setSelectedHistoryCustomer(null)}
                                    className="rounded-xl border border-[#3E3234] px-4 py-1.5 text-xs font-semibold text-[#D1C7BD] hover:bg-[#2E2527]"
                                >
                                    Tutup
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* ── MODAL TAMBAH / EDIT PROMO & VOUCHER ─────────────────────── */}
            {showPromoModal && (
                <div
                    className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 p-0 sm:p-4 backdrop-blur-sm"
                    onClick={() => !savingPromo && setShowPromoModal(false)}
                >
                    <div
                        className="relative max-h-[90dvh] sm:max-h-[90vh] w-full max-w-[520px] overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-[#3E3234] bg-[#221B1D] p-5 sm:p-6 pb-8 sm:pb-6 shadow-2xl text-white"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between border-b border-[#2E2527] pb-3">
                            <h3 className="text-base font-bold text-white flex items-center gap-2">
                                <span>🎟️</span> {editingPromo ? "Edit Kode Promo" : "Buat Kode Promo Baru"}
                            </h3>
                            <button
                                type="button"
                                onClick={() => setShowPromoModal(false)}
                                className="rounded-lg p-1 text-[#A89F97] hover:bg-[#2E2527] hover:text-white"
                            >
                                ✕
                            </button>
                        </div>

                        <form onSubmit={handleSavePromo} className="mt-4 space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-semibold text-[#D1C7BD] mb-1">
                                        Kode Promo (Kupon) *
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={promoCode}
                                        onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                                        placeholder="Misal: DISKON10"
                                        className="w-full rounded-xl border border-[#3E3234] bg-[#191415] px-3.5 py-2 text-xs font-bold text-white uppercase outline-none focus:border-[#E8A598]"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-[#D1C7BD] mb-1">
                                        Nama Promo *
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={promoName}
                                        onChange={(e) => setPromoName(e.target.value)}
                                        placeholder="Misal: Diskon Spesial Gajian"
                                        className="w-full rounded-xl border border-[#3E3234] bg-[#191415] px-3.5 py-2 text-xs text-white outline-none focus:border-[#E8A598]"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-[#D1C7BD] mb-1">
                                    Deskripsi Promo (opsional)
                                </label>
                                <textarea
                                    rows={2}
                                    value={promoDescription}
                                    onChange={(e) => setPromoDescription(e.target.value)}
                                    placeholder="Penjelasan singkat syarat & ketentuan promo untuk pelanggan..."
                                    className="w-full rounded-xl border border-[#3E3234] bg-[#191415] px-3.5 py-2 text-xs text-white outline-none focus:border-[#E8A598]"
                                />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-semibold text-[#D1C7BD] mb-1">
                                        Tipe Diskon *
                                    </label>
                                    <select
                                        value={promoDiscountType}
                                        onChange={(e) => setPromoDiscountType(e.target.value)}
                                        className="w-full rounded-xl border border-[#3E3234] bg-[#191415] px-3 py-2 text-xs text-white outline-none focus:border-[#E8A598]"
                                    >
                                        <option value="percentage">Persentase (%)</option>
                                        <option value="fixed_amount">Potongan Tetap (Rp)</option>
                                        <option value="shipping_discount">Subsidi Ongkos Kirim (Rp)</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-[#D1C7BD] mb-1">
                                        {promoDiscountType === "percentage" ? "Besaran Persen (%) *" : "Nilai Potongan (Rp) *"}
                                    </label>
                                    <input
                                        type="number"
                                        required
                                        min={1}
                                        value={promoDiscountValue}
                                        onChange={(e) => setPromoDiscountValue(e.target.value)}
                                        placeholder={promoDiscountType === "percentage" ? "10" : "15000"}
                                        className="w-full rounded-xl border border-[#3E3234] bg-[#191415] px-3.5 py-2 text-xs text-white outline-none focus:border-[#E8A598]"
                                    />
                                </div>
                            </div>

                            {promoDiscountType === "percentage" && (
                                <div>
                                    <label className="block text-xs font-semibold text-[#D1C7BD] mb-1">
                                        Maksimal Diskon (Rp) (Opsional)
                                    </label>
                                    <input
                                        type="number"
                                        min={0}
                                        value={promoMaxDiscount}
                                        onChange={(e) => setPromoMaxDiscount(e.target.value)}
                                        placeholder="Misal: 15000 (kosongkan jika tanpa batas)"
                                        className="w-full rounded-xl border border-[#3E3234] bg-[#191415] px-3.5 py-2 text-xs text-white outline-none focus:border-[#E8A598]"
                                    />
                                </div>
                            )}

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-semibold text-[#D1C7BD] mb-1">
                                        Minimal Belanja (Rp)
                                    </label>
                                    <input
                                        type="number"
                                        min={0}
                                        value={promoMinOrderAmount}
                                        onChange={(e) => setPromoMinOrderAmount(e.target.value)}
                                        placeholder="0"
                                        className="w-full rounded-xl border border-[#3E3234] bg-[#191415] px-3.5 py-2 text-xs text-white outline-none focus:border-[#E8A598]"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-[#D1C7BD] mb-1">
                                        Batas Pemakaian per User
                                    </label>
                                    <input
                                        type="number"
                                        min={1}
                                        value={promoUsageLimitPerUser}
                                        onChange={(e) => setPromoUsageLimitPerUser(e.target.value)}
                                        placeholder="1"
                                        className="w-full rounded-xl border border-[#3E3234] bg-[#191415] px-3.5 py-2 text-xs text-white outline-none focus:border-[#E8A598]"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-[#D1C7BD] mb-1">
                                    Total Kuota Pemakaian (Global)
                                </label>
                                <input
                                    type="number"
                                    min={1}
                                    value={promoUsageLimit}
                                    onChange={(e) => setPromoUsageLimit(e.target.value)}
                                    placeholder="Kosongkan jika kuota tidak terbatas"
                                    className="w-full rounded-xl border border-[#3E3234] bg-[#191415] px-3.5 py-2 text-xs text-white outline-none focus:border-[#E8A598]"
                                />
                            </div>

                            {/* ── Sasaran Pengguna: Semua Pelanggan vs Pelanggan Pilihan ── */}
                            <div className="rounded-2xl border border-[#3E3234] bg-[#191415] p-3.5 space-y-3">
                                <div>
                                    <label className="block text-xs font-bold text-white mb-0.5">
                                        Target Pengguna Kupon *
                                    </label>
                                    <p className="text-[11px] text-[#A89F97]">
                                        Tentukan apakah promo berlaku untuk semua pelanggan atau hanya pelanggan tertentu.
                                    </p>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setPromoTargetType("all")}
                                        className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition ${promoTargetType === "all"
                                            ? "border-emerald-500 bg-emerald-950/60 text-emerald-300"
                                            : "border-[#3E3234] bg-[#221B1D] text-[#A89F97] hover:text-white"
                                            }`}
                                    >
                                        <span>🌐</span> Semua Pelanggan
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setPromoTargetType("specific");
                                            if (customerList.length === 0) fetchCustomers();
                                        }}
                                        className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition ${promoTargetType === "specific"
                                            ? "border-amber-500 bg-amber-950/60 text-amber-300"
                                            : "border-[#3E3234] bg-[#221B1D] text-[#A89F97] hover:text-white"
                                            }`}
                                    >
                                        <span>🎯</span> Pelanggan Pilihan
                                    </button>
                                </div>

                                {promoTargetType === "specific" && (
                                    <div className="mt-2 space-y-2 pt-2 border-t border-[#2E2527]">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-[11px] font-semibold text-amber-300">
                                                Pilih Pelanggan ({promoSelectedCustomerIds.length} dipilih):
                                            </span>
                                            <div className="flex items-center gap-2 text-[10px]">
                                                <button
                                                    type="button"
                                                    onClick={() => setPromoSelectedCustomerIds(customerList.map((c) => c.id))}
                                                    className="text-[#E8A598] hover:underline"
                                                >
                                                    Pilih Semua
                                                </button>
                                                <span className="text-[#524245]">|</span>
                                                <button
                                                    type="button"
                                                    onClick={() => setPromoSelectedCustomerIds([])}
                                                    className="text-[#A89F97] hover:underline"
                                                >
                                                    Reset
                                                </button>
                                            </div>
                                        </div>

                                        {/* Filter Search Customer */}
                                        <input
                                            type="text"
                                            value={promoCustomerSearch}
                                            onChange={(e) => setPromoCustomerSearch(e.target.value)}
                                            placeholder="Cari nama atau WhatsApp pelanggan..."
                                            className="w-full rounded-lg border border-[#3E3234] bg-[#221B1D] px-3 py-1.5 text-xs text-white placeholder-[#78686A] outline-none focus:border-[#E8A598]"
                                        />

                                        {/* List Pelanggan */}
                                        <div className="max-h-44 overflow-y-auto space-y-1 rounded-xl border border-[#2E2527] bg-[#140F10] p-1.5">
                                            {customersLoading ? (
                                                <p className="text-center text-[11px] text-[#A89F97] py-3">Memuat data pelanggan...</p>
                                            ) : customerList.length === 0 ? (
                                                <p className="text-center text-[11px] text-[#A89F97] py-3">Belum ada pelanggan terdaftar.</p>
                                            ) : (
                                                customerList
                                                    .filter((c) => {
                                                        if (!promoCustomerSearch.trim()) return true;
                                                        const q = promoCustomerSearch.toLowerCase();
                                                        return (
                                                            c.name?.toLowerCase().includes(q) ||
                                                            c.phone?.toLowerCase().includes(q)
                                                        );
                                                    })
                                                    .map((c) => {
                                                        const isChecked = promoSelectedCustomerIds.includes(c.id);
                                                        return (
                                                            <label
                                                                key={c.id}
                                                                className={`flex items-center justify-between rounded-lg p-2 text-xs transition cursor-pointer select-none ${isChecked
                                                                    ? "bg-amber-950/40 border border-amber-500/30 text-white"
                                                                    : "hover:bg-[#1E1719] text-[#D1C7BD]"
                                                                    }`}
                                                            >
                                                                <div className="flex items-center gap-2.5 min-w-0">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={isChecked}
                                                                        onChange={() => {
                                                                            if (isChecked) {
                                                                                setPromoSelectedCustomerIds(promoSelectedCustomerIds.filter((id) => id !== c.id));
                                                                            } else {
                                                                                setPromoSelectedCustomerIds([...promoSelectedCustomerIds, c.id]);
                                                                            }
                                                                        }}
                                                                        className="h-3.5 w-3.5 rounded border-[#3E3234] accent-amber-500"
                                                                    />
                                                                    <div className="truncate">
                                                                        <span className="font-semibold block truncate text-xs">{c.name}</span>
                                                                        <span className="text-[10px] text-[#A89F97]">{c.phone}</span>
                                                                    </div>
                                                                </div>
                                                                {isChecked && (
                                                                    <span className="text-[10px] font-bold text-amber-400 shrink-0 ml-2">
                                                                        ✓ Terpilih
                                                                    </span>
                                                                )}
                                                            </label>
                                                        );
                                                    })
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-semibold text-[#D1C7BD] mb-1">
                                        Tanggal Mulai (Opsional)
                                    </label>
                                    <input
                                        type="datetime-local"
                                        value={promoStartDate}
                                        onChange={(e) => setPromoStartDate(e.target.value)}
                                        className="w-full rounded-xl border border-[#3E3234] bg-[#191415] px-3 py-2 text-xs text-white outline-none focus:border-[#E8A598]"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-[#D1C7BD] mb-1">
                                        Tanggal Berakhir (Opsional)
                                    </label>
                                    <input
                                        type="datetime-local"
                                        value={promoEndDate}
                                        onChange={(e) => setPromoEndDate(e.target.value)}
                                        className="w-full rounded-xl border border-[#3E3234] bg-[#191415] px-3 py-2 text-xs text-white outline-none focus:border-[#E8A598]"
                                    />
                                </div>
                            </div>

                            <label className="flex items-center gap-2 pt-2 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={promoIsActive}
                                    onChange={(e) => setPromoIsActive(e.target.checked)}
                                    className="h-4 w-4 rounded border-[#3E3234] text-[#7A2E3A] focus:ring-[#7A2E3A] accent-[#7A2E3A]"
                                />
                                <span className="text-xs font-semibold text-[#D1C7BD]">
                                    Aktifkan promo ini sekarang
                                </span>
                            </label>

                            <div className="mt-5 flex items-center justify-end gap-2 border-t border-[#2E2527] pt-4">
                                <button
                                    type="button"
                                    onClick={() => setShowPromoModal(false)}
                                    className="rounded-xl border border-[#3E3234] px-4 py-2 text-xs font-semibold text-[#A89F97] hover:bg-[#2E2527] hover:text-white"
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    disabled={savingPromo}
                                    className="rounded-xl bg-[#7A2E3A] px-5 py-2 text-xs font-bold text-white transition hover:bg-[#60232E] disabled:opacity-50"
                                >
                                    {savingPromo ? "Menyimpan..." : editingPromo ? "Simpan Perubahan" : "Buat Promo"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── MODAL KELOLA KATEGORI MENU ─────────────────────────────────── */}
            {showCategoryManager && (
                <div
                    className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 p-0 sm:p-4 backdrop-blur-sm"
                    onClick={() => setShowCategoryManager(false)}
                >
                    <div
                        className="relative max-h-[90dvh] sm:max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-[#3E3234] bg-[#221B1D] p-5 sm:p-6 pb-8 sm:pb-6 shadow-2xl text-white"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between border-b border-[#2E2527] pb-3">
                            <div className="flex items-center gap-2">
                                <span className="text-xl">📁</span>
                                <div>
                                    <h3 className="text-base font-bold text-white">
                                        Manajemen Kategori Menu
                                    </h3>
                                    <p className="text-[11px] text-[#A89F97]">
                                        Kelola pengelompokan menu hidangan Ava Eats untuk kemudahan pelanggan.
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowCategoryManager(false)}
                                className="rounded-lg p-1 text-[#A89F97] hover:bg-[#2E2527] hover:text-white"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="mt-4 flex items-center justify-between">
                            <span className="text-xs font-semibold text-[#D1C7BD]">
                                Total: {categoriesList.length} Kategori
                            </span>
                            <button
                                type="button"
                                onClick={openAddCategoryModal}
                                className="inline-flex items-center gap-1.5 rounded-xl bg-[#7A2E3A] px-3 py-1.5 text-xs font-bold text-white transition hover:bg-[#913745]"
                            >
                                <span>+</span> Tambah Kategori
                            </button>
                        </div>

                        <div className="mt-3 space-y-2.5 max-h-96 overflow-y-auto pr-1">
                            {categoriesLoading ? (
                                <p className="py-8 text-center text-xs text-[#A89F97]">Memuat kategori...</p>
                            ) : categoriesList.length === 0 ? (
                                <div className="rounded-2xl border border-[#2E2527] bg-[#191415] p-8 text-center text-xs text-[#A89F97]">
                                    Belum ada kategori menu. Klik tombol &ldquo;+ Tambah Kategori&rdquo; di atas.
                                </div>
                            ) : (
                                categoriesList.map((cat) => (
                                    <div
                                        key={cat.id}
                                        className="flex items-center justify-between gap-3 rounded-2xl border border-[#3E3234] bg-[#191415] p-3.5 transition hover:border-[#524245]"
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#2A2022] text-xl border border-[#3E3234]">
                                                {cat.icon || "🍽️"}
                                            </span>
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <h4 className="text-sm font-bold text-white truncate">
                                                        {cat.name}
                                                    </h4>
                                                    <span className="rounded-full bg-[#2A2022] border border-[#3E3234] px-2 py-0.5 text-[10px] font-bold text-[#E8A598]">
                                                        {cat.product_count} Menu
                                                    </span>
                                                </div>
                                                {cat.description && (
                                                    <p className="text-[11px] text-[#A89F97] truncate mt-0.5">
                                                        {cat.description}
                                                    </p>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-1.5 shrink-0">
                                            <button
                                                type="button"
                                                onClick={() => openEditCategoryModal(cat)}
                                                className="rounded-lg border border-[#3E3234] bg-[#221B1D] px-2.5 py-1.5 text-xs font-semibold text-[#D1C7BD] hover:bg-[#2E2527] hover:text-white transition"
                                                title="Edit nama kategori & pilih menu"
                                            >
                                                <span>✏️ </span><span className="hidden sm:inline">Edit & Atur Menu</span><span className="sm:hidden">Atur</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleDeleteCategory(cat)}
                                                className="rounded-lg border border-red-500/30 bg-red-950/20 px-2 py-1.5 text-xs text-red-400 hover:bg-red-950/40 transition"
                                                title="Hapus Kategori"
                                            >
                                                🗑️
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        <div className="mt-5 border-t border-[#2E2527] pt-3 text-right">
                            <button
                                type="button"
                                onClick={() => setShowCategoryManager(false)}
                                className="rounded-xl border border-[#3E3234] px-4 py-2 text-xs font-semibold text-[#A89F97] hover:bg-[#2E2527] hover:text-white"
                            >
                                Tutup
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── MODAL TAMBAH / EDIT KATEGORI BESERTA PILIH MENU ──────────────── */}
            {showCategoryModal && (
                <div
                    className="fixed inset-0 z-60 flex items-end sm:items-center justify-center bg-black/80 p-0 sm:p-4 backdrop-blur-sm"
                    onClick={() => !savingCategory && setShowCategoryModal(false)}
                >
                    <div
                        className="relative max-h-[92dvh] sm:max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-[#3E3234] bg-[#221B1D] p-5 sm:p-6 pb-8 sm:pb-6 shadow-2xl text-white"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between border-b border-[#2E2527] pb-3">
                            <h3 className="text-base font-bold text-white flex items-center gap-2">
                                <span>{editingCategory ? "✏️ Edit Kategori Menu" : "✨ Buat Kategori Baru"}</span>
                            </h3>
                            <button
                                type="button"
                                onClick={() => setShowCategoryModal(false)}
                                className="rounded-lg p-1 text-[#A89F97] hover:bg-[#2E2527] hover:text-white"
                            >
                                ✕
                            </button>
                        </div>

                        <form onSubmit={handleSaveCategory} className="mt-4 space-y-3.5">
                            <div className="flex gap-2.5">
                                <div className="w-16 shrink-0">
                                    <label className="block text-xs font-semibold text-[#D1C7BD] mb-1">
                                        Icon
                                    </label>
                                    <input
                                        type="text"
                                        value={categoryFormIcon}
                                        onChange={(e) => setCategoryFormIcon(e.target.value)}
                                        placeholder="🍽️"
                                        className="w-full text-center rounded-xl border border-[#3E3234] bg-[#191415] px-2 py-2 text-base text-white outline-none focus:border-[#E8A598]"
                                    />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <label className="block text-xs font-semibold text-[#D1C7BD] mb-1">
                                        Nama Kategori *
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={categoryFormName}
                                        onChange={(e) => setCategoryFormName(e.target.value)}
                                        placeholder="Contoh: Paket Nasi & Lauk"
                                        className="w-full rounded-xl border border-[#3E3234] bg-[#191415] px-3.5 py-2 text-xs text-white outline-none focus:border-[#E8A598]"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-[#D1C7BD] mb-1">
                                    Deskripsi Singkat (Opsional)
                                </label>
                                <input
                                    type="text"
                                    value={categoryFormDescription}
                                    onChange={(e) => setCategoryFormDescription(e.target.value)}
                                    placeholder="Contoh: Menu hidangan lezat siap santap untuk balita"
                                    className="w-full rounded-xl border border-[#3E3234] bg-[#191415] px-3.5 py-2 text-xs text-white outline-none focus:border-[#E8A598]"
                                />
                            </div>

                            {/* Bagian Pilih Menu untuk Kategori Ini */}
                            <div className="rounded-2xl border border-[#3E3234] bg-[#191415] p-3.5 space-y-2.5">
                                <div className="flex items-center justify-between gap-2">
                                    <div>
                                        <span className="block text-xs font-bold text-white">
                                            Pilih Menu untuk Kategori Ini
                                        </span>
                                        <span className="text-[11px] text-[#A89F97]">
                                            {categoryFormProductIds.length} dari {products.length} menu dipilih
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2 text-[10px]">
                                        <button
                                            type="button"
                                            onClick={() => setCategoryFormProductIds(products.map((p) => p.id))}
                                            className="text-[#E8A598] hover:underline"
                                        >
                                            Pilih Semua
                                        </button>
                                        <span className="text-[#524245]">|</span>
                                        <button
                                            type="button"
                                            onClick={() => setCategoryFormProductIds([])}
                                            className="text-[#A89F97] hover:underline"
                                        >
                                            Reset
                                        </button>
                                    </div>
                                </div>

                                <div className="max-h-52 overflow-y-auto space-y-1.5 rounded-xl border border-[#2E2527] bg-[#140F10] p-2">
                                    {products.length === 0 ? (
                                        <p className="text-center text-[11px] text-[#A89F97] py-3">Belum ada menu produk.</p>
                                    ) : (
                                        products.map((p) => {
                                            const isChecked = categoryFormProductIds.includes(p.id);
                                            return (
                                                <label
                                                    key={p.id}
                                                    className={`flex items-center justify-between rounded-lg p-2 text-xs transition cursor-pointer select-none ${isChecked
                                                        ? "bg-[#7A2E3A]/30 border border-[#7A2E3A]/50 text-white"
                                                        : "hover:bg-[#1E1719] text-[#D1C7BD]"
                                                        }`}
                                                >
                                                    <div className="flex items-center gap-2.5 min-w-0">
                                                        <input
                                                            type="checkbox"
                                                            checked={isChecked}
                                                            onChange={() => {
                                                                if (isChecked) {
                                                                    setCategoryFormProductIds(
                                                                        categoryFormProductIds.filter((id) => id !== p.id)
                                                                    );
                                                                } else {
                                                                    setCategoryFormProductIds([...categoryFormProductIds, p.id]);
                                                                }
                                                            }}
                                                            className="h-3.5 w-3.5 rounded border-[#3E3234] accent-[#7A2E3A]"
                                                        />
                                                        <div className="truncate">
                                                            <span className="font-semibold block truncate text-xs">{p.name}</span>
                                                            <span className="text-[10px] text-emerald-400">
                                                                Rp {p.price?.toLocaleString("id-ID")}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    {isChecked && (
                                                        <span className="text-[10px] font-bold text-[#E8A598] shrink-0 ml-2">
                                                            ✓ Termasuk
                                                        </span>
                                                    )}
                                                </label>
                                            );
                                        })
                                    )}
                                </div>
                            </div>

                            <div className="mt-5 flex items-center justify-end gap-2 border-t border-[#2E2527] pt-4">
                                <button
                                    type="button"
                                    onClick={() => setShowCategoryModal(false)}
                                    className="rounded-xl border border-[#3E3234] px-4 py-2 text-xs font-semibold text-[#A89F97] hover:bg-[#2E2527] hover:text-white"
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    disabled={savingCategory}
                                    className="rounded-xl bg-[#7A2E3A] px-5 py-2 text-xs font-bold text-white transition hover:bg-[#60232E] disabled:opacity-50"
                                >
                                    {savingCategory ? "Menyimpan..." : editingCategory ? "Simpan Perubahan" : "Buat Kategori"}
                                </button>
                            </div>
                        </form>
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

            {/* ── Thermal Receipt & Shipping Label Modal ──────────────────────────────── */}
            {printOrder && (
                <ThermalReceiptModal
                    order={printOrder}
                    onClose={() => setPrintOrder(null)}
                />
            )}
        </main>
    );
}
