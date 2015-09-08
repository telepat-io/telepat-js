# Change Log
All notable changes to this project will be documented in this file.
This project adheres to [Semantic Versioning](http://semver.org/).

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