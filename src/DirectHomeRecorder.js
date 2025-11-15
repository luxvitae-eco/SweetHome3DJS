/*
 * DirectHomeRecorder.js
 *
 * Sweet Home 3D, Copyright (c) 2024 Space Mushrooms <info@sweethome3d.com>
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program; if not, write to the Free Software
 * Foundation, Inc., 59 Temple Place, Suite 330, Boston, MA  02111-1307  USA
 */

import {
  HomeObject
} from './SweetHome3D';

import { HomeRecorder } from './HomeRecorder';
import {
  URLContent,
  LocalURLContent, HomeURLContent, SimpleURLContent, BlobURLContent,
  LocalStorageURLContent, IndexedDBURLContent,
} from './URLContent';
import { CoreTools } from './CoreTools';
import { UUID } from './core';

/**
 * @typedef {Object} IConfiguration
 * @property {string} readHomeURL
 * @property {string} writeHomeURL
 * @property {string} writeResourceURL
 * @property {string} readResourceURL
 * @property {string} listHomesURL
 * @property {string} deleteHomeURL
 * @property {string} compressionLevel
 * @property {string} writeHomeWithWorker
 */

/**
 * Creates a home recorder able to save homes and its resources directly on server, 
 * in local storage or in indexedDB.
 * @constructor
 * @author Emmanuel Puybaret
 */
export class DirectHomeRecorder extends HomeRecorder {
  /**
   * @type {IConfiguration}
   */
  // configuration;

  /**
   * 
   * @param {IConfiguration} configuration 
   */
  constructor(configuration) {
    super(configuration);
  }

  /**
   * Reads a home with this recorder.
   * @param {string} homeName the home name on the server 
   *                          or the URL of the home if <code>readHomeURL</code> service is missing 
   * @param {{homeLoaded: function, homeError: function, progression: function}} observer  callbacks used to follow the reading of the home 
   */
  readHome(homeName, observer) {
    if (this.configuration.readHomeURL !== undefined) {
      // Replace % sequence by %% except %s before formating readHomeURL with home name 
      let readHomeUrl = CoreTools.format(this.configuration.readHomeURL.replace(/(%[^s])/g, "%$1"), encodeURIComponent(homeName));
      let querySeparator = readHomeUrl.indexOf('?') != -1 ? '&' : '?';
      readHomeUrl += querySeparator + "editionId=" + HomeObject.createId("home");
      homeName = readHomeUrl;
    }
    super.readHome(homeName, observer);
  }

  /**
   * Writes a home instance using <code>writeHomeURL</code> and <code>writeResourceURL</code> URLs in configuration.
   * @param {Home}   home saved home
   * @param {string} homeName the home name on the server 
   * @param {{homeSaved: function, homeError: function}} [observer]  The callbacks used to follow the writing operation of the home
   * @return {abort: function} a function that will abort writing operation if needed 
   */
  writeHome(home, homeName, observer) {
    let localContents = [];
    // Keep only local contents which have to be saved
    this.searchContents(home, [], localContents, (content) => {
      return content instanceof LocalURLContent
        || (content.isJAREntry() && URLContent.fromURL(content.getJAREntryURL()) instanceof LocalURLContent);
    });

    let abortableOperations = [];
    let recorder = this;
    let contentsObserver = {
      contentsSaved: function (savedContentNames) {
        // Search contents included in home
        let homeContents = []
        recorder.searchContents(home, [], homeContents, (content) => {
          return content instanceof HomeURLContent
            || content instanceof SimpleURLContent;
        });

        let savedContentIndex = 0;
        for (let i = 0; i < homeContents.length; i++) {
          let content = homeContents[i];
          if (content instanceof HomeURLContent) {
            let entry = content.getJAREntryName();
            if (entry.indexOf('/') < 0) {
              savedContentNames[content.getURL()] = (++savedContentIndex).toString();
            } else {
              savedContentNames[content.getURL()] = (++savedContentIndex) + entry.substring(entry.indexOf('/'));
            }
          } else if (content instanceof SimpleURLContent
            && content.isJAREntry()
            && URLContent.fromURL(content.getJAREntryURL()) instanceof LocalURLContent) {
            savedContentNames[content.getURL()] = (++savedContentIndex).toString();
          }
        }

        abortableOperations.push(recorder.writeHomeToZip(home, homeName, homeContents, savedContentNames, "blob", {
          homeSaved: function (home, data) {
            let content = new BlobURLContent(data);
            let revokeOperation = {
              abort: function () {
                // Don't keep blob URL in document
                URL.revokeObjectURL(content.getURL());
              }
            };
            abortableOperations.push(
              content.writeBlob(recorder.configuration.writeHomeURL, homeName,
                {
                  blobSaved: function (content, name) {
                    revokeOperation.abort();
                    if (observer != null
                      && observer.homeSaved != null) {
                      observer.homeSaved(home);
                    }
                  },
                  blobError: function (status, error) {
                    revokeOperation.abort();
                    if (observer != null
                      && observer.homeError != null) {
                      observer.homeError(status, error);
                    }
                  }
                }));
            abortableOperations.push(revokeOperation);
          },
          homeError: function (status, error) {
            if (observer != null
              && observer.homeError != null) {
              observer.homeError(status, error);
            }
          }
        }));
      },
      contentsError: function (status, error) {
        if (observer != null
          && observer.homeError != null) {
          observer.homeError(status, error);
        };
      }
    };

    if (this.configuration.writeResourceURL !== undefined
      && this.configuration.readResourceURL !== undefined) {
      abortableOperations.push(this.saveContents(localContents, contentsObserver));
    } else {
      contentsObserver.contentsSaved({});
    }
    return {
      abort: function () {
        for (let i = 0; i < abortableOperations.length; i++) {
          abortableOperations[i].abort();
        }
      }
    };
  }

