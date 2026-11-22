/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config, { isServer }) => {
    // The `uint8arrays` library (used by did-jwt) exports a function named `toString`.
    // With module concatenation, the production minifier folds `ns.toString(x)` into the
    // string "[object Object]" and credential decoding breaks in the browser.
    if (!isServer) config.optimization.concatenateModules = false;
    return config;
  },
};
module.exports = nextConfig;
