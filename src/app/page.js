"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { apiRequest, isTokenExpired, getImageUrl } from "@/lib/api";

// Metadata tampilan sementara karena field ini belum tersedia di API.
const productUiMetadata = {
  "Nasi Ayam Bakar": { category: "Paket Nasi", emoji: "🍗", popular: true },
  "Nasi Ayam Geprek": { category: "Paket Nasi", emoji: "🍚", popular: false },
  "Nasi Rendang": { category: "Paket Nasi", emoji: "🥘", popular: true },
  "Nasi Telur": { category: "Paket Nasi", emoji: "🍳", popular: false },
  "Es Teh Manis": { category: "Minuman", emoji: "🧋", popular: false },
  "Air Mineral": { category: "Minuman", emoji: "💧", popular: false },
};

const formatRupiah = (amount) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);

// Feature flag: set ke true jika sewaktu-waktu ingin memunculkan kembali info stok di kartu menu
const SHOW_PRODUCT_STOCK = false;

export default function Home() {
  const router = useRouter();
  const pathname = usePathname();

  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState("");

  const [activeTab, setActiveTab] = useState("available"); // 'available' (Siap Dipesan) | 'catalog' (Katalog Menu)
  const [catalogStatusFilter, setCatalogStatusFilter] = useState("Semua"); // "Semua" | "Tersedia" | "Tidak Tersedia"
  const [activeCategory, setActiveCategory] = useState("Semua");
  const [quantities, setQuantities] = useState({});
  const [cartOpen, setCartOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [customer, setCustomer] = useState(null);
  const [storeInfoOpen, setStoreInfoOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [activePromos, setActivePromos] = useState([]);
  const [pendingOrders, setPendingOrders] = useState([]);
  const [expiredOrders, setExpiredOrders] = useState([]);

  // Fetch pending unpaid & expired orders untuk reminder banner di hero section
  const loadPendingOrders = useCallback(async () => {
    try {
      const token = localStorage.getItem("ava_eats_access_token");
      if (!token || isTokenExpired(token)) {
        setPendingOrders([]);
        setExpiredOrders([]);
        return;
      }
      const data = await apiRequest("/customers/me/orders");
      if (Array.isArray(data)) {
        const unpaid = data.filter((o) => {
          const isCancelled = o.status === "cancelled" || o.payment_status === "cancelled";
          const isPaid = o.payment_status === "approved" || o.payment_status === "paid" || o.status === "paid";
          const isExpired = o.payment_status === "expired" || (o.cancellation_reason && /expire|kedaluwarsa/i.test(o.cancellation_reason));
          const isPending = o.payment_status === "pending" || (!o.payment_status && o.status === "pending");
          return isPending && !isCancelled && !isPaid && !isExpired;
        });
        setPendingOrders(unpaid);

        // Filter expired orders (abaikan yang sudah ditutup/diabaikan oleh customer)
        let dismissed = [];
        try {
          dismissed = JSON.parse(localStorage.getItem("ava_eats_dismissed_expired") || "[]");
        } catch {
          dismissed = [];
        }

        const expired = data.filter((o) => {
          const isPaid = o.payment_status === "approved" || o.payment_status === "paid" || o.status === "paid";
          if (isPaid) return false;
          const isExpired = o.payment_status === "expired" || (o.cancellation_reason && /expire|kedaluwarsa/i.test(o.cancellation_reason));
          const isDismissed = dismissed.includes(o.id) || dismissed.includes(o.order_code);
          return isExpired && !isDismissed;
        });
        setExpiredOrders(expired);
      } else {
        setPendingOrders([]);
        setExpiredOrders([]);
      }
    } catch {
      setPendingOrders([]);
      setExpiredOrders([]);
    }
  }, []);

  const handleDismissExpiredOrder = useCallback((orderId, e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    try {
      const stored = JSON.parse(localStorage.getItem("ava_eats_dismissed_expired") || "[]");
      if (!stored.includes(orderId)) {
        stored.push(orderId);
        localStorage.setItem("ava_eats_dismissed_expired", JSON.stringify(stored));
      }
      setExpiredOrders((prev) => prev.filter((o) => o.id !== orderId && o.order_code !== orderId));
      setToast("Pengingat pesanan kedaluwarsa telah disembunyikan.");
      setTimeout(() => setToast(""), 3500);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("ava_eats_dismiss_updated"));
      }
    } catch {
      setExpiredOrders((prev) => prev.filter((o) => o.id !== orderId && o.order_code !== orderId));
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (customer) {
        loadPendingOrders();
      } else {
        setPendingOrders([]);
        setExpiredOrders([]);
      }
    }, 0);

    window.addEventListener("focus", loadPendingOrders);
    window.addEventListener("pageshow", loadPendingOrders);
    window.addEventListener("ava_eats_cart_updated", loadPendingOrders);
    window.addEventListener("ava_eats_dismiss_updated", loadPendingOrders);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", loadPendingOrders);
      window.removeEventListener("pageshow", loadPendingOrders);
      window.removeEventListener("ava_eats_cart_updated", loadPendingOrders);
      window.removeEventListener("ava_eats_dismiss_updated", loadPendingOrders);
    };
  }, [customer, loadPendingOrders]);

  // Fetch promo aktif untuk hero banner & menu drawer
  useEffect(() => {
    let isMounted = true;
    apiRequest("/promos/active")
      .then((data) => {
        if (isMounted) {
          setActivePromos(Array.isArray(data) ? data : data?.promos || []);
        }
      })
      .catch(() => {
        if (isMounted) {
          setActivePromos([]);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [customer]);

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const token = localStorage.getItem("ava_eats_access_token");
        if (!token || isTokenExpired(token)) {
          localStorage.removeItem("ava_eats_access_token");
          localStorage.removeItem("ava_eats_customer");
          setCustomer(null);
          return;
        }

        const savedCustomer = localStorage.getItem("ava_eats_customer");
        if (savedCustomer) {
          setCustomer(JSON.parse(savedCustomer));
        } else {
          apiRequest("/customers/me")
            .then((data) => {
              setCustomer(data);
              localStorage.setItem("ava_eats_customer", JSON.stringify(data));
            })
            .catch(() => {
              setCustomer(null);
            });
        }
      } catch {
        setCustomer(null);
      }
    }, 0);

    return () => clearTimeout(timer);
  }, []);

  function handleLogout() {
    const name = customer?.name || "Moms";
    localStorage.removeItem("ava_eats_access_token");
    localStorage.removeItem("ava_eats_customer");
    localStorage.removeItem("ava_eats_checkout_cart");
    localStorage.removeItem("ava_eats_checkout_draft");
    setQuantities({});
    setCustomer(null);
    setPendingOrders([]);
    setExpiredOrders([]);
    setMenuOpen(false);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("ava_eats_cart_updated"));
    }
    setToast(`Berhasil keluar dari akun. Sampai jumpa lagi, ${name}! 👋`);
    setTimeout(() => setToast(""), 4000);
  }

  // Sinkronisasi keranjang dari localStorage saat mount, ganti rute (kembali dari checkout/orders), atau event custom
  const syncCartFromStorage = useCallback(() => {
    try {
      const savedCart = localStorage.getItem("ava_eats_checkout_cart");
      if (savedCart) {
        const parsed = JSON.parse(savedCart);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const initialQuantities = {};
          parsed.forEach((item) => {
            if (item.product_id && item.quantity > 0) {
              initialQuantities[item.product_id] = item.quantity;
            }
          });
          setQuantities(initialQuantities);
          return;
        }
      }
      // Jika keranjang di storage kosong / habis checkout, bersihkan quantities!
      setQuantities({});
    } catch {
      setQuantities({});
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(syncCartFromStorage, 0);

    // Ketika user kembali dari checkout, tab aktif kembali, atau keranjang di-clear dari halaman lain
    window.addEventListener("focus", syncCartFromStorage);
    window.addEventListener("pageshow", syncCartFromStorage);
    window.addEventListener("storage", syncCartFromStorage);
    window.addEventListener("ava_eats_cart_updated", syncCartFromStorage);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", syncCartFromStorage);
      window.removeEventListener("pageshow", syncCartFromStorage);
      window.removeEventListener("storage", syncCartFromStorage);
      window.removeEventListener("ava_eats_cart_updated", syncCartFromStorage);
    };
  }, [pathname, syncCartFromStorage]);

  useEffect(() => {
    let cancelled = false;

    async function loadProducts() {
      try {
        setProductsLoading(true);
        setProductsError("");

        const result = await apiRequest("/products");

        if (cancelled) return;

        const normalizedProducts = (result.products || []).map((product) => {
          const metadata = productUiMetadata[product.name] || {};

          return {
            ...product,
            price: Number(product.price),
            available: Boolean(product.is_available) && product.stock > 0,
            category: product.category || metadata.category || "Lainnya",
            emoji: metadata.emoji || "🍽️",
            popular: metadata.popular || false,
          };
        });

        setProducts(normalizedProducts);
      } catch (error) {
        if (!cancelled) {
          setProductsError(error.message || "Gagal mengambil data menu.");
        }
      } finally {
        if (!cancelled) setProductsLoading(false);
      }
    }

    loadProducts();

    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch kategori menu dari backend
  const [dbCategories, setDbCategories] = useState([]);
  useEffect(() => {
    let isMounted = true;
    apiRequest("/categories")
      .then((data) => {
        if (isMounted && Array.isArray(data)) {
          setDbCategories(data);
        }
      })
      .catch(() => { });
    return () => {
      isMounted = false;
    };
  }, []);

  const categories = useMemo(() => {
    const list = [{ name: "Semua", icon: "✨" }];
    if (dbCategories.length > 0) {
      dbCategories.forEach((c) => {
        list.push({ name: c.name, icon: c.icon || "🍽️" });
      });
    } else {
      const existing = [...new Set(products.map((p) => p.category).filter(Boolean))];
      existing.forEach((cat) => list.push({ name: cat, icon: "🍽️" }));
    }
    return list;
  }, [dbCategories, products]);

  const visibleProducts = useMemo(() => {
    let result = products.filter((product) => {
      // 1. Pada tab "available" (Siap Dipesan): hanya tampilkan menu yang stoknya tersedia
      if (activeTab === "available") {
        if (!product.available) {
          return false;
        }

        const matchesCategory =
          activeCategory === "Semua" ||
          product.category === activeCategory;

        const matchesSearch =
          product.name.toLowerCase().includes(search.toLowerCase()) ||
          (product.description &&
            product.description.toLowerCase().includes(search.toLowerCase()));

        return matchesCategory && matchesSearch;
      }

      // 2. Pada tab "catalog" (Katalog Menu):
      // Filter status: "Semua" | "Tersedia" | "Tidak Tersedia"
      if (catalogStatusFilter === "Tersedia" && !product.available) {
        return false;
      }
      if (catalogStatusFilter === "Tidak Tersedia" && product.available) {
        return false;
      }

      const matchesSearch =
        product.name.toLowerCase().includes(search.toLowerCase()) ||
        (product.description &&
          product.description.toLowerCase().includes(search.toLowerCase()));

      return matchesSearch;
    });

    // Pada Katalog Menu filter "Semua": urutkan yang Tersedia di atas, Tidak Tersedia di urutan bawah
    if (activeTab === "catalog" && catalogStatusFilter === "Semua") {
      result = [...result].sort((a, b) => {
        if (a.available === b.available) return 0;
        return a.available ? -1 : 1;
      });
    }

    return result;
  }, [products, activeTab, activeCategory, catalogStatusFilter, search]);

  const cartItems = products.filter(
    (product) => (quantities[product.id] || 0) > 0
  );

  const totalItems = cartItems.reduce(
    (total, product) => total + quantities[product.id],
    0
  );

  const totalPrice = cartItems.reduce(
    (total, product) => total + product.price * quantities[product.id],
    0
  );


  function changeQuantity(productId, amount) {
    const product = products.find(
      (item) => item.id === productId
    );

    if (!product) return;

    setQuantities((current) => {
      const currentQuantity = current[productId] || 0;

      const nextQuantity = Math.max(
        0,
        Math.min(product.stock, currentQuantity + amount)
      );

      const nextQuantities = {
        ...current,
        [productId]: nextQuantity,
      };

      try {
        const activeItems = products
          .map((p) => ({
            product_id: p.id,
            name: p.name,
            price: p.price,
            quantity: p.id === productId ? nextQuantity : (nextQuantities[p.id] || 0),
          }))
          .filter((item) => item.quantity > 0);

        if (activeItems.length > 0) {
          localStorage.setItem(
            "ava_eats_checkout_cart",
            JSON.stringify(activeItems)
          );
        } else {
          localStorage.removeItem("ava_eats_checkout_cart");
        }
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("ava_eats_cart_updated"));
        }
      } catch (err) {
        console.warn("Gagal menyimpan keranjang:", err);
      }

      return nextQuantities;
    });
  }


  return (
    <main className="app-shell">
      {/* Toast Notifikasi Logout / Feedback */}
      {toast && (
        <div
          role="status"
          className="fixed top-5 left-1/2 z-50 flex w-[90%] max-w-sm -translate-x-1/2 items-center justify-between gap-3 rounded-2xl border border-[#D8E2D5] bg-[#EDF3E9] p-4 text-sm font-medium text-[#456044] shadow-xl backdrop-blur transition"
        >
          <span>{toast}</span>
          <button
            type="button"
            onClick={() => setToast("")}
            className="text-lg font-bold text-[#456044] hover:opacity-70"
            aria-label="Tutup notifikasi"
          >
            ×
          </button>
        </div>
      )}

      <header className="brand-header">
        <div className="brand-top">
          <div className="brand-logo">
            <img src="/logo.png" alt="Ava Eats Logo" />
          </div>

          <div className="brand-info">
            <p className="brand-eyebrow">HOMEMADE WITH LOVE</p>
            <h1>Ava Eats</h1>
            <p className="brand-tagline">
              Nourishing meals for your little one
            </p>
          </div>

          <button
            type="button"
            className="icon-button"
            aria-label="Buka menu navigasi"
            onClick={() => setMenuOpen(true)}
          >
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        </div>

        <div className="announcement">
          <span>✦</span>
          <p>
            Selamat datang di Ava Eats Moms
            {customer?.name ? ` ${customer.name}` : ""}! Semoga harimu
            menyenangkan.
          </p>
        </div>

        {/* ── UNPAID ORDER REMINDER BANNER (Hero Alert) ────────────────────── */}
        {pendingOrders.length > 0 && (() => {
          const latestPending = pendingOrders[0];
          const totalUnpaid = latestPending.grand_total || latestPending.total_amount;
          return (
            <Link
              href="/orders"
              className="mt-3 block overflow-hidden rounded-2xl border border-amber-300 bg-gradient-to-r from-amber-50 via-[#FFF9F0] to-orange-50 p-3.5 shadow-xs transition hover:border-amber-400 hover:shadow-md"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-lg text-white shadow-2xs">
                    ⏳
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-amber-900 border border-amber-200">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                        Menunggu Pembayaran
                      </span>
                      {pendingOrders.length > 1 && (
                        <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700 border border-red-200">
                          {pendingOrders.length} Pesanan
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs font-bold text-[#2A2620] truncate">
                      Pesanan #{latestPending.order_code || latestPending.id} • {formatRupiah(totalUnpaid)}
                    </p>
                    <p className="text-[11px] text-[#78686A] mt-0.5 line-clamp-1">
                      Silakan selesaikan pembayaran agar makanan Moms dapat segera disiapkan dapur.
                    </p>
                  </div>
                </div>

                <div className="shrink-0">
                  <span className="inline-flex items-center gap-1 rounded-xl bg-[#7A2E3A] px-3 py-1.5 text-xs font-bold text-white shadow-xs transition hover:bg-[#60232E]">
                    Lanjut Bayar →
                  </span>
                </div>
              </div>
            </Link>
          );
        })()}

        {/* ── EXPIRED ORDER BANNER (Hero Alert dengan Tombol Abaikan/Cancel) ── */}
        {pendingOrders.length === 0 && expiredOrders.length > 0 && (() => {
          const latestExpired = expiredOrders[0];
          const totalAmount = latestExpired.grand_total || latestExpired.total_amount;
          return (
            <div
              className="mt-3 relative block overflow-hidden rounded-2xl border border-rose-300 bg-gradient-to-r from-rose-50 via-[#FFF9F9] to-orange-50 p-3.5 shadow-xs transition hover:border-rose-400 hover:shadow-md"
            >
              {/* Tombol Silang / Tutup Pengingat di Pojok Kanan Atas */}
              <button
                type="button"
                onClick={(e) => handleDismissExpiredOrder(latestExpired.id, e)}
                className="absolute top-2.5 right-2.5 flex h-6 w-6 items-center justify-center rounded-full bg-white/80 text-xs font-bold text-[#8A7778] hover:bg-rose-100 hover:text-rose-900 transition shadow-2xs"
                title="Abaikan pengingat ini"
                aria-label="Abaikan pengingat pesanan kedaluwarsa"
              >
                ✕
              </button>

              <div className="flex items-center justify-between gap-3 pr-6 sm:pr-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-500 text-lg text-white shadow-2xs">
                    ⌛
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-rose-900 border border-rose-200">
                        Waktu Pembayaran Habis
                      </span>
                      {expiredOrders.length > 1 && (
                        <span className="rounded-full bg-rose-200/80 px-1.5 py-0.5 text-[10px] font-bold text-rose-800 border border-rose-300">
                          {expiredOrders.length} Pesanan
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs font-bold text-[#2A2620] truncate">
                      Pesanan #{latestExpired.order_code || latestExpired.id} • {formatRupiah(totalAmount)}
                    </p>
                    <p className="text-[11px] text-[#78686A] mt-0.5 line-clamp-1">
                      Batas waktu bayar telah habis. Mau pesan ulang atau abaikan pengingat ini?
                    </p>
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={(e) => handleDismissExpiredOrder(latestExpired.id, e)}
                    className="hidden sm:inline-flex rounded-xl border border-rose-300/80 bg-white/80 px-2.5 py-1.5 text-xs font-semibold text-[#7A3545] hover:bg-rose-50 transition"
                  >
                    Abaikan
                  </button>
                  <Link
                    href="/orders"
                    className="inline-flex items-center gap-1 rounded-xl bg-[#7A2E3A] px-3 py-1.5 text-xs font-bold text-white shadow-xs transition hover:bg-[#60232E]"
                  >
                    Pesan Ulang →
                  </Link>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Voucher & Promo Quick Banner - Hanya tampil jika ada promo yang sedang aktif */}
        {activePromos.length > 0 && (
          <Link
            href="/promos"
            className="mt-3 flex items-center justify-between rounded-2xl border border-[#E8D6CE] bg-[#FAF4F2] p-3 text-xs text-[#7A2E3A] transition hover:bg-[#F5ECE8] shadow-xs"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-base shrink-0">🎟️</span>
              <div className="truncate">
                <strong className="block text-xs font-bold text-[#7A2E3A]">
                  Klaim Kupon & Voucher Promo
                </strong>
                <span className="text-[11px] text-[#806B6D]">
                  {(() => {
                    const maxPct = Math.max(
                      0,
                      ...activePromos
                        .filter((p) => p.discount_type === "percentage")
                        .map((p) => p.discount_value)
                    );
                    if (maxPct > 0) {
                      return `Diskon s.d. ${maxPct}% & subsidi ongkir untuk Moms!`;
                    }
                    return `Tersedia ${activePromos.length} penawaran kupon promo spesial untuk Moms!`;
                  })()}
                </span>
              </div>
            </div>
            <span className="shrink-0 text-xs font-extrabold text-[#7A2E3A] underline ml-2">
              Lihat →
            </span>
          </Link>
        )}
      </header>

      <section className="menu-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">OUR KITCHEN</p>
            <h2>Mau makan apa?</h2>
            <p className="section-subtitle">
              {activeTab === "available"
                ? "Pilih hidangan lezat yang siap dipesan hari ini."
                : "Katalog seluruh hidangan Ava Eats (Info ketersediaan & detail resep)."}
            </p>
          </div>
          <span className="menu-count">
            {visibleProducts.length} menu {activeTab === "available" ? "tersedia" : "katalog"}
          </span>
        </div>

        {/* ── Mode Tab Menu: AVAILABLE (Siap Dipesan) vs KATALOG MENU (Semua) ── */}
        <div className="menu-tabs mb-3" role="tablist" aria-label="Mode Menu">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "available"}
            className={activeTab === "available" ? "active font-bold" : ""}
            onClick={() => setActiveTab("available")}
          >
            🛍️ Siap Dipesan
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "catalog"}
            className={activeTab === "catalog" ? "active font-bold" : ""}
            onClick={() => setActiveTab("catalog")}
          >
            📖 Katalog Menu
          </button>
        </div>

        <div className="search-box">
          <span aria-hidden="true">⌕</span>
          <input
            type="search"
            placeholder={
              activeTab === "available"
                ? "Cari menu yang siap dipesan..."
                : "Cari di katalog hidangan..."
            }
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Cari menu"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              aria-label="Hapus pencarian"
            >
              ×
            </button>
          )}
        </div>

        {/* Filter Bar */}
        {activeTab === "available" ? (
          /* Kategori Menu untuk Siap Dipesan */
          <div className="category-list" role="tablist">
            {categories.map((cat) => {
              const catName = typeof cat === "string" ? cat : cat.name;
              const catIcon = typeof cat === "object" ? cat.icon : null;
              const isActive = activeCategory === catName;
              return (
                <button
                  key={catName}
                  className={isActive ? "category-chip active" : "category-chip"}
                  onClick={() => setActiveCategory(catName)}
                  role="tab"
                  aria-selected={isActive}
                >
                  {catIcon && <span className="mr-1">{catIcon}</span>}
                  {catName}
                </button>
              );
            })}
          </div>
        ) : (
          /* Filter Status untuk Katalog Menu: Semua, Tersedia, Tidak Tersedia */
          <div className="category-list" role="tablist">
            {[
              { id: "Semua", label: "Semua", icon: "✨" },
              // { id: "Tersedia", label: "Tersedia", icon: "🟢" },
              // { id: "Tidak Tersedia", label: "Tidak Tersedia", icon: "⚪" },
            ].map((f) => {
              const isActive = catalogStatusFilter === f.id;
              return (
                <button
                  key={f.id}
                  className={isActive ? "category-chip active" : "category-chip"}
                  onClick={() => setCatalogStatusFilter(f.id)}
                  role="tab"
                  aria-selected={isActive}
                >
                  <span className="mr-1">{f.icon}</span>
                  {f.label}
                </button>
              );
            })}
          </div>
        )}


        {productsLoading && (
          <p className="py-8 text-center text-sm text-[#6B6459]">
            Memuat menu dari server...
          </p>
        )}

        {!productsLoading && productsError && (
          <div className="py-8 text-center">
            <p className="text-sm text-red-600">{productsError}</p>
            <button
              type="button"
              className="text-button mt-3"
              onClick={() => window.location.reload()}
            >
              Coba lagi
            </button>
          </div>
        )}


        {!productsLoading && !productsError && (
          activeTab === "catalog" ? (
            /* ── Tampilan 3 Kolom Jejer untuk Katalog Menu ── */
            <div className="grid grid-cols-3 gap-2 sm:gap-2.5 w-full">
              {visibleProducts.map((product) => (
                <article
                  className="flex flex-col overflow-hidden rounded-xl border border-[#EDDFD4] bg-[#FAF5EE] shadow-xs transition-all hover:shadow-sm"
                  key={product.id}
                >
                  <div className="relative aspect-square w-full overflow-hidden bg-[#F3EBE1] flex items-center justify-center">
                    {product.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={getImageUrl(product.image)}
                        alt={product.name}
                        className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
                      />
                    ) : (
                      <span className="food-emoji text-3xl">{product.emoji || "🍽️"}</span>
                    )}

                    {product.popular && (
                      <span className="popular-badge text-[7px] px-1 py-0.5">★ Favorit</span>
                    )}

                    {/* Status Badge */}
                    {product.available ? (
                      <span className="absolute top-1 left-1 z-10 rounded-md bg-[#2D7A4D]/95 text-white px-1.5 py-0.5 text-[8px] font-bold shadow-xs">
                        ✓ Tersedia
                      </span>
                    ) : (
                      <span className="absolute top-1 left-1 z-10 rounded-md bg-[#766E67]/95 text-white px-1.5 py-0.5 text-[8px] font-bold shadow-xs">
                        Tidak Tersedia
                      </span>
                    )}
                  </div>

                  <div className="flex flex-1 flex-col p-2">
                    <p className="text-[8px] font-extrabold uppercase tracking-wide text-[#6E8F63] truncate">
                      {product.category}
                    </p>

                    <h3 className="text-[11px] font-bold leading-tight text-[#2A2620] line-clamp-2 mt-0.5 min-h-[26px]">
                      {product.name}
                    </h3>

                    {SHOW_PRODUCT_STOCK && (
                      <span
                        className={`shrink-0 text-[8px] mt-0.5 ${product.available ? "text-[#6B6459]" : "text-red-600"
                          }`}
                      >
                        {product.stock > 0 ? `Stok: ${product.stock}` : "Habis"}
                      </span>
                    )}

                    {product.description && (
                      <p className="text-[8.5px] leading-tight text-[#83776D] line-clamp-2 mt-1 mb-1.5">
                        {product.description}
                      </p>
                    )}

                    <div className="mt-auto pt-1">
                      <span className="block text-[7.5px] text-[#9C9185]">Mulai dari</span>
                      <span className="block text-[11px] font-extrabold text-[#7A2E3A] leading-tight">
                        {formatRupiah(product.price)}
                      </span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            /* ── Tampilan 3 Kolom Jejer untuk Menu Siap Dipesan (Dengan Tombol Pesan / Kuantitas) ── */
            <div className="grid grid-cols-3 gap-2 sm:gap-2.5 w-full">
              {visibleProducts.map((product) => {
                const quantity = quantities[product.id] || 0;

                return (
                  <article
                    className="flex flex-col overflow-hidden rounded-xl border border-[#EDDFD4] bg-[#FAF5EE] shadow-xs transition-all hover:shadow-sm"
                    key={product.id}
                  >
                    <div className="relative aspect-square w-full overflow-hidden bg-[#F3EBE1] flex items-center justify-center">
                      {product.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={getImageUrl(product.image)}
                          alt={product.name}
                          className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
                        />
                      ) : (
                        <span className="food-emoji text-3xl">{product.emoji || "🍽️"}</span>
                      )}

                      {product.popular && (
                        <span className="popular-badge text-[7px] px-1 py-0.5">★ Favorit</span>
                      )}

                      {!product.available && (
                        <span className="absolute top-1 left-1 z-10 rounded-md bg-[#766E67]/95 text-white px-1.5 py-0.5 text-[8px] font-bold shadow-xs">
                          Habis
                        </span>
                      )}
                    </div>

                    <div className="flex flex-1 flex-col p-2">
                      <p className="text-[8px] font-extrabold uppercase tracking-wide text-[#6E8F63] truncate">
                        {product.category}
                      </p>

                      <h3 className="text-[11px] font-bold leading-tight text-[#2A2620] line-clamp-2 mt-0.5 min-h-[26px]">
                        {product.name}
                      </h3>

                      {SHOW_PRODUCT_STOCK && (
                        <span
                          className={`shrink-0 text-[8px] mt-0.5 ${product.available ? "text-[#6B6459]" : "text-red-600"
                            }`}
                        >
                          {product.stock > 0 ? `Stok: ${product.stock}` : "Habis"}
                        </span>
                      )}

                      {product.description && (
                        <p className="text-[8.5px] leading-tight text-[#83776D] line-clamp-2 mt-1 mb-1.5">
                          {product.description}
                        </p>
                      )}

                      <div className="product-bottom mt-auto pt-1 flex items-end justify-between gap-1">
                        <div>
                          <span className="block text-[7.5px] text-[#9C9185]">Mulai dari</span>
                          <span className="block text-[11px] font-extrabold text-[#7A2E3A] leading-tight">
                            {formatRupiah(product.price)}
                          </span>
                        </div>

                        {product.available ? (
                          quantity === 0 ? (
                            <button
                              type="button"
                              disabled={quantity >= product.stock}
                              onClick={() => changeQuantity(product.id, 1)}
                              aria-label={`Tambah ${product.name}`}
                              className="add-button disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              +
                            </button>
                          ) : (
                            <div className="quantity-control">
                              <button
                                type="button"
                                onClick={() => changeQuantity(product.id, -1)}
                                aria-label={`Kurangi ${product.name}`}
                              >
                                −
                              </button>
                              <span>{quantity}</span>
                              <button
                                type="button"
                                disabled={quantity >= product.stock}
                                onClick={() => changeQuantity(product.id, 1)}
                                aria-label={`Tambah ${product.name}`}
                                className="disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                +
                              </button>
                            </div>
                          )
                        ) : (
                          <span className="sold-out">Tidak Tersedia</span>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )
        )}


        {!productsLoading &&
          !productsError &&
          visibleProducts.length === 0 && (
            <div className="empty-state">
              <span>🍽️</span>
              <h3>Menu belum ditemukan</h3>
              <p>
                {activeTab === "catalog"
                  ? catalogStatusFilter === "Tersedia"
                    ? "Belum ada hidangan dengan status tersedia saat ini."
                    : catalogStatusFilter === "Tidak Tersedia"
                      ? "Tidak ada hidangan yang berstatus tidak tersedia."
                      : "Coba kata kunci pencarian lainnya, ya Moms."
                  : "Coba kata kunci atau kategori lainnya, ya Moms."}
              </p>
              <button
                className="text-button"
                onClick={() => {
                  setSearch("");
                  if (activeTab === "available") {
                    setActiveCategory("Semua");
                  } else {
                    setCatalogStatusFilter("Semua");
                  }
                }}
              >
                Reset pencarian
              </button>
            </div>
          )}
      </section>

      <footer className="page-footer">
        <div className="footer-mark">
          <img src="/logo.png" alt="Ava Eats Logo" />
        </div>
        <p>Made with love by Ava Eats</p>
      </footer>

      {totalItems > 0 && !cartOpen && (
        <div className="cart-dock">
          <button
            className="cart-button"
            onClick={() => setCartOpen(true)}
          >
            <span className="cart-icon">
              ♧
              <span className="cart-badge">{totalItems}</span>
            </span>

            <span className="cart-button-label">
              <strong>Lihat Keranjang</strong>
              <small>{totalItems} item dipilih</small>
            </span>

            <strong className="cart-total">
              {formatRupiah(totalPrice)}
            </strong>
            <span className="cart-arrow">→</span>
          </button>
        </div>
      )}

      {cartOpen && (
        <div
          className="sheet-backdrop"
          onClick={() => setCartOpen(false)}
        >
          <section
            className="cart-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cart-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sheet-handle" />

            <div className="sheet-heading">
              <div>
                <p className="eyebrow">YOUR SELECTION</p>
                <h2 id="cart-title">Keranjangmu</h2>
              </div>

              <button
                className="close-button"
                onClick={() => setCartOpen(false)}
                aria-label="Tutup keranjang"
              >
                ×
              </button>
            </div>

            <div className="cart-list">
              {cartItems.map((product) => (
                <div className="cart-item" key={product.id}>
                  <div className="cart-item-emoji overflow-hidden flex items-center justify-center">
                    {product.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={getImageUrl(product.image)}
                        alt={product.name}
                        className="h-full w-full object-cover rounded-lg"
                      />
                    ) : (
                      product.emoji
                    )}
                  </div>

                  <div className="cart-item-info">
                    <strong>{product.name}</strong>
                    <span>{formatRupiah(product.price)}</span>
                  </div>

                  <div className="quantity-control">
                    <button
                      onClick={() =>
                        changeQuantity(product.id, -1)
                      }
                      aria-label={`Kurangi ${product.name}`}
                    >
                      −
                    </button>
                    <span>{quantities[product.id]}</span>
                    <button
                      onClick={() =>
                        changeQuantity(product.id, 1)
                      }
                      aria-label={`Tambah ${product.name}`}
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="order-summary">
              <div>
                <span>Total item</span>
                <strong>{totalItems} item</strong>
              </div>
              <div className="summary-total">
                <span>Total sementara</span>
                <strong>{formatRupiah(totalPrice)}</strong>
              </div>
              <p className="summary-note">
                Ongkir dan detail pembayaran dihitung pada tahap
                checkout.
              </p>
            </div>

            <button
              className="checkout-button"

              onClick={() => {
                const checkoutItems = cartItems.map((product) => ({
                  product_id: product.id,
                  name: product.name,
                  price: product.price,
                  quantity: quantities[product.id],
                }));

                localStorage.setItem(
                  "ava_eats_checkout_cart",
                  JSON.stringify(checkoutItems)
                );

                setCartOpen(false);
                router.push("/checkout");
              }}

            >
              Lanjut ke Checkout <span>→</span>
            </button>
          </section>
        </div>
      )}

      {/* ── Slide-up Drawer Menu Navigasi (Hamburger) ── */}
      {menuOpen && (
        <div
          className="sheet-backdrop"
          onClick={() => setMenuOpen(false)}
        >
          <section
            className="cart-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="nav-menu-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sheet-handle" />

            <div className="sheet-heading">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#7A2E3A] text-xs font-bold text-white">
                  A
                </div>
                <div>
                  <p className="eyebrow">AVA EATS</p>
                  <h2 id="nav-menu-title" className="text-xl font-bold text-[#2A2620]">
                    Menu Navigasi
                  </h2>
                </div>
              </div>

              <button
                type="button"
                className="close-button"
                onClick={() => setMenuOpen(false)}
                aria-label="Tutup menu"
              >
                ×
              </button>
            </div>

            {/* Profile / Login Card */}
            <div className="mb-4 rounded-2xl border border-[#E8D6CE] bg-[#FAF7F2] p-4">
              {customer ? (
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#7A2E3A] text-base font-bold text-white">
                        {customer.name ? customer.name.charAt(0).toUpperCase() : "M"}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <strong className="truncate text-sm text-[#2A2620]">
                            {customer.name}
                          </strong>
                          <span className="shrink-0 rounded-full bg-[#6E8F63]/15 px-2 py-0.5 text-[10px] font-semibold text-[#496442]">
                            Member
                          </span>
                        </div>
                        <p className="truncate text-xs text-[#6B6459]">{customer.phone}</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleLogout}
                      className="shrink-0 rounded-lg border border-[#E4D5D5] px-2.5 py-1 text-xs font-semibold text-[#7A2E3A] transition hover:bg-white"
                    >
                      Logout
                    </button>
                  </div>

                  <div className="mt-3 pt-3 border-t border-[#E8D6CE]/60">
                    <Link
                      href="/profile"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center justify-center gap-1.5 w-full rounded-xl border border-[#E8D6CE] bg-white py-2 text-xs font-semibold text-[#7A2E3A] shadow-sm transition hover:bg-[#FAF7F2]"
                    >
                      <span>✏️</span> Edit Informasi Profil
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#E8D6CE] text-lg">
                      👤
                    </div>
                    <div className="min-w-0">
                      <strong className="block text-sm text-[#2A2620]">
                        Halo, Moms! 👋
                      </strong>
                      <span className="block truncate text-xs text-[#6B6459]">
                        Masuk untuk kelola pesanan & alamat
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Link
                      href="/login"
                      onClick={() => setMenuOpen(false)}
                      className="rounded-xl bg-[#7A2E3A] px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-[#64252F]"
                    >
                      Masuk
                    </Link>
                    <Link
                      href="/register"
                      onClick={() => setMenuOpen(false)}
                      className="rounded-xl border border-[#7A2E3A] bg-white px-3 py-2 text-xs font-semibold text-[#7A2E3A] transition hover:bg-[#FAF7F2]"
                    >
                      Daftar
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {/* Navigation List */}
            <nav className="space-y-2">
              {customer && (
                <>
                  <Link
                    href="/profile"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center justify-between rounded-xl border border-[#EEE5DF] bg-white p-3.5 transition hover:bg-[#FAF7F2]"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FAF0E6] text-lg">
                        👤
                      </span>
                      <div>
                        <strong className="block text-sm text-[#2A2620]">
                          Profil Saya
                        </strong>
                        <span className="text-xs text-[#78686A]">
                          Ubah nama, WhatsApp, & kata sandi
                        </span>
                      </div>
                    </div>
                    <span className="text-base font-bold text-[#80515A]">→</span>
                  </Link>

                  <Link
                    href="/addresses"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center justify-between rounded-xl border border-[#EEE5DF] bg-white p-3.5 transition hover:bg-[#FAF7F2]"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FAF0E6] text-lg">
                        📍
                      </span>
                      <div>
                        <strong className="block text-sm text-[#2A2620]">
                          Alamat Pengiriman
                        </strong>
                        <span className="text-xs text-[#78686A]">
                          Kelola alamat rumah, kantor, & titik GPS
                        </span>
                      </div>
                    </div>
                    <span className="text-base font-bold text-[#80515A]">→</span>
                  </Link>
                </>
              )}

              <Link
                href="/orders"
                onClick={() => setMenuOpen(false)}
                className="flex items-center justify-between rounded-xl border border-[#EEE5DF] bg-white p-3.5 transition hover:bg-[#FAF7F2]"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F5E8E8] text-lg">
                    📦
                  </span>
                  <div>
                    <strong className="block text-sm text-[#2A2620]">
                      Pesanan Saya
                    </strong>
                    <span className="text-xs text-[#78686A]">
                      Pantau status & riwayat transaksi
                    </span>
                  </div>
                </div>
                <span className="text-base font-bold text-[#80515A]">→</span>
              </Link>

              <Link
                href="/promos"
                onClick={() => setMenuOpen(false)}
                className="flex items-center justify-between rounded-xl border border-[#EEE5DF] bg-white p-3.5 transition hover:bg-[#FAF7F2]"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFF3E8] text-lg">
                    🎟️
                  </span>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <strong className="block text-sm text-[#2A2620]">
                        Kupon & Voucher Promo
                      </strong>
                      <span className={`rounded-full px-1.5 py-0.2 text-[9px] font-extrabold uppercase text-white ${activePromos.length > 0 ? "bg-[#7A2E3A]" : "bg-[#A89F97]"}`}>
                        {activePromos.length > 0 ? `${activePromos.length} Promo` : "Promo"}
                      </span>
                    </div>
                    <span className="text-xs text-[#78686A]">
                      Cek voucher diskon & subsidi ongkir
                    </span>
                  </div>
                </div>
                <span className="text-base font-bold text-[#80515A]">→</span>
              </Link>

              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  if (totalItems > 0) {
                    setCartOpen(true);
                  }
                }}
                className="flex w-full items-center justify-between rounded-xl border border-[#EEE5DF] bg-white p-3.5 text-left transition hover:bg-[#FAF7F2]"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F3E1DE]/50 text-lg">
                    🛒
                  </span>
                  <div>
                    <strong className="block text-sm text-[#2A2620]">
                      Keranjang Belanja
                    </strong>
                    <span className="text-xs text-[#78686A]">
                      {totalItems > 0
                        ? `${totalItems} item dipilih • ${formatRupiah(totalPrice)}`
                        : "Keranjang masih kosong"}
                    </span>
                  </div>
                </div>
                {totalItems > 0 ? (
                  <span className="rounded-full bg-[#7A2E3A] px-2.5 py-0.5 text-xs font-bold text-white">
                    {totalItems}
                  </span>
                ) : (
                  <span className="text-xs text-[#A08E8B]">Buka</span>
                )}
              </button>

              <Link
                href="/checkout"
                onClick={() => {
                  setMenuOpen(false);
                  if (totalItems === 0) {
                    localStorage.removeItem("ava_eats_checkout_cart");
                    localStorage.removeItem("ava_eats_checkout_draft");
                  }
                }}
                className="flex items-center justify-between rounded-xl border border-[#EEE5DF] bg-white p-3.5 transition hover:bg-[#FAF7F2]"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E4EBDD]/70 text-lg">
                    🛵
                  </span>
                  <div>
                    <strong className="block text-sm text-[#2A2620]">
                      Halaman Checkout
                    </strong>
                    <span className="text-xs text-[#78686A]">
                      Selesaikan pesanan dan pembayaran
                    </span>
                  </div>
                </div>
                <span className="text-base font-bold text-[#80515A]">→</span>
              </Link>

              {/* Accordion Info Toko */}
              <button
                type="button"
                onClick={() => setStoreInfoOpen((prev) => !prev)}
                className="flex w-full items-center justify-between rounded-xl border border-[#EEE5DF] bg-white p-3.5 text-left transition hover:bg-[#FAF7F2]"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FAF0E6] text-lg">
                    📍
                  </span>
                  <div>
                    <strong className="block text-sm text-[#2A2620]">
                      Info Toko & Lokasi
                    </strong>
                    <span className="text-xs text-[#78686A]">
                      Alamat pickup, jam buka, kontak
                    </span>
                  </div>
                </div>
                <span className="text-xs font-bold text-[#78686A]">
                  {storeInfoOpen ? "▲" : "▼"}
                </span>
              </button>

              {storeInfoOpen && (
                <div className="rounded-xl border border-[#D5E2CF] bg-[#E4EBDD]/40 p-4 text-xs leading-5 text-[#496442]">
                  <p className="font-bold text-sm text-[#2A2620]">
                    {process.env.NEXT_PUBLIC_STORE_NAME || "Ava Eats"}
                  </p>
                  <p className="mt-1">
                    {process.env.NEXT_PUBLIC_STORE_ADDRESS ||
                      "Cluster The Awa, Blok B1 No 27, Ciriung, Kec. Cibinong, Kabupaten Bogor, Jawa Barat 16918"}
                  </p>
                  <p className="mt-2 font-semibold">
                    📞 WhatsApp: {process.env.NEXT_PUBLIC_STORE_PHONE || "082213232456"}
                  </p>
                  <p className="mt-0.5">
                    ⏰ Jam Buka: Setiap Hari (08.00 - 20.00 WIB)
                  </p>
                  <div className="mt-3 flex gap-2">
                    <a
                      href={`https://wa.me/62${(process.env.NEXT_PUBLIC_STORE_PHONE || "082213232456").replace(/^0/, "")}?text=Halo%20Admin%20Ava%20Eats`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex rounded-lg bg-[#6E8F63] px-3 py-1.5 font-semibold text-white transition hover:bg-[#58764F]"
                    >
                      Chat WhatsApp ↗
                    </a>
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${process.env.NEXT_PUBLIC_STORE_LATITUDE || "-6.459818049304167"},${process.env.NEXT_PUBLIC_STORE_LONGITUDE || "106.87384403716149"}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex rounded-lg border border-[#6E8F63] px-3 py-1.5 font-semibold text-[#496442] transition hover:bg-white"
                    >
                      Google Maps ↗
                    </a>
                  </div>
                </div>
              )}
            </nav>

            <div className="mt-5 border-t border-[#EEE5DF] pt-4 text-center">
              <p className="text-[11px] text-[#A08E8B]">
                Ava Eats • Homemade With Love for Your Little One
              </p>
              <Link
                href="/admin/login"
                onClick={() => setMenuOpen(false)}
                className="mt-2 inline-block text-[11px] font-medium text-[#7A2E3A] hover:underline"
              >
                🛡️ Staff & Admin Portal
              </Link>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