  /**
   * Saves blob contents which are not saved.
   * @param {Array}  localContents array of possibly unsaved contents
   * @param {contentsSaved: function, contentsError: function} contentsObserver 
               called when contents are saved or if writing fails
   * @return {abort: function} an object containing <code>abort</code> method to abort the write operations  
   * @private 
   */
  saveContents(localContents, contentsObserver) {
    let abortableOperations = {};
    let savedContents = {};
    let savedContentNames = {};
    let autoRecoveryObjectstore = "/Recovery";
    if (this.configuration.autoRecoveryObjectstore !== undefined) {
      autoRecoveryObjectstore = "/" + this.configuration.autoRecoveryObjectstore;
    }
    let recorder = this;
    localContents = localContents.slice(0);
    for (let i = localContents.length - 1; i >= 0; i--) {
      let localContent = localContents[i];
      const localUrlContent = localContent.isJAREntry()
        ? URLContent.fromURL(localContent.getJAREntryURL())
        : localContent;
      if ((!(localUrlContent instanceof LocalStorageURLContent)
        || this.configuration.writeResourceURL.indexOf(LocalStorageURLContent.LOCAL_STORAGE_PREFIX) < 0)
        && (!(localUrlContent instanceof IndexedDBURLContent)
          || this.configuration.writeResourceURL.indexOf(IndexedDBURLContent.INDEXED_DB_PREFIX) < 0)
        || (localUrlContent instanceof IndexedDBURLContent
          && (this.configuration.writeResourceURL.indexOf(IndexedDBURLContent.INDEXED_DB_PREFIX) < 0
            || this.configuration.writeResourceURL.indexOf(autoRecoveryObjectstore) < 0)
          && localUrlContent.getURL().indexOf(autoRecoveryObjectstore) > 0)) {
        if (localUrlContent.getSavedContent() == null
          || localUrlContent.getSavedContent().getURL().indexOf(LocalStorageURLContent.LOCAL_STORAGE_PREFIX) === 0
          && this.configuration.writeResourceURL.indexOf(LocalStorageURLContent.LOCAL_STORAGE_PREFIX) < 0
          || localUrlContent.getSavedContent().getURL().indexOf(IndexedDBURLContent.INDEXED_DB_PREFIX) === 0
          && (this.configuration.writeResourceURL.indexOf(IndexedDBURLContent.INDEXED_DB_PREFIX) < 0
            || this.configuration.writeResourceURL.indexOf(autoRecoveryObjectstore) < 0
            && localUrlContent.getSavedContent().getURL().indexOf(autoRecoveryObjectstore) > 0)) {
          let savedContent = savedContents[localUrlContent.getURL()];
          if (savedContent != null) {
            localUrlContent.setSavedContent(savedContent);
            localContents.splice(i, 1);
          } else {
            localUrlContent.setSavedContent(null); // Prefer to store resource on server if in local storage or indexedDB
            localUrlContent.getBlob({
              localContent: localContent,
              blobReady: function (blob) {
                let extension = "dat";
                if (blob.type == "image/png") {
                  extension = "png";
                } else if (blob.type == "image/jpeg") {
                  extension = "jpg";
                }
                let contentFileName = UUID.randomUUID() + '.' + extension;
                let observer = {
                  handledContent: this.localContent,
                  blobSaved: function (content, contentFileName) {
                    if (content.getSavedContent() == null
                      || content.getSavedContent().getURL().indexOf(IndexedDBURLContent.INDEXED_DB_PREFIX) === 0
                      && (recorder.configuration.writeResourceURL.indexOf(IndexedDBURLContent.INDEXED_DB_PREFIX) < 0
                        || recorder.configuration.writeResourceURL.indexOf(autoRecoveryObjectstore) < 0
                        && content.getSavedContent().getURL().indexOf(autoRecoveryObjectstore) > 0)) {
                      let savedContent = URLContent.fromURL(
                        CoreTools.format(recorder.configuration.readResourceURL.replace(/(%[^s])/g, "%$1"), encodeURIComponent(contentFileName)));
                      content.setSavedContent(savedContent);
                      savedContents[content.getURL()] = savedContent;
                    }
                    savedContentNames[this.handledContent.getURL()] = this.handledContent.isJAREntry()
                      ? "jar:" + content.getSavedContent().getURL() + "!/" + this.handledContent.getJAREntryName()
                      : content.getSavedContent().getURL();
                    delete abortableOperations[contentFileName];
                    localContents.splice(localContents.lastIndexOf(this.handledContent), 1);
                    if (localContents.length === 0) {
                      contentsObserver.contentsSaved(savedContentNames);
                    }
                  },
                  blobError: function (status, error) {
                    contentsObserver.contentsError(status, error);
                  }
                };

                abortableOperations[contentFileName] = localUrlContent.writeBlob(recorder.configuration.writeResourceURL, contentFileName, observer);
              },
              blobError: function (status, error) {
                contentsObserver.contentsError(status, error);
              }
            });
          }
        } else {
          savedContentNames[localContent.getURL()] = localContent.isJAREntry()
            ? "jar:" + localUrlContent.getSavedContent().getURL() + "!/" + localContent.getJAREntryName()
            : localUrlContent.getSavedContent().getURL();
          localContents.splice(i, 1);
        }
      } else {
        localContents.splice(i, 1);
      }
    }

    if (localContents.length === 0) {
      contentsObserver.contentsSaved(savedContentNames);
    }
    return {
      abort: function () {
        for (let i in abortableOperations) {
          abortableOperations[i].abort();
        }
      }
    };
  }

  /**
   * Requests the available homes on server.
   * @param {availableHomes: function, homesError: function} observer
   * @return {abort: function} a function that will abort request 
   *                           or <code>null</code> if no request was performed  
   */
  getAvailableHomes(observer) {
    if (this.configuration.listHomesURL !== undefined) {
      let url = this.configuration.listHomesURL;
      if (url.indexOf(LocalStorageURLContent.LOCAL_STORAGE_PREFIX) === 0) {
        // Parse URL of the form localstorage:regExpWithCapturingGroup
        let path = url.substring(url.indexOf(LocalStorageURLContent.LOCAL_STORAGE_PREFIX) + LocalStorageURLContent.LOCAL_STORAGE_PREFIX.length);
        var regExp = new RegExp(path.indexOf('?') > 0 ? path.substring(0, path.indexOf('?')) : path);
        let propertyNames = Object.getOwnPropertyNames(localStorage);
        let homes = [];
        for (let i = 0; i < propertyNames.length; i++) {
          let tags = propertyNames[i].match(regExp);
          if (tags) {
            homes.push(tags.length > 1 ? tags[1] : tags[0]);
          }
        }
        observer.availableHomes(homes);
        return { abort: function () { } };
      } else if (url.indexOf(IndexedDBURLContent.INDEXED_DB_PREFIX) === 0) {
        // Parse URL of the form indexeddb://database/objectstore?keyPathField=regExpWithCapturingGroup
        let databaseNameIndex = url.indexOf(IndexedDBURLContent.INDEXED_DB_PREFIX) + IndexedDBURLContent.INDEXED_DB_PREFIX.length;
        let firstPathSlashIndex = url.indexOf('/', databaseNameIndex);
        let questionMarkIndex = url.indexOf('?', firstPathSlashIndex + 1);
        let equalIndex = url.indexOf('=', questionMarkIndex + 1);
        let ampersandIndex = url.indexOf('&', equalIndex + 1);
        let databaseName = url.substring(databaseNameIndex, firstPathSlashIndex);
        let objectStore = url.substring(firstPathSlashIndex + 1, questionMarkIndex);
        let keyPathField = url.substring(questionMarkIndex + 1, equalIndex);
        var regExp = new RegExp(url.substring(equalIndex + 1, ampersandIndex > 0 ? ampersandIndex : url.length));

        let databaseUpgradeNeeded = ev => {
          let database = ev.target.result;
          if (!database.objectStoreNames.contains(objectStore)) {
            database.createObjectStore(objectStore, { keyPath: keyPathField });
          }
        };
        let databaseError = ev => {
          if (observer.homesError !== undefined) {
            observer.homesError(ev.target.errorCode, "Can't connect to database " + databaseName);
          }
        };
        let databaseSuccess = ev => {
          let database = ev.target.result;
          try {
            if (!database.objectStoreNames.contains(objectStore)) {
              // Reopen the database to create missing object store  
              database.close();
              let requestUpgrade = indexedDB.open(databaseName, database.version + 1);
              requestUpgrade.addEventListener("upgradeneeded", databaseUpgradeNeeded);
              requestUpgrade.addEventListener("error", databaseError);
              requestUpgrade.addEventListener("success", databaseSuccess);
            } else {
              let transaction = database.transaction(objectStore, 'readonly');
              let store = transaction.objectStore(objectStore);
              let query;
              if (IDBObjectStore.prototype.getAllKeys !== undefined) {
                query = store.getAllKeys();
                query.addEventListener("success", (ev) => {
                  let homes = [];
                  for (let i = 0; i < ev.target.result.length; i++) {
                    let tags = ev.target.result[i].match(regExp);
                    if (tags) {
                      homes.push(tags.length > 1 ? tags[1] : tags[0]);
                    }
                  }
                  observer.availableHomes(homes);
                });
              } else {
                query = store.openCursor();
                let homes = [];
                query.addEventListener("success", (ev) => {
                  let cursor = ev.target.result;
                  if (cursor != null) {
                    let tags = cursor.primaryKey.match(regExp);
                    if (tags) {
                      homes.push(tags.length > 1 ? tags[1] : tags[0]);
                    }
                    cursor["continue"]();
                  } else {
                    observer.availableHomes(homes);
                  }
                });
              }
              query.addEventListener("error", (ev) => {
                if (observer.homesError !== undefined) {
                  observer.homesError(ev.target.errorCode, "Can't query in " + objectStore);
                }
              });
              transaction.addEventListener("complete", (ev) => {
                database.close();
              });
            }
          } catch (ex) {
            if (observer.homesError !== undefined) {
              observer.homesError(ex, ex.message);
            }
          }
        };

        if (indexedDB != null) {
          var request = indexedDB.open(databaseName);
          request.addEventListener("upgradeneeded", databaseUpgradeNeeded);
          request.addEventListener("error", databaseError);
          request.addEventListener("success", databaseSuccess);
        } else if (observer.homesError !== undefined) {
          observer.homesError(new Error("indexedDB"), "indexedDB unavailable");
        }
        return { abort: function () { } };
      } else {
        var request = new XMLHttpRequest();
        let querySeparator = url.indexOf('?') != -1 ? '&' : '?';
        request.open("GET", url + querySeparator + "requestId=" + UUID.randomUUID(), true);
        request.addEventListener("load", (ev) => {
          if (request.readyState === XMLHttpRequest.DONE
            && request.status === 200) {
            observer.availableHomes(JSON.parse(request.responseText));
          } else if (observer.homesError !== undefined) {
            observer.homesError(request.status, request.responseText);
          }
        });
        if (observer.homesError !== undefined) {
          let errorListener = ev => {
            observer.homesError(0, ev);
          };
          request.addEventListener("error", errorListener);
          request.addEventListener("timeout", errorListener);
        }
        request.send();
        return request;
      }
    } else {
      return null;
    }
  }

