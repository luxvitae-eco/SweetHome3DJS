/*
 * ModelLoader.js
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
  Node3D,
  Group3D,
  Shape3D,
  Link3D,
} from './scene3d';
import { ZIPTools } from './URLContent';

/**
 * Creates an instance of a model loader.
 * @param {string} modelExtension
 * @constructor
 * @author Emmanuel Puybaret
 */
export class ModelLoader {
  constructor(modelExtension) {
    this.modelExtension = modelExtension;
    this.parserBusy = false;
    this.waitingParsedEntries = [];
  }

  /**
   * Loads the 3D model from the given URL. This method is reentrant when run asynchronously.
   * @param {string} url The URL of a zip file containing an entry with the extension given in constructor 
   *            that will be loaded or an URL noted as jar:url!/modelEntry where modelEntry will be loaded.
   * @param {boolean} [synchronous] optional parameter equal to false by default
   * @param {{modelLoaded, modelError, progression}} loadingModelObserver 
   *            the observer containing <code>modelLoaded(model)</code>, <code>modelError(error)</code>, 
   *            <code>progression(part, info, percentage)</code> methods that will be called at various phases,  
   *            with <code>model<code> being an instance of <code>Node3D</code>, 
   *            <code>error</code>, <code>part</code>, <code>info</code> strings 
   *            and <code>percentage</code> a number.
   */
  load(url, synchronous, loadingModelObserver) {
    if (loadingModelObserver === undefined) {
      loadingModelObserver = synchronous;
      synchronous = false;
    }
    let modelEntryName = null;
    if (url.indexOf("jar:") === 0) {
      let entrySeparatorIndex = url.indexOf("!/");
      modelEntryName = url.substring(entrySeparatorIndex + 2);
      url = url.substring(4, entrySeparatorIndex);
    }

    loadingModelObserver.progression(ModelLoader.READING_MODEL, url, 0);
    let loader = this;
    const zipObserver = {
      zipReady: function (zip) {
        try {
          if (modelEntryName === null) {
            // Search an entry ending with the given extension
            let entries = zip.file(/.*/);
            for (let i = 0; i < entries.length; i++) {
              if (entries[i].name.toLowerCase().match(new RegExp("\." + loader.modelExtension.toLowerCase() + "$"))) {
                loader.parseModelEntry(entries[i], zip, url, synchronous, loadingModelObserver);
                return;
              }
            }
            if (entries.length > 0) {
              // If not found, try with the first entry
              modelEntryName = entries[0].name;
            } else {
              if (loadingModelObserver.modelError !== undefined) {
                loadingModelObserver.modelError("Empty file");
              }
              return;
            }
          }
          loader.parseModelEntry(zip.file(decodeURIComponent(modelEntryName)), zip, url, synchronous, loadingModelObserver);
        } catch (ex) {
          zipObserver.zipError(ex);
        }
      },
      zipError: function (error) {
        if (loadingModelObserver.modelError !== undefined) {
          loadingModelObserver.modelError(error);
        }
      },
      progression: function (part, info, percentage) {
        if (loadingModelObserver.progression !== undefined) {
          loadingModelObserver.progression(ModelLoader.READING_MODEL, info, percentage);
        }
      }
    };
    ZIPTools.getZIP(url, synchronous, zipObserver);
  }

  /**
   * Clears the list of 3D models waiting to be parsed by this loader. 
   */
  clear() {
    this.waitingParsedEntries = [];
  }

  /**
   * Parses the content of the given entry to create the scene it contains. 
   * @private
   */
  parseModelEntry(modelEntry, zip, zipUrl, synchronous, loadingModelObserver) {
    if (synchronous) {
      let modelContent = this.getModelContent(modelEntry);
      loadingModelObserver.progression(ModelLoader.READING_MODEL, modelEntry.name, 1);
      let modelContext = {};
      this.parseDependencies(modelContent, modelEntry.name, zip, modelContext);
      let scene = this.parseEntryScene(modelContent, modelEntry.name, zip, modelContext, null, loadingModelObserver.progression);
      this.loadTextureImages(scene, {}, zip, zipUrl, true);
      loadingModelObserver.modelLoaded(scene);
    } else {
      let parsedEntry = {
        modelEntry: modelEntry,
        zip: zip,
        zipUrl: zipUrl,
        loadingModelObserver: loadingModelObserver
      };
      this.waitingParsedEntries.push(parsedEntry);
      this.parseNextWaitingEntry();
    }
  }

