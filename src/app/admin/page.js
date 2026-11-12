"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiRequest, getImageUrl, parseUtcDate, formatDateTime } from "@/lib/api";
import ThermalReceiptModal from "@/components/ThermalReceiptModal";
import { showToast as modernToast, showAlert, showConfirm } from "@/components/ModernDialog";

const formatRupiah = (amount) =>
    new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0,
    }).format(amount || 0);

const getTodayWibDate = () => {
    try {
        return new Intl.DateTimeFormat("en-CA", {
            timeZone: "Asia/Jakarta",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
        }).format(new Date());
    } catch {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
};

const shiftDateString = (dateStr, deltaDays) => {
    if (!dateStr) return "";
    const [y, m, d] = String(dateStr).split("-").map(Number);
    const dt = new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + deltaDays));
    return dt.toISOString().slice(0, 10);
};

const diffDaysBetween = (startStr, endStr) => {
    if (!startStr || !endStr) return 0;
    const [sy, sm, sd] = String(startStr).split("-").map(Number);
    const [ey, em, ed] = String(endStr).split("-").map(Number);
    const s = Date.UTC(sy, (sm || 1) - 1, sd || 1);
    const e = Date.UTC(ey, (em || 1) - 1, ed || 1);
    return Math.round((e - s) / 86400000);
};

const formatOtsDateHeader = (dateStr, customDayLabel) => {
    if (!dateStr) return { dayName: customDayLabel || "-", formattedDate: "" };
    const [y, m, d] = String(dateStr).split("-").map(Number);
    const dt = new Date(y, (m || 1) - 1, d || 1);
    const dayNames = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
    const dayName = (customDayLabel || "").trim() || dayNames[dt.getDay()] || "";
    const formattedDate = `${d} ${monthNames[(m || 1) - 1] || ""} ${y}`;
    return { dayName, formattedDate };
};

const createEmptyOtsItemRow = () => ({ name: "", qty: 1, price: "" });

const parseOtsItemsToRows = (itemsText) => {
    const rawLines = String(itemsText || "").split(/\r?\n/);
    const priceSuffixRegex = /\s*(?:-|–|—)\s*(?:rp\.?\s*)?(\d+(?:[.,]\d{3})*)(?:\s*(rb|ribu|k))?\s*$/i;
    const qtySuffixRegex = /\s+x(\d+)\s*$/i;
    const rows = [];
    for (const raw of rawLines) {
        const line = raw.trim();
        if (!line) continue;

        let nameAndQty = line;
        let lineTotal = null;

        const mPrice = line.match(priceSuffixRegex);
        if (mPrice) {
            const num = parseInt(mPrice[1].replace(/[.,]/g, ""), 10);
            const unit = (mPrice[2] || "").toLowerCase();
            const val = ["rb", "ribu", "k"].includes(unit) ? num * 1000 : num;
            if (!Number.isNaN(val)) {
                lineTotal = val;
            }
            nameAndQty = line.slice(0, mPrice.index).trim() || line;
        }

        let qty = 1;
        let cleanName = nameAndQty;
        const mQty = nameAndQty.match(qtySuffixRegex);
        if (mQty) {
            const parsedQty = parseInt(mQty[1], 10);
            if (parsedQty > 0) {
                qty = parsedQty;
                cleanName = nameAndQty.slice(0, mQty.index).trim() || nameAndQty;
            }
        }

        const unitPrice = lineTotal !== null ? String(Math.round(lineTotal / qty)) : "";
        rows.push({
            name: cleanName,
            qty,
            price: unitPrice,
        });
    }
    return rows.length > 0 ? rows : [createEmptyOtsItemRow()];
};

