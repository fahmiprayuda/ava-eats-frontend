export const metadata = {
  title: "AVA EATS • Operations Portal",
  description: "Internal operations dashboard for Ava Eats staff and management.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#191415",
};

export default function AdminLayout({ children }) {
  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-[#191415] text-[#F5EFEB]">
      {children}
    </div>
  );
}