  /**
   * Parses asynchronously the waiting entries.
   * @private
   */
  parseNextWaitingEntry() {
    if (!this.parserBusy) {
      // Parse model files one at a time to avoid keeping in memory unzipped content not yet used
      for (let key in this.waitingParsedEntries) {
        if (this.waitingParsedEntries.hasOwnProperty(key)) {
          const parsedEntry = this.waitingParsedEntries[key];
          const modelEntryName = parsedEntry.modelEntry.name;
          // Get model content to parse
          const modelContent = this.getModelContent(parsedEntry.modelEntry);
          parsedEntry.loadingModelObserver.progression(ModelLoader.READING_MODEL, modelEntryName, 1);
          const modelContext = {};
          this.parseDependencies(modelContent, modelEntryName, parsedEntry.zip, modelContext);
          const loader = this;
          // Post future work (avoid worker because the amount of data to transfer back and forth slows the program) 
          setTimeout(
            () => {
              loader.parseEntryScene(modelContent, modelEntryName, parsedEntry.zip, modelContext,
                (scene) => {
                  loader.loadTextureImages(scene, {}, parsedEntry.zip, parsedEntry.zipUrl, true);
                  parsedEntry.loadingModelObserver.modelLoaded(scene);
                  loader.parserBusy = false;
                  loader.parseNextWaitingEntry();
                },
                parsedEntry.loadingModelObserver.progression);
            }, 0);

          this.parserBusy = true;
          // Remove parsed entry from waiting list
          delete this.waitingParsedEntries[key];
          break;
        }
      }
    }
  }

  /**
   * Loads the textures images used by appearances of the scene.
   * @private
   */
  loadTextureImages(node, images, zip, zipUrl, synchronous) {
    if (node instanceof Group3D) {
      for (let i = 0; i < node.children.length; i++) {
        this.loadTextureImages(node.children[i], images, zip, zipUrl, synchronous);
      }
    } else if (node instanceof Link3D) {
      this.loadTextureImages(node.getSharedGroup(), images, zip, zipUrl, synchronous);
    } else if (node instanceof Shape3D) {
      let appearance = node.getAppearance();
      if (appearance) {
        let imageEntryName = appearance.imageEntryName;
        if (imageEntryName !== undefined) {
          delete appearance[imageEntryName];
          if (imageEntryName in images) {
            appearance.setTextureImage(images[imageEntryName]);
          } else {
            let image = new Image();
            image.crossOrigin = "anonymous";
            appearance.setTextureImage(image);
            image.url = "jar:" + zipUrl + "!/" + imageEntryName;
            // Store loaded image to avoid duplicates
            images[imageEntryName] = image;

            let loader = () => {
              let imageEntry = zip.file(decodeURIComponent(imageEntryName));
              if (imageEntry !== null) {
                let imageData = imageEntry.asBinary();
                let base64Image = btoa(imageData);
                let extension = imageEntryName.substring(imageEntryName.lastIndexOf('.') + 1).toLowerCase();
                let mimeType = ZIPTools.isJPEGImage(imageData)
                  ? "image/jpeg"
                  : (ZIPTools.isPNGImage(imageData)
                    ? "image/png"
                    : ("image/" + extension));
                // Detect quickly if a PNG image use transparency
                image.transparent = ZIPTools.isTransparentImage(imageData);
                image.src = "data:" + mimeType + ";base64," + base64Image;
              } else {
                appearance.setTextureImage(null);
              }
            };
            if (synchronous) {
              loader();
            } else {
              setTimeout(loader, 0);
            }
          }
        }
      }
    }
  }

  /**
   * Returns the content of the model stored in the given entry.
   * @protected
   */
  getModelContent(modelEntry) {
    return modelEntry.asBinary();
  }

  /**
   * Parses the dependencies of the model content if any and returns the materials it describes.
   * @protected
   */
  parseDependencies(modelContent, modelEntryName, zip, modelContext) {
  }

  /**
   * Parses the given model content and calls onmodelloaded asynchronously or 
   * returns the scene it describes if onmodelloaded is null.
   * @protected
   */
  parseEntryScene(
    modelContent,
    modelEntryName,
    zip,
    modelContext,
    onmodelloaded,
    onprogression
  ) {
  }
}

// Constants used to follow model loading progression (moved from Node3D)
ModelLoader.READING_MODEL = Node3D.READING_MODEL;
ModelLoader.PARSING_MODEL = Node3D.PARSING_MODEL;
ModelLoader.BUILDING_MODEL = Node3D.BUILDING_MODEL;
ModelLoader.BINDING_MODEL = Node3D.BINDING_MODEL;
