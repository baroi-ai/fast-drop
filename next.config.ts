/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  basePath: "/fast-drop",
  images: {
    unoptimized: true,
  },
  // Add this new property to allow your phone to connect
  allowedDevOrigins: ["192.168.1.3", "192.168.1.2"],
};

export default nextConfig;
