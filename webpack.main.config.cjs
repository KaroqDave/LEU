module.exports = (_env, { mode }) => ({
  entry: './src/main/index.ts',
  devtool: mode === 'production' ? false : 'source-map',
  module: { rules: require('./webpack.rules.cjs') },
  resolve: { extensions: ['.js', '.ts', '.tsx', '.json'] },
});