  /**
   * Deletes on server a home from its name.
   * @param {string} homeName
   * @param {homeDeleted: function, homeError: function} observer
   * @return {abort: function} a function that will abort deletion 
   *                           or <code>null</code> if no deletion was performed  
   */
  deleteHome(homeName, observer) {
    if (this.configuration.deleteHomeURL !== undefined) {
      let url = CoreTools.format(this.configuration.deleteHomeURL.replace(/(%[^s])/g, "%$1"), encodeURIComponent(homeName));
      if (url.indexOf(LocalStorageURLContent.LOCAL_STORAGE_PREFIX) === 0) {
        // Parse URL of the form localstorage:key
        let path = url.substring(url.indexOf(LocalStorageURLContent.LOCAL_STORAGE_PREFIX) + LocalStorageURLContent.LOCAL_STORAGE_PREFIX.length);
        let storageKey = decodeURIComponent(path.indexOf('?') > 0 ? path.substring(0, path.indexOf('?')) : path);
        localStorage.removeItem(storageKey);
        observer.homeDeleted(homeName);
        return { abort: function () { } };
      } else if (url.indexOf(IndexedDBURLContent.INDEXED_DB_PREFIX) === 0) {
        // Parse URL of the form indexeddb://database/objectstore?keyPathField=key
        let databaseNameIndex = url.indexOf(IndexedDBURLContent.INDEXED_DB_PREFIX) + IndexedDBURLContent.INDEXED_DB_PREFIX.length;
        let firstPathSlashIndex = url.indexOf('/', databaseNameIndex);
        let questionMarkIndex = url.indexOf('?', firstPathSlashIndex + 1);
        let equalIndex = url.indexOf('=', questionMarkIndex + 1);
        let ampersandIndex = url.indexOf('&', equalIndex + 1);
        let databaseName = url.substring(databaseNameIndex, firstPathSlashIndex);
        let objectStore = url.substring(firstPathSlashIndex + 1, questionMarkIndex);
        let keyPathField = url.substring(questionMarkIndex + 1, equalIndex);
        let key = decodeURIComponent(url.substring(equalIndex + 1, ampersandIndex > 0 ? ampersandIndex : url.length));

        let databaseUpgradeNeeded = ev => {
          let database = ev.target.result;
          if (!database.objectStoreNames.contains(objectStore)) {
            database.createObjectStore(objectStore, { keyPath: keyPathField });
          }
        };
        let databaseError = ev => {
          if (observer.homeError !== undefined) {
            observer.homeError(ev.target.errorCode, "Can't connect to database " + databaseName);
          }
        };
        let databaseSuccess = ev => {
          let database = ev.target.result;
          try {
            if (!database.objectStoreNames.contains(objectStore)) {
              // Reopen the database to create missing object store  
              database.close();
              let requestUpgrade = indexedDB.open(databaseName, database.version + 1);
              requestUpgrade.addEventListener("upgradeneeded", databaseUpgradeNeeded);
              requestUpgrade.addEventListener("error", databaseError);
              requestUpgrade.addEventListener("success", databaseSuccess);
            } else {
              let transaction = database.transaction(objectStore, 'readwrite');
              let store = transaction.objectStore(objectStore);
              let query = store["delete"](key);
              query.addEventListener("error", (ev) => {
                if (observer.homeError !== undefined) {
                  observer.homeError(ev.target.errorCode, "Can't delete in " + objectStore);
                }
              });
              query.addEventListener("success", (ev) => {
                observer.homeDeleted(homeName);
              });
              transaction.addEventListener("complete", (ev) => {
                database.close();
              });
            }
          } catch (ex) {
            if (observer.homeError !== undefined) {
              observer.homeError(ex, ex.message);
            }
          }
        };

        if (indexedDB != null) {
          var request = indexedDB.open(databaseName);
          request.addEventListener("upgradeneeded", databaseUpgradeNeeded);
          request.addEventListener("error", databaseError);
          request.addEventListener("success", databaseSuccess);
        } else if (observer.homeError !== undefined) {
          observer.homeError(new Error("indexedDB"), "indexedDB unavailable");
        }
        return { abort: function () { } };
      } else {
        // Replace % sequence by %% except %s before formating readHomeURL with home name 
        if (url.indexOf("?") > 0) {
          url += "&requestId=" + UUID.randomUUID();
        }
        var request = new XMLHttpRequest();
        request.open("GET", url, true);
        request.addEventListener("load", (ev) => {
          if (request.readyState === XMLHttpRequest.DONE
            && request.status === 200) {
            observer.homeDeleted(homeName);
          } else if (observer.homeError !== undefined) {
            observer.homeError(request.status, request.responseText);
          }
        });
        if (observer.homeError !== undefined) {
          let errorListener = ev => {
            observer.homeError(0, ev);
          };
          request.addEventListener("error", errorListener);
          request.addEventListener("timeout", errorListener);
        }
        request.send();
        return request;
      }
    } else {
      return null;
    }
  }
}
