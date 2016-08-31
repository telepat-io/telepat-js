# Change Log
All notable changes to this project will be documented in this file.
This project adheres to [Semantic Versioning](http://semver.org/).

## [0.5.0] - 2016-06-31
### Changed
- New codebase, using ES6 and Webpack
- New documentation available

## [0.4.0] - 2016-05-30
### Changed
- Updated API endpoint URLs for Telepat v0.4.0
- Fixed subscription event issues

## [0.2.5] - 2016-02-29
### Changed
- Updated API endpoint URLs for Telepat v0.2.9
- Fixed authentication methods

## [0.2.2] - 2015-09-24
### Changed
- When logging in with Facebook, the client will first register a new user, if needed
- Fixed example app

## [0.2.1] - 2015-09-22
### Changed
- Fixed an issue that was preventing proper admin login
- Changed pouchdb dir location

## [0.2.0] - 2015-09-08
### Added
- This change log
- Channels now allow user filtering
- Sending timestamp-generated UDID

### Changed
- Refactored Telepat as class instead of object
- Set the X-BLGREQ-UDID header to a non-empty string default, since some browsers ignore empty headers
- `admin/users` method changed to GET
- Fixed issue with multiple subscriptions
- Moved monitoring to separate class
- Fixes to admin and user functionality

### Removed
- Remove long text diffing, for now
