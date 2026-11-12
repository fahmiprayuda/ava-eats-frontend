"use client";

import { useState, useEffect, useRef } from "react";
import { parseUtcDate } from "@/lib/api";
import JsBarcode from "jsbarcode";

const formatNumber = (num) =>
    new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(num || 0);

export default function ThermalReceiptModal({ order, onClose }) {
    const [paperSize, setPaperSize] = useState("80mm"); // "58mm" | "80mm"
    const [qrisLoadError, setQrisLoadError] = useState(false);
    const barcodeRef = useRef(null);

    const isOts = Boolean(order && (order.is_ots || String(order.order_code || "").startsWith("OTS-")));
    const orderCode = order ? (order.order_code || `ORD-${order.id}`) : "";
    const trackingNumber = order ? (order.tracking_number || "") : "";

    useEffect(() => {
        if (isOts || !barcodeRef.current) return;
        const codeToRender = (trackingNumber || orderCode).trim();
        if (!codeToRender) return;

        try {
            // Render barcode with clean, compact settings
            JsBarcode(barcodeRef.current, codeToRender, {
                format: "CODE128",
                width: 1.5,
                height: 40,
                displayValue: false,
                margin: 0,
                lineColor: "#000000",
                background: "#ffffff",
            });

            // JsBarcode sets viewBox="0 0 width height", width="...px", height="...px"
            // We remove fixed px width/height so viewBox scales responsively to paper size
            const svg = barcodeRef.current;
            svg.removeAttribute("width");
            svg.removeAttribute("height");
            svg.style.width = "100%";
            svg.style.maxWidth = paperSize === "58mm" ? "200px" : "240px";
            svg.style.height = "auto";
            svg.style.display = "block";
            svg.style.margin = "0 auto";
        } catch (err) {
            console.error("[Barcode Render Error]", err);
        }
    }, [isOts, trackingNumber, orderCode, paperSize]);

    if (!order) return null;

    function handlePrint() {
        window.print();
    }

    const customerName = order.customer_name || order.customer?.name || order.recipient_name || "Pelanggan";

    const orderDateObj = order.created_at ? parseUtcDate(order.created_at) : new Date();
    const formattedDate = orderDateObj
        ? orderDateObj.toLocaleDateString("id-ID", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
          })
        : "-";

    const formattedTime = orderDateObj
        ? orderDateObj.toLocaleTimeString("id-ID", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
          }).replace(":", ".")
        : "-";

    const isDelivery = (order.fulfillment_method || order.order_type) === "delivery";
    const status = (order.status || "").toLowerCase();
    const isCancelled = status === "cancelled";
    const isPending = status === "pending";
    const isRefunded = order.refund_status === "refunded";

    const paymentStatusText = isCancelled
        ? "CANCELLED"
        : isRefunded
        ? "REFUNDED"
        : isPending
        ? "UNPAID"
        : "PAID";

    const items = order.items || [];
    const itemsSubtotal = items.reduce(
        (sum, it) => sum + (it.price || 0) * (it.quantity || 1),
        0
    );
    const shippingCost = order.shipping_cost || 0;
    const packagingFee = order.packaging_fee || 0;
    const discountAmount = order.discount_amount || 0;
    const grandTotal = order.grand_total || order.total_amount || (itemsSubtotal + shippingCost + packagingFee - discountAmount);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/80 backdrop-blur-xs transition-opacity"
                onClick={onClose}
            />

            {/* Modal Card */}
            <div className="relative z-10 flex max-h-[95vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-[#3E3234] bg-[#221B1D] shadow-2xl">
                {/* Header Modal */}
                <div className="flex items-center justify-between border-b border-[#2E2527] px-4 py-3 sm:px-5">
                    <div className="flex items-center gap-2">
                        <span className="text-lg">🖨️</span>
                        <div>
                            <h3 className="text-sm font-bold text-white">
                                Cetak Struk & Label Thermal
                            </h3>
                            <p className="text-[11px] text-[#A89F97]">
                                Struk resmi Ava Eats #{orderCode}
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-1 text-sm text-[#A89F97] hover:bg-[#2E2527] hover:text-white"
                        aria-label="Tutup"
                    >
                        ✕
                    </button>
                </div>

                {/* Toolbar Pilihan Ukuran Kertas */}
                <div className="flex items-center justify-between bg-[#1A1416] px-4 py-2.5 sm:px-5 border-b border-[#2E2527]">
                    <span className="text-xs font-semibold text-[#D1C7BD]">
                        Ukuran Kertas Printer:
                    </span>
                    <div className="flex items-center gap-1.5 bg-[#251E20] p-1 rounded-xl border border-[#342A2C]">
                        <button
                            type="button"
                            onClick={() => setPaperSize("58mm")}
                            className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${paperSize === "58mm"
                                ? "bg-[#7A2E3A] text-white shadow-xs"
                                : "text-[#A89F97] hover:text-white"
                                }`}
                        >
                            58 mm (Mini / BT)
                        </button>
                        <button
                            type="button"
                            onClick={() => setPaperSize("80mm")}
                            className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${paperSize === "80mm"
                                ? "bg-[#7A2E3A] text-white shadow-xs"
                                : "text-[#A89F97] hover:text-white"
                                }`}
                        >
                            80 mm (Standar POS - Lebar)
                        </button>
                    </div>
                </div>

                {/* Preview Kertas Struk Thermal */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-[#161213] flex justify-center items-start">
                    <div
                        id="thermal-receipt-printable"
                        className={`bg-white text-black shadow-2xl select-none transition-all my-2 shrink-0 ${
                            paperSize === "58mm"
                                ? "w-[320px] paper-58 p-6 text-[11.5px]"
                                : "w-[420px] paper-80 p-8 text-xs"
                        }`}
                        style={{
                            fontFamily:
                                "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
                            boxSizing: "border-box",
                            minHeight: "fit-content",
                        }}
                    >
                        {/* ── 1. Header: Logo & Mascot Pas di Tengah ── */}
                        <div className="w-full flex flex-col items-center justify-center pt-2 pb-1">
                            <div className="inline-flex items-center justify-center gap-3.5">
                                <div className="text-left">
                                    <h1
                                        className="text-2xl sm:text-[28px] font-black tracking-tight text-black leading-none"
                                        style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
                                    >
                                        Ava Eats
                                    </h1>
                                    <p className="text-[9.5px] sm:text-[10.5px] text-gray-600 font-medium italic mt-1 tracking-tight">
                                        Homemade goodness, made with love
                                    </p>
                                </div>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src="/receipt-logo.png"
                                    alt="Ava Eats Mascot"
                                    className="h-16 w-16 sm:h-20 sm:w-20 rounded-full object-cover border border-gray-200 shrink-0 shadow-xs"
                                />
                            </div>

                            {/* Title RECEIPT */}
                            <div className="text-center mt-3 mb-1 w-full">
                                <p className="text-[11px] sm:text-xs font-bold tracking-[0.35em] text-black uppercase">
                                    RECEIPT
                                </p>
                            </div>
                        </div>

                        {/* Banner Peringatan Jika Pesanan Dibatalkan */}
                        {isCancelled && (
                            <div className="my-2 border border-red-600 bg-red-50 p-2 text-center text-red-700 rounded-md">
                                <p className="font-bold text-xs uppercase tracking-wider">
                                    *** PESANAN DIBATALKAN ***
                                </p>
                                <p className="text-[9px] mt-0.5 font-medium">STRUK BATAL - BUKAN BUKTI TRANSAKSI</p>
                                {order.cancellation_reason && (
                                    <p className="text-[9px] italic mt-0.5 text-black">
                                        Alasan: &ldquo;{order.cancellation_reason}&rdquo;
                                    </p>
                                )}
                            </div>
                        )}

                        {/* ── 2. Order Meta Section (Tanpa Alamat & Resi, Resi ada di Barcode bawah) ── */}
                        <div className="border-t border-black pt-3 pb-2.5 my-2 space-y-1.5 leading-snug">
                            <div className="flex items-start">
                                <span className="w-24 sm:w-28 text-black font-semibold uppercase shrink-0">ORDER ID</span>
                                <span className="w-3 text-black font-medium shrink-0">:</span>
                                <span className="flex-1 text-black font-medium">{orderCode}</span>
                            </div>
                            <div className="flex items-start">
                                <span className="w-24 sm:w-28 text-black font-semibold uppercase shrink-0">CUSTOMER</span>
                                <span className="w-3 text-black font-medium shrink-0">:</span>
                                <span className="flex-1 text-black font-medium uppercase">{customerName}</span>
                            </div>
                            {!isOts && (
                                <div className="flex items-start">
                                    <span className="w-24 sm:w-28 text-black font-semibold uppercase shrink-0">PICK-UP</span>
                                    <span className="w-3 text-black font-medium shrink-0">:</span>
                                    <span className="flex-1 text-black font-medium uppercase">
                                        {isDelivery
                                            ? (order.courier ? order.courier.toUpperCase() : "DELIVERY")
                                            : "OUTLET PICK-UP"}
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* ── 3. Table Items Header ── */}
                        <div className="border-t border-b border-black py-2 mt-2.5 mb-2 flex justify-between font-bold text-black tracking-wider text-[11px] sm:text-xs">
                            <span className="flex-1">ITEM PURCHASED</span>
                            <span className="w-10 sm:w-12 text-center">QTY</span>
                            <span className="w-18 sm:w-20 text-right">PRICE</span>
                        </div>

                        {/* Items Rows */}
                        <div className="space-y-2 py-1.5 leading-snug">
                            {items.map((it, idx) => {
                                const itemNum = String(idx + 1).padStart(2, "0");
                                const itemTotal = (it.price || 0) * (it.quantity || 1);
                                return (
                                    <div key={idx} className="flex items-start justify-between text-black">
                                        <div className="flex-1 pr-2 flex items-start gap-2">
                                            <span className="font-mono text-gray-700 shrink-0">{itemNum}</span>
                                            <span className="font-medium">{it.product_name || it.name || "Menu"}</span>
                                        </div>
                                        <span className="w-10 sm:w-12 text-center font-mono shrink-0">
                                            {it.quantity || 1}
                                        </span>
                                        <span className="w-18 sm:w-20 text-right font-mono font-medium shrink-0">
                                            {formatNumber(itemTotal)}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>

                        {/* ── 4. Totals Block ── */}
                        <div className="border-t border-black pt-3 pb-2 mt-3 space-y-1.5 text-black">
                            <div className="flex justify-between">
                                <span className="font-semibold">SUBTOTAL AMOUNT</span>
                                <span className="font-mono font-medium">{formatNumber(itemsSubtotal)}</span>
                            </div>
                            {packagingFee > 0 && (
                                <div className="flex justify-between">
                                    <span className="font-semibold">EXTRA PACKAGING</span>
                                    <span className="font-mono font-medium">{formatNumber(packagingFee)}</span>
                                </div>
                            )}
                            {isDelivery && shippingCost > 0 && (
                                <div className="flex justify-between">
                                    <span className="font-semibold">SHIPPING COST</span>
                                    <span className="font-mono font-medium">{formatNumber(shippingCost)}</span>
                                </div>
                            )}
                            {discountAmount > 0 && (
                                <div className="flex justify-between font-semibold">
                                    <span>DISCOUNT PROMO {order.promo_code ? `(${order.promo_code})` : ""}</span>
                                    <span className="font-mono">-{formatNumber(discountAmount)}</span>
                                </div>
                            )}
                            <div className="flex justify-between font-black text-xs sm:text-sm pt-2.5 mt-2 border-t border-black">
                                <span>TOTAL AMOUNT</span>
                                <span className="font-mono font-black">{formatNumber(grandTotal)}</span>
                            </div>
                        </div>

                        {/* ── 5. Date / Time / Status Line ── */}
                        <div className="border-t border-b border-black py-2.5 my-3 flex justify-between items-center font-bold text-black text-[11px] sm:text-xs">
                            <span className="font-mono">{formattedDate}</span>
                            <span className="font-mono">{formattedTime}</span>
                            <span
                                className={`font-mono font-black ${
                                    isCancelled
                                        ? "text-red-700"
                                        : isPending
                                        ? "text-amber-800"
                                        : "text-black"
                                }`}
                            >
                                {paymentStatusText}
                            </span>
                        </div>

                        {/* ── 6. QRIS Static (OTS jika masih UNPAID) atau Barcode (Order Reguler) ── */}
                        {isOts ? (
                            isPending && !qrisLoadError ? (
                                <div className="mt-3 mb-2 flex flex-col items-center justify-center w-full px-2">
                                    <div className="flex flex-col items-center">
                                        <p className="text-[9.5px] font-bold uppercase tracking-widest text-black mb-1.5 text-center">
                                            SCAN QRIS UNTUK PEMBAYARAN
                                        </p>
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src="/qris-bca.png"
                                            alt="QRIS Static BCA"
                                            onError={() => setQrisLoadError(true)}
                                            className={`object-contain rounded border border-gray-300 bg-white p-1 ${paperSize === "58mm" ? "w-36 h-36" : "w-44 h-44"}`}
                                        />
                                    </div>
                                </div>
                            ) : null
                        ) : (
                            <div className="mt-3 mb-2 flex flex-col items-center justify-center w-full px-2">
                                <div className="w-full flex items-center justify-center">
                                    <svg ref={barcodeRef} />
                                </div>
                                <span className="text-[8.5px] font-mono tracking-widest text-black mt-1 uppercase font-semibold text-center">
                                    {order.tracking_number
                                        ? `* RESI: ${order.tracking_number} *`
                                        : `* ORDER: ${orderCode} *`}
                                </span>
                            </div>
                        )}

                        {/* ── 7. Thank You Footer ── */}
                        <div className="text-center pt-2 pb-4">
                            <p
                                className="font-bold text-2xl sm:text-3xl text-black tracking-normal leading-tight"
                                style={{
                                    fontFamily:
                                        "'Dancing Script', 'Caveat', 'Brush Script MT', 'Segoe Script', cursive, serif",
                                }}
                            >
                                Thank you!
                            </p>
                            <p className="text-[10px] sm:text-[11px] text-gray-700 tracking-wider font-sans mt-1.5 font-medium">
                                avaeats.id
                            </p>
                        </div>
                    </div>
                </div>

                {/* Footer Modal Actions */}
                <div className="flex items-center justify-end gap-2 border-t border-[#2E2527] bg-[#1F191A] px-4 py-3 sm:px-5">
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-xl border border-[#3E3234] px-4 py-2 text-xs font-semibold text-[#D1C7BD] hover:bg-[#2E2527] transition"
                    >
                        Tutup
                    </button>
                    <button
                        type="button"
                        onClick={handlePrint}
                        className="rounded-xl bg-[#7A2E3A] px-5 py-2 text-xs font-bold text-white shadow-md shadow-[#7A2E3A]/40 hover:bg-[#64252F] transition flex items-center gap-1.5"
                    >
                        <span>🖨️</span>
                        <span>Cetak Struk Sekarang</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
