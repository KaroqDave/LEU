const MiniCssExtractPlugin = require('mini-css-extract-plugin');

module.exports = {
  devtool: 'source-map',
  module: {
    rules: [
      ...require('./webpack.rules.cjs'),
      { test: /\.css$/, use: [MiniCssExtractPlugin.loader, 'css-loader'] },
      { test: /\.svg$/i, type: 'asset/resource' },
    ],
  },
  plugins: [new MiniCssExtractPlugin({ filename: '[name].css' })],
  output: { publicPath: '/' },
  resolve: { extensions: ['.js', '.ts', '.tsx', '.json'] },
};
