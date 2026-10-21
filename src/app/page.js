"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { apiRequest, isTokenExpired } from "@/lib/api";

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

export default function Home() {
  const router = useRouter();
  const pathname = usePathname();

  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState("");

  const [activeTab, setActiveTab] = useState("available");
  const [activeCategory, setActiveCategory] = useState("Semua");
  const [quantities, setQuantities] = useState({});
  const [cartOpen, setCartOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [customer, setCustomer] = useState(null);
  const [storeInfoOpen, setStoreInfoOpen] = useState(false);
  const [toast, setToast] = useState("");

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
            category: metadata.category || "Lainnya",
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



  const categories = [
    "Semua",
    ...new Set(products.map((product) => product.category)),
  ];

  const visibleProducts = useMemo(() => {
    return products.filter((product) => {
      const matchesTab =
        activeTab === "catalog" || product.available;

      const matchesCategory =
        activeCategory === "Semua" ||
        product.category === activeCategory;

      const matchesSearch = product.name
        .toLowerCase()
        .includes(search.toLowerCase());

      return matchesTab && matchesCategory && matchesSearch;
    });
  }, [products, activeTab, activeCategory, search]);

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
          <div className="brand-logo">A</div>

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
      </header>

      <section className="menu-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">OUR KITCHEN</p>
            <h2>Mau makan apa?</h2>
            <p className="section-subtitle">
              Pilih menu favoritmu hari ini.
            </p>
          </div>
          <span className="menu-count">
            {visibleProducts.length} menu
          </span>
        </div>

        <div className="search-box">
          <span aria-hidden="true">⌕</span>
          <input
            type="search"
            placeholder="Cari menu favorit..."
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

        <div className="menu-tabs" role="tablist">
          <button
            className={activeTab === "available" ? "active" : ""}
            onClick={() => setActiveTab("available")}
            role="tab"
            aria-selected={activeTab === "available"}
          >
            Ready to Order
          </button>
          <button
            className={activeTab === "catalog" ? "active" : ""}
            onClick={() => setActiveTab("catalog")}
            role="tab"
            aria-selected={activeTab === "catalog"}
          >
            All Menus
          </button>
        </div>

        <div className="category-list">
          {categories.map((category) => (
            <button
              key={category}
              className={
                activeCategory === category
                  ? "category-chip active"
                  : "category-chip"
              }
              onClick={() => setActiveCategory(category)}
            >
              {category}
            </button>
          ))}
        </div>


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
          <div className="product-grid">
            {visibleProducts.map((product) => {
              const quantity = quantities[product.id] || 0;

              return (
                <article className="product-card" key={product.id}>
                  <div className="product-image">
                    <span className="food-emoji">{product.emoji}</span>

                    {product.popular && (
                      <span className="popular-badge">★ Favorit</span>
                    )}

                    {!product.available && (
                      <span className="unavailable-badge">Habis</span>
                    )}
                  </div>

                  <div className="product-content">
                    <p className="product-category">{product.category}</p>

                    <div className="flex items-center justify-between gap-2">
                      <h3>{product.name}</h3>

                      <span
                        className={`shrink-0 text-xs ${product.available ? "text-[#6B6459]" : "text-red-600"
                          }`}
                      >
                        {product.stock > 0 ? `Stok: ${product.stock}` : "Habis"}
                      </span>
                    </div>

                    <p className="product-description">
                      {product.description}
                    </p>

                    <div className="product-bottom">
                      <div>
                        <p className="price-label">Mulai dari</p>
                        <p className="product-price">
                          {formatRupiah(product.price)}
                        </p>
                      </div>

                      {product.available ? (
                        quantity === 0 ? (
                          <button
                            type="button"
                            disabled={quantity >= product.stock}
                            onClick={() => changeQuantity(product.id, 1)}
                            aria-label={`Tambah ${product.name}`}
                            className="disabled:cursor-not-allowed disabled:opacity-40"
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
                        <span className="sold-out">Habis</span>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}


        {!productsLoading &&
          !productsError &&
          visibleProducts.length === 0 && (
            <div className="empty-state">
              <span>🍽️</span>
              <h3>Menu belum ditemukan</h3>
              <p>Coba kata kunci atau kategori lainnya, ya.</p>
              <button
                className="text-button"
                onClick={() => {
                  setSearch("");
                  setActiveCategory("Semua");
                }}
              >
                Reset pencarian
              </button>
            </div>
          )}
      </section>

      <footer className="page-footer">
        <div className="footer-mark">A</div>
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
                  <div className="cart-item-emoji">
                    {product.emoji}
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
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#E8D6CE] text-lg">
                      👤
                    </div>
                    <div>
                      <strong className="block text-sm text-[#2A2620]">
                        Halo, Moms! 👋
                      </strong>
                      <span className="text-xs text-[#6B6459]">
                        Masuk untuk kelola pesanan & alamat
                      </span>
                    </div>
                  </div>

                  <Link
                    href="/login"
                    onClick={() => setMenuOpen(false)}
                    className="shrink-0 rounded-xl bg-[#7A2E3A] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#64252F]"
                  >
                    Masuk
                  </Link>
                </div>
              )}
            </div>

            {/* Navigation List */}
            <nav className="space-y-2">
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
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