const serializeOtsRows = (rows) => {
    const cleaned = (rows || [])
        .map((r) => ({
            name: String(r?.name || "").trim(),
            qty: Math.max(1, parseInt(r?.qty, 10) || 1),
            price: String(r?.price || "").replace(/[^\d]/g, ""),
        }))
        .filter((r) => r.name);

    const itemsText = cleaned
        .map((r) => {
            const label = r.qty > 1 ? `${r.name} x${r.qty}` : r.name;
            if (r.price !== "") {
                return `${label} - ${Number(r.price) * r.qty}`;
            }
            return label;
        })
        .join("\n");

    let total = 0;
    let hasPrice = false;
    for (const r of cleaned) {
        if (r.price !== "") {
            total += Number(r.price) * r.qty;
            hasPrice = true;
        }
    }

    return {
        itemsText,
        amount: hasPrice && total > 0 ? total : null,
    };
};

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
    const [productSearch, setProductSearch] = useState("");
    const savedScrollYRef = useRef(0);
    const [showScrollTop, setShowScrollTop] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            setShowScrollTop(window.scrollY > 280);
        };
        window.addEventListener("scroll", handleScroll, { passive: true });
        handleScroll();
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    const scrollToTop = () => {
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    const restoreScrollPosition = (targetY) => {
        if (typeof window === "undefined" || targetY <= 0) return;
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                window.scrollTo({ top: targetY, behavior: "instant" });
            });
        });
    };

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
    const [auditStartDate, setAuditStartDate] = useState("");
    const [auditEndDate, setAuditEndDate] = useState("");
    const auditSearchRef = useRef(auditSearch);
    const auditRangeRef = useRef({ startDate: "", endDate: "" });
    useEffect(() => {
        auditSearchRef.current = auditSearch;
    }, [auditSearch]);
    useEffect(() => {
        auditRangeRef.current = { startDate: auditStartDate, endDate: auditEndDate };
    }, [auditStartDate, auditEndDate]);

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

    // Auto Refresh state (10 detik) - default nonaktif (false)
    const [autoRefresh, setAutoRefresh] = useState(() => {
        if (typeof window === "undefined") return false;
        try {
            const saved = localStorage.getItem("ava_eats_admin_autorefresh");
            return saved === "true";
        } catch {
            return false;
        }
    });
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

    // Manual Tracking (Resi) Modal State
    const [manualTrackingModalOrder, setManualTrackingModalOrder] = useState(null);
    const [manualTrackingResi, setManualTrackingResi] = useState("");
    const [manualTrackingCourier, setManualTrackingCourier] = useState("manual");
    const [manualTrackingUpdateStatus, setManualTrackingUpdateStatus] = useState(true);
    const [manualTrackingSubmitting, setManualTrackingSubmitting] = useState(false);

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

    // Catatan OTS (On-The-Spot) State
    const [otsNotes, setOtsNotes] = useState([]);
    const [otsLoading, setOtsLoading] = useState(false);
    const [otsSearch, setOtsSearch] = useState("");
    const [otsStatusFilter, setOtsStatusFilter] = useState("pending"); // "all" | "pending" | "unpaid" | "done"
    const [todayWibDate, setTodayWibDate] = useState("");
    const [otsDate, setOtsDate] = useState("");
    const [otsCustomerName, setOtsCustomerName] = useState("");
    const [otsItemRows, setOtsItemRows] = useState([createEmptyOtsItemRow()]);
    const [savingOtsNote, setSavingOtsNote] = useState(false);
    const [showOtsAddForm, setShowOtsAddForm] = useState(false);
    const [openOtsMenuId, setOpenOtsMenuId] = useState(null);
    const [openOtsRecapDates, setOpenOtsRecapDates] = useState({});
    const [otsRecapPendingOnly, setOtsRecapPendingOnly] = useState(false);

    // Master Menu OTS State
    const [otsMenus, setOtsMenus] = useState([]);
    const [otsMenusLoading, setOtsMenusLoading] = useState(false);
    const [showOtsMenuManager, setShowOtsMenuManager] = useState(false);
    const [newOtsMenuName, setNewOtsMenuName] = useState("");
    const [newOtsMenuPrice, setNewOtsMenuPrice] = useState("");
    const [savingOtsMenu, setSavingOtsMenu] = useState(false);
    const [editingOtsMenuId, setEditingOtsMenuId] = useState(null);
    const [editOtsMenuName, setEditOtsMenuName] = useState("");
    const [editOtsMenuPrice, setEditOtsMenuPrice] = useState("");
    const [savingEditOtsMenu, setSavingEditOtsMenu] = useState(false);

    // Edit OTS Note Modal State
    const [showOtsEditModal, setShowOtsEditModal] = useState(false);
    const [editingOtsNote, setEditingOtsNote] = useState(null);
    const [editOtsDate, setEditOtsDate] = useState("");
    const [editOtsCustomerName, setEditOtsCustomerName] = useState("");
    const [editOtsItemRows, setEditOtsItemRows] = useState([createEmptyOtsItemRow()]);
    const [editOtsIsPaid, setEditOtsIsPaid] = useState(false);
    const [editOtsIsDone, setEditOtsIsDone] = useState(false);
    const [savingEditOts, setSavingEditOts] = useState(false);

    const showToast = (msg, type = "success") => {
        modernToast(msg, type);
    };

    const fetchOtsNotes = useCallback(async ({ silent = false } = {}) => {
        if (!silent) setOtsLoading(true);
        try {
            const data = await apiRequest("/ots-notes", { useAdminToken: true });
            setOtsNotes(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error("Gagal memuat catatan OTS:", err);
        } finally {
            if (!silent) setOtsLoading(false);
        }
    }, []);

    const fetchOtsMenus = useCallback(async ({ silent = false } = {}) => {
        if (!silent) setOtsMenusLoading(true);
        try {
            const data = await apiRequest("/ots-notes/menus", { useAdminToken: true });
            setOtsMenus(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error("Gagal memuat daftar menu OTS:", err);
        } finally {
            if (!silent) setOtsMenusLoading(false);
        }
    }, []);

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

    const fetchProducts = useCallback(async ({ silent = false } = {}) => {
        if (!silent) setProductsLoading(true);
        try {
            const data = await apiRequest("/products");
            setProducts(data.products || (Array.isArray(data) ? data : []));
        } catch (err) {
            setErrorMsg(err.message || "Gagal memuat daftar menu.");
        } finally {
            if (!silent) setProductsLoading(false);
        }
    }, []);

    const fetchAuditTrails = useCallback(async (searchQuery, startDateArg, endDateArg) => {
        setAuditLoading(true);
        try {
            const effectiveSearch = searchQuery !== undefined ? searchQuery : auditSearchRef.current;
            const effectiveStart = startDateArg !== undefined ? startDateArg : auditRangeRef.current.startDate;
            const effectiveEnd = endDateArg !== undefined ? endDateArg : auditRangeRef.current.endDate;

            const params = new URLSearchParams();
            params.set("limit", "100");
            if (effectiveSearch && effectiveSearch.trim()) {
                params.set("search", effectiveSearch.trim());
            }
            if (effectiveStart) {
                params.set("start_date", effectiveStart);
            }
            if (effectiveEnd) {
                params.set("end_date", effectiveEnd);
            }

            const res = await apiRequest(`/admins/audit-trails?${params.toString()}`, { useAdminToken: true });
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
            const today = getTodayWibDate();
            const defaultAuditStart = shiftDateString(today, -6);
            setTodayWibDate(today);
            setOtsDate((prev) => prev || today);
            setAuditStartDate((prev) => prev || defaultAuditStart);
            setAuditEndDate((prev) => prev || today);
            auditRangeRef.current = {
                startDate: auditRangeRef.current.startDate || defaultAuditStart,
                endDate: auditRangeRef.current.endDate || today,
            };
            setLoading(false);
            fetchOrders();
            fetchProducts();
            fetchCategories();
            fetchPromos();
            fetchOtsNotes();
            fetchOtsMenus();
            fetchAuditTrails(auditSearchRef.current, auditRangeRef.current.startDate, auditRangeRef.current.endDate);
            if (adminUser?.role !== "staff") {
                fetchAdmins();
                fetchCustomers();
            }
        }, 0);

        return () => clearTimeout(timer);
    }, [router, fetchOrders, fetchProducts, fetchCategories, fetchPromos, fetchOtsNotes, fetchOtsMenus, fetchAuditTrails, fetchAdmins, fetchCustomers, adminUser?.role]);

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
                    fetchProducts({ silent: true });
                    fetchCategories();
                    fetchPromos();
                    fetchOtsNotes({ silent: true });
                    fetchOtsMenus({ silent: true });
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
    }, [autoRefresh, fetchOrders, fetchProducts, fetchCategories, fetchPromos, fetchOtsNotes, fetchOtsMenus, fetchAuditTrails, fetchAdmins, fetchCustomers, adminUser?.role]);

    // Sync dark background color to html/body for seamless mobile Safari rendering
    useEffect(() => {
        document.documentElement.style.backgroundColor = "#191415";
        document.body.style.backgroundColor = "#191415";
        return () => {
            document.documentElement.style.backgroundColor = "";
            document.body.style.backgroundColor = "";
        };
    }, []);

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
            showToast(err.message || "Gagal memperbarui status pesanan.", "error");
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
            showToast(err.message || "Gagal menjalankan simulasi kurir.", "error");
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
            showToast(err.message || "Gagal menjalankan simulasi paket tiba.", "error");
        }
    }

    function openManualTrackingModal(ord) {
        setManualTrackingModalOrder(ord);
        setManualTrackingResi(ord.tracking_number || "");
        setManualTrackingCourier(ord.courier || "manual");
        setManualTrackingUpdateStatus(ord.status === "paid" || ord.status === "processing");
    }

    async function handleSaveManualTracking(e) {
        e.preventDefault();
        if (!manualTrackingModalOrder) return;
        if (!manualTrackingResi.trim()) {
            showToast("Nomor resi wajib diisi.", "warning");
            return;
        }

        try {
            setManualTrackingSubmitting(true);
            const res = await apiRequest(`/shipping/manual-tracking/${manualTrackingModalOrder.id}`, {
                method: "POST",
                useAdminToken: true,
                body: JSON.stringify({
                    tracking_number: manualTrackingResi.trim(),
                    courier: manualTrackingCourier.trim(),
                    update_order_status: manualTrackingUpdateStatus,
                }),
            });

            // Update in orders list
            setOrders((prev) =>
                prev.map((o) =>
                    o.id === manualTrackingModalOrder.id
                        ? {
                            ...o,
                            tracking_number: res.tracking_number,
                            courier: res.courier,
                            tracking_url: res.tracking_url,
                            status: res.order_status || o.status,
                        }
                        : o
                )
            );

            // Update printOrder if active
            if (printOrder && printOrder.id === manualTrackingModalOrder.id) {
                setPrintOrder((prev) => ({
                    ...prev,
                    tracking_number: res.tracking_number,
                    courier: res.courier,
                    tracking_url: res.tracking_url,
                    status: res.order_status || prev.status,
                }));
            }

            showToast("Nomor resi berhasil disimpan! 📦");
            setManualTrackingModalOrder(null);
            fetchAuditTrails();
        } catch (err) {
            showToast(err.message || "Gagal menyimpan nomor resi.", "error");
        } finally {
            setManualTrackingSubmitting(false);
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
            showToast(err.message || "Gagal membatalkan pesanan.", "error");
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
            showToast("File harus berupa gambar bukti transfer (JPG, PNG, WEBP).", "warning");
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            showToast("Ukuran bukti transfer maksimal 5 MB.", "warning");
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
            showToast(err.message || "Gagal mengunggah bukti transfer.", "error");
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
            showToast(err.message || "Gagal mengonfirmasi refund.", "error");
        } finally {
            setRefundSubmitting(false);
        }
    }

    async function handleToggleAvailability(productId, currentAvailability, stock) {
        if (!currentAvailability && stock <= 0) {
            showToast("Produk tidak bisa diaktifkan karena stok 0. Tambah stok terlebih dahulu.", "warning");
            return;
        }

        try {
            await apiRequest(`/products/${productId}/availability`, {
                method: "PUT",
                useAdminToken: true,
                body: JSON.stringify({ is_available: !currentAvailability }),
            });
            showToast(`Ketersediaan menu berhasil diperbarui!`);
            fetchProducts({ silent: true });
            fetchAuditTrails();
        } catch (err) {
            showToast(err.message || "Gagal memperbarui ketersediaan.", "error");
        }
    }

    // Modal Add / Edit Product handlers
    function openAddProductModal() {
        if (typeof window !== "undefined") {
            savedScrollYRef.current = window.scrollY;
        }
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
        if (typeof window !== "undefined") {
            savedScrollYRef.current = window.scrollY;
        }
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
            showToast("File harus berupa gambar (JPG, PNG, WEBP, GIF).", "warning");
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            showToast("Ukuran foto maksimal 5 MB.", "warning");
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
            showToast(err.message || "Gagal mengunggah gambar produk.", "error");
        } finally {
            setUploadingImage(false);
        }
    }

    function closeProductModal() {
        setShowProductModal(false);
        restoreScrollPosition(savedScrollYRef.current);
    }

    async function handleSaveProduct(e) {
        e.preventDefault();
        setErrorMsg("");

        if (prodName.trim().length < 3) {
            showToast("Nama produk minimal 3 karakter.", "warning");
            return;
        }

        if (Number(prodPrice) <= 0) {
            showToast("Harga produk harus lebih dari 0.", "warning");
            return;
        }

        if (Number(prodWeight) <= 0) {
            showToast("Berat produk harus lebih dari 0 gram.", "warning");
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

            await fetchProducts({ silent: true });
            fetchAuditTrails();
            closeProductModal();
        } catch (err) {
            showToast(err.message || "Gagal menyimpan produk.", "error");
        } finally {
            setSavingProduct(false);
        }
    }

    async function handleDeleteProduct(p) {
        const confirmed = await showConfirm(
            `Hapus permanen menu '${p.name}'? Menu ini tidak akan lagi muncul di katalog pembeli.`,
            {
                title: "Hapus Menu",
                type: "danger",
                confirmText: "Ya, Hapus",
            }
        );
        if (!confirmed) return;

        try {
            await apiRequest(`/products/${p.id}`, {
                method: "DELETE",
                useAdminToken: true,
            });
            showToast(`Menu '${p.name}' berhasil dihapus.`);
            fetchProducts({ silent: true });
            fetchAuditTrails();
        } catch (err) {
            showToast(err.message || "Gagal menghapus produk.", "error");
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

            fetchProducts({ silent: true });
            fetchAuditTrails();
        } catch (err) {
            showToast(err.message || "Gagal menyimpan stok.", "error");
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
            showToast("Nama kategori tidak boleh kosong.", "warning");
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
            fetchProducts({ silent: true });
            fetchAuditTrails();
        } catch (err) {
            showToast(err.message || "Gagal menyimpan kategori.", "error");
        } finally {
            setSavingCategory(false);
        }
    }

    async function handleDeleteCategory(cat) {
        const confirmed = await showConfirm(
            `Hapus kategori '${cat.name}'? Menu di dalamnya tidak akan terhapus, melainkan diubah menjadi tanpa kategori.`,
            {
                title: "Hapus Kategori",
                type: "warning",
                confirmText: "Ya, Hapus",
            }
        );
        if (!confirmed) return;

        try {
            await apiRequest(`/categories/${cat.id}`, {
                method: "DELETE",
                useAdminToken: true,
            });
            showToast(`Kategori '${cat.name}' berhasil dihapus.`);
            fetchCategories();
            fetchProducts({ silent: true });
            fetchAuditTrails();
        } catch (err) {
            showToast(err.message || "Gagal menghapus kategori.", "error");
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
                    showToast("Password minimal 6 karakter.", "warning");
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
            showToast(err.message || "Gagal menyimpan data admin.", "error");
        } finally {
            setSavingAdmin(false);
        }
    }

    async function handleDeleteAdmin(adminId, username) {
        const confirmed = await showConfirm(
            `Yakin ingin menghapus akun admin '${username}'? Akses admin ini akan langsung dicabut.`,
            {
                title: "Hapus Akun Admin",
                type: "danger",
                confirmText: "Ya, Hapus",
            }
        );
        if (!confirmed) return;

        try {
            await apiRequest(`/admins/${adminId}`, {
                method: "DELETE",
                useAdminToken: true,
            });
            showToast(`Admin '${username}' berhasil dihapus.`);
            fetchAdmins();
            fetchAuditTrails();
        } catch (err) {
            showToast(err.message || "Gagal menghapus admin.", "error");
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
                    showToast("Password minimal 6 karakter.", "warning");
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
            showToast(err.message || "Gagal menyimpan data pelanggan.", "error");
        } finally {
            setSavingCustomer(false);
        }
    }

    async function handleDeleteCustomer(customerId, name) {
        const confirmed = await showConfirm(
            `Yakin ingin menghapus akun pelanggan '${name}'?`,
            {
                title: "Hapus Akun Pelanggan",
                type: "danger",
                confirmText: "Ya, Hapus",
            }
        );
        if (!confirmed) return;

        try {
            await apiRequest(`/customers/admin/${customerId}`, {
                method: "DELETE",
                useAdminToken: true,
            });
            showToast(`Pelanggan '${name}' berhasil dihapus.`);
            fetchCustomers();
            fetchAuditTrails();
        } catch (err) {
            showToast(err.message || "Gagal menghapus pelanggan.", "error");
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
            showToast("Kode promo tidak boleh kosong.", "warning");
            return;
        }
        if (!promoName.trim()) {
            showToast("Nama promo tidak boleh kosong.", "warning");
            return;
        }
        if (Number(promoDiscountValue) <= 0) {
            showToast("Nilai diskon harus lebih besar dari 0.", "warning");
            return;
        }
        if (promoTargetType === "specific" && promoSelectedCustomerIds.length === 0) {
            showToast("Silakan pilih minimal 1 pelanggan untuk kupon bertarget khusus.", "warning");
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
            showToast(err.message || "Gagal menyimpan kode promo.", "error");
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
            showToast(err.message || "Gagal mengubah status promo.", "error");
        }
    }

    async function handleDeletePromo(promo) {
        const confirmed = await showConfirm(
            `Hapus voucher promo '${promo.code}'? Kupon ini tidak akan bisa digunakan lagi oleh pelanggan.`,
            {
                title: "Hapus Voucher Promo",
                type: "danger",
                confirmText: "Ya, Hapus",
            }
        );
        if (!confirmed) return;

        try {
            await apiRequest(`/promos/${promo.id}`, {
                method: "DELETE",
                useAdminToken: true,
            });
            showToast(`Promo '${promo.code}' berhasil dihapus.`);
            fetchPromos();
            fetchAuditTrails();
        } catch (err) {
            showToast(err.message || "Gagal menghapus promo.", "error");
        }
    }

    // ── Catatan OTS (On-The-Spot) Handlers ──────────────────────────────────
    async function handleCreateOtsNote(e) {
        e.preventDefault();
        if (!otsDate) {
            showToast("Pilih tanggal catatan terlebih dahulu.", "warning");
            return;
        }

        const { itemsText, amount } = serializeOtsRows(otsItemRows);
        if (!otsCustomerName.trim() || !itemsText) {
            showToast("Nama pembeli dan minimal 1 menu wajib diisi.", "warning");
            return;
        }

        setSavingOtsNote(true);
        try {
            await apiRequest("/ots-notes", {
                method: "POST",
                useAdminToken: true,
                body: JSON.stringify({
                    note_date: otsDate,
                    day_label: null,
                    customer_name: otsCustomerName.trim(),
                    items_text: itemsText,
                    amount,
                    is_paid: false,
                    is_done: false,
                }),
            });
            showToast(`Catatan '${otsCustomerName.trim()}' berhasil ditambahkan! 📝`);
            setOtsCustomerName("");
            setOtsItemRows([createEmptyOtsItemRow()]);
            await fetchOtsNotes({ silent: true });
            fetchAuditTrails();
        } catch (err) {
            showToast(err.message || "Gagal menyimpan catatan OTS.", "error");
        } finally {
            setSavingOtsNote(false);
        }
    }

    const updateOtsRowField = (setter, index, field, value) => {
        setter((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
    };

    const addOtsRow = (setter) => {
        setter((prev) => [...prev, createEmptyOtsItemRow()]);
    };

    const removeOtsRow = async (rows, setter, index) => {
        const targetRow = rows[index];
        const menuLabel = targetRow?.name?.trim()
            ? `'${targetRow.name.trim()}'`
            : `baris ke-${index + 1}`;
        const confirmed = await showConfirm(
            `Yakin mau menghapus menu ${menuLabel}?`,
            {
                title: "Hapus Menu",
                type: "danger",
                confirmText: "Ya, Hapus",
            }
        );
        if (!confirmed) return;

        setter((prev) => {
            const next = prev.filter((_, i) => i !== index);
            return next.length > 0 ? next : [createEmptyOtsItemRow()];
        });
    };

    const handlePickPresetOtsMenu = (setter, menuId) => {
        const selected = otsMenus.find((m) => String(m.id) === String(menuId));
        if (!selected) return;
        const nextPrice = selected.price > 0 ? String(selected.price) : "";
        const nextItem = {
            name: selected.name,
            qty: 1,
            price: nextPrice,
        };
        setter((prev) => {
            const existingIdx = prev.findIndex(
                (r) =>
                    String(r.name || "").trim().toLowerCase() === selected.name.trim().toLowerCase() &&
                    String(r.price || "") === nextPrice
            );
            if (existingIdx !== -1) {
                return prev.map((r, i) =>
                    i === existingIdx ? { ...r, qty: Math.max(1, parseInt(r.qty, 10) || 1) + 1 } : r
                );
            }
            const emptyIndex = prev.findIndex((r) => !String(r.name || "").trim() && !String(r.price || "").trim());
            if (emptyIndex !== -1) {
                return prev.map((r, i) => (i === emptyIndex ? nextItem : r));
            }
            return [...prev, nextItem];
        });
    };

    const adjustOtsRowQty = (setter, index, delta) => {
        setter((prev) =>
            prev.map((row, i) => {
                if (i !== index) return row;
                const currentQty = Math.max(1, parseInt(row.qty, 10) || 1);
                return { ...row, qty: Math.max(1, currentQty + delta) };
            })
        );
    };

    async function handleCreateOtsMenu(e) {
        e.preventDefault();
        if (!newOtsMenuName.trim()) {
            showToast("Nama menu OTS wajib diisi.", "warning");
            return;
        }
        setSavingOtsMenu(true);
        try {
            await apiRequest("/ots-notes/menus", {
                method: "POST",
                useAdminToken: true,
                body: JSON.stringify({
                    name: newOtsMenuName.trim(),
                    price: Math.max(0, Number(newOtsMenuPrice) || 0),
                    is_active: true,
                }),
            });
            showToast(`Menu OTS '${newOtsMenuName.trim()}' ditambahkan! 🍽️`);
            setNewOtsMenuName("");
            setNewOtsMenuPrice("");
            await fetchOtsMenus({ silent: true });
            fetchAuditTrails();
        } catch (err) {
            showToast(err.message || "Gagal menambah menu OTS.", "error");
        } finally {
            setSavingOtsMenu(false);
        }
    }

    function openInlineEditOtsMenu(menu) {
        setEditingOtsMenuId(menu.id);
        setEditOtsMenuName(menu.name || "");
        setEditOtsMenuPrice(menu.price !== null && menu.price !== undefined ? String(menu.price) : "");
    }

    async function handleSaveEditOtsMenu(menuId) {
        if (!editOtsMenuName.trim()) {
            showToast("Nama menu tidak boleh kosong.", "warning");
            return;
        }
        setSavingEditOtsMenu(true);
        try {
            await apiRequest(`/ots-notes/menus/${menuId}`, {
                method: "PUT",
                useAdminToken: true,
                body: JSON.stringify({
                    name: editOtsMenuName.trim(),
                    price: Math.max(0, Number(editOtsMenuPrice) || 0),
                }),
            });
            showToast("Menu OTS berhasil diperbarui! ✨");
            setEditingOtsMenuId(null);
            await fetchOtsMenus({ silent: true });
            fetchAuditTrails();
        } catch (err) {
            showToast(err.message || "Gagal memperbarui menu OTS.", "error");
        } finally {
            setSavingEditOtsMenu(false);
        }
    }

    async function handleDeleteOtsMenu(menu) {
        const confirmed = await showConfirm(
            `Hapus menu OTS '${menu.name}' dari daftar pilihan?`,
            {
                title: "Hapus Menu OTS",
                type: "danger",
                confirmText: "Ya, Hapus",
            }
        );
        if (!confirmed) return;

        try {
            await apiRequest(`/ots-notes/menus/${menu.id}`, {
                method: "DELETE",
                useAdminToken: true,
            });
            showToast(`Menu OTS '${menu.name}' berhasil dihapus.`);
            if (editingOtsMenuId === menu.id) setEditingOtsMenuId(null);
            await fetchOtsMenus({ silent: true });
            fetchAuditTrails();
        } catch (err) {
            showToast(err.message || "Gagal menghapus menu OTS.", "error");
        }
    }

    const renderOtsItemRowsEditor = (rows, setter) => {
        const { amount: calculatedTotal } = serializeOtsRows(rows);
        return (
            <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                    <label className="block text-[11px] font-semibold text-[#D1C7BD]">
                        Pesanan Menu & Harga <span className="text-red-400">*</span>
                    </label>
                    {calculatedTotal !== null && (
                        <span className="rounded border border-emerald-500/30 bg-emerald-950/50 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                            Total: {formatRupiah(calculatedTotal)}
                        </span>
                    )}
                </div>

                {/* Preset Menu OTS Selector */}
                <div className="flex items-center gap-2">
                    {otsMenus.length > 0 ? (
                        <select
                            value=""
                            onChange={(e) => {
                                if (e.target.value) {
                                    handlePickPresetOtsMenu(setter, e.target.value);
                                }
                            }}
                            className="min-w-0 flex-1 rounded-xl border border-[#524245] bg-[#191415] px-3 py-2 text-xs text-[#E8A598] font-medium outline-none focus:border-[#E8A598]"
                        >
                            <option value="">-- Pilih Cepat dari Menu OTS ({otsMenus.length}) --</option>
                            {otsMenus.map((m) => (
                                <option key={m.id} value={m.id}>
                                    {m.name} {m.price > 0 ? `— ${formatRupiah(m.price)}` : ""}
                                </option>
                            ))}
                        </select>
                    ) : (
                        <button
                            type="button"
                            onClick={() => setShowOtsMenuManager(true)}
                            className="flex-1 rounded-xl border border-dashed border-[#524245] bg-[#191415]/70 px-3 py-2 text-left text-[11px] font-medium text-[#A89F97] hover:border-[#E8A598] hover:text-[#E8A598] transition"
                        >
                            + Simpan daftar menu OTS di sini biar nanti tinggal pilih...
                        </button>
                    )}
                </div>

                <div className="space-y-2">
                    {rows.map((row, index) => {
                        const qty = Math.max(1, parseInt(row.qty, 10) || 1);
                        return (
                            <div key={index} className="flex flex-wrap sm:flex-nowrap items-center gap-2">
                                <input
                                    type="text"
                                    required={index === 0}
                                    value={row.name}
                                    onChange={(e) => updateOtsRowField(setter, index, "name", e.target.value)}
                                    placeholder={index === 0 ? "cth: Nasi Putih" : "cth: Sei Sapi"}
                                    className="w-full sm:w-auto sm:flex-1 min-w-0 rounded-xl border border-[#3E3234] bg-[#191415] px-3 py-2 text-xs text-white placeholder-[#786D6B] placeholder:text-[10px] outline-none focus:border-[#E8A598]"
                                />
                                <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
                                    {/* Qty Stepper */}
                                    <div className="inline-flex h-8 shrink-0 items-center rounded-xl border border-[#3E3234] bg-[#191415] overflow-hidden">
                                        <button
                                            type="button"
                                            disabled={qty <= 1}
                                            onClick={() => adjustOtsRowQty(setter, index, -1)}
                                            className="flex h-full w-7 items-center justify-center text-[#D1C7BD] hover:bg-[#2E2527] disabled:opacity-30 transition"
                                            title="Kurangi Qty"
                                        >
                                            <span className="text-xs font-bold leading-none">−</span>
                                        </button>
                                        <span className="w-6 text-center text-[11px] font-bold text-white select-none">
                                            {qty}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => adjustOtsRowQty(setter, index, 1)}
                                            className="flex h-full w-7 items-center justify-center text-[#E8A598] hover:bg-[#2E2527] transition"
                                            title="Tambah Qty"
                                        >
                                            <span className="text-xs font-bold leading-none">+</span>
                                        </button>
                                    </div>

                                    {/* Unit Price */}
                                    <div className="relative flex-1 sm:w-32 shrink-0">
                                        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-[#786D6B]">
                                            Rp
                                        </span>
                                        <input
                                            type="number"
                                            min="0"
                                            value={row.price}
                                            onChange={(e) => updateOtsRowField(setter, index, "price", e.target.value)}
                                            placeholder={index === 0 ? "5000" : "10000"}
                                            className="w-full rounded-xl border border-[#3E3234] bg-[#191415] pl-8 pr-2.5 py-2 text-xs text-white placeholder-[#786D6B] placeholder:text-[10px] outline-none focus:border-[#E8A598]"
                                        />
                                    </div>

                                    {rows.length > 1 && (
                                        <button
                                            type="button"
                                            onClick={() => removeOtsRow(rows, setter, index)}
                                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-red-500/30 bg-[#191415] text-xs font-bold text-red-400 hover:bg-red-950/40"
                                            title="Hapus baris menu"
                                        >
                                            <span className="text-xs font-bold leading-none">✕</span>
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                <button
                    type="button"
                    onClick={() => addOtsRow(setter)}
                    className="inline-flex items-center gap-1 rounded-lg border border-dashed border-[#4D3D40] bg-[#191415]/60 px-3 py-1.5 text-[11px] font-semibold text-[#E8A598] transition hover:border-[#E8A598] hover:bg-[#2E2527]"
                >
                    + Tambah Manual
                </button>
            </div>
        );
    };

    function openEditOtsModal(note) {
        if (typeof window !== "undefined") {
            savedScrollYRef.current = window.scrollY;
        }
        setEditingOtsNote(note);
        setEditOtsDate(note.note_date || todayWibDate);
        setEditOtsCustomerName(note.customer_name || "");
        setEditOtsItemRows(parseOtsItemsToRows(note.items_text));
        setEditOtsIsPaid(Boolean(note.is_paid));
        setEditOtsIsDone(Boolean(note.is_done));
        setShowOtsEditModal(true);
    }

    function closeOtsEditModal() {
        setShowOtsEditModal(false);
        restoreScrollPosition(savedScrollYRef.current);
    }

    async function handleSaveEditOts(e) {
        e.preventDefault();
        if (!editingOtsNote) return;
        const { itemsText, amount } = serializeOtsRows(editOtsItemRows);
        if (!editOtsCustomerName.trim() || !itemsText) {
            showToast("Nama pembeli dan minimal 1 menu wajib diisi.", "warning");
            return;
        }

        setSavingEditOts(true);
        try {
            await apiRequest(`/ots-notes/${editingOtsNote.id}`, {
                method: "PUT",
                useAdminToken: true,
                body: JSON.stringify({
                    note_date: editOtsDate,
                    day_label: null,
                    customer_name: editOtsCustomerName.trim(),
                    items_text: itemsText,
                    amount,
                    is_paid: editOtsIsPaid,
                    is_done: editOtsIsDone,
                }),
            });
            showToast(`Catatan '${editOtsCustomerName.trim()}' diperbarui! ✨`);
            closeOtsEditModal();
            await fetchOtsNotes({ silent: true });
            restoreScrollPosition(savedScrollYRef.current);
            fetchAuditTrails();
        } catch (err) {
            showToast(err.message || "Gagal memperbarui catatan OTS.", "error");
        } finally {
            setSavingEditOts(false);
        }
    }

    async function handleToggleOtsField(note, field) {
        const targetY = typeof window !== "undefined" ? window.scrollY : 0;
        if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
        }
        const nextVal = !note[field];
        // Optimistic UI update
        setOtsNotes((prev) =>
            prev.map((n) => (n.id === note.id ? { ...n, [field]: nextVal } : n))
        );
        restoreScrollPosition(targetY);
        try {
            await apiRequest(`/ots-notes/${note.id}`, {
                method: "PUT",
                useAdminToken: true,
                body: JSON.stringify({ [field]: nextVal }),
            });
            await fetchOtsNotes({ silent: true });
            restoreScrollPosition(targetY);
        } catch (err) {
            showToast(err.message || "Gagal memperbarui status catatan.", "error");
            await fetchOtsNotes({ silent: true });
            restoreScrollPosition(targetY);
        }
    }

    function handleSelectOtsFilter(filterId) {
        const targetY = typeof window !== "undefined" ? window.scrollY : 0;
        if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
        }
        setOtsStatusFilter(filterId);
        restoreScrollPosition(targetY);
    }

    useEffect(() => {
        if (openOtsMenuId === null) return;
        const handleOutsideClick = (e) => {
            if (typeof e.target?.closest === "function" && !e.target.closest("[data-ots-menu-container]")) {
                setOpenOtsMenuId(null);
            }
        };
        document.addEventListener("mousedown", handleOutsideClick);
        document.addEventListener("touchstart", handleOutsideClick);
        return () => {
            document.removeEventListener("mousedown", handleOutsideClick);
            document.removeEventListener("touchstart", handleOutsideClick);
        };
    }, [openOtsMenuId]);

    const buildOtsReceiptOrder = (note) => {
        const parsedRows = parseOtsItemsToRows(note.items_text);
        const items = parsedRows
            .filter((r) => r.name && r.name.trim())
            .map((r) => ({
                product_name: r.name.trim(),
                quantity: Math.max(1, parseInt(r.qty, 10) || 1),
                price: r.price !== "" ? Number(r.price) : 0,
            }));
        const total =
            note.amount !== null && note.amount !== undefined
                ? Number(note.amount)
                : items.reduce((sum, it) => sum + (it.price || 0) * (it.quantity || 1), 0);

        return {
            id: `OTS-${note.id}`,
            order_code: `OTS-${note.id}`,
            is_ots: true,
            customer_name: note.customer_name || "Pelanggan OTS",
            created_at: note.created_at || (note.note_date ? `${note.note_date}T00:00:00` : undefined),
            fulfillment_method: "pickup",
            status: note.is_paid ? "paid" : "pending",
            items,
            shipping_cost: 0,
            packaging_fee: 0,
            discount_amount: 0,
            grand_total: total,
            total_amount: total,
        };
    };

    async function handleDeleteOtsNote(note) {
        const targetY = typeof window !== "undefined" ? window.scrollY : 0;
        const confirmed = await showConfirm(
            `Hapus catatan OTS '${note.customer_name} : ${note.items_text}'?`,
            {
                title: "Hapus Catatan OTS",
                type: "danger",
                confirmText: "Ya, Hapus",
            }
        );
        if (!confirmed) {
            restoreScrollPosition(targetY);
            return;
        }

        try {
            await apiRequest(`/ots-notes/${note.id}`, {
                method: "DELETE",
                useAdminToken: true,
            });
            showToast(`Catatan '${note.customer_name}' berhasil dihapus.`);
            await fetchOtsNotes({ silent: true });
            restoreScrollPosition(targetY);
            fetchAuditTrails();
        } catch (err) {
            showToast(err.message || "Gagal menghapus catatan OTS.", "error");
        }
    }

    function handleCopyOtsDay(dateStr, dayName, items) {
        const { dayName: resolvedDay, formattedDate } = formatOtsDateHeader(dateStr, dayName);
        const header = formattedDate ? `${resolvedDay} (${formattedDate})` : resolvedDay;
        const lines = items.map((item) => {
            const priceSuffix = item.amount ? ` (${formatRupiah(item.amount)})` : "";
            const isMultiLine = String(item.items_text || "").includes("\n");
            if (isMultiLine) {
                return `${item.customer_name} :\n${item.items_text}${priceSuffix ? `\nTotal:${priceSuffix}` : ""}`;
            }
            return `${item.customer_name} : ${item.items_text}${priceSuffix}`;
        });
        const fullText = `${header}\n${lines.join("\n")}`;
        if (typeof navigator !== "undefined" && navigator.clipboard) {
            navigator.clipboard.writeText(fullText);
            showToast(`Catatan ${resolvedDay} berhasil disalin ke clipboard! 📋`);
        }
    }

    function buildOtsDayRecap(notes, pendingOnly = false) {
        const masterMenuNameMap = new Map();
        (otsMenus || []).forEach((menu) => {
            const normalized = String(menu?.name || "").trim().replace(/\s+/g, " ").toLowerCase();
            if (normalized) {
                masterMenuNameMap.set(normalized, String(menu.name).trim());
            }
        });

        const relevantNotes = (notes || []).filter((n) => (pendingOnly ? !n.is_done : true));
        const itemMap = new Map();

        relevantNotes.forEach((note) => {
            const rows = parseOtsItemsToRows(note.items_text);
            rows.forEach((row) => {
                const rawName = String(row?.name || "").trim().replace(/\s+/g, " ");
                if (!rawName) return;
                const key = rawName.toLowerCase();
                const qty = Math.max(1, parseInt(row?.qty, 10) || 1);

                if (!itemMap.has(key)) {
                    itemMap.set(key, {
                        key,
                        name: masterMenuNameMap.get(key) || rawName,
                        totalQty: 0,
                        pendingQty: 0,
                    });
                }
                const entry = itemMap.get(key);
                entry.totalQty += qty;
                if (!note.is_done) {
                    entry.pendingQty += qty;
                }
            });
        });

        const items = Array.from(itemMap.values()).sort((a, b) => {
            if (b.totalQty !== a.totalQty) return b.totalQty - a.totalQty;
            return a.name.localeCompare(b.name, "id");
        });

        const totalPortions = items.reduce((sum, item) => sum + item.totalQty, 0);
        return {
            items,
            totalPortions,
            totalOrders: relevantNotes.length,
        };
    }

    function handleCopyOtsRecap(dateStr, dayName, recap, pendingOnly) {
        const { dayName: resolvedDay, formattedDate } = formatOtsDateHeader(dateStr, dayName);
        const header = formattedDate ? `Rekap Menu - ${resolvedDay} (${formattedDate})` : `Rekap Menu - ${resolvedDay}`;
        const scopeLabel = pendingOnly ? " [Belum Selesai]" : "";
        const lines = (recap?.items || []).map((item) => `- ${item.name} = ${item.totalQty}`);
        const fullText = `${header}${scopeLabel}\n${lines.join("\n")}\nTotal: ${recap?.totalPortions || 0} item`;
        if (typeof navigator !== "undefined" && navigator.clipboard) {
            navigator.clipboard.writeText(fullText);
            showToast(`Rekap Menu ${resolvedDay} berhasil disalin! 📋`);
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

    const filteredProducts = products.filter((prod) => {
        const q = productSearch.trim().toLowerCase();
        if (!q) return true;
        return (
            prod.name?.toLowerCase().includes(q) ||
            prod.category?.toLowerCase().includes(q) ||
            prod.description?.toLowerCase().includes(q)
        );
    });

    const otsPendingCount = otsNotes.filter((n) => !n.is_done).length;
    const otsUnpaidCount = otsNotes.filter((n) => !n.is_paid).length;
    const otsDoneCount = otsNotes.filter((n) => n.is_done && n.is_paid).length;

    const filteredOtsNotes = otsNotes.filter((note) => {
        if (otsStatusFilter === "pending" && note.is_done) return false;
        if (otsStatusFilter === "unpaid" && note.is_paid) return false;
        if (otsStatusFilter === "done" && (!note.is_done || !note.is_paid)) return false;

        const q = otsSearch.trim().toLowerCase();
        if (!q) return true;
        const { dayName, formattedDate } = formatOtsDateHeader(note.note_date, note.day_label);
        return (
            note.customer_name?.toLowerCase().includes(q) ||
            note.items_text?.toLowerCase().includes(q) ||
            dayName.toLowerCase().includes(q) ||
            formattedDate.toLowerCase().includes(q)
        );
    });

    const groupedOtsMap = new Map();
    filteredOtsNotes.forEach((note) => {
        const key = note.note_date || "tanpa-tanggal";
        if (!groupedOtsMap.has(key)) {
            groupedOtsMap.set(key, []);
        }
        groupedOtsMap.get(key).push(note);
    });
    const groupedOtsDays = Array.from(groupedOtsMap.entries());
    const pendingOtsCount = otsNotes.filter((n) => !n.is_done).length;

    const pendingCookCount = orders.filter((o) => o.status === "paid" || o.status === "processing").length;
    const totalRevenue = orders
        .filter((o) => o.status === "paid" || o.status === "completed" || o.status === "delivered")
        .reduce((sum, o) => sum + (o.grand_total || o.total_amount || 0), 0);

    return (
        <main className="min-h-screen w-full max-w-full overflow-x-hidden bg-[#191415] text-[#F5EFEB] pb-24 sm:pb-16">
            {/* Topbar - Mobile First Sticky Header */}
            <header className="sticky top-0 z-40 border-b border-[#2E2527] bg-[#221B1D]/95 backdrop-blur-md px-3 sm:px-4 py-2.5 sm:py-3 w-full">
                <div className="mx-auto flex max-w-7xl items-center justify-between gap-2">
                    <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
                        <div className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-white/20">
                            <img src="/logo.png" alt="Ava Eats Admin" className="h-full w-full object-cover" />
                        </div>
                        <div className="min-w-0">
                            <span className="block text-[8px] sm:text-[10px] font-bold uppercase tracking-widest text-[#E8A598] truncate">
                                AVA EATS ADMIN
                            </span>
                            <h1 className="text-xs sm:text-sm font-bold text-white leading-tight truncate">
                                Operations Portal
                            </h1>
                        </div>
                    </div>

                    <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                        {/* Manual Refresh / Sync Button */}
                        <button
                            type="button"
                            onClick={() => {
                                fetchOrders();
                                fetchProducts();
                                fetchCategories();
                                fetchPromos();
                                fetchAuditTrails();
                                if (adminUser?.role !== "staff") {
                                    fetchAdmins();
                                    fetchCustomers();
                                }
                                setRefreshCounter(10);
                                showToast("Data dashboard berhasil di-refresh! 🔄");
                            }}
                            title="Refresh data sekarang secara manual"
                            className="inline-flex items-center gap-1 sm:gap-1.5 rounded-xl border border-[#3E3234] bg-[#2A2123] px-2 sm:px-2.5 py-1.5 text-xs font-semibold text-[#D1C7BD] hover:bg-[#342A2C] hover:text-white transition shrink-0"
                        >
                            <span>🔄</span>
                            <span className="hidden sm:inline text-[11px]">Sync</span>
                        </button>

                        {/* Auto-Refresh 10s Toggle Button */}
                        <button
                            type="button"
                            onClick={() => {
                                const nextState = !autoRefresh;
                                setAutoRefresh(nextState);
                                try {
                                    localStorage.setItem("ava_eats_admin_autorefresh", String(nextState));
                                } catch { }
                                if (nextState) {
                                    setRefreshCounter(10);
                                    showToast("Auto-refresh tiap 10 detik diaktifkan! ⏱️");
                                } else {
                                    showToast("Auto-refresh dinonaktifkan. ⏸️");
                                }
                            }}
                            title={autoRefresh ? "Auto-refresh aktif setiap 10 detik. Klik untuk mematikan." : "Auto-refresh nonaktif. Klik untuk mengaktifkan."}
                            className={`inline-flex items-center gap-1 sm:gap-1.5 rounded-xl border px-2 sm:px-2.5 py-1.5 text-xs font-semibold transition shrink-0 ${autoRefresh
                                ? "border-emerald-500/40 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/50"
                                : "border-[#3E3234] bg-[#2A2123] text-[#A89F97] hover:bg-[#342A2C] hover:text-white"
                                }`}
                        >
                            {autoRefresh ? (
                                <>
                                    <span className="relative flex h-2 w-2">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                    </span>
                                    <span className="text-[10px] sm:text-[11px] font-mono font-bold text-emerald-400">
                                        <span className="hidden sm:inline">Auto: </span>{refreshCounter}s
                                    </span>
                                </>
                            ) : (
                                <>
                                    <span className="h-2 w-2 rounded-full bg-[#5E5254]"></span>
                                    <span className="text-[10px] sm:text-[11px] font-mono font-medium text-[#A89F97]">
                                        Auto: <span className="font-bold text-[#8C7F82]">Off</span>
                                    </span>
                                </>
                            )}
                        </button>

                        <Link
                            href="/"
                            target="_blank"
                            className="hidden md:inline-flex items-center gap-1 rounded-xl border border-[#3E3234] px-3 py-1.5 text-xs font-semibold text-[#D1C7BD] hover:bg-[#2E2527] transition"
                        >
                            <span>↗</span> Buka Toko
                        </Link>

                        {/* Admin Name Badge */}
                        <div className="flex items-center gap-1.5 rounded-xl bg-[#2E2527] px-2 sm:px-2.5 py-1.5 max-w-[85px] sm:max-w-none">
                            <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400 animate-pulse" />
                            <span className="text-[11px] sm:text-xs font-bold text-white truncate sm:hidden">
                                {adminUser?.name?.split(" ")[0] || "Admin"}
                            </span>
                            <span className="text-xs font-bold text-white truncate hidden sm:inline">
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

                        {/* Logout Button */}
                        <button
                            type="button"
                            onClick={handleLogout}
                            className="rounded-xl border border-red-500/30 bg-red-950/40 px-2 sm:px-2.5 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-900/60 transition shrink-0"
                        >
                            Keluar
                        </button>
                    </div>
                </div>
            </header>

            <div className="mx-auto max-w-7xl px-3 sm:px-4 pt-3 sm:pt-6 w-full min-w-0">
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
                {activeTab !== "ots" && (
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

                        <div className="col-span-2 lg:col-span-1 rounded-2xl border border-[#342A2C] bg-[#221B1D] p-3.5 sm:p-4">
                            <span className="text-[10px] sm:text-[11px] font-semibold text-[#A89F97] uppercase tracking-wider">
                                Audit Trail
                            </span>
                            <p className="mt-1 text-base sm:text-xl font-bold text-sky-400">
                                {auditTotal} Log
                            </p>
                            <span className="text-[9px] sm:text-[10px] text-[#A89F97]">Aktivitas Sistem</span>
                        </div>
                    </div>
                )}

                {/* Mobile Friendly Tabs */}
                <div className="mb-4 sm:mb-6 overflow-x-auto no-scrollbar border-b border-[#2E2527] pb-2 flex gap-2 w-full min-w-0 max-w-full">
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
                        onClick={() => setActiveTab("ots")}
                        className={`shrink-0 rounded-xl px-3.5 py-2 text-xs font-bold transition inline-flex items-center gap-2 ${activeTab === "ots"
                            ? "bg-[#7A2E3A] text-white shadow-md shadow-[#7A2E3A]/40"
                            : "bg-[#251E20] text-[#A89F97] hover:bg-[#2E2527] hover:text-white"
                            }`}
                    >
                        <span>📝 Pesanan OTS</span>
                        {pendingOtsCount > 0 ? (
                            <span className="rounded-full bg-sky-400/20 border border-sky-400/40 px-1.5 py-0.5 text-[10px] font-bold text-sky-300">
                                {pendingOtsCount}
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
                    <div className="space-y-4 w-full min-w-0">
                        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 w-full min-w-0 max-w-full">
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

                        {ordersLoading && orders.length === 0 ? (
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
                                            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 min-w-0">
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

                                            <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
                                                <button
                                                    type="button"
                                                    onClick={() => setPrintOrder(ord)}
                                                    className="rounded-lg border border-[#3E3234] bg-[#2A2123] px-2 sm:px-2.5 py-1 text-xs font-semibold text-[#D1C7BD] hover:bg-[#342A2C] hover:text-white transition inline-flex items-center gap-1 shadow-xs shrink-0"
                                                    title="Cetak Struk & Label Thermal (58mm / 80mm)"
                                                >
                                                    <span>🖨️</span> <span className="hidden sm:inline">Cetak</span> Struk
                                                </button>
                                                <div className="text-right">
                                                    <span className="text-xs sm:text-sm font-bold text-white">
                                                        Rp {(ord.grand_total || ord.total_amount || 0).toLocaleString("id-ID")}
                                                    </span>
                                                    <span className="block text-[9px] text-[#A89F97]">
                                                        {ord.created_at ? parseUtcDate(ord.created_at)?.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "-"}
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
                                                        {/* Resi Kurir (Manual / Otomatis) */}
                                                        {ord.tracking_number ? (
                                                            <div className="flex items-center gap-1.5 rounded-xl border border-sky-500/40 bg-sky-950/40 px-3 py-1.5 text-xs">
                                                                <span className="text-sky-300 font-bold">📦 Resi:</span>
                                                                <span className="font-mono font-bold text-white uppercase">{ord.tracking_number}</span>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => openManualTrackingModal(ord)}
                                                                    className="text-[10px] text-sky-400 hover:text-sky-200 underline font-semibold ml-1"
                                                                    title="Edit Nomor Resi"
                                                                >
                                                                    ✏️ Ubah
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                onClick={() => openManualTrackingModal(ord)}
                                                                title="Input nomor resi pengiriman kurir manual"
                                                                className="rounded-xl border border-[#3E3234] bg-[#221B1D] px-3 py-2 text-xs font-semibold text-[#D1C7BD] hover:bg-[#2E2527] hover:text-white transition flex items-center gap-1.5"
                                                            >
                                                                <span>📦</span>
                                                                <span>Input Resi Manual</span>
                                                            </button>
                                                        )}

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
                                                            <div className="flex flex-wrap items-center gap-2">
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

                {/* ── TAB: CATATAN OTS (ON-THE-SPOT) ─────────────────────────── */}
                {activeTab === "ots" && (
                    <div className="space-y-4">
                        {/* Header */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                            <div>
                                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                                    <span>📝</span> Catatan Jualan On The Spot (OTS)
                                </h2>
                                <p className="text-[11px] text-[#A89F97] mt-0.5">
                                    Catatan bebas pesanan di luar menu Ava Eats, otomatis dikelompokkan per hari & tanggal.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowOtsMenuManager(true)}
                                className="inline-flex h-8 self-start sm:self-auto shrink-0 items-center justify-center gap-1.5 rounded-xl border border-[#524245] bg-[#2E2527] px-3 text-[#E8A598] hover:bg-[#3E3234] transition"
                            >
                                <span className="text-[11px] font-bold leading-none">
                                    🍽️ Menu OTS ({otsMenus.length})
                                </span>
                            </button>
                        </div>

                        {/* Collapsible Quick Add Card */}
                        <div className="rounded-2xl border border-[#3E3234] bg-[#221B1D] shadow-sm overflow-hidden">
                            <div
                                onClick={() => !showOtsAddForm && setShowOtsAddForm(true)}
                                className={`flex items-center justify-between gap-3 px-4 py-3 ${!showOtsAddForm ? "cursor-pointer hover:bg-[#271F21] transition" : "border-b border-[#2E2527] bg-[#1F191A]"}`}
                            >
                                <div className="min-w-0">
                                    <p className="text-xs font-bold text-white flex items-center gap-1.5">
                                        <span>{showOtsAddForm ? "📝" : "➕"}</span>
                                        <span>Masukan Pesanan OTS</span>
                                    </p>
                                    {!showOtsAddForm && (
                                        <p className="text-[10px] text-[#A89F97] truncate mt-0.5">
                                            Klik untuk mencatat pesanan baru
                                        </p>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setShowOtsAddForm((prev) => !prev);
                                    }}
                                    className={`inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-xl px-3 transition ${showOtsAddForm
                                        ? "border border-[#3E3234] bg-[#2E2527] text-[#D1C7BD] hover:bg-[#3E3234]"
                                        : "bg-[#7A2E3A] text-white shadow-sm shadow-[#7A2E3A]/40 hover:bg-[#913745]"
                                        }`}
                                >
                                    <span className="text-[11px] font-bold leading-none">
                                        {showOtsAddForm ? "▲ Tutup" : "+ Buka Form"}
                                    </span>
                                </button>
                            </div>

                            {showOtsAddForm && (
                                <form
                                    onSubmit={handleCreateOtsNote}
                                    className="p-4 space-y-3"
                                >
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                        <div>
                                            <label className="mb-1 block text-[11px] font-semibold text-[#D1C7BD]">
                                                Tanggal <span className="text-red-400">*</span>
                                                {otsDate && (
                                                    <span className="ml-1.5 rounded bg-[#2E2527] px-1.5 py-0.5 text-[10px] text-[#E8A598]">
                                                        Hari: {formatOtsDateHeader(otsDate, "").dayName}
                                                    </span>
                                                )}
                                            </label>
                                            <input
                                                type="date"
                                                required
                                                value={otsDate}
                                                onChange={(e) => setOtsDate(e.target.value)}
                                                className="w-full rounded-xl border border-[#3E3234] bg-[#191415] px-3 py-2 text-xs text-white outline-none focus:border-[#E8A598]"
                                            />
                                        </div>

                                        <div>
                                            <label className="mb-1 block text-[11px] font-semibold text-[#D1C7BD]">
                                                Nama Pembeli <span className="text-red-400">*</span>
                                            </label>
                                            <input
                                                type="text"
                                                required
                                                value={otsCustomerName}
                                                onChange={(e) => setOtsCustomerName(e.target.value)}
                                                placeholder="cth: Fabiola"
                                                className="w-full rounded-xl border border-[#3E3234] bg-[#191415] px-3 py-2 text-xs text-white placeholder-[#786D6B] placeholder:text-[10px] outline-none focus:border-[#E8A598]"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        {renderOtsItemRowsEditor(otsItemRows, setOtsItemRows)}
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
                                            <button
                                                type="submit"
                                                disabled={savingOtsNote}
                                                className="shrink-0 rounded-xl bg-[#7A2E3A] px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-[#7A2E3A]/40 transition hover:bg-[#913745] disabled:opacity-60"
                                            >
                                                <span className="text-xs font-bold leading-none">
                                                    {savingOtsNote ? "Menyimpan..." : "+ Simpan Pesanan"}
                                                </span>
                                            </button>
                                        </div>
                                    </div>
                                </form>
                            )}
                        </div>

                        {/* Search & Filter */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                            <div className="relative flex-1">
                                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-xs text-[#A89F97]">
                                    🔍
                                </span>
                                <input
                                    type="text"
                                    value={otsSearch}
                                    onChange={(e) => setOtsSearch(e.target.value)}
                                    placeholder="Cari pembeli, menu, atau hari..."
                                    className="w-full rounded-xl border border-[#3E3234] bg-[#221B1D] pl-9 pr-9 py-2.5 text-xs text-white placeholder-[#786D6B] placeholder:text-[10px] outline-none focus:border-[#E8A598]"
                                />
                                {otsSearch && (
                                    <button
                                        type="button"
                                        onClick={() => setOtsSearch("")}
                                        aria-label="Hapus pencarian"
                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded-full bg-[#3E3234] text-[10px] font-bold text-[#D1C7BD] hover:bg-[#524245] hover:text-white"
                                    >
                                        ✕
                                    </button>
                                )}
                            </div>

                            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                                {[
                                    { id: "pending", label: `Belum Selesai (${otsPendingCount})` },
                                    { id: "unpaid", label: `Belum Bayar (${otsUnpaidCount})` },
                                    { id: "done", label: `Lunas & Selesai (${otsDoneCount})` },
                                    { id: "all", label: `Semua (${otsNotes.length})` },
                                ].map((f) => (
                                    <button
                                        key={f.id}
                                        type="button"
                                        onClick={() => handleSelectOtsFilter(f.id)}
                                        className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${otsStatusFilter === f.id
                                            ? "bg-white text-[#191415]"
                                            : "border border-[#342A2C] bg-[#221B1D] text-[#A89F97] hover:text-white"
                                            }`}
                                    >
                                        <span className="text-[11px] font-semibold">{f.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Grouped List Per Hari */}
                        {otsLoading && otsNotes.length === 0 ? (
                            <p className="py-12 text-center text-xs text-[#A89F97]">Memuat catatan OTS...</p>
                        ) : groupedOtsDays.length === 0 ? (
                            <div className="rounded-2xl border border-[#342A2C] bg-[#221B1D] p-10 text-center">
                                <span className="text-3xl block mb-2">📝</span>
                                <p className="text-sm font-semibold text-white">
                                    {otsSearch.trim() || otsStatusFilter !== "all"
                                        ? "Catatan tidak ditemukan"
                                        : "Belum ada catatan pesanan OTS"}
                                </p>
                                <p className="mt-1 text-xs text-[#A89F97]">
                                    {otsSearch.trim() || otsStatusFilter !== "all"
                                        ? "Coba ubah filter atau kata kunci pencarian."
                                        : "Mulai catat pesanan harian di luar menu Ava Eats lewat form di atas."}
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {groupedOtsDays.map(([dateStr, dayNotes]) => {
                                    const firstCustomLabel = dayNotes[0]?.day_label;
                                    const { dayName, formattedDate } = formatOtsDateHeader(dateStr, firstCustomLabel);
                                    const isToday = Boolean(todayWibDate && dateStr === todayWibDate);
                                    const dayTotalAmount = dayNotes.reduce((sum, n) => sum + (Number(n.amount) || 0), 0);
                                    const dayDoneCount = dayNotes.filter((n) => n.is_done).length;
                                    const isRecapOpen = Boolean(openOtsRecapDates[dateStr]);
                                    const dayAllNotes = otsNotes.filter(
                                        (n) => (n.note_date || "tanpa-tanggal") === dateStr
                                    );
                                    const dayRecap = isRecapOpen
                                        ? buildOtsDayRecap(dayAllNotes, otsRecapPendingOnly)
                                        : null;

                                    return (
                                        <div
                                            key={dateStr}
                                            className="rounded-2xl border border-[#342A2C] bg-[#221B1D] shadow-sm"
                                        >
                                            {/* Day Header */}
                                            <div className="flex flex-wrap items-center justify-between gap-2 rounded-t-2xl border-b border-[#2E2527] bg-[#1F191A] px-4 py-3">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <h3 className="text-sm font-bold text-white">
                                                        {dayName}
                                                    </h3>
                                                    {formattedDate && (
                                                        <span className="text-xs font-medium text-[#A89F97]">
                                                            • {formattedDate}
                                                        </span>
                                                    )}
                                                    {isToday && (
                                                        <span className="rounded-full bg-emerald-500/20 border border-emerald-500/40 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                                                            Hari Ini
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="text-[11px] text-[#A89F97]">
                                                        {dayDoneCount}/{dayNotes.length} selesai
                                                    </span>
                                                    {dayTotalAmount > 0 && (
                                                        <span className="rounded-lg bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 text-[11px] font-bold text-emerald-300">
                                                            Total: {formatRupiah(dayTotalAmount)}
                                                        </span>
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            setOpenOtsRecapDates((prev) => ({
                                                                ...prev,
                                                                [dateStr]: !prev[dateStr],
                                                            }))
                                                        }
                                                        className={`inline-flex h-6 items-center justify-center gap-1 rounded-lg border px-2 text-[10px] font-bold leading-none transition ${isRecapOpen
                                                            ? "border-[#E8A598] bg-[#7A2E3A] text-white"
                                                            : "border-[#524245] bg-[#2E2527] text-[#E8A598] hover:bg-[#3E3234]"
                                                            }`}
                                                        title="Lihat rekap jumlah pesanan per menu"
                                                    >
                                                        <span className="text-[10px] font-bold leading-none">📊 Rekap Menu</span>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleCopyOtsDay(dateStr, firstCustomLabel, dayNotes)}
                                                        className="inline-flex h-6 items-center justify-center gap-1 rounded-lg border border-[#524245] bg-[#2E2527] px-2 text-[10px] font-bold leading-none text-[#E8A598] hover:bg-[#3E3234] transition"
                                                        title="Salin format teks ke WhatsApp"
                                                    >
                                                        <span className="text-[10px] font-bold leading-none">📋 Salin WA</span>
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Collapsible Rekap Menu Harian */}
                                            {isRecapOpen && dayRecap && (
                                                <div className="border-b border-[#2E2527] bg-[#191415]/90 px-4 py-3 space-y-2.5">
                                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs font-bold text-[#E8A598]">
                                                                📊 Rekap Menu ({dayName}{formattedDate ? ` • ${formattedDate}` : ""})
                                                            </span>
                                                        </div>
                                                        <div className="flex flex-wrap items-center gap-1.5">
                                                            <button
                                                                type="button"
                                                                onClick={() => setOtsRecapPendingOnly(false)}
                                                                className={`inline-flex h-6 items-center rounded-full px-2.5 transition ${!otsRecapPendingOnly
                                                                    ? "bg-white text-[#191415]"
                                                                    : "border border-[#3E3234] bg-[#221B1D] text-[#A89F97] hover:text-white"
                                                                    }`}
                                                            >
                                                                <span className="text-[10px] font-bold leading-none">Semua</span>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => setOtsRecapPendingOnly(true)}
                                                                className={`inline-flex h-6 items-center rounded-full px-2.5 transition ${otsRecapPendingOnly
                                                                    ? "bg-amber-400 text-[#191415]"
                                                                    : "border border-[#3E3234] bg-[#221B1D] text-[#A89F97] hover:text-white"
                                                                    }`}
                                                            >
                                                                <span className="text-[10px] font-bold leading-none">Belum Selesai</span>
                                                            </button>
                                                            {dayRecap.items.length > 0 && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleCopyOtsRecap(dateStr, firstCustomLabel, dayRecap, otsRecapPendingOnly)}
                                                                    className="inline-flex h-6 items-center gap-1 rounded-lg border border-[#524245] bg-[#2E2527] px-2 text-[#E8A598] hover:bg-[#3E3234] transition"
                                                                    title="Salin Rekap Menu ke WhatsApp"
                                                                >
                                                                    <span className="text-[10px] font-bold leading-none">📋 Salin Rekap</span>
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {dayRecap.items.length === 0 ? (
                                                        <p className="text-[11px] text-[#A89F97] py-1">
                                                            {otsRecapPendingOnly
                                                                ? "Semua pesanan di tanggal ini sudah selesai."
                                                                : "Belum ada item menu yang tercatat."}
                                                        </p>
                                                    ) : (
                                                        <>
                                                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                                                {dayRecap.items.map((item) => (
                                                                    <div
                                                                        key={item.key}
                                                                        className="flex items-center justify-between gap-2 rounded-xl border border-[#342A2C] bg-[#221B1D] px-3 py-2"
                                                                    >
                                                                        <div className="min-w-0">
                                                                            <p className="text-xs font-semibold text-white truncate">
                                                                                {item.name}
                                                                            </p>
                                                                            {!otsRecapPendingOnly && item.pendingQty > 0 && item.pendingQty < item.totalQty && (
                                                                                <p className="text-[10px] text-amber-300">
                                                                                    {item.pendingQty} belum selesai
                                                                                </p>
                                                                            )}
                                                                        </div>
                                                                        <span className="shrink-0 rounded-lg bg-[#7A2E3A]/40 border border-[#E8A598]/30 px-2 py-0.5 text-xs font-extrabold text-[#F5EFEB]">
                                                                            = {item.totalQty}
                                                                        </span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                            <p className="text-[11px] text-[#A89F97]">
                                                                Total: <span className="font-semibold text-white">{dayRecap.items.length} jenis menu</span> •{" "}
                                                                <span className="font-semibold text-white">{dayRecap.totalPortions} item</span> dari {dayRecap.totalOrders} pesanan
                                                            </p>
                                                        </>
                                                    )}
                                                </div>
                                            )}

                                            {/* Notes List for This Day */}
                                            <div className="divide-y divide-[#2E2527]">
                                                {dayNotes.map((note) => (
                                                    <div
                                                        key={note.id}
                                                        className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 px-4 py-3 last:rounded-b-2xl transition ${note.is_done ? "bg-[#1B1517]/60" : "hover:bg-[#271F21]"
                                                            }`}
                                                    >
                                                        <div className="min-w-0 flex-1">
                                                            {String(note.items_text || "").includes("\n") ? (
                                                                <div className="space-y-1 text-xs sm:text-sm">
                                                                    <div className="flex items-baseline gap-1.5">
                                                                        <span className={`font-bold ${note.is_done ? "text-[#A89F97] line-through" : "text-[#E8A598]"}`}>
                                                                            {note.customer_name}
                                                                        </span>
                                                                        <span className="text-[#786D6B] font-bold">:</span>
                                                                    </div>
                                                                    <div className={`whitespace-pre-line pl-2.5 border-l-2 border-[#3E3234] leading-relaxed ${note.is_done ? "text-[#786D6B] line-through" : "text-white font-medium"}`}>
                                                                        {note.items_text}
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <div className="flex flex-wrap items-baseline gap-1.5 text-xs sm:text-sm">
                                                                    <span className={`font-bold ${note.is_done ? "text-[#A89F97] line-through" : "text-[#E8A598]"}`}>
                                                                        {note.customer_name}
                                                                    </span>
                                                                    <span className="text-[#786D6B] font-bold">:</span>
                                                                    <span className={`break-words ${note.is_done ? "text-[#786D6B] line-through" : "text-white font-medium"}`}>
                                                                        {note.items_text}
                                                                    </span>
                                                                </div>
                                                            )}
                                                            <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-[#786D6B]">
                                                                {note.amount !== null && note.amount !== undefined && (
                                                                    <span className="rounded bg-emerald-950/50 border border-emerald-500/30 px-1.5 py-0.5 font-semibold text-emerald-300">
                                                                        {formatRupiah(note.amount)}
                                                                    </span>
                                                                )}
                                                                {note.created_by && (
                                                                    <span>Dicatat oleh {note.created_by}</span>
                                                                )}
                                                            </div>
                                                        </div>

                                                        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                                                            <button
                                                                type="button"
                                                                onClick={() => handleToggleOtsField(note, "is_paid")}
                                                                className={`inline-flex h-7 items-center justify-center rounded-lg border px-2.5 text-[11px] font-bold leading-none transition ${note.is_paid
                                                                    ? "border-emerald-500/40 bg-emerald-950/60 text-emerald-300 hover:bg-emerald-900/60"
                                                                    : "border-[#3E3234] bg-[#191415] text-[#A89F97] hover:border-amber-500/40 hover:text-amber-300"
                                                                    }`}
                                                            >
                                                                <span className="text-[11px] font-bold leading-none">
                                                                    {note.is_paid ? "💰 Lunas" : "Belum Bayar"}
                                                                </span>
                                                            </button>

                                                            <label
                                                                className={`inline-flex h-7 items-center justify-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-bold leading-none cursor-pointer select-none transition ${note.is_done
                                                                    ? "border-emerald-500/40 bg-emerald-950/60 text-emerald-300"
                                                                    : "border-[#3E3234] bg-[#191415] text-[#A89F97] hover:border-emerald-500/40 hover:text-emerald-300"
                                                                    }`}
                                                                title="Tandai pesanan sudah selesai / diserahkan"
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    checked={Boolean(note.is_done)}
                                                                    onChange={() => handleToggleOtsField(note, "is_done")}
                                                                    className="h-3.5 w-3.5 accent-emerald-500 rounded cursor-pointer"
                                                                />
                                                                <span className="text-[11px] font-bold leading-none">Selesai</span>
                                                            </label>

                                                            {/* Menu Titik Tiga: Edit, Struk, Hapus */}
                                                            <div className="relative" data-ots-menu-container>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setOpenOtsMenuId((prev) => (prev === note.id ? null : note.id))}
                                                                    aria-label="Menu aksi catatan"
                                                                    title="Menu aksi (Edit, Struk, Hapus)"
                                                                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[#3E3234] bg-[#191415] text-sm font-bold leading-none text-[#D1C7BD] hover:bg-[#2E2527] hover:text-white transition"
                                                                >
                                                                    ⋮
                                                                </button>

                                                                {openOtsMenuId === note.id && (
                                                                    <div className="absolute right-0 top-full z-30 mt-1.5 w-36 overflow-hidden rounded-xl border border-[#3E3234] bg-[#221B1D] py-1 shadow-xl shadow-black/50">
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => {
                                                                                setOpenOtsMenuId(null);
                                                                                openEditOtsModal(note);
                                                                            }}
                                                                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-[#D1C7BD] hover:bg-[#2E2527] hover:text-white transition"
                                                                        >
                                                                            <span>✏️</span> Edit
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => {
                                                                                if (typeof window !== "undefined") {
                                                                                    savedScrollYRef.current = window.scrollY;
                                                                                }
                                                                                setOpenOtsMenuId(null);
                                                                                setPrintOrder(buildOtsReceiptOrder(note));
                                                                            }}
                                                                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-[#E8A598] hover:bg-[#2E2527] transition"
                                                                        >
                                                                            <span>🧾</span> Struk
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => {
                                                                                setOpenOtsMenuId(null);
                                                                                handleDeleteOtsNote(note);
                                                                            }}
                                                                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-red-400 hover:bg-red-950/40 transition"
                                                                        >
                                                                            <span>🗑️</span> Hapus
                                                                        </button>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
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
                            <div className="flex flex-wrap items-center gap-2">
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

                        {/* Search Bar Menu & Stok */}
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
                            <div className="relative flex-1">
                                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-xs text-[#A89F97]">
                                    🔍
                                </span>
                                <input
                                    type="text"
                                    value={productSearch}
                                    onChange={(e) => setProductSearch(e.target.value)}
                                    placeholder="Cari nama menu, kategori, atau deskripsi..."
                                    className="w-full rounded-xl border border-[#3E3234] bg-[#221B1D] pl-9 pr-9 py-2.5 text-xs text-white placeholder-[#786D6B] outline-none focus:border-[#E8A598] transition"
                                />
                                {productSearch && (
                                    <button
                                        type="button"
                                        onClick={() => setProductSearch("")}
                                        aria-label="Hapus pencarian"
                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded-full bg-[#3E3234] text-[10px] font-bold text-[#D1C7BD] hover:bg-[#524245] hover:text-white transition"
                                    >
                                        ✕
                                    </button>
                                )}
                            </div>
                            <div className="shrink-0 text-[11px] font-medium text-[#A89F97] px-1">
                                {productSearch.trim()
                                    ? `Menampilkan ${filteredProducts.length} dari ${products.length} menu`
                                    : `Total ${products.length} menu`}
                            </div>
                        </div>

                        {productsLoading && products.length === 0 ? (
                            <p className="py-12 text-center text-xs text-[#A89F97]">Memuat menu...</p>
                        ) : filteredProducts.length === 0 ? (
                            <div className="rounded-2xl border border-[#342A2C] bg-[#221B1D] p-10 text-center">
                                <span className="text-3xl block mb-2">🍽️</span>
                                <p className="text-sm font-semibold text-white">
                                    {productSearch.trim()
                                        ? `Menu "${productSearch}" tidak ditemukan`
                                        : "Belum ada menu makanan"}
                                </p>
                                <p className="mt-1 text-xs text-[#A89F97]">
                                    {productSearch.trim()
                                        ? "Coba gunakan kata kunci lain atau hapus pencarian."
                                        : "Klik tombol \"+ Tambah Menu Baru\" untuk menambahkan hidangan pertama."}
                                </p>
                                {productSearch.trim() && (
                                    <button
                                        type="button"
                                        onClick={() => setProductSearch("")}
                                        className="mt-3 rounded-xl border border-[#524245] bg-[#2E2527] px-4 py-2 text-xs font-bold text-[#E8A598] hover:bg-[#3E3234] transition"
                                    >
                                        Reset Pencarian
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                {filteredProducts.map((prod) => {
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
                                                <div className="flex flex-wrap items-center gap-2">
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

                            <div className="flex flex-wrap items-center gap-2">
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
                        {promosLoading && promosList.length === 0 ? (
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
                                                        <div className="flex flex-wrap items-center gap-2">
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
                        {/* Audit Date Range (2 Kalender, Maks 1 Bulan) + Search */}
                        <div className="rounded-2xl border border-[#342A2C] bg-[#221B1D] p-3.5 sm:p-4 space-y-3">
                            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3">
                                {/* 2 Kalender Datepicker */}
                                <div className="grid grid-cols-2 gap-2.5 sm:flex sm:items-end">
                                    <div>
                                        <label className="mb-1 block text-[10px] font-semibold text-[#A89F97]">
                                            Dari Tanggal
                                        </label>
                                        <input
                                            type="date"
                                            value={auditStartDate}
                                            max={auditEndDate || todayWibDate}
                                            onChange={(e) => {
                                                const newStart = e.target.value;
                                                if (!newStart) return;
                                                let nextEnd = auditEndDate || todayWibDate || newStart;
                                                if (nextEnd < newStart) {
                                                    nextEnd = newStart;
                                                } else if (diffDaysBetween(newStart, nextEnd) > 31) {
                                                    const maxEnd = shiftDateString(newStart, 31);
                                                    nextEnd = todayWibDate && maxEnd > todayWibDate ? todayWibDate : maxEnd;
                                                    showToast("Rentang audit trail maksimal 1 bulan (31 hari).", "info");
                                                }
                                                setAuditStartDate(newStart);
                                                setAuditEndDate(nextEnd);
                                                auditRangeRef.current = { startDate: newStart, endDate: nextEnd };
                                                fetchAuditTrails(auditSearch, newStart, nextEnd);
                                            }}
                                            className="w-full rounded-xl border border-[#3E3234] bg-[#191415] px-2.5 py-2 text-xs text-white outline-none focus:border-[#E8A598]"
                                        />
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-[10px] font-semibold text-[#A89F97]">
                                            Sampai Tanggal
                                        </label>
                                        <input
                                            type="date"
                                            value={auditEndDate}
                                            min={auditStartDate}
                                            max={todayWibDate}
                                            onChange={(e) => {
                                                const newEnd = e.target.value;
                                                if (!newEnd) return;
                                                let nextStart = auditStartDate || newEnd;
                                                if (newEnd < nextStart) {
                                                    nextStart = newEnd;
                                                } else if (diffDaysBetween(nextStart, newEnd) > 31) {
                                                    nextStart = shiftDateString(newEnd, -31);
                                                    showToast("Rentang audit trail maksimal 1 bulan (31 hari).", "info");
                                                }
                                                setAuditStartDate(nextStart);
                                                setAuditEndDate(newEnd);
                                                auditRangeRef.current = { startDate: nextStart, endDate: newEnd };
                                                fetchAuditTrails(auditSearch, nextStart, newEnd);
                                            }}
                                            className="w-full rounded-xl border border-[#3E3234] bg-[#191415] px-2.5 py-2 text-xs text-white outline-none focus:border-[#E8A598]"
                                        />
                                    </div>
                                </div>

                                {/* Preset Cepat & Search */}
                                <div className="flex flex-wrap items-center gap-1.5">
                                    {[
                                        { label: "Hari Ini", days: 0 },
                                        { label: "7 Hari", days: 6 },
                                        { label: "1 Bulan", days: 30 },
                                    ].map((preset) => {
                                        const endRef = todayWibDate || auditEndDate;
                                        const targetStart = endRef ? shiftDateString(endRef, -preset.days) : "";
                                        const isActive = auditStartDate === targetStart && auditEndDate === endRef;
                                        return (
                                            <button
                                                key={preset.label}
                                                type="button"
                                                onClick={() => {
                                                    const end = todayWibDate || getTodayWibDate();
                                                    const start = shiftDateString(end, -preset.days);
                                                    setAuditStartDate(start);
                                                    setAuditEndDate(end);
                                                    auditRangeRef.current = { startDate: start, endDate: end };
                                                    fetchAuditTrails(auditSearch, start, end);
                                                }}
                                                className={`inline-flex h-8 items-center justify-center rounded-xl px-3 transition ${isActive
                                                    ? "bg-white text-[#191415]"
                                                    : "border border-[#3E3234] bg-[#191415] text-[#A89F97] hover:text-white"
                                                    }`}
                                            >
                                                <span className="text-[11px] font-bold leading-none">{preset.label}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-2 border-t border-[#2E2527]">
                                <div className="relative flex-1">
                                    <input
                                        type="text"
                                        value={auditSearch}
                                        onChange={(e) => {
                                            setAuditSearch(e.target.value);
                                            fetchAuditTrails(e.target.value);
                                        }}
                                        placeholder="🔍 Cari log (ID order, aksi, nama admin, keyword)..."
                                        className="w-full rounded-xl border border-[#3E3234] bg-[#191415] pl-3.5 pr-8 py-2 text-xs text-white placeholder-[#786D6B] placeholder:text-[10px] outline-none focus:border-[#E8A598]"
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

                                <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                                    <span className="text-[11px] text-[#A89F97]">
                                        {auditTrails.length} dari {auditTotal} aktivitas (maks 1 bulan)
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => fetchAuditTrails(auditSearch)}
                                        className="inline-flex h-8 items-center justify-center rounded-xl border border-[#3E3234] bg-[#191415] px-3 text-[#D1C7BD] hover:bg-[#2E2527] transition"
                                    >
                                        <span className="text-[11px] font-semibold leading-none">↻ Refresh Log</span>
                                    </button>
                                </div>
                            </div>
                        </div>

                        {auditLoading && auditTrails.length === 0 ? (
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
                                                    {trail.created_at ? formatDateTime(trail.created_at) : "-"}
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
                            <div className="flex flex-wrap items-center gap-2">
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
                                onClick={closeProductModal}
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
                                        min={100}
                                        step={1}
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
                                        min={1}
                                        step={1}
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
                                    onClick={closeProductModal}
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
                                                className={`rounded-xl border p-3.5 transition ${isCancelled
                                                    ? "border-red-900/40 bg-[#1D1416] opacity-80"
                                                    : "border-[#342A2C] bg-[#1A1416]"
                                                    }`}
                                            >
                                                <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <strong className="font-mono text-xs font-bold text-white">
                                                            #{order.order_code || order.id}
                                                        </strong>
                                                        <span
                                                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${isCancelled
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
                                                            ? formatDateTime(order.created_at, {
                                                                day: "numeric",
                                                                month: "short",
                                                                year: "numeric",
                                                                hour: "2-digit",
                                                                minute: "2-digit",
                                                                second: undefined,
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
                >
                    <div
                        className="relative max-h-[90dvh] sm:max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-[#3E3234] bg-[#221B1D] p-5 sm:p-6 pb-8 sm:pb-6 shadow-2xl text-white"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between border-b border-[#2E2527] pb-3">
                            <div className="flex flex-wrap items-center gap-2">
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
                                                <div className="flex flex-wrap items-center gap-2">
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

            {/* ── Manual Tracking / Resi Modal ────────────────────────────────────────── */}
            {manualTrackingModalOrder && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div
                        className="fixed inset-0 bg-black/85 backdrop-blur-sm"
                    />
                    <div className="relative z-10 max-w-md w-full rounded-2xl border border-[#3E3234] bg-[#221B1D] p-5 shadow-2xl">
                        <div className="flex items-center justify-between border-b border-[#2E2527] pb-3 mb-4">
                            <div className="flex items-center gap-2">
                                <span className="text-lg">📦</span>
                                <div>
                                    <h3 className="text-sm font-bold text-white">Input No. Resi Pengiriman</h3>
                                    <p className="text-[11px] text-[#A89F97]">
                                        Order #{manualTrackingModalOrder.order_code || manualTrackingModalOrder.id} • {manualTrackingModalOrder.customer_name || manualTrackingModalOrder.recipient_name}
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setManualTrackingModalOrder(null)}
                                className="rounded-lg p-1 text-sm text-[#A89F97] hover:bg-[#2E2527] hover:text-white"
                            >
                                ✕
                            </button>
                        </div>

                        <form onSubmit={handleSaveManualTracking} className="space-y-4">
                            <div>
                                <label className="mb-1 block text-xs font-semibold text-[#D1C7BD]">
                                    Nomor Resi / AWB <span className="text-red-400">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={manualTrackingResi}
                                    onChange={(e) => setManualTrackingResi(e.target.value.toUpperCase())}
                                    placeholder="Contoh: PXL-12345678, JNE98765432, KURIR-01"
                                    required
                                    className="w-full rounded-xl border border-[#3E3234] bg-[#191415] px-3.5 py-2.5 text-sm font-mono font-bold text-white uppercase outline-none focus:border-[#E8A598]"
                                />
                                <span className="text-[10px] text-[#A89F97] mt-0.5 block">
                                    Nomor resi ini otomatis muncul di struk thermal lengkap dengan Barcode.
                                </span>
                            </div>

                            <div>
                                <label className="mb-1 block text-xs font-semibold text-[#D1C7BD]">
                                    Nama Ekspedisi / Kurir
                                </label>
                                <select
                                    value={manualTrackingCourier}
                                    onChange={(e) => setManualTrackingCourier(e.target.value)}
                                    className="w-full rounded-xl border border-[#3E3234] bg-[#191415] px-3.5 py-2.5 text-xs font-semibold text-white outline-none focus:border-[#E8A598]"
                                >
                                    <option value="manual">🛵 Kurir Toko / Manual</option>
                                    <option value="paxel">❄️ Paxel</option>
                                    <option value="gosend">🛵 GoSend</option>
                                    <option value="grab">🛵 GrabExpress</option>
                                    <option value="lalamove">🚚 Lalamove</option>
                                    <option value="jne">📦 JNE</option>
                                    <option value="j&t">📦 J&T Express</option>
                                    <option value="sicepat">📦 SiCepat</option>
                                    <option value="anteraja">📦 AnterAja</option>
                                </select>
                            </div>

                            <label className="flex items-center gap-2 cursor-pointer bg-[#1A1416] p-3 rounded-xl border border-[#2E2527]">
                                <input
                                    type="checkbox"
                                    checked={manualTrackingUpdateStatus}
                                    onChange={(e) => setManualTrackingUpdateStatus(e.target.checked)}
                                    className="h-4 w-4 rounded border-[#3E3234] text-[#7A2E3A] focus:ring-[#7A2E3A] accent-[#7A2E3A]"
                                />
                                <span className="text-xs text-[#D1C7BD]">
                                    Ubah status pesanan menjadi <strong className="text-emerald-400">Dalam Pengiriman</strong> (Delivered)
                                </span>
                            </label>

                            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#2E2527]">
                                <button
                                    type="button"
                                    onClick={() => setManualTrackingModalOrder(null)}
                                    className="rounded-xl border border-[#3E3234] px-4 py-2 text-xs font-semibold text-[#D1C7BD] hover:bg-[#2E2527] transition"
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    disabled={manualTrackingSubmitting || !manualTrackingResi.trim()}
                                    className="rounded-xl bg-[#7A2E3A] px-5 py-2 text-xs font-bold text-white hover:bg-[#64252F] transition disabled:opacity-50"
                                >
                                    {manualTrackingSubmitting ? "Menyimpan..." : "Simpan No. Resi"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── Edit Catatan OTS Modal ─────────────────────────────────────────────── */}
            {showOtsEditModal && editingOtsNote && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 p-0 sm:p-4 backdrop-blur-sm">
                    <div className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-[#3E3234] bg-[#221B1D] p-5 sm:p-6 shadow-2xl text-white">
                        <div className="flex items-center justify-between border-b border-[#2E2527] pb-3">
                            <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                <span>📝</span> Edit Catatan OTS
                            </h3>
                            <button
                                type="button"
                                disabled={savingEditOts}
                                onClick={closeOtsEditModal}
                                className="flex h-8 w-8 items-center justify-center rounded-full bg-[#2E2527] text-sm text-[#A89F97] hover:bg-[#3E3234]"
                            >
                                ✕
                            </button>
                        </div>

                        <form onSubmit={handleSaveEditOts} className="mt-4 space-y-3.5">
                            <div>
                                <label className="mb-1 block text-xs font-semibold text-[#D1C7BD]">
                                    Tanggal *
                                    {editOtsDate && (
                                        <span className="ml-1.5 rounded bg-[#2E2527] px-1.5 py-0.5 text-[10px] text-[#E8A598]">
                                            Hari: {formatOtsDateHeader(editOtsDate, "").dayName}
                                        </span>
                                    )}
                                </label>
                                <input
                                    type="date"
                                    required
                                    value={editOtsDate}
                                    onChange={(e) => setEditOtsDate(e.target.value)}
                                    className="w-full rounded-xl border border-[#3E3234] bg-[#191415] px-3 py-2 text-xs text-white outline-none focus:border-[#E8A598]"
                                />
                            </div>

                            <div>
                                <label className="mb-1 block text-xs font-semibold text-[#D1C7BD]">
                                    Nama Pembeli *
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={editOtsCustomerName}
                                    onChange={(e) => setEditOtsCustomerName(e.target.value)}
                                    className="w-full rounded-xl border border-[#3E3234] bg-[#191415] px-3 py-2 text-xs text-white outline-none focus:border-[#E8A598]"
                                />
                            </div>

                            {renderOtsItemRowsEditor(editOtsItemRows, setEditOtsItemRows)}

                            <div className="flex flex-wrap gap-4 pt-1">
                                <label className="inline-flex items-center gap-2 text-xs font-semibold text-[#D1C7BD] cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={editOtsIsPaid}
                                        onChange={(e) => setEditOtsIsPaid(e.target.checked)}
                                        className="h-4 w-4 accent-emerald-500 rounded"
                                    />
                                    💰 Sudah Lunas
                                </label>
                                <label className="inline-flex items-center gap-2 text-xs font-semibold text-[#D1C7BD] cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={editOtsIsDone}
                                        onChange={(e) => setEditOtsIsDone(e.target.checked)}
                                        className="h-4 w-4 accent-emerald-500 rounded"
                                    />
                                    ✅ Pesanan Selesai
                                </label>
                            </div>

                            <div className="mt-5 flex gap-2 pt-2 border-t border-[#2E2527]">
                                <button
                                    type="button"
                                    disabled={savingEditOts}
                                    onClick={closeOtsEditModal}
                                    className="flex-1 rounded-xl border border-[#3E3234] py-2.5 text-xs font-bold text-[#D1C7BD] hover:bg-[#2E2527]"
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    disabled={savingEditOts}
                                    className="flex-1 rounded-xl bg-[#7A2E3A] py-2.5 text-xs font-bold text-white shadow-md shadow-[#7A2E3A]/40 transition hover:bg-[#913745] disabled:opacity-60"
                                >
                                    {savingEditOts ? "Menyimpan..." : "Simpan Perubahan"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── Kelola Master Menu OTS Modal ────────────────────────────────────────── */}
            {showOtsMenuManager && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 p-0 sm:p-4 backdrop-blur-sm">
                    <div className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-[#3E3234] bg-[#221B1D] p-5 sm:p-6 shadow-2xl text-white">
                        <div className="flex items-center justify-between border-b border-[#2E2527] pb-3">
                            <div>
                                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                    <span>🍽️</span> Kelola Menu OTS
                                </h3>
                                <p className="text-[10px] text-[#A89F97] mt-0.5">
                                    Simpan menu OTS & harga agar bisa langsung dipilih saat mencatat pesanan.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    setEditingOtsMenuId(null);
                                    setShowOtsMenuManager(false);
                                }}
                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#2E2527] text-sm text-[#A89F97] hover:bg-[#3E3234]"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Tambah Menu OTS Baru */}
                        <form onSubmit={handleCreateOtsMenu} className="mt-4 space-y-2.5 border-b border-[#2E2527] pb-4">
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    required
                                    value={newOtsMenuName}
                                    onChange={(e) => setNewOtsMenuName(e.target.value)}
                                    placeholder="Nama menu (cth: Nasi Putih)"
                                    className="min-w-0 flex-1 rounded-xl border border-[#3E3234] bg-[#191415] px-3 py-2 text-xs text-white placeholder-[#786D6B] placeholder:text-[10px] outline-none focus:border-[#E8A598]"
                                />
                                <div className="relative w-28 shrink-0">
                                    <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-[#786D6B]">
                                        Rp
                                    </span>
                                    <input
                                        type="number"
                                        min="0"
                                        value={newOtsMenuPrice}
                                        onChange={(e) => setNewOtsMenuPrice(e.target.value)}
                                        placeholder="5000"
                                        className="w-full rounded-xl border border-[#3E3234] bg-[#191415] pl-8 pr-2.5 py-2 text-xs text-white placeholder-[#786D6B] placeholder:text-[10px] outline-none focus:border-[#E8A598]"
                                    />
                                </div>
                            </div>
                            <button
                                type="submit"
                                disabled={savingOtsMenu}
                                className="w-full rounded-xl bg-[#7A2E3A] py-2 text-xs font-bold text-white shadow-sm shadow-[#7A2E3A]/40 transition hover:bg-[#913745] disabled:opacity-60"
                            >
                                <span className="text-xs font-bold leading-none">
                                    {savingOtsMenu ? "Menyimpan..." : "+ Tambah ke Daftar Menu OTS"}
                                </span>
                            </button>
                        </form>

                        {/* Daftar Menu OTS Tersimpan */}
                        <div className="mt-4 space-y-2 max-h-64 overflow-y-auto pr-0.5">
                            {otsMenusLoading && otsMenus.length === 0 ? (
                                <p className="py-6 text-center text-xs text-[#A89F97]">Memuat menu OTS...</p>
                            ) : otsMenus.length === 0 ? (
                                <p className="py-6 text-center text-xs text-[#786D6B]">
                                    Belum ada menu OTS tersimpan. Tambahkan di atas!
                                </p>
                            ) : (
                                otsMenus.map((menu) => (
                                    <div
                                        key={menu.id}
                                        className="rounded-xl border border-[#2E2527] bg-[#191415] px-3 py-2.5"
                                    >
                                        {editingOtsMenuId === menu.id ? (
                                            <div className="space-y-2">
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="text"
                                                        value={editOtsMenuName}
                                                        onChange={(e) => setEditOtsMenuName(e.target.value)}
                                                        className="min-w-0 flex-1 rounded-lg border border-[#3E3234] bg-[#221B1D] px-2.5 py-1.5 text-xs text-white outline-none focus:border-[#E8A598]"
                                                    />
                                                    <div className="relative w-24 shrink-0">
                                                        <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-[#786D6B]">
                                                            Rp
                                                        </span>
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            value={editOtsMenuPrice}
                                                            onChange={(e) => setEditOtsMenuPrice(e.target.value)}
                                                            className="w-full rounded-lg border border-[#3E3234] bg-[#221B1D] pl-7 pr-2 py-1.5 text-xs text-white outline-none focus:border-[#E8A598]"
                                                        />
                                                    </div>
                                                </div>
                                                <div className="flex justify-end gap-1.5">
                                                    <button
                                                        type="button"
                                                        disabled={savingEditOtsMenu}
                                                        onClick={() => setEditingOtsMenuId(null)}
                                                        className="rounded-lg border border-[#3E3234] px-2.5 py-1 text-[10px] font-semibold text-[#D1C7BD] hover:bg-[#2E2527]"
                                                    >
                                                        <span className="text-[10px] font-semibold">Batal</span>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        disabled={savingEditOtsMenu}
                                                        onClick={() => handleSaveEditOtsMenu(menu.id)}
                                                        className="rounded-lg bg-emerald-700 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-emerald-600 disabled:opacity-60"
                                                    >
                                                        <span className="text-[10px] font-bold">
                                                            {savingEditOtsMenu ? "..." : "Simpan"}
                                                        </span>
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="min-w-0">
                                                    <p className="text-xs font-bold text-white truncate">{menu.name}</p>
                                                    <p className="text-[11px] font-semibold text-emerald-400">
                                                        {menu.price > 0 ? formatRupiah(menu.price) : "Tanpa harga default"}
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-1.5 shrink-0">
                                                    <button
                                                        type="button"
                                                        onClick={() => openInlineEditOtsMenu(menu)}
                                                        className="inline-flex h-7 items-center justify-center rounded-lg border border-[#3E3234] bg-[#221B1D] px-2 text-[#D1C7BD] hover:bg-[#2E2527]"
                                                        title="Edit menu"
                                                    >
                                                        <span className="text-[10px] font-semibold leading-none">✏️ Edit</span>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeleteOtsMenu(menu)}
                                                        className="inline-flex h-7 items-center justify-center rounded-lg border border-red-500/30 bg-[#221B1D] px-2 text-red-400 hover:bg-red-950/40"
                                                        title="Hapus menu"
                                                    >
                                                        <span className="text-[10px] font-semibold leading-none">Hapus</span>
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>

                        <div className="mt-4 pt-3 border-t border-[#2E2527]">
                            <button
                                type="button"
                                onClick={() => {
                                    setEditingOtsMenuId(null);
                                    setShowOtsMenuManager(false);
                                }}
                                className="w-full rounded-xl border border-[#3E3234] py-2 text-xs font-bold text-[#D1C7BD] hover:bg-[#2E2527]"
                            >
                                <span className="text-xs font-bold leading-none">Tutup</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Thermal Receipt & Shipping Label Modal ──────────────────────────────── */}
            {printOrder && (
                <ThermalReceiptModal
                    order={printOrder}
                    onClose={() => {
                        setPrintOrder(null);
                        restoreScrollPosition(savedScrollYRef.current);
                    }}
                />
            )}

            {/* ── Floating Back-to-Top (Up Arrow) Button ──────────────────────────── */}
            {showScrollTop && (
                <button
                    type="button"
                    onClick={scrollToTop}
                    aria-label="Kembali ke atas"
                    title="Kembali ke atas"
                    className="fixed bottom-5 right-5 sm:bottom-7 sm:right-7 z-40 flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-full border border-[#E8A598]/40 bg-[#7A2E3A]/95 text-white shadow-xl shadow-black/50 backdrop-blur-md transition-all duration-200 hover:bg-[#913745] hover:scale-105 active:scale-95"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2.5}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-5 w-5"
                    >
                        <path d="m18 15-6-6-6 6" />
                    </svg>
                </button>
            )}
        </main>
    );
}
