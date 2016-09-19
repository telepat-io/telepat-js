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

A simple usage example:

```js
let telepat = new Telepat();
telepat.connect({
 apiEndpoint: 'TELEPAT-API-ENDPOINT',
 socketEndpoint: 'TELEPAT-SOCKET-ENDPOINT',
 apiKey: 'APP-API-KEY',
 appId: 'APP-ID'
}, (err, res) => {
 if (err) {
   // Treat connection error
   console.log(err);
   return;
 }

 // Display all collections
 console.log(telepat.collections);

 // Login, display and update user data
 telepat.on('login', () => {
   console.log(telepat.user.data);
   telepat.user.data.change = true;
 });
 telepat.user.login('user', 'pass');

 // Subscribe to data
 let articleChannel = telepat.subscribe({
   channel: {
     context: 'collection-identifier',
     model: 'article'
   }
 }, () => {
   console.log(articleChannel.objectsArray);
   articleChannel.objects['object-identifier'].title = 'new title';

   articleChannel.on('update', (operationType, objectId, object, oldObject) => {
     // Update interface on data updates
   });
 });
});
```

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
