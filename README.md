# Telepat Javascript Client

version: 0.1.1

UMD client for Telepat, using [Browserify](http://browserify.org) to run in browsers.
Available on [GitHub](https://github.com/telepat-io/telepat-js).

[Telepat](http://telepat.io) is an open-source backend stack, designed to deliver information and information updates in real-time to clients, while allowing for flexible deployment and simple scaling. Read more about how it works and why it's different [here](http://docs.telepat.io).

## Installing

- `bower install telepat-js`, if you're using Bower
- `npm install telepat-js`, if you're using NPM
- or the classic `<script src="dist/telepat.js"></script>`

## Learning

Documentation is available [here](http://docs.telepat.io/js-sdk.html), and you can check out a simple demo in the `example` folder.

Read on about working with the library:

- [Telepat](http://docs.telepat.io/javascript-sdk/lib/telepat.js.html)
- [Channel](http://docs.telepat.io/javascript-sdk/lib/channel.js.html)

## Building from source

Clone this repo, then run `npm install`. After that, you can build the project using `gulp build`.

## License

Released under the [MIT License](http://www.opensource.org/licenses/mit-license.php).

## Credits

Telepat is built on top of the following awesome libraries:

- [crypto-js](https://github.com/brix/crypto-js)
- [jsondiffpatch](https://github.com/benjamine/jsondiffpatch)
- [loglevel](https://github.com/pimterry/loglevel)
- [pouchdb](https://github.com/pouchdb/pouchdb)
- [socket.io-client](https://github.com/automattic/socket.io-client)
- [superagent](https://github.com/visionmedia/superagent)