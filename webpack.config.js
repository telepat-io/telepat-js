var webpack = require('webpack');
var UglifyJsPlugin = webpack.optimize.UglifyJsPlugin;
var path = require('path');
var env = require('yargs').argv.mode;
var version = require('yargs').argv.version;

var libraryName = 'Telepat';

var definePlugin = new webpack.DefinePlugin({
  __0_3__: JSON.stringify(JSON.parse(version === 0.3))
});
var plugins = [definePlugin];
var outputFile = 'telepat';

if (version) {
  outputFile += version;
}
if (env === 'dev') {
  outputFile += '.js';
} else {
  plugins.push(new UglifyJsPlugin({ minimize: true }));
  outputFile += '.min.js';
}

var config = {
  entry: __dirname + '/src/telepat.js',
  devtool: 'source-map',
  output: {
    path: __dirname + '/lib',
    filename: outputFile,
    library: libraryName,
    libraryTarget: 'umd',
    umdNamedDefine: true
  },
  module: {
    loaders: [
      {
        test: /(\.jsx|\.js)$/,
        loader: 'babel',
        exclude: /(node_modules|bower_components)/
      },
      {
        test: /(\.jsx|\.js)$/,
        loader: 'eslint-loader',
        exclude: /node_modules/
      },
      {
        test: /(\.json)$/,
        loader: 'json-loader'
      }
    ]
  },
  resolve: {
    root: path.resolve('./src'),
    extensions: ['', '.js']
  },
  plugins: plugins
};

module.exports = config;
