import EventObject from './event';
import API from './api';
import log from './logger';
import error from './error';

/**
 * Use Channels to create, update and remove Telepat objects. You can create new Channels using the {@link #Telepat#subscribe subscribe}
 * or the {@link #Telepat#getChannel getChannel} methods of the main {@link Telepat} object.
 *
 * @class Channel
 *
 * @example
 * let articleChannel = telepat.subscribe({
 *  channel: {
 *    context: 'context-unique-identifier',
 *    model: 'article'
 *  }
 * }, () => {
 *  console.log(articleChannel.objectsArray);
 *
 *  // Create a new article object
 *  articleChannel.objects['new'] = {
 *    title: 'New article',
 *    text: 'Article body'
 *  };
 *
 *  // Update a specific article
 *  articleChannel.objects['article-unique-id'].title = 'New title';
 *
 *  // Delete a specific article
 *  delete articleChannel.objects['article-unique-id'];
 *
 *  // React to object updates
 *  articleChannel.on('update', (operationType, objectId, object, oldObject) => {
 *    console.log(`Received article update of type ${operationType}, for object with id ${objectId}`);
 *    // Objects are already updated
 *    console.log(articleChannel.objects);
 *  });
 *
 *  // Unsubscribe and clear objects
 *  articleChannel.unsubscribe();
 * });
 */
export default class Channel {
  constructor(monitor, options, addCallback = null, updateCallback = null, removeCallback = null) {
    this._event = new EventObject(log);
    this._monitor = monitor;
    this._options = options;
    this._addCallback = addCallback;
    this._updateCallback = updateCallback;
    this._removeCallback = removeCallback;

    /**
     * A container object referencing all of the objects retrieved via subscription. Each object is stored on a key equal to its own unique id.
     * @type {Object}
     * @memberof Channel
     * @instance
     */
    this.objects = {};
    /**
     * A container array referencing all of the objects retrieved via subscription. The order of the objects reflects the sorting options set for the channel.
     * @type {Array<Object>}
     * @memberof Channel
     * @instance
     */
    this.objectsArray = [];
    /**
     * The current object count.
     * @type {number|null}
     * @memberof Channel
     * @instance
     */
    this.objectsCount = null;
  }

  _sortObjectArray() {
    if (this._options.sort) {
      this.objectsArray.sort((a, b) => {
        let result = null;

        Object.keys(this._options.sort).map(key => {
          let order = this._options.sort[key];
          let factor = (order === 'asc') ? 1 : -1;

          if (a[key] && !b[key]) {
            result = factor;
          }
          if (!a[key] && b[key]) {
            result = -factor;
          }
          if (a[key] && b[key]) {
            if (a[key] < b[key]) {
              result = -factor;
            }
            if (a[key] > b[key]) {
              result = factor;
            }
          }
        });

        if (!result) {
          return 0;
        }
        return result;
      });
    }
  }

/**
 * Call this function to perform the actual subscribe for the configured channel. This is usually invoked by the
 * {@link #Telepat#subscribe subscribe} method on the main {@link Telepat} object.
 *
 * @param {TelepatCallback} callback Callback invoked after subscribe is finished
 */
  subscribe(callback = () => {}) {
    API.call('object/subscribe',
    this._options,
    (err, res) => {
      if (err) {
        this._event.emit('error', error('Subscribe failed with error: ' + err));
        callback(err, null);
      } else {
        var i;

        for (i = 0; i < res.body.content.length; i++) {
          this.objects[res.body.content[i].id] = res.body.content[i];
        }
        this.objectsArray = res.body.content;
        this._sortObjectArray();
        var objectKeys = Object.keys(this.objects);

        for (i = 0; i < objectKeys.length; i++) {
          this.objects[objectKeys[i]].$$event = new EventObject(log);
        }
        this._monitor.add(
          this._options,
          this.objects,
          this._event,
          this._addCallback || this.add.bind(this),
          this._removeCallback || this.remove.bind(this),
          this._updateCallback || this.update.bind(this)
        );
        this._event.on('update', (operation, parentId, parentObject, delta) => {
          if (operation === 'add') {
            this.objectsArray.push(parentObject);
            this._sortObjectArray();
            if (this.objectsCount) {
              this.objectsCount++;
            }
          } else if (operation === 'delete') {
            this.objectsArray = this.objectsArray.filter(object => {
              return object.id !== parentId;
            });
            this._sortObjectArray();
            if (this.objectsCount) {
              this.objectsCount--;
            }
          }
        });
        this._event.emit('subscribe');
        callback(null, this);
      }
    });
  }

/**
 * Call this function to unsubscribe from the configured channel. All channel properties will be reset to original values.
 *
 * @param {TelepatCallback} callback Callback invoked after unsubscribe is finished
 */
  unsubscribe(callback = () => {}) {
    API.call('object/unsubscribe',
      this._options,
      err => {
        if (err) {
          this._event.emit('error', error('Unsubscribe failed with error: ' + err));
          callback(err, null);
        } else {
          this.objects = {};
          this.objectsArray = [];
          this.objectsCount = null;
          this._monitor.remove(this._options);
          this._event.emit('unsubscribe');
          this._event.emit('_unsubscribe');
          callback(null, this);
        }
      });
  }

