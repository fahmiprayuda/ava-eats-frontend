
"use client";

import { useMemo, useState } from "react";

const products = [
  {
    id: 1,
    name: "Nasi Ayam Bakar",
    description: "Ayam bakar, nasi hangat, sambal",
    price: 25000,
    category: "Paket Nasi",
    emoji: "🍗",
    available: true,
    popular: true,
  },
  {
    id: 2,
    name: "Nasi Ayam Geprek",
    description: "Ayam crispy dengan sambal geprek",
    price: 22000,
    category: "Paket Nasi",
    emoji: "🍚",
    available: true,
    popular: false,
  },
  {
    id: 3,
    name: "Nasi Rendang",
    description: "Rendang sapi dan nasi putih",
    price: 30000,
    category: "Paket Nasi",
    emoji: "🥘",
    available: true,
    popular: true,
  },
  {
    id: 4,
    name: "Nasi Telur",
    description: "Telur balado, nasi, dan lalapan",
    price: 15000,
    category: "Paket Nasi",
    emoji: "🍳",
    available: true,
    popular: false,
  },
  {
    id: 5,
    name: "Es Teh Manis",
    description: "Teh segar, manisnya pas",
    price: 5000,
    category: "Minuman",
    emoji: "🧋",
    available: true,
    popular: false,
  },
  {
    id: 6,
    name: "Air Mineral",
    description: "Air mineral dingin",
    price: 4000,
    category: "Minuman",
    emoji: "💧",
    available: true,
    popular: false,
  },
];

const formatRupiah = (amount) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);

export default function Home() {
  const [activeTab, setActiveTab] = useState("available");
  const [activeCategory, setActiveCategory] = useState("Semua");
  const [quantities, setQuantities] = useState({});
  const [cartOpen, setCartOpen] = useState(false);
  const [search, setSearch] = useState("");

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

      const matchesSearch =
        product.name.toLowerCase().includes(search.toLowerCase());

      return matchesTab && matchesCategory && matchesSearch;
    });
  }, [activeTab, activeCategory, search]);

  const cartItems = products.filter(
    (product) => (quantities[product.id] || 0) > 0
  );

  const totalItems = cartItems.reduce(
    (total, product) => total + quantities[product.id],
    0
  );

  const totalPrice = cartItems.reduce(
    (total, product) =>
      total + product.price * quantities[product.id],
    0
  );

  function changeQuantity(productId, amount) {
    setQuantities((current) => {
      const nextQuantity = Math.max(
        0,
        (current[productId] || 0) + amount
      );

      return {
        ...current,
        [productId]: nextQuantity,
      };
    });
  }

  return (
    <main className="app-shell">
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
            className="icon-button"
            aria-label="Informasi bisnis"
            onClick={() =>
              alert("Selamat datang di Ava Eats Moms!")
            }
          >
            i
          </button>
        </div>

        <div className="announcement">
          <span>✦</span>
          <p>Selamat datang di Ava Eats Moms! Semoga harimu menyenangkan.</p>
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

        <div className="product-grid">
          {visibleProducts.map((product) => {
            const quantity = quantities[product.id] || 0;

            return (
              <article className="product-card" key={product.id}>
                <div className="product-image">
                  <span className="food-emoji">
                    {product.emoji}
                  </span>

                  {product.popular && (
                    <span className="popular-badge">
                      ★ Favorit
                    </span>
                  )}

                  {!product.available && (
                    <span className="unavailable-badge">
                      Habis
                    </span>
                  )}
                </div>

                <div className="product-content">
                  <p className="product-category">
                    {product.category}
                  </p>

                  <h3>{product.name}</h3>

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
                          className="add-button"
                          onClick={() =>
                            changeQuantity(product.id, 1)
                          }
                          aria-label={`Tambah ${product.name}`}
                        >
                          +
                        </button>
                      ) : (
                        <div className="quantity-control">
                          <button
                            onClick={() =>
                              changeQuantity(product.id, -1)
                            }
                            aria-label={`Kurangi ${product.name}`}
                          >
                            −
                          </button>
                          <span>{quantity}</span>
                          <button
                            onClick={() =>
                              changeQuantity(product.id, 1)
                            }
                            aria-label={`Tambah ${product.name}`}
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

        {visibleProducts.length === 0 && (
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

                window.location.href = "/checkout";
              }}

            >
              Lanjut ke Checkout <span>→</span>
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
