"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function AddressNewRedirect() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const redirectTo = searchParams.get("redirect") || "";

    useEffect(() => {
        const dest = redirectTo
            ? `/addresses?action=new&redirect=${encodeURIComponent(redirectTo)}`
            : "/addresses?action=new";
        router.replace(dest);
    }, [router, redirectTo]);

    return (
        <main className="flex min-h-screen items-center justify-center bg-[#F8F3E9]">
            <p className="text-sm text-[#6B6459]">Membuka form alamat baru...</p>
        </main>
    );
}

export default function AddressNewPage() {
    return (
        <Suspense fallback={
            <main className="flex min-h-screen items-center justify-center bg-[#F8F3E9]">
                <p className="text-sm text-[#6B6459]">Memuat...</p>
            </main>
        }>
            <AddressNewRedirect />
        </Suspense>
    );
}
