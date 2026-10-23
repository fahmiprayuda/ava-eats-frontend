"use client";

import { useEffect, useRef, useState, useCallback } from "react";

/**
 * Modal Pemilihan Titik Lokasi GPS Interaktif
 * Menggunakan Google Maps Tiles berkecepatan tinggi & responsif (CDN lokal Indonesia < 50ms)
 * Memungkinkan pengguna menggeser peta dan menancapkan pin di lokasi yang tepat (mirip Gojek / Grab).
 */
export default function LocationPickerModal({
    isOpen,
    onClose,
    initialCoords,
    onConfirm,
}) {
    const mapContainerRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const [currentCoords, setCurrentCoords] = useState(
        initialCoords || { lat: -6.2088, lon: 106.8456 } // Default: Jakarta Pusat
    );
    const [isDragging, setIsDragging] = useState(false);
    const [geocodedAddress, setGeocodedAddress] = useState(
        initialCoords
            ? `Titik Koordinat: ${initialCoords.lat.toFixed(5)}, ${initialCoords.lon.toFixed(5)}`
            : "Geser peta untuk menandai titik alamat..."
    );
    const [geocodingLoading, setGeocodingLoading] = useState(false);
    const [gpsDetecting, setGpsDetecting] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [searching, setSearching] = useState(false);
    const abortControllerRef = useRef(null);
    const debounceTimerRef = useRef(null);

    // Reverse Geocoding non-blocking dengan timeout 2.5 detik
    const fetchAddressFromCoords = useCallback((lat, lon) => {
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        if (abortControllerRef.current) abortControllerRef.current.abort();

        debounceTimerRef.current = setTimeout(async () => {
            const controller = new AbortController();
            abortControllerRef.current = controller;
            const timeoutId = setTimeout(() => controller.abort(), 2500);

            setGeocodingLoading(true);
            try {
                const res = await fetch(
                    `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`,
                    {
                        signal: controller.signal,
                        headers: { "Accept-Language": "id" },
                    }
                );
                clearTimeout(timeoutId);
                const data = await res.json();
                if (data && data.display_name) {
                    const addr = data.address || {};
                    const road = addr.road || addr.pedestrian || addr.suburb || "";
                    const village = addr.village || addr.neighbourhood || addr.city_district || "";
                    const city = addr.city || addr.town || addr.county || "";
                    const shortAddr = [road, village, city].filter(Boolean).join(", ");
                    setGeocodedAddress(shortAddr || data.display_name);
                } else {
                    setGeocodedAddress(`Titik Koordinat: ${lat.toFixed(5)}, ${lon.toFixed(5)}`);
                }
            } catch {
                setGeocodedAddress(`Titik Koordinat: ${lat.toFixed(5)}, ${lon.toFixed(5)}`);
            } finally {
                setGeocodingLoading(false);
            }
        }, 400);
    }, []);

    // Inisialisasi Peta Leaflet dengan Google Maps Tiles
    useEffect(() => {
        if (!isOpen) return;

        let isMounted = true;
        let map = null;

        const startLat = initialCoords?.lat || -6.2088;
        const startLon = initialCoords?.lon || 106.8456;

        // Load Leaflet secara dinamis
        import("leaflet").then((leafletModule) => {
            if (!isMounted || !mapContainerRef.current) return;
            const L = leafletModule.default || leafletModule;

            // Bersihkan instance lama jika ada
            if (mapInstanceRef.current) {
                try {
                    mapInstanceRef.current.remove();
                } catch { }
                mapInstanceRef.current = null;
            }

            map = L.map(mapContainerRef.current, {
                center: [startLat, startLon],
                zoom: initialCoords ? 17 : 15,
                zoomControl: false,
                fadeAnimation: true,
                zoomAnimation: true,
            });

            // Google Maps Raster Tiles: Blazing fast CDN di Indonesia, familiar & stabil
            L.tileLayer("https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}", {
                maxZoom: 20,
                subdomains: ["mt0", "mt1", "mt2", "mt3"],
                attribution: "Google Maps",
            }).addTo(map);

            // Zoom control di kiri atas
            L.control.zoom({ position: "topleft" }).addTo(map);

            mapInstanceRef.current = map;

            // Events pergerakan peta
            map.on("movestart", () => {
                setIsDragging(true);
            });

            map.on("move", () => {
                const center = map.getCenter();
                setCurrentCoords({ lat: center.lat, lon: center.lng });
            });

            map.on("moveend", () => {
                setIsDragging(false);
                const center = map.getCenter();
                setCurrentCoords({ lat: center.lat, lon: center.lng });
                fetchAddressFromCoords(center.lat, center.lng);
            });

            // Invalidate size agar tidak ada tile abu-abu
            map.invalidateSize();
            setTimeout(() => {
                if (map) map.invalidateSize();
            }, 100);
            setTimeout(() => {
                if (map) map.invalidateSize();
            }, 300);

            // Fetch geocode awal
            fetchAddressFromCoords(startLat, startLon);
        });

        return () => {
            isMounted = false;
            if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
            if (abortControllerRef.current) abortControllerRef.current.abort();
            if (mapInstanceRef.current) {
                try {
                    mapInstanceRef.current.remove();
                } catch { }
                mapInstanceRef.current = null;
            }
        };
    }, [isOpen, initialCoords, fetchAddressFromCoords]);

    // Deteksi GPS Perangkat Saat Ini secara instan
    const handleGetCurrentLocation = () => {
        if (!navigator.geolocation) {
            alert("Perangkat Anda tidak mendukung geolokasi GPS.");
            return;
        }

        setGpsDetecting(true);
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                setGpsDetecting(false);
                const { latitude, longitude } = pos.coords;
                if (mapInstanceRef.current) {
                    mapInstanceRef.current.flyTo([latitude, longitude], 17, {
                        duration: 1.2,
                    });
                }
            },
            () => {
                // Fallback dengan high accuracy jika cepat gagal
                navigator.geolocation.getCurrentPosition(
                    (pos) => {
                        setGpsDetecting(false);
                        const { latitude, longitude } = pos.coords;
                        if (mapInstanceRef.current) {
                            mapInstanceRef.current.flyTo([latitude, longitude], 17, {
                                duration: 1.2,
                            });
                        }
                    },
                    () => {
                        setGpsDetecting(false);
                        alert("Tidak dapat mengakses GPS. Pastikan izin lokasi aktif di browser Anda.");
                    },
                    { enableHighAccuracy: true, timeout: 5000 }
                );
            },
            { enableHighAccuracy: false, timeout: 4000 }
        );
    };

    // Pencarian Lokasi Cepat
    const handleSearchLocation = async (e) => {
        e.preventDefault();
        if (!searchQuery.trim() || searching) return;

        setSearching(true);
        try {
            const res = await fetch(
                `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
                    searchQuery.trim() + ", Indonesia"
                )}&limit=1`
            );
            const data = await res.json();
            if (data && data.length > 0) {
                const lat = parseFloat(data[0].lat);
                const lon = parseFloat(data[0].lon);
                if (mapInstanceRef.current) {
                    mapInstanceRef.current.flyTo([lat, lon], 17, { duration: 1.2 });
                }
            } else {
                alert(`Lokasi "${searchQuery}" tidak ditemukan. Coba gunakan nama jalan atau kelurahan.`);
            }
        } catch {
            alert("Gagal melakukan pencarian lokasi.");
        } finally {
            setSearching(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 p-0 sm:p-4 backdrop-blur-xs select-none"
            onClick={onClose}
        >
            <div
                className="relative flex flex-col w-full max-w-2xl overflow-hidden rounded-t-3xl sm:rounded-3xl border border-[#E8D6CE] bg-[#FAF7F2] shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header Modal & Search Bar */}
                <div className="border-b border-[#E8D6CE] bg-white px-4 sm:px-5 py-3 space-y-2.5 z-20">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="text-xl">📍</span>
                            <div>
                                <h3 className="text-sm font-bold text-[#2A2620]">
                                    Geser & Tancepkan Pin Lokasi
                                </h3>
                                <p className="text-[11px] text-[#78686A]">
                                    Geser peta agar pin merah tepat di depan rumah Moms.
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex h-8 w-8 items-center justify-center rounded-full border border-[#E8D6CE] bg-[#FAF7F2] text-xs font-bold text-[#78686A] transition hover:bg-[#E8D6CE] hover:text-[#2A2620]"
                        >
                            ✕
                        </button>
                    </div>

                    {/* Quick Search Bar */}
                    <form onSubmit={handleSearchLocation} className="relative flex items-center gap-2">
                        <div className="relative flex-1">
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Cari nama jalan, komplek, atau kelurahan..."
                                className="w-full rounded-xl border border-[#E8D6CE] bg-[#FAF7F2] px-3.5 py-2 pl-9 text-xs text-[#2A2620] outline-none placeholder-[#A89F97] focus:border-[#7A2E3A] focus:bg-white"
                            />
                            <span className="absolute left-3 top-2.5 text-xs text-[#A89F97]">🔍</span>
                            {searchQuery && (
                                <button
                                    type="button"
                                    onClick={() => setSearchQuery("")}
                                    className="absolute right-2.5 top-2 text-xs text-[#A89F97] hover:text-[#2A2620]"
                                >
                                    ✕
                                </button>
                            )}
                        </div>
                        <button
                            type="submit"
                            disabled={searching || !searchQuery.trim()}
                            className="rounded-xl bg-[#7A2E3A] px-3.5 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-[#60232E] disabled:opacity-50"
                        >
                            {searching ? "..." : "Cari"}
                        </button>
                    </form>
                </div>

                {/* Map Area dengan Fixed Height Explicit (Mencegah Collapsing/Freeze) */}
                <div className="relative w-full h-[50vh] min-h-[360px] sm:h-[460px] bg-[#E5E0D8] overflow-hidden">
                    {/* Leaflet container */}
                    <div ref={mapContainerRef} className="h-full w-full" />

                    {/* Centered Pin Indicator (Animasi Bouncing saat peta digeser) */}
                    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
                        <div
                            className={`flex flex-col items-center transition-transform duration-200 ${isDragging ? "-translate-y-4 scale-110" : "translate-y-0 scale-100"
                                }`}
                        >
                            {/* Speech Bubble */}
                            <div className="rounded-full bg-[#7A2E3A] px-3 py-1 text-[10px] font-extrabold text-white shadow-lg mb-1 whitespace-nowrap">
                                {isDragging ? "Lepaskan untuk memasang..." : "📍 Lokasi Di Sini"}
                            </div>

                            {/* Pin Icon */}
                            <div className="relative flex items-center justify-center">
                                <span className="text-4xl filter drop-shadow-md">📍</span>
                            </div>

                            {/* Needle Shadow */}
                            <div
                                className={`h-2 rounded-full bg-black/40 blur-xs transition-all duration-200 ${isDragging ? "w-2 opacity-30" : "w-4 opacity-70"
                                    }`}
                            />
                        </div>
                    </div>

                    {/* Floating Button: GPS Lokasi Saya */}
                    <button
                        type="button"
                        onClick={handleGetCurrentLocation}
                        disabled={gpsDetecting}
                        className="absolute bottom-4 right-4 z-10 flex items-center gap-1.5 rounded-full border border-[#E8D6CE] bg-white px-3.5 py-2 text-xs font-bold text-[#7A2E3A] shadow-xl transition hover:bg-[#FAF7F2] active:scale-95 disabled:opacity-50"
                    >
                        <span>{gpsDetecting ? "⏳" : "🎯"}</span>
                        <span>{gpsDetecting ? "Mencari GPS..." : "Lokasi Saya"}</span>
                    </button>
                </div>

                {/* Bottom Bar: Alamat Terdeteksi + Konfirmasi */}
                <div className="border-t border-[#E8D6CE] bg-white p-4 sm:p-5 z-20 space-y-3">
                    <div className="rounded-2xl border border-[#E8D6CE] bg-[#FAF7F2] p-3">
                        <div className="flex items-start gap-2.5">
                            <span className="text-base shrink-0 mt-0.5">🏡</span>
                            <div className="min-w-0 flex-1">
                                <span className="block text-[11px] font-bold text-[#7A2E3A] uppercase tracking-wider">
                                    Titik Yang Ditandai
                                </span>
                                <p className="text-xs font-semibold text-[#2A2620] line-clamp-2 mt-0.5">
                                    {geocodingLoading
                                        ? "Membaca nama lokasi..."
                                        : geocodedAddress || "Memuat koordinat..."}
                                </p>
                                <span className="block text-[10px] text-[#78686A] mt-1 font-mono">
                                    Koordinat: {currentCoords.lat.toFixed(6)}, {currentCoords.lon.toFixed(6)}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="w-1/3 rounded-xl border border-[#E8D6CE] bg-white py-3 text-xs font-bold text-[#78686A] transition hover:bg-[#FAF7F2]"
                        >
                            Batal
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                onConfirm({
                                    lat: currentCoords.lat,
                                    lon: currentCoords.lon,
                                    addressText: geocodedAddress,
                                });
                                onClose();
                            }}
                            className="flex-1 rounded-xl bg-[#7A2E3A] py-3 text-xs font-bold text-white shadow-sm transition hover:bg-[#60232E]"
                        >
                            ✓ Pasang Pin di Sini
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