  /**
   * Call this to retrieve the number of objects available for this channel. Value will be available on the {@link #ChannelobjectsCount objectsCount} property.
   *
   * @param  {TelepatCallback} callback Callback invoked after getting object count is finished
   */
  getCount(callback = () => {}) {
    API.call('object/count',
      this._options,
      (err, res) => {
        if (err) {
          this._event.emit('error', error('Get object count failed with error: ' + err));
          callback(err, null);
        } else {
          this.objectsCount = res.body.content.count;
          callback(null, this.objectsCount);
        }
      });
  }

/**
 * Add a new Telepat object to the current channel.
 * Instead of using this function, you can also add the object to {@link #Channelobjects Channel.objects}, on any new key.
 * The key will be automatically replaced with the new object id after the backend processes the operation.
 *
 * @param {Object} object The new object to add
 * @param {TelepatCallback} callback Callback invoked after notifying the Telepat backend of the new object
 *
 * @example
 * // This is one way of adding a new object using the channel instance.
 * // The new key will be picked up by the monitoring system, which will signal the new event creation
 * //   to the Telepat backend, and then delete the new key you just set from the objects property.
 * // After processing the request, Telepat will signal the change back to the client, and the new object will be
 * //   re-added to the objects property, but this time on the right key (equal to the new object's assigned id).
 * //   This is when the 'update' event will get triggered on the channel.
 * channel.objects['new'] = newObject;
 *
 * // Alternatively, you can call the add method:
 * channel.add(newObject, err => {
 *  if (err) {
 *    // There's been a server error, check err. The object will not be added.
 *  } else {
 *    // We've successfully signaled that we want to add the object.
 *    // Keep in mind that this is not a sync process, so we still have to wait for the 'update'
 *    //   event on the channel, signaling the availability of the new object on the channel.objects property.
 *  }
 * });
 */
  add(object, callback = () => {}) {
    API.call('object/create',
      {
        model: this._options.channel.model,
        context: this._options.channel.context || object.context_id,
        content: object
      },
      err => {
        if (err) {
          this._event.emit('error', error('Adding object failed with error: ' + err));
          callback(err, null);
        } else {
          callback(null, object);
        }
      });
  }

/**
 * Remove a Telepat object from the current channel.
 * Instead of using this function, you can also delete the object from {@link #Channelobjects Channel.objects}.
 *
 * @param {string} id The id of the object to delete
 * @param {TelepatCallback} callback Callback invoked after notifying the Telepat backend of the deleted object
 *
 * @example
 * // This is one way of deleting an object using the channel instance.
 * // The deleted key will be picked up by the monitoring system, which will signal the object removal
 * //   to the Telepat backend. The change will be then signaled back to the client as confirmation, triggering
 * //   the channel's 'update' event.
 * // This is the optimistic way of doing a delete, as the removed object will be instantly gone from the local
 * //   state, before the 'update' event is triggered (and even if it is not).
 * delete channel.objects[objectId];
 *
 * // Alternatively, the pessimistic approach is to call the remove method:
 * channel.remove(objectId, err => {
 *  if (err) {
 *    // There's been a server error, check err. The object will not be deleted.
 *  } else {
 *    // We've successfully signaled that we want to delete the object.
 *    // Keep in mind that this is not a sync process, so we still have to wait for the 'update'
 *    //   event on the channel, signaling that the object has been removed from the channel.objects property.
 *  }
 * });
 */
  remove(id, callback = () => {}) {
    API.del('object/delete',
      {
        model: this._options.channel.model,
        context: this._options.channel.context || this.objects[id].context_id,
        id: id
      },
      err => {
        if (err) {
          this._event.emit('error', error('Removing object failed with error: ' + err));
          callback(err, null);
        } else {
          callback(null, id);
        }
      });
  }

/**
 * Updates a Telepat object from the current channel.
 * To call this function, you need to create an  array containing 'patch' objects, representing the
  modifications that need to be persisted. The structure of a patch object is:
 *
 * `{'op': 'replace', 'path': channel + '/' + object_id + '/' + object_property, 'value': modified_value}`
 *
 * Instead of using this function, you can also update the object directly from {@link #Channelobjects Channel.objects}.
 *
 * @param {number} id The id of the object to update
 * @param {Array<Object>} patches The array of patches representing the modifications that need to be persisted.
 * @param {TelepatCallback} callback Callback invoked after notifying the Telepat backend of the updated object
 *
 * @example
 * // This is one way of updating an object using the channel instance.
 * // The updated key will be picked up by the monitoring system, which will signal the object update
 * //   to the Telepat backend. The change will be then signaled back to the client as confirmation, triggering
 * //   the channel's 'update' event.
 * // This is the optimistic way of doing a delete, as the updated object will be instantly modified within the local
 * //   state, before the 'update' event is triggered (and even if it is not).
 * channel.objects[objectId].title = "New title";
 *
 * // Alternatively, the pessimistic approach is to call the update method:
 * channel.update(objectId, [
 *  {
 *    'op': 'replace',
 *    'path': `article/${objectId}/title`,
 *    'value': 'New title'
 *  }
 * ], err => {
 *  if (err) {
 *    // There's been a server error, check err. The object will not be updated.
 *  } else {
 *    // We've successfully signaled that we want to update the object.
 *    // Keep in mind that this is not a sync process, so we still have to wait for the 'update'
 *    //   event on the channel, signaling that the object has been updated within the channel.objects property.
 *  }
 * });
 */
  update(id, patches, callback = () => {}) {
    API.call('object/update',
      {
        model: this._options.channel.model,
        context: this._options.channel.context || this.objects[id].context_id,
        id: id,
        patches: patches
      },
      err => {
        if (err) {
          this._event.emit('error', error('Updating object failed with error: ' + err));
        } else {
        }
      });
  }

/**
 * Invoked when there was an error processing the requested operation.
 *
 * @event error
 * @type {Error}
 */
/**
 * Invoked when channel subscription is successful.
 *
 * @event subscribe
 */
/**
 * Invoked when channel unsubscription is successful.
 *
 * @event unsubscribe
 */
/**
 * Invoked when objects in the subscription have been modified (there was an update of an existing object, a new object has been added or an object has been deleted).
 *
 * @event update
 * @param {string} eventType One of 'add', 'delete' or 'replace'
 * @param {string} objectId The id of the affected object
 * @param {Object} object The affected object itself
 * @param {Object} oldObject Present only for the 'replace' eventType, the old state of the affected object
 */

/**
 * Call this function to add callbacks to be invoked on event triggers.
 * Available callbacks:
 *
 * | Name                                               | Description           |
 * | -------------------------------------------------- | --------------------- |
 * | {@link #Channel.event:error error}                 | Invoked when there was an error processing the requested operation |
 * | {@link #Channel.event:subscribe subscribe}         | Invoked when channel subscription is successful |
 * | {@link #Channel.event:unsubscribe unsubscribe}     | Invoked when channel unsubscription is successful |
 * | {@link #Channel.event:update update}               | Invoked when objects in the subscription have been modified (update of an existing object, new object or deleted object) |
 *
 * @param {string} name The name of the event to associate the callback with
 * @param {function} callback The callback to be executed
 * @return {number} A callback id. Save this in order to later remove the callback from the event (using {@link #Channel#removeCallback removeCallback})
 * @example
 * // React to object updates
 *  articleChannel.on('update', (operationType, objectId, object, oldObject) => {
 *    console.log(`Received article update of type ${operationType}, for object with id ${objectId}`);
 *    // Objects are already updated
 *    console.log(articleChannel.objects);
 *  });
 */
  on(name, callback) {
    return this._event.on(name, callback);
  }

  /**
   * Call this function to remove callbacks that have been set using {@link #Channel#on on}.
   *
   * @param {string} name The name of the event the callback was associated with
   * @param {number} callbackId The callback id returned by calling {@link #Channel#on on}
   * @example
   * let updateCallbackId = channel.on('update', () => {
   *  // Remove the callback after the first update event
   *  channel.removeCallback(updateCallbackId);
   * });
   */
  removeCallback(name, index) {
    return this._event.removeCallback(name, index);
  };
};
