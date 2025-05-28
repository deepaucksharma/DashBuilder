/**
 * Webpack Configuration for DashBuilder
 * Production-ready build configuration with optimizations
 */

const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const OptimizeCSSAssetsPlugin = require('optimize-css-assets-webpack-plugin');
const WorkboxPlugin = require('workbox-webpack-plugin');
const CompressionPlugin = require('compression-webpack-plugin');
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;
const { DefinePlugin } = require('webpack');

const isDevelopment = process.env.NODE_ENV !== 'production';
const isAnalyze = process.env.ANALYZE === 'true';

module.exports = {
  mode: isDevelopment ? 'development' : 'production',
  
  entry: {
    main: './frontend/dashbuilder-app.js',
    vendor: [
      './frontend/nerdgraph-client.js',
      './frontend/realtime-service.js'
    ]
  },
  
  output: {
    path: path.resolve(__dirname, '../../dist'),
    filename: isDevelopment ? '[name].js' : '[name].[contenthash].js',
    chunkFilename: isDevelopment ? '[name].chunk.js' : '[name].[contenthash].chunk.js',
    publicPath: '/',
    clean: true
  },
  
  module: {
    rules: [
      // JavaScript
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: [
              ['@babel/preset-env', {
                targets: {
                  browsers: ['last 2 versions', 'not dead', '> 0.2%']
                },
                modules: false
              }]
            ],
            plugins: [
              '@babel/plugin-syntax-dynamic-import',
              '@babel/plugin-proposal-class-properties',
              '@babel/plugin-proposal-optional-chaining',
              '@babel/plugin-proposal-nullish-coalescing-operator'
            ]
          }
        }
      },
      
      // CSS
      {
        test: /\.css$/,
        use: [
          isDevelopment ? 'style-loader' : MiniCssExtractPlugin.loader,
          {
            loader: 'css-loader',
            options: {
              importLoaders: 1,
              sourceMap: isDevelopment
            }
          },
          {
            loader: 'postcss-loader',
            options: {
              postcssOptions: {
                plugins: [
                  'autoprefixer',
                  'postcss-preset-env'
                ]
              }
            }
          }
        ]
      },
      
      // Images
      {
        test: /\.(png|svg|jpg|jpeg|gif)$/i,
        type: 'asset',
        parser: {
          dataUrlCondition: {
            maxSize: 8 * 1024 // 8kb
          }
        }
      },
      
      // Fonts
      {
        test: /\.(woff|woff2|eot|ttf|otf)$/i,
        type: 'asset/resource'
      }
    ]
  },
  
  plugins: [
    // HTML generation
    new HtmlWebpackPlugin({
      template: './frontend/index.html',
      favicon: './frontend/assets/favicon.ico',
      minify: !isDevelopment && {
        removeComments: true,
        collapseWhitespace: true,
        removeAttributeQuotes: true
      }
    }),
    
    // CSS extraction
    !isDevelopment && new MiniCssExtractPlugin({
      filename: '[name].[contenthash].css',
      chunkFilename: '[id].[contenthash].css'
    }),
    
    // Environment variables
    new DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV),
      'process.env.API_ENDPOINT': JSON.stringify(process.env.API_ENDPOINT || 'https://api.newrelic.com'),
      'process.env.WS_ENDPOINT': JSON.stringify(process.env.WS_ENDPOINT || 'wss://realtime.newrelic.com'),
      'process.env.VERSION': JSON.stringify(require('../../package.json').version)
    }),
    
    // Service Worker
    !isDevelopment && new WorkboxPlugin.GenerateSW({
      clientsClaim: true,
      skipWaiting: true,
      runtimeCaching: [
        {
          urlPattern: /^https:\/\/api\.newrelic\.com/,
          handler: 'NetworkFirst',
          options: {
            cacheName: 'api-cache',
            expiration: {
              maxEntries: 50,
              maxAgeSeconds: 5 * 60 // 5 minutes
            },
            cacheableResponse: {
              statuses: [0, 200]
            }
          }
        },
        {
          urlPattern: /\.(png|jpg|jpeg|svg|gif)$/,
          handler: 'CacheFirst',
          options: {
            cacheName: 'image-cache',
            expiration: {
              maxEntries: 100,
              maxAgeSeconds: 30 * 24 * 60 * 60 // 30 days
            }
          }
        }
      ]
    }),
    
    // Compression
    !isDevelopment && new CompressionPlugin({
      algorithm: 'gzip',
      test: /\.(js|css|html|svg)$/,
      threshold: 8192,
      minRatio: 0.8
    }),
    
    // Bundle analyzer
    isAnalyze && new BundleAnalyzerPlugin({
      analyzerMode: 'static',
      reportFilename: 'bundle-report.html'
    })
  ].filter(Boolean),
  
  optimization: {
    minimize: !isDevelopment,
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          parse: {
            ecma: 8
          },
          compress: {
            ecma: 5,
            warnings: false,
            comparisons: false,
            inline: 2,
            drop_console: true,
            drop_debugger: true
          },
          mangle: {
            safari10: true
          },
          output: {
            ecma: 5,
            comments: false,
            ascii_only: true
          }
        },
        parallel: true
      }),
      new OptimizeCSSAssetsPlugin({})
    ],
    
    splitChunks: {
      chunks: 'all',
      cacheGroups: {
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          priority: 10
        },
        charts: {
          test: /[\\/](chart-renderers|adaptive-widgets)[\\/]/,
          name: 'charts',
          priority: 5
        },
        common: {
          minChunks: 2,
          priority: -10,
          reuseExistingChunk: true
        }
      }
    },
    
    runtimeChunk: 'single',
    
    moduleIds: 'deterministic'
  },
  
  resolve: {
    extensions: ['.js', '.json'],
    alias: {
      '@': path.resolve(__dirname, '../'),
      '@components': path.resolve(__dirname, '../components'),
      '@utils': path.resolve(__dirname, '../utils'),
      '@services': path.resolve(__dirname, '../services')
    }
  },
  
  devtool: isDevelopment ? 'eval-source-map' : 'source-map',
  
  devServer: {
    contentBase: path.join(__dirname, '../../dist'),
    compress: true,
    hot: true,
    port: 3000,
    historyApiFallback: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true
      },
      '/graphql': {
        target: 'https://api.newrelic.com',
        changeOrigin: true,
        headers: {
          'Api-Key': process.env.NEW_RELIC_API_KEY
        }
      }
    },
    overlay: {
      warnings: true,
      errors: true
    }
  },
  
  performance: {
    hints: !isDevelopment && 'warning',
    maxEntrypointSize: 512000,
    maxAssetSize: 512000
  }
};