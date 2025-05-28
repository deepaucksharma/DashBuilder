const path = require('path');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  mode: process.env.NODE_ENV || 'production',
  devServer: {
    static: {
      directory: path.join(__dirname, 'dist'),
    },
    compress: true,
    port: 9000,
    hot: true,
    open: true
  },
  entry: {
    'console': './nerdlets/console/index.js',
    'overview': './nerdlets/overview/index.js'
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name]/index.js',
    clean: true
  },
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: [
              '@babel/preset-env',
              ['@babel/preset-react', { runtime: 'automatic' }]
            ]
          }
        }
      },
      {
        test: /\.s?css$/,
        use: [
          MiniCssExtractPlugin.loader,
          'css-loader',
          'sass-loader'
        ]
      },
      {
        test: /\.(png|jpg|jpeg|gif|svg)$/,
        type: 'asset/resource'
      }
    ]
  },
  plugins: [
    new MiniCssExtractPlugin({
      filename: '[name]/styles.css'
    }),
    new HtmlWebpackPlugin({
      template: 'src/index.html',
      chunks: ['console'],
      filename: 'console/index.html'
    }),
    new HtmlWebpackPlugin({
      template: 'src/index.html',
      chunks: ['overview'],
      filename: 'overview/index.html'
    })
  ],
  resolve: {
    extensions: ['.js', '.jsx'],
    alias: {
      '@dashbuilder/shared-components': path.resolve(__dirname, '../shared-components/src'),
      'nr1': path.resolve(__dirname, 'lib/nr1-mock.js')
    }
  },
  externals: {
    'react': 'React',
    'react-dom': 'ReactDOM',
    'prop-types': 'PropTypes'
  }
};