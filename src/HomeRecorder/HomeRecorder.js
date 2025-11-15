/*
 * HomeRecorder.js
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
import JSZip from 'jszip';
import { SAXParser } from '@flyskypie/xml-sax-parser';

import { HomeXMLHandler, XMLWriter, HomeXMLExporter } from '../SweetHome3D';

import { ContentDigestManager } from '../ContentDigestManager';
import { StringWriter, UUID } from '../core';
import {
  LocalStorageURLContent, BlobURLContent,
  HomeURLContent, IndexedDBURLContent, LocalURLContent,
  SimpleURLContent, URLContent,
  OperatingSystem,
} from '../URLContent';
import { CoreTools } from '../CoreTools';
import { ZIPTools } from '../URLContent';

import WriteHomeWorker from './WriteHomeWorker?worker';

/**
 * @typedef {Object} IConfiguration
 * @property {string} writeCacheResourceURL
 * @property {string} readCacheResourceURL
 * @property {string} listCacheResourcesURL
 * @property {string} compressionLevel
 * @property {string} includeAllContent
 * @property {string} writeDataType
 * @property {string} writeHomeWithWorker
 */

/**
 * Creates a home recorder able to read homes from URLs.
 * @class
 * @property {IConfiguration} configuration the recorder configuration
 * @author Emmanuel Puybaret
 */
export class HomeRecorder {
  /**
   * @type {IConfiguration}
   * @protected
   */
  // configuration = undefined;

  /**
   * @constructor
   * @param {IConfiguration} configuration the recorder configuration
   */
  constructor(configuration) {
    this.configuration = configuration !== undefined ? configuration : {};
  }

  /**
   * Reads a home instance from its <code>url</code>.
   * @param {string} url  URL of the read home
   * @param {{homeLoaded: function, homeError: function, progression: function}} observer  The callbacks used to follow the reading of the home 
            (only <code>homeLoaded</code> is mandatory)
   */
  readHome(url, observer) {
    if (observer.progression !== undefined) {
      observer.progression(HomeRecorder.READING_HOME, url, 0);
    }
    // XML entry where home data is stored is Home.xml, except if url starts with jar: to specify another entry name 
    let homeEntryName = "Home.xml";
    if (url.indexOf("jar:") === 0) {
      let entrySeparatorIndex = url.indexOf("!/");
      homeEntryName = url.substring(entrySeparatorIndex + 2);
      url = url.substring(4, entrySeparatorIndex);
    }
    let recorder = this;

    ZIPTools.getZIP(url, {
      zipReady: function (zip) {
        try {
          let homeXmlEntry = zip.file(homeEntryName);
          if (homeXmlEntry !== null) {
            // An observer which will replace home contents by permanent content or content in cache if it exists
            let contentObserver = {
              homeLoaded: function (home) {
                recorder.replaceHomeContents(home, url, observer);
              },
              homeError: function (error) {
                if (observer.homeError !== undefined) {
                  observer.homeError(error);
                }
              },
              progression: function (part, info, percentage) {
                if (observer.progression !== undefined) {
                  observer.progression(percentage);
                }
              }
            };
            recorder.parseHomeXMLEntry(homeXmlEntry, zip, url, typeof ContentDigestManager === "undefined"
              ? observer : contentObserver);
          } else {
            this.zipError(new Error("No " + homeEntryName + " entry in " + url));
          }
        } catch (ex) {
          this.zipError(ex);
        }
      },
      zipError: function (error) {
        if (observer.homeError !== undefined) {
          observer.homeError(error);
        }
      },
      progression: function (part, info, percentage) {
        if (observer.progression !== undefined) {
          observer.progression(HomeRecorder.READING_HOME, url, percentage);
        }
      }
    });
  }

