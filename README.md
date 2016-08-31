[![NPM](https://img.shields.io/npm/v/telepat-js.svg)](https://www.npmjs.com/package/telepat-js) ![Bower](https://img.shields.io/bower/v/telepat-js.svg) [![David](https://img.shields.io/david/telepat-io/telepat-js.svg)](https://david-dm.org/telepat-io/telepat-js)

# Telepat Javascript Client

UMD client for Telepat, using [Webpack](https://webpack.github.io/) to run in browsers.
Available on [GitHub](https://github.com/telepat-io/telepat-js).

[Telepat](http://telepat.io) is an open-source backend stack, designed to deliver information and information updates in real-time to clients, while allowing for flexible deployment and simple scaling. Read more about how it works and why it's different [here](http://docs.telepat.io).

## Installing

- `bower install telepat-js`, if you're using Bower
- `npm install telepat-js`, if you're using NPM
- or the classic `<script src="lib/telepat.js"></script>`

## Learning

Documentation is available [here](http://docs.telepat.io/js-sdk.html), and you can check out a simple demo [here](https://github.com/telepat-io/telepat-demo).

Read on about working with the library:

- [Telepat](http://docs.telepat.io/telepat-js/lib/telepat.js.html)
- [Channel](http://docs.telepat.io/telepat-js/lib/channel.js.html)
- [User](http://docs.telepat.io/telepat-js/lib/user.js.html)
- [Admin](http://docs.telepat.io/telepat-js/lib/admin.js.html)

## Building from source

Clone [the repo](https://github.com/telepat-io/telepat-js), then run `npm install`. After editing the sources in the /src directory, run `npm run build-all` to compile the libraries, and `npm run docs` to generate the documentation.

## License

Released under the [Apache 2 License](http://www.apache.org/licenses/LICENSE-2.0).

## Credits

Telepat is built on top of the following awesome libraries:

- [crypto-js](https://github.com/brix/crypto-js)
- [jsondiffpatch](https://github.com/benjamine/jsondiffpatch)
- [loglevel](https://github.com/pimterry/loglevel)
- [pouchdb](https://github.com/pouchdb/pouchdb)
- [socket.io-client](https://github.com/automattic/socket.io-client)
- [superagent](https://github.com/visionmedia/superagent)
