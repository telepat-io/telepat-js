var webpack = require('webpack');
var UglifyJsPlugin = webpack.optimize.UglifyJsPlugin;
var path = require('path');
var env = require('yargs').argv.mode;
var version = require('yargs').argv.version;
var nodeExternals = require('webpack-node-externals');

if (!version) {
  version = 'client';
}

var plugins = [
  new webpack.ContextReplacementPlugin(/.*/, path.resolve(__dirname, 'node_modules', 'jsondiffpatch'), {
    '../package.json': './package.json',
    './formatters': './src/formatters/index.js',
    './console': './src/formatters/console.js'
  })
];
var outputFile = `telepat.${version}`;

plugins.push(new webpack.DefinePlugin({ 'global.GENTLY': false }));

if (env === 'dev') {
  outputFile += '.js';
} else {
  plugins.push(new UglifyJsPlugin({ minimize: true }));
  outputFile += '.min.js';
}

var config = {
  entry: __dirname + '/src/telepat.js',
  target: version === 'server' ? 'node' : 'web',
  devtool: 'source-map',
  output: {
    path: __dirname + '/lib',
    filename: outputFile,
    library: 'Telepat',
    libraryTarget: 'umd',
    umdNamedDefine: true
  }, 
  externals:  version === 'server'? {
    'pouchdb':"pouchdb",
    'leveldown':"leveldown"
  } : {},
  module: {
    loaders: [
      {
        test: /(\.js)$/,
        loader: 'babel',
        exclude: /(node_modules|bower_components)/
      },
      {
        test: /(\.js)$/,
        loader: 'eslint-loader',
        exclude: /node_modules/
      },
      {
        test: /(\.json)$/,
        loader: 'json'
      }
    ]
  },
  resolve: {
    root: path.resolve('./src'),
    extensions: ['', '.js', '.json'],
    alias: {
      '../package.json': './node_modules/jsondiffpatch/package.json'
    }
  },
  node: {
    __dirname: true
  },
  plugins: plugins,
};

module.exports = config;
