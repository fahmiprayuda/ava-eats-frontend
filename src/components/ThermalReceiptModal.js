"use client";

import { useState } from "react";
import { parseUtcDate } from "@/lib/api";

export default function ThermalReceiptModal({ order, onClose }) {
    const [paperSize, setPaperSize] = useState("58mm"); // "58mm" | "80mm"

    if (!order) return null;

    function handlePrint() {
        window.print();
    }

    const orderCode = order.order_code || `ORD-${order.id}`;
    const customerName = order.customer_name || order.customer?.name || "Pelanggan";
    const customerPhone = order.phone || order.customer?.phone || "-";
    const orderDate = order.created_at
        ? parseUtcDate(order.created_at)?.toLocaleString("id-ID", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        })
        : "-";

    const isDelivery = (order.fulfillment_method || order.order_type) === "delivery";
    const status = (order.status || "").toLowerCase();
    const isCancelled = status === "cancelled";
    const isPending = status === "pending";
    const isRefunded = order.refund_status === "refunded";
    const isRefundPending = order.refund_status === "refund_pending";

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
            <div className="relative z-10 flex max-h-[95vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[#3E3234] bg-[#221B1D] shadow-2xl">
                {/* Header Modal */}
                <div className="flex items-center justify-between border-b border-[#2E2527] px-4 py-3 sm:px-5">
                    <div className="flex items-center gap-2">
                        <span className="text-lg">🖨️</span>
                        <div>
                            <h3 className="text-sm font-bold text-white">
                                Cetak Struk & Label Thermal
                            </h3>
                            <p className="text-[11px] text-[#A89F97]">
                                Label kemasan & kitchen slip pesanan #{orderCode}
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
                            80 mm (Standar POS)
                        </button>
                    </div>
                </div>

                {/* Preview Kertas Struk Thermal */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-[#161213] flex justify-center">
                    <div
                        id="thermal-receipt-printable"
                        className={`bg-white text-black p-4 sm:p-5 shadow-xl font-mono text-[11px] leading-tight select-none ${paperSize === "58mm" ? "w-[280px] paper-58" : "w-[360px] paper-80"
                            }`}
                        style={{
                            fontFamily: "'Courier New', Courier, monospace",
                        }}
                    >
                        {/* Header Toko */}
                        <div className="text-center pb-2">
                            <h2 className="text-base font-black tracking-wider uppercase">
                                AVA EATS
                            </h2>
                            <p className="text-[10px] font-semibold mt-0.5">
                                Homemade Frozen Food for Kids
                            </p>
                            <p className="text-[9px] text-gray-700">
                                WA: 0822-1323-2456 • Cibinong, Bogor
                            </p>
                        </div>

                        {/* Banner Peringatan Jika Pesanan Dibatalkan */}
                        {isCancelled && (
                            <div className="my-1.5 border-2 border-dashed border-red-600 bg-red-50 p-1.5 text-center text-red-700">
                                <p className="font-black text-[11px] tracking-wider uppercase">
                                    *** PESANAN DIBATALKAN ***
                                </p>
                                <p className="text-[8px] font-bold mt-0.5">
                                    STRUK BATAL - BUKAN BUKTI TRANSAKSI
                                </p>
                                {order.cancellation_reason && (
                                    <p className="text-[8px] italic mt-0.5 text-black">
                                        Alasan: &ldquo;{order.cancellation_reason}&rdquo;
                                    </p>
                                )}
                            </div>
                        )}

                        {/* Garis Pemisah */}
                        <div className="border-b-2 border-dashed border-black my-2" />

                        {/* Order Meta */}
                        <div className="space-y-0.5 text-[10px]">
                            <div className="flex justify-between">
                                <span>TGL:</span>
                                <span>{orderDate}</span>
                            </div>
                            <div className="flex justify-between font-bold">
                                <span>ORDER:</span>
                                <span>#{orderCode}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>METODE:</span>
                                <span className="font-bold">
                                    {isDelivery
                                        ? `🛵 DELIVERY (${(order.courier || "KURIR").toUpperCase()})`
                                        : "🛍️ PICKUP OUTLET"}
                                </span>
                            </div>
                            {order.tracking_number && (
                                <div className="flex justify-between">
                                    <span>NO. RESI:</span>
                                    <span className="font-bold">{order.tracking_number}</span>
                                </div>
                            )}
                        </div>

                        {/* Garis Pemisah */}
                        <div className="border-b border-dashed border-black my-2" />

                        {/* Penerima & Alamat Pengiriman */}
                        <div className="text-[10px] space-y-0.5">
                            <p className="font-bold uppercase tracking-wider text-[11px]">
                                PENERIMA:
                            </p>
                            <p className="font-bold text-[11px]">{customerName}</p>
                            <p>📞 {customerPhone}</p>
                            {isDelivery ? (
                                <div className="mt-1 pt-1 border-t border-dotted border-gray-400">
                                    <p className="font-bold">ALAMAT PENGIRIMAN:</p>
                                    <p className="leading-snug mt-0.5 whitespace-pre-wrap">
                                        {order.delivery_address || order.address || "-"}
                                    </p>
                                    {order.address_notes && (
                                        <p className="mt-1 italic text-[9px] bg-gray-100 p-1 border border-gray-300">
                                            Patokan: {order.address_notes}
                                        </p>
                                    )}
                                </div>
                            ) : (
                                <p className="italic text-gray-600 mt-0.5">
                                    [Ambil Sendiri di Outlet Ava Eats]
                                </p>
                            )}
                        </div>

                        {/* Catatan Khusus Pesanan */}
                        {order.notes && (
                            <>
                                <div className="border-b border-dashed border-black my-2" />
                                <div className="bg-gray-100 p-1.5 border border-black text-[10px]">
                                    <span className="font-bold block">⚠️ CATATAN PESANAN:</span>
                                    <span className="italic leading-snug">{order.notes}</span>
                                </div>
                            </>
                        )}

                        {/* Garis Pemisah */}
                        <div className="border-b-2 border-dashed border-black my-2" />

                        {/* Rincian Menu */}
                        <div className="text-[10px]">
                            <p className="font-bold uppercase mb-1">ITEM PESANAN:</p>
                            <div className="space-y-1.5">
                                {items.map((it, idx) => (
                                    <div key={idx} className="flex justify-between items-start">
                                        <div className="flex-1 pr-2">
                                            <span className="font-bold">
                                                [{it.quantity || 1}x] {it.product_name || it.name || "Menu"}
                                            </span>
                                            <span className="block text-[9px] text-gray-600">
                                                @ Rp {(it.price || 0).toLocaleString("id-ID")}
                                            </span>
                                        </div>
                                        <span className="font-bold whitespace-nowrap">
                                            Rp {((it.price || 0) * (it.quantity || 1)).toLocaleString("id-ID")}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Garis Pemisah */}
                        <div className="border-b-2 border-dashed border-black my-2" />

                        {/* Total Pembayaran */}
                        <div className="space-y-1 text-[10px]">
                            <div className="flex justify-between">
                                <span>Subtotal Menu:</span>
                                <span>Rp {itemsSubtotal.toLocaleString("id-ID")}</span>
                            </div>
                            {isDelivery && (
                                <div className="flex justify-between">
                                    <span>Ongkos Kirim:</span>
                                    <span>Rp {shippingCost.toLocaleString("id-ID")}</span>
                                </div>
                            )}
                            {packagingFee > 0 && (
                                <div className="flex justify-between">
                                    <span>Extra Packaging (Bag+Ice):</span>
                                    <span>Rp {packagingFee.toLocaleString("id-ID")}</span>
                                </div>
                            )}
                            {discountAmount > 0 && (
                                <div className="flex justify-between font-bold">
                                    <span>Diskon Promo {order.promo_code ? `(${order.promo_code})` : ""}:</span>
                                    <span>-Rp {discountAmount.toLocaleString("id-ID")}</span>
                                </div>
                            )}
                            <div className="flex justify-between font-black text-[12px] pt-1 border-t border-black">
                                <span>TOTAL AKHIR:</span>
                                <span>Rp {grandTotal.toLocaleString("id-ID")}</span>
                            </div>
                            <div className="flex justify-between items-center text-[10px] pt-1 border-t border-dotted border-gray-400">
                                <span>STATUS PESANAN:</span>
                                <span className={`font-black uppercase text-[10px] ${
                                    isCancelled
                                        ? "text-red-700 font-extrabold"
                                        : isPending
                                        ? "text-amber-700"
                                        : "text-black"
                                }`}>
                                    {isCancelled
                                        ? "✗ BATAL (CANCELLED)"
                                        : isRefunded
                                        ? "↩ REFUND SELESAI"
                                        : isRefundPending
                                        ? "⏳ PROSES REFUND"
                                        : isPending
                                        ? "⏳ MENUNGGU BAYAR"
                                        : "✓ LUNAS (PAID)"}
                                </span>
                            </div>
                        </div>

                        {/* Garis Pemisah */}
                        <div className="border-b-2 border-dashed border-black my-2" />

                        {/* Instruksi Handling Frozen Food & Footer */}
                        <div className="text-center text-[9px] space-y-0.5 pt-1">
                            {isCancelled ? (
                                <div className="space-y-0.5 py-1">
                                    <p className="font-black text-red-700 uppercase tracking-wide">
                                        ⚠️ PESANAN INI SUDAH DIBATALKAN ⚠️
                                    </p>
                                    <p className="text-gray-600">
                                        Barang tidak diserahkan ke kurir atau pelanggan.
                                    </p>
                                </div>
                            ) : (
                                <>
                                    <p className="font-black text-[10px] tracking-wide uppercase">
                                        ❄️ FROZEN FOOD & ICE PACK ❄️
                                    </p>
                                    <p className="leading-snug">
                                        Segera simpan di dalam freezer (-18°C) begitu paket diterima.
                                    </p>
                                </>
                            )}
                            <p className="pt-2 font-semibold">
                                Terima kasih sudah mempercayakan Ava Eats! ❤️
                            </p>
                            <p className="text-[8px] text-gray-500 pt-1">
                                www.avaeats.id • #{orderCode}
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
