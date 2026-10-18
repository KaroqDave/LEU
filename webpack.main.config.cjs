module.exports = {
  entry: './src/main/index.ts',
  devtool: 'source-map',
  module: { rules: require('./webpack.rules.cjs') },
  resolve: { extensions: ['.js', '.ts', '.tsx', '.json'] },
};