  /**
   * Parses the content of the given entry to create the home object it contains. 
   * @private
   */
  parseHomeXMLEntry(homeXmlEntry, zip, zipUrl, observer) {
    let xmlContent = homeXmlEntry.asText();
    if (observer.progression !== undefined) {
      observer.progression(HomeRecorder.READING_HOME, homeXmlEntry.name, 1);

      observer.progression(HomeRecorder.PARSING_HOME, homeXmlEntry.name, 0);
    }

    let handler = this.getHomeXMLHandler();
    // The handler needs the zip URL for creating the right content URL (see HomeXMLHandler#parseContent)
    handler.homeUrl = zipUrl;
    let saxParser = new SAXParser(handler, handler, handler, handler, handler);
    try {
      // Replace ' by " because SAXParser converts &apos; entities to ' in attributes value too early
      xmlContent = xmlContent.replace(/\'/g, '"');
      saxParser.parseString(xmlContent);
      observer.homeLoaded(handler.getHome());
    } catch (ex) {
      if (observer.homeError !== undefined) {
        observer.homeError(ex);
      }
    }

    if (observer.progression !== undefined) {
      observer.progression(HomeRecorder.PARSING_HOME, homeXmlEntry.name, 1);
    }
  }

  /**
   * Returns a SAX XML handler able to interpret the information contained in the 
   * <code>Home.xml</code> entry.
   * @return {HomeXMLHandler}
   * @protected 
   */
  getHomeXMLHandler() {
    return new HomeXMLHandler();
  }

  /**
   * Replaces home contents by permanent content or content in cache if it exists, 
   * then call <code>homeLoaded</code> method of the given <code>observer</code>.
   * @param {Home}   home
   * @param {string} homeUrl
   * @param {{homeLoaded: function, homeError: function, progression: function}} observer
   * @private
   */
  replaceHomeContents(home, homeUrl, observer) {
    if (!HomeRecorder.cacheResourcesStoredInContentDigestManager
      && this.configuration.listCacheResourcesURL
      && this.configuration.readCacheResourceURL) {
      let recorder = this;
      let contentDigestManager = ContentDigestManager.getInstance();
      let url = this.configuration.listCacheResourcesURL;
      if (url.indexOf(LocalStorageURLContent.LOCAL_STORAGE_PREFIX) === 0) {
        // Parse URL of the form localstorage:regExpWithCapturingGroup
        let path = url.substring(url.indexOf(LocalStorageURLContent.LOCAL_STORAGE_PREFIX) + LocalStorageURLContent.LOCAL_STORAGE_PREFIX.length);
        const regExp = new RegExp(path.indexOf('?') > 0 ?
          path.substring(0, path.indexOf('?')) : path);
        let propertyNames = Object.getOwnPropertyNames(localStorage);
        let resourceKeys = [];
        for (let i = 0; i < propertyNames.length; i++) {
          let tags = propertyNames[i].match(regExp);
          if (tags) {
            resourceKeys.push(propertyNames[i]);
          }
        }
        if (resourceKeys.length > 0) {
          // Get resource digest and store it in content digest manager 
          for (let i = resourceKeys.length - 1; i >= 0; i--) {
            let data = localStorage.getItem(resourceKeys[i]);
            let contentType = data.substring("data:".length, data.indexOf(';'));
            let chars = atob(data.substring(data.indexOf(',') + 1));
            let numbers = new Array(chars.length);
            for (let j = 0; j < numbers.length; j++) {
              numbers[j] = chars.charCodeAt(j);
            }
            let byteArray = new Uint8Array(numbers);
            let blobContentUrl = new BlobURLContent(new Blob([byteArray], { type: contentType }));
            contentDigestManager.getContentDigest(blobContentUrl, {
              key: resourceKeys[i],
              blobContentUrl: blobContentUrl,
              digestReady: function (content, digest) {
                URL.revokeObjectURL(this.blobContentUrl);
                let tags = this.key.match(regExp);
                let cacheContent = URLContent.fromURL(
                  CoreTools.format(recorder.configuration.readCacheResourceURL.replace(/(%[^s])/g, "%$1"), encodeURIComponent(tags.length > 1 ? tags[1] : tags[0])));
                contentDigestManager.setContentDigest(cacheContent, digest);

                resourceKeys.splice(resourceKeys.lastIndexOf(this.key), 1);
                if (resourceKeys.length === 0) {
                  recorder.replaceOrExtractHomeContents(home, homeUrl, observer);
                }
              },
              digestError: function (status, error) {
                URL.revokeObjectURL(this.blobContentUrl);
                console.warn("Can't retrieve cache content digest: " + error);
              }
            });
          }
        } else {
          recorder.replaceOrExtractHomeContents(home, homeUrl, observer);
        }
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
        const regExp = new RegExp(url.substring(equalIndex + 1, ampersandIndex > 0 ? ampersandIndex : url.length));

        let databaseUpgradeNeeded = ev => {
          let database = ev.target.result;
          if (!database.objectStoreNames.contains(objectStore)) {
            database.createObjectStore(objectStore, { keyPath: keyPathField });
          }
        };
        let databaseError = ev => {
          console.warn("Can't connect to database " + databaseName);
          recorder.replaceOrExtractHomeContents(home, homeUrl, observer);
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
              query = store.openCursor();
              query.addEventListener("success", (ev) => {
                let cursor = ev.target.result;
                if (cursor != null) {
                  let tags = cursor.primaryKey.match(regExp);
                  if (tags) {
                    let name = tags.length > 1 ? tags[1] : tags[0];
                    let cacheContent = URLContent.fromURL(
                      CoreTools.format(recorder.configuration.readCacheResourceURL.replace(/(%[^s])/g, "%$1"), encodeURIComponent(name)));
                    contentDigestManager.setContentDigest(cacheContent, cursor.value.digest);
                  }
                  cursor["continue"]();
                } else {
                  recorder.replaceOrExtractHomeContents(home, homeUrl, observer);
                }
              });
              query.addEventListener("error", (ev) => {
                console.warn("Can't query in " + objectStore);
                recorder.replaceOrExtractHomeContents(home, homeUrl, observer);
              });
              transaction.addEventListener("complete", (ev) => {
                database.close();
              });
            }
          } catch (ex) {
            console.warn("Issue in " + objectStore + ": " + ex.message);
            recorder.replaceOrExtractHomeContents(home, homeUrl, observer);
          }
        };

        if (indexedDB != null) {
          let request = indexedDB.open(databaseName);
          request.addEventListener("upgradeneeded", databaseUpgradeNeeded);
          request.addEventListener("error", databaseError);
          request.addEventListener("success", databaseSuccess);
        } else if (observer.homeError !== undefined) {
          console.warn("indexedDB unavailable");
          recorder.replaceOrExtractHomeContents(home, homeUrl, observer);
        }
      } else {
        let request = new XMLHttpRequest();
        let querySeparator = url.indexOf('?') != -1 ? '&' : '?';
        request.open("GET", url + querySeparator + "requestId=" + UUID.randomUUID(), true);
        request.addEventListener("load", (ev) => {
          if (request.readyState === XMLHttpRequest.DONE
            && request.status === 200) {
            // Server is supposed to return a JSON array containing objects with name and digest properties
            let availableResources = JSON.parse(request.responseText);
            for (let i = 0; i < availableResources.length; i++) {
              let name = availableResources[i].name;
              let cacheContent = URLContent.fromURL(
                CoreTools.format(recorder.configuration.readCacheResourceURL.replace(/(%[^s])/g, "%$1"), encodeURIComponent(name)));
              contentDigestManager.setContentDigest(cacheContent, availableResources[i].digest);
            }
          } else if (observer.homeError !== undefined) {
            console.warn("Error while requesting " + url);
          }
          recorder.replaceOrExtractHomeContents(home, homeUrl, observer);
        });
        if (observer.homeError !== undefined) {
          let errorListener = ev => {
            console.warn("Error while requesting " + url);
            recorder.replaceOrExtractHomeContents(home, homeUrl, observer);
          };
          request.addEventListener("error", errorListener);
          request.addEventListener("timeout", errorListener);
        }
        request.send();
        return request;
      }

      HomeRecorder.cacheResourcesStoredInContentDigestManager = true;
    } else {
      this.replaceOrExtractHomeContents(home, homeUrl, observer);
    }
  }

  /**
   * Replaces home contents by permanent content or content in cache if it exists, 
   * then call <code>homeLoaded</code> method of the given <code>observer</code>.
   * @param {Home}   home
   * @param {string} homeUrl
   * @param {{homeLoaded: function, homeError: function, progression: function}} observer
   * @private
   */
  replaceOrExtractHomeContents(home, homeUrl, observer) {
    let homeContents = [];
    this.searchContents(home, [], homeContents, (content) => {
      return content instanceof HomeURLContent;
    });
    // Compute digest for home contents
    if (homeContents.length > 0) {
      let recorder = this;
      let homeContentsCopy = homeContents.slice(0).reverse();
      let contentDigestManager = ContentDigestManager.getInstance();
      for (let i = homeContentsCopy.length - 1; i >= 0; i--) {
        contentDigestManager.getContentDigest(homeContentsCopy[i], {
          homeContent: homeContentsCopy[i],
          digestReady: function (content, digest) {
            homeContentsCopy.splice(homeContentsCopy.lastIndexOf(content), 1);
            if (homeContentsCopy.length === 0) {
              // Replace home contents by permanent contents which exist
              let permanentContents = [];
              recorder.searchContents(home, [], permanentContents,
                (content) => {
                  return content instanceof HomeURLContent
                    && contentDigestManager.getPermanentContentDigest(content) != null;
                },
                (content) => {
                  let permanentContent = contentDigestManager.getPermanentContentDigest(content);
                  if (permanentContent.getURL().indexOf(".extract", permanentContent.getURL().length - ".extract".length) > 0) {
                    return URLContent.fromURL("jar:" + permanentContent.getURL() + "!/data");
                  } else if (content.isJAREntry() && content.getJAREntryName().indexOf('/') > 0 && !permanentContent.isJAREntry()) {
                    return URLContent.fromURL("jar:" + permanentContent.getURL() + "!/"
                      + content.getJAREntryName().substring(content.getJAREntryName().indexOf('/') + 1));
                  } else {
                    return permanentContent;
                  }
                });

              let remainingHomeContentCount = homeContents.length - permanentContents.length;
              if (remainingHomeContentCount > 0
                && recorder.configuration.readCacheResourceURL
                && recorder.configuration.writeCacheResourceURL) {
                // If some permanent content was found, store remaining home contents in cache 
                // to be able to optimize memory by closing home file and not reopening it in workers when saving home
                let compressionLevel = recorder.configuration.writeCacheResourceURL.indexOf(LocalStorageURLContent.LOCAL_STORAGE_PREFIX) < 0
                  && recorder.configuration.writeCacheResourceURL.indexOf(IndexedDBURLContent.INDEXED_DB_PREFIX) < 0 ? 5 : 0;

                let replaceContents = () => {
                  if (--remainingHomeContentCount === 0) {
                    ZIPTools.disposeZIP(homeUrl);
                    recorder.searchContents(home, [], permanentContents,
                      (content) => {
                        return content instanceof HomeURLContent;
                      },
                      (content) => {
                        let replacingContent = remainingHomeContents[content.getURL()];
                        return replacingContent !== undefined ? replacingContent : content;
                      });
                    observer.homeLoaded(home);
                  }
                };
                let writeBlob = (homeContent, blob, blobContentEntryName, extension) => {
                  let blobName = UUID.randomUUID();
                  if (extension != null) {
                    blobName += extension;
                  }
                  contentDigestManager.getContentDigest(homeContent, {
                    digestReady: function (content, digest) {
                      new BlobURLContent(blob).writeBlob(recorder.configuration.writeCacheResourceURL, [blobName, digest], {
                        blobSaved: function (content, blobName) {
                          let url = CoreTools.format(recorder.configuration.readCacheResourceURL.replace(/(%[^s])/g, "%$1"), encodeURIComponent(blobName));
                          if (blobContentEntryName != null) {
                            url = "jar:" + url + "!/" + blobContentEntryName;
                          }
                          let cacheContent = URLContent.fromURL(url);
                          remainingHomeContents[homeContent.getURL()] = cacheContent;
                          // Store content in cache for future use (digest already known since it's an extract of the file)
                          contentDigestManager.setContentDigest(cacheContent, digest);
                          replaceContents();
                        },
                        blobError: function (status, error) {
                          console.warn("Can't saved all home extracted data: " + error);
                          replaceContents();
                        }
                      });
                    }
                  });
                };

                let remainingHomeContents = {};
                for (let j = 0; j < homeContents.length; j++) {
                  let homeContent = homeContents[j];
                  if (permanentContents.indexOf(homeContent) < 0) {
                    let contentEntryName = homeContent.getJAREntryName();
                    let slashIndex = contentEntryName.indexOf('/');
                    if (slashIndex > 0) {
                      const contentZipOut = new JSZip();
                      recorder.writeHomeZipEntries(contentZipOut, "", homeContent, {
                        blobContentEntryName: contentEntryName.substring(slashIndex + 1),
                        contentSaved: function (homeContent) {
                          writeBlob(homeContent, recorder.generateZip(contentZipOut, compressionLevel, "blob"),
                            this.blobContentEntryName);
                        },
                        contentError: function (status, error) {
                          console.warn("Can't extract all home data: " + error);
                          replaceContents();
                        }
                      });
                    } else {
                      homeContent.getStreamURL({
                        homeContent: homeContent,
                        urlReady: function (url) {
                          if (url.indexOf("jar:") === 0) {
                            let entrySeparatorIndex = url.indexOf("!/");
                            let contentEntryName = decodeURIComponent(url.substring(entrySeparatorIndex + 2));
                            let jarUrl = url.substring(4, entrySeparatorIndex);
                            ZIPTools.getZIP(jarUrl, false, {
                              homeContent: this.homeContent,
                              zipReady: function (zip) {
                                try {
                                  let contentEntry = zip.file(contentEntryName);
                                  let entryData = contentEntry.asUint8Array();
                                  if (ZIPTools.isPNGImage(entryData)
                                    || ZIPTools.isGIFImage(entryData)
                                    || ZIPTools.isJPEGImage(entryData)
                                    || ZIPTools.isBMPImage(entryData)) {
                                    writeBlob(this.homeContent, new Blob([entryData]));
                                  } else {
                                    // Store 3D model and other files in a ZIP file with one entry containing homeContent
                                    let contentZipOut = new JSZip();
                                    recorder.writeZipEntry(contentZipOut, "data", this.homeContent, {
                                      contentSaved: function (homeContent) {
                                        writeBlob(homeContent, recorder.generateZip(contentZipOut, compressionLevel, "blob"),
                                          "data", ".extract");
                                      },
                                      contentError: function (status, error) {
                                        console.warn("Can't extract all home data: " + error);
                                        replaceContents();
                                      }
                                    });
                                  }
                                } catch (ex) {
                                  this.zipError(ex);
                                }
                              },
                              zipError: function (error) {
                                console.warn("Can't extract all home data: " + error);
                                replaceContents();
                              }
                            });
                          }
                        },
                        urlError: function (status, error) {
                          console.warn("Can't extract all home data: " + error);
                          replaceContents();
                        }
                      });
                    }
                  }
                }
              } else {
                ZIPTools.disposeZIP(homeUrl);
                observer.homeLoaded(home);
              }
            }
          },
          digestError: function (status, error) {
            console.warn("Can't retrieve home content digest: " + error);
            homeContentsCopy.splice(homeContentsCopy.lastIndexOf(this.homeContent), 1);
            if (homeContentsCopy.length === 0) {
              observer.homeLoaded(home);
            }
          }
        });
      }
    } else {
      observer.homeLoaded(home);
    }
  }

  /**
   * Writes asynchronously the given <code>home</code> to a new blob 
   * (or the data matching the array type set in <code>writeDataType</code> configuration attribute, 
   * i.e base64, array, uint8array or arraybuffer).
   * If <code>writeHomeWithWorker</code> configuration attribute is set to <code>true</code>, the data
   * will be generated in a separated worker kept alive between calls to this method.
   * @param {Home}   home saved home
   * @param {string} homeName the home name on the server 
   * @param {{homeSaved: function, homeError: function}} observer  The callbacks used to follow the export operation of the home.
   *           homeSaved will receive in its second parameter the data containing the saved home with the resources it needs. 
   * @return {abort: function} a function that will abort writing operation if needed 
   */
  writeHome(home, homeName, observer) {
    let includeAllContent = this.configuration.includeAllContent !== undefined ? this.configuration.includeAllContent : true;
    let dataType = this.configuration.writeDataType !== undefined ? this.configuration.writeDataType : "blob";
    let contents = [];
    this.searchContents(home, [], contents);

    let abortedOperation = false;
    let abortableOperation = null;
    if (contents.length > 0) {
      let recorder = this;
      let contentsCopy = contents.slice(0);
      let savedContents = [];
      let savedContentNames = {};
      let savedContentIndex = 0;
      let contentDigestManager = ContentDigestManager.getInstance();
      for (let i = contentsCopy.length - 1; i >= 0; i--) {
        let content = contentsCopy[i];
        if (content instanceof LocalURLContent
          || (content.isJAREntry() && URLContent.fromURL(content.getJAREntryURL()) instanceof LocalURLContent)
          || content instanceof HomeURLContent
          || content instanceof SimpleURLContent
          || includeAllContent) {
          contentDigestManager.getContentDigest(content, {
            digestReady: function (content, digest) {
              // Check if duplicated content can be avoided
              let duplicatedContentFound = false;
              if (digest !== undefined) {
                for (let j = 0; j < savedContents.length; j++) {
                  let savedContent = savedContents[j];
                  if (content.getURL() !== savedContent.getURL()
                    && contentDigestManager.equals(content, savedContent)) {
                    savedContentNames[content.getURL()] = savedContentNames[savedContent.getURL()];
                    contents.splice(contents.indexOf(content), 1);
                    duplicatedContentFound = true;
                    break;
                  }
                }
              }

              if (!duplicatedContentFound) {
                let subEntryName = "";
                if (content.isJAREntry()) {
                  let entryName = content.getJAREntryName();
                  if (content instanceof HomeURLContent) {
                    let slashIndex = entryName.indexOf('/');
                    // If content comes from a directory of a home file
                    if (slashIndex > 0) {
                      // Retrieve entry name in zipped stream without the directory
                      subEntryName = entryName.substring(slashIndex);
                    }
                  } else if (!(content instanceof SimpleURLContent)) {
                    // Retrieve entry name in zipped stream
                    subEntryName = "/" + entryName;
                  }
                }

                // Build a relative URL that points to content object
                let homeContentPath = savedContentIndex++ + subEntryName;
                savedContentNames[content.getURL()] = homeContentPath;
                savedContents.push(content);
              }

              contentsCopy.splice(contentsCopy.lastIndexOf(content), 1);
              if (contentsCopy.length === 0
                && !abortedOperation) {
                abortableOperation = recorder.writeHomeToZip(home, homeName, contents, savedContentNames, dataType, observer);
              }
            },
            digestError: function (status, error) {
              if (observer.homeError !== undefined) {
                observer.homeError(status, error);
              }
            }
          });
        } else {
          contents.splice(i, 1);
          contentsCopy.splice(contentsCopy.lastIndexOf(content), 1);
          if (contentsCopy.length === 0
            && !abortedOperation) {
            abortableOperation = recorder.writeHomeToZip(home, homeName, contents, savedContentNames, dataType, observer);
          }
        }
      }
    } else {
      abortableOperation = this.writeHomeToZip(home, homeName, contents, {}, dataType, observer);
    }

    return {
      abort: function () {
        abortedOperation = true;
        if (abortableOperation != null) {
          abortableOperation.abort();
        }
      }
    };
  }

  /**
   * Writes home to ZIP data. 
   * @param {Home}   home saved home
   * @param {string} homeName the home name on the server 
   * @param {[URLContent]} homeContents
   * @param {{string, string}} savedContentNames
   * @param {string} dataType base64, array, uint8array, arraybuffer or blob
   * @param {{homeSaved: function, homeError: function}} observer  The callbacks used to follow the export operation of the home.
   *           homeSaved will receive in its second parameter the data containing the saved home with the resources it needs.
   * @return {abort: function} a function that will abort writing operation if needed 
   * @ignore
   */
  writeHomeToZip(home, homeName, homeContents, savedContentNames, dataType, observer) {
    let homeClone = home.clone();
    homeClone.setName(homeName);

    let writer = new StringWriter();
    let exporter = this.getHomeXMLExporter();
    exporter.setSavedContentNames(savedContentNames);
    exporter.writeElement(new XMLWriter(writer), homeClone);
    let homeXmlEntry = writer.toString();

    if ((!OperatingSystem.isInternetExplorer() || homeContents.length == 0)
      && this.configuration.writeHomeWithWorker) {
      // Generate ZIP file in a separate worker
      if (this.writeHomeWorker == null) {
        // let blob = new Blob(["importScripts('" + ZIPTools.getScriptFolder() + "jszip.min.js');"
        //   + "importScripts('" + (document.getElementById('recorder-worker') != null
        //     ? document.getElementById('recorder-worker').src
        //     : ZIPTools.getScriptFolder("URLContent.js") + "URLContent.js', '" + ZIPTools.getScriptFolder("HomeRecorder.js") + "HomeRecorder.js")
        //   + "');"
        //   + "onmessage = function(ev) {"
        //   + "  new HomeRecorder(ev.data.recorderConfiguration).generateHomeZip("
        //   + "      ev.data.homeXmlEntry, ev.data.homeContents, ev.data.homeContentTypes, ev.data.savedContentNames, ev.data.dataType, {"
        //   + "         homeSaved: function(homeXmlEntry, data) {"
        //   + "            postMessage(data);"
        //   + "         },"
        //   + "         homeError: function(status, error) {"
        //   + "            postMessage({status: status, error: error});"
        //   + "         }"
        //   + "    });"
        //   + "}"],
        //   { type: 'text/plain' });
        // this.writeHomeWorker = new Worker(URL.createObjectURL(blob));
        this.writeHomeWorker = new WriteHomeWorker();
      }
      let recorder = this;
      let workerListener = ev => {
        recorder.writeHomeWorker.removeEventListener("message", workerListener);
        if (ev.data.error) {
          if (ev.data.error === "indexedDB unavailable") {
            console.warn("Can't use worker to save home");
            recorder.writeHomeToZipWithoutWorker(home, homeXmlEntry, homeContents, savedContentNames, dataType, observer);
          } else {
            if (observer.homeError !== undefined) {
              observer.homeError(ev.data.status, ev.data.error);
            }
          }
        } else {
          observer.homeSaved(home, ev.data);
        }
      };
      this.writeHomeWorker.addEventListener("message", workerListener);

      let homeContentTypes = new Array(homeContents.length);
      for (let i = 0; i < homeContents.length; i++) {
        let constructor = Object.getPrototypeOf(homeContents[i]).constructor;
        if (constructor !== undefined && constructor.name !== undefined) {
          homeContentTypes[i] = constructor.name;
        } else { // IE 11
          homeContentTypes[i] = homeContents[i].constructor.toString().match(/function (\w*)/)[1];
        }
      }
      this.writeHomeWorker.postMessage({
        recorderConfiguration: this.configuration,
        homeXmlEntry: homeXmlEntry,
        homeContents: homeContents,
        homeContentTypes: homeContentTypes,
        savedContentNames: savedContentNames,
        dataType: dataType
      });

      return {
        abort: function () {
          if (recorder.writeHomeWorker != null) {
            recorder.writeHomeWorker.terminate();
          }
          recorder.writeHomeWorker = null;
        }
      };
    } else {
      this.writeHomeToZipWithoutWorker(home, homeXmlEntry, homeContents, savedContentNames, dataType, observer);
    }
  }

  /**
   * Writes home to ZIP data without using a worker. 
   * @param {string} homeXmlEntry entry of saved home
   * @param {[URLContent|{}]} homeContents
   * @param {{string, string}} savedContentNames
   * @param {string} dataType base64, array, uint8array, arraybuffer or blob
   * @param {{homeSaved: function, homeError: function}} observer   
   * @return {abort: function} a function that will abort writing operation 
   * @private
   */
  writeHomeToZipWithoutWorker(home, homeXmlEntry, homeContents, savedContentNames, dataType, observer) {
    this.generateHomeZip(homeXmlEntry, homeContents, null, savedContentNames, dataType, {
      homeSaved: function (homeXmlEntry, data) {
        observer.homeSaved(home, data);
      },
      homeError: function (status, error) {
        if (observer.homeError !== undefined) {
          observer.homeError(status, error);
        }
      }
    });

    return {
      abort: function () {
      }
    };
  }

  /**
   * Generates home ZIP data. 
   * @param {string} homeXmlEntry entry of saved home
   * @param {[URLContent|{}]} homeContents
   * @param {[string]} homeContentTypes
   * @param {{string, string}} savedContentNames
   * @param {string} dataType base64, array, uint8array, arraybuffer or blob
   * @param {{homeSaved: function, homeError: function}} observer   
   * @private
   */
  generateHomeZip(
    homeXmlEntry,
    homeContents,
    homeContentTypes,
    savedContentNames,
    dataType,
    observer
  ) {
    let zipOut = new JSZip();
    zipOut.file('Home.xml', homeXmlEntry);

    if (homeContents.length > 0) {
      if (homeContentTypes !== null) {
        // Recreate content objects from their type
        for (let i = 0; i < homeContents.length; i++) {
          let savedContentName = savedContentNames[homeContents[i].url];
          switch (homeContentTypes[i]) {
            case "SimpleURLContent":
              homeContents[i] = new SimpleURLContent(homeContents[i].url);
              break;
            case "HomeURLContent":
              homeContents[i] = new HomeURLContent(homeContents[i].url);
              break;
            case "BlobURLContent":
              homeContents[i] = new BlobURLContent(homeContents[i].blob);
              break;
            default:
              homeContents[i] = URLContent.fromURL(homeContents[i].url);
              if (homeContents[i] instanceof LocalStorageURLContent) {
                observer.homeError(0, "Data from localstorage not supported in workers");
                return;
              }
              break;
          }
          // Update saved content name from possibly changed URL
          savedContentNames[homeContents[i].getURL()] = savedContentName;
        }
      }

      let recorder = this;
      let homeContentsCopy = homeContents.slice(0).reverse();
      let contentObserver = {
        contentSaved: function (content) {
          homeContentsCopy.splice(homeContentsCopy.lastIndexOf(content), 1);
          if (homeContentsCopy.length === 0) {
            observer.homeSaved(homeXmlEntry, recorder.generateZip(zipOut, recorder.configuration.compressionLevel, dataType));
          }
        },
        contentError: function (status, error) {
          observer.homeError(status, error);
        }
      };
      for (let i = homeContentsCopy.length - 1; i >= 0; i--) {
        let content = homeContentsCopy[i];
        let contentEntryName = savedContentNames[content.getURL()];
        if (contentEntryName !== undefined) {
          let slashIndex = contentEntryName.indexOf('/');
          if (slashIndex > 0) {
            contentEntryName = contentEntryName.substring(0, slashIndex);
          }
          if (!(content instanceof SimpleURLContent)
            && content.isJAREntry()) {
            if (content instanceof HomeURLContent) {
              this.writeHomeZipEntries(zipOut, contentEntryName, content, contentObserver);
            } else {
              this.writeZipEntries(zipOut, contentEntryName, content, contentObserver);
            }
          } else {
            this.writeZipEntry(zipOut, contentEntryName, content, contentObserver);
          }
        } else {
          contentObserver.contentSaved(content);
        }
      }
    } else {
      observer.homeSaved(homeXmlEntry, this.generateZip(zipOut, this.configuration.compressionLevel, dataType));
    }
  }

  /**
   * Returns the zipped data in the given paramater.
   * @param {JSZip} zip the zip instance containing data
   * @param {number} compressionLevel 0 to 9
   * @param {string} dataType base64, array, uint8array, arraybuffer or blob
   * @returns the data zipped according to the configuration of this recorder. 
   * @private
   */
  generateZip(zip, compressionLevel, dataType) {
    let compression = compressionLevel !== undefined && compressionLevel === 0 ? "STORE" : "DEFLATE";
    let deflateCompressionLevel = compressionLevel !== undefined ? compressionLevel : 1;
    return zip.generate({
      type: dataType,
      compression: compression,
      compressionOptions: { level: deflateCompressionLevel }
    });
  }

  /**
   * Writes in <code>zipOut</code> stream one or more entries matching the content
   * <code>urlContent</code> coming from a home file.
   * @param {JSZip} zipOut
   * @param {string} entryNameOrDirectory
   * @param {HomeURLContent} urlContent
   * @param {contentSaved: function, contentError: function} contentObserver 
               called when content is saved or if writing fails
   * @private 
   */
  writeHomeZipEntries(zipOut, entryNameOrDirectory, urlContent, contentObserver) {
    let entryName = urlContent.getJAREntryName();
    let slashIndex = entryName.indexOf('/');
    // If content comes from a directory of a home file
    if (slashIndex > 0) {
      let zipUrl = urlContent.getJAREntryURL();
      let entryDirectory = entryName.substring(0, slashIndex + 1);
      let recorder = this;
      URLContent.fromURL(urlContent.getJAREntryURL()).getStreamURL({
        urlReady: function (url) {
          ZIPTools.getZIP(url, false, {
            zipReady: function (zip) {
              try {
                let entries = zip.file(new RegExp("^" + entryDirectory + ".*")).reverse();
                for (let i = entries.length - 1; i >= 0; i--) {
                  let zipEntry = entries[i];
                  let siblingContent = new URLContent("jar:" + zipUrl + "!/"
                    + encodeURIComponent(zipEntry.name).replace("+", "%20"));
                  recorder.writeZipEntry(zipOut,
                    entryNameOrDirectory.length > 0
                      ? entryNameOrDirectory + zipEntry.name.substring(slashIndex)
                      : zipEntry.name.substring(slashIndex + 1),
                    siblingContent,
                    {
                      zipEntry: zipEntry,
                      contentSaved: function (content) {
                        entries.splice(entries.lastIndexOf(this.zipEntry), 1);
                        if (entries.length === 0) {
                          contentObserver.contentSaved(urlContent);
                        }
                      },
                      contentError: function (status, error) {
                        contentObserver.contentError(status, error);
                      }
                    });
                }
              } catch (ex) {
                this.zipError(ex);
              }
            },
            zipError: function (error) {
              contentObserver.contentError(error, error.message);
            }
          });
        },
        urlError: function (status, error) {
          contentObserver.contentError(status, error);
        }
      });
    } else {
      this.writeZipEntry(zipOut, entryNameOrDirectory, urlContent, contentObserver);
    }
  }

  /**
   * Writes in <code>zipOut</code> stream all the sibling files of the zipped
   * <code>urlContent</code>.
   * @param {JSZip} zipOut
   * @param {string} directory
   * @param {URLContent} urlContent
   * @param {contentSaved: function, contentError: function} contentObserver 
               called when content is saved or if writing fails
   * @private 
   */
  writeZipEntries(zipOut, directory, urlContent, contentObserver) {
    let recorder = this;
    URLContent.fromURL(urlContent.getJAREntryURL()).getStreamURL({
      urlReady: function (url) {
        ZIPTools.getZIP(url, false, {
          zipReady: function (zip) {
            try {
              let entries = zip.file(/.*/).reverse();
              for (let i = entries.length - 1; i >= 0; i--) {
                let zipEntry = entries[i];
                let siblingContent = new URLContent("jar:" + urlContent.getJAREntryURL() + "!/"
                  + encodeURIComponent(zipEntry.name).replace("+", "%20"));
                recorder.writeZipEntry(zipOut, directory + "/" + zipEntry.name, siblingContent,
                  {
                    zipEntry: zipEntry,
                    contentSaved: function (content) {
                      entries.splice(entries.lastIndexOf(this.zipEntry), 1);
                      if (entries.length === 0) {
                        contentObserver.contentSaved(urlContent);
                      }
                    },
                    contentError: function (status, error) {
                      contentObserver.contentError(status, error);
                    }
                  });
              }
            } catch (ex) {
              this.zipError(ex);
            }
          },
          zipError: function (error) {
            contentObserver.contentError(error, error.message);
          }
        });
      },
      urlError: function (status, error) {
        contentObserver.contentError(status, error);
      }
    });
  }

  /**
   * Writes in <code>zipOut</code> stream a new entry named <code>entryName</code> that
   * contains a given <code>content</code>.
   * @param {JSZip} zipOut
   * @param {string} entryName
   * @param {URLContent} content
   * @param {contentSaved: function, contentError: function} contentObserver 
               called when contents is saved or if writing fails
   * @private 
   */
  writeZipEntry(zipOut, entryName, content, contentObserver) {
    content.getStreamURL({
      urlReady: function (url) {
        if (url.indexOf("jar:") === 0) {
          let entrySeparatorIndex = url.indexOf("!/");
          let contentEntryName = decodeURIComponent(url.substring(entrySeparatorIndex + 2));
          let jarUrl = url.substring(4, entrySeparatorIndex);
          ZIPTools.getZIP(jarUrl, false, {
            zipReady: function (zip) {
              try {
                let contentEntry = zip.file(contentEntryName);
                zipOut.file(entryName, contentEntry.asUint8Array(), { binary: true });
                contentObserver.contentSaved(content);
              } catch (ex) {
                this.zipError(ex);
              }
            },
            zipError: function (error) {
              contentObserver.contentError(error, error.message);
            }
          });
        } else {
          let request = new XMLHttpRequest();
          request.open("GET", url, true);
          request.responseType = "arraybuffer";
          request.addEventListener("load", () => {
            zipOut.file(entryName, request.response);
            contentObserver.contentSaved(content);
          });
          request.send();
        }
      },
      urlError: function (status, error) {
        contentObserver.contentError(status, error);
      }
    });
  }

  /**
   * Returns a XML exporter able to generate a XML content.
   * @return {HomeXMLExporter}
   * @protected 
   */
  getHomeXMLExporter() {
    return new HomeXMLExporter();
  }

  /**
   * Searchs all the contents referenced by the given <code>object</code>.
   * @param {Object} object the object root
   * @param {Array}  homeObjects array used to track already seeked objects
   * @param {Array}  contents array filed with found contents
   * @param {function} [acceptContent] a function returning <code>false</code> if its parameter is not an interesting content  
   * @param {function} [replaceContent] a function returning the content if its parameter is not an interesting content  
   * @ignore 
   */
  searchContents(object, homeObjects, contents, acceptContent, replaceContent) {
    if (Array.isArray(object)) {
      for (let i = 0; i < object.length; i++) {
        let replacingContent = this.searchContents(object[i], homeObjects, contents, acceptContent, replaceContent);
        if (replacingContent !== null) {
          object[i] = replacingContent;
        }
      }
    } else if (object instanceof URLContent
      && (acceptContent === undefined || acceptContent(object))) {
      let i = 0;
      for (; i < contents.length; i++) {
        if (contents[i].getURL() == object.getURL()) {
          break;
        }
      }
      if (i === contents.length) {
        contents.push(object);
      }
      if (replaceContent !== undefined) {
        return replaceContent(object);
      } else {
        return null;
      }
    } else if (object != null
      && typeof object !== 'number'
      && typeof object !== 'string'
      && typeof object !== 'boolean'
      && typeof object !== 'function'
      && !(object instanceof URLContent)
      && homeObjects.indexOf(object) < 0) {
      homeObjects.push(object);
      let propertyNames = Object.getOwnPropertyNames(object);
      for (let j = 0; j < propertyNames.length; j++) {
        let propertyName = propertyNames[j];
        if (propertyName == "object3D"
          || object.constructor
          && object.constructor.__transients
          && object.constructor.__transients.indexOf(propertyName) != -1) {
          continue;
        }
        let propertyValue = object[propertyName];
        let replacingContent = this.searchContents(propertyValue, homeObjects, contents, acceptContent, replaceContent);
        if (replacingContent !== null) {
          object[propertyName] = replacingContent;
        }
      }
    }
    return null;
  }
}

HomeRecorder.READING_HOME = "Reading home";
HomeRecorder.PARSING_HOME = "Parsing home";

/**
 * @private
 */
HomeRecorder.cacheResourcesStoredInContentDigestManager = false;
