import webpack from 'webpack';

/** @type {import('next').NextConfig} */
const nextConfig = {
    // lightning-js includes valid bitwise math that crashes this Next 14 SWC minifier.
    swcMinify: false,

    webpack: (config) => {
      // Some third-party bundles (styled-components CJS in deps) reference a global `React`.
      // Provide it explicitly so SSR does not crash with "React is not defined".
      config.plugins = config.plugins || [];
      config.plugins.push(
        new webpack.ProvidePlugin({
          React: 'react',
        })
      );

      // MP3 file handling
      config.module.rules.push({
        test: /\.mp3$/,
        use: [
          {
            loader: 'file-loader',
            options: {
              name: '[name].[ext]',
              outputPath: 'static/media/',
              publicPath: '/_next/static/media/',
            },
          },
        ],
      });

      // Fallback for Node.js modules not available in browser
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
        os: false,
      };

      return config;
    },
  };

export default nextConfig;
