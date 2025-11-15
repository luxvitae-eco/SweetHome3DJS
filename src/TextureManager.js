/*
 * TextureManager.js
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

import { IllegalStateException } from './core';
import { ZIPTools } from './URLContent';

/**
 * Singleton managing texture image cache.
 * @constructor
 * @author Emmanuel Puybaret
 */
export class TextureManager {
  constructor() {
    this.loadedTextureImages = {};
    this.loadingTextureObservers = {};
  }

  /**
   * Returns an instance of this singleton.
   * @return {TextureManager} 
   */
  static getInstance() {
    if (TextureManager.instance == null) {
      TextureManager.instance = new TextureManager();
    }
    return TextureManager.instance;
  }

  /**
   * Clears loaded texture images cache. 
   */
  clear() {
    this.loadedTextureImages = {};
    this.loadingTextureObservers = {};
  }

  /**
   * Reads a texture image from <code>content</code> notified to <code>textureObserver</code>. 
   * If the texture isn't loaded in cache yet and <code>synchronous</code> is false, a one pixel 
   * white image texture will be notified immediately to the given <code>textureObserver</code>, 
   * then a second notification will be given in Event Dispatch Thread once the image texture is loaded. 
   * If the texture is in cache, it will be notified immediately to the given <code>textureObserver</code>.
   * @param {URLContent} content  an object containing an image
   * @param {number}  [angle]       the rotation angle applied to the image
   * @param {boolean} [synchronous] if <code>true</code>, this method will return only once image content is loaded.
   * @param {{textureUpdated, textureError, progression}} textureObserver 
   *             the observer that will be notified once the texture is available. 
   *             It may define <code>textureUpdated(textureImage)</code>, <code>textureError(error)</code>, 
   *             <code>progression(part, info, percentage)</code> optional methods 
   *             with <code>textureImage<code> being an instance of <code>Image</code>, 
   *             <code>error</code>, <code>part</code>, <code>info</code> strings 
   *             and <code>percentage</code> a number.
   */
  loadTexture(content, angle, synchronous, textureObserver) {
    if (synchronous === undefined) {
      // 2 parameters (content, textureObserver)
      textureObserver = angle;
      angle = 0;
      synchronous = false;
    } else if (textureObserver === undefined) {
      // 3 parameters (content, synchronous, textureObserver)
      textureObserver = synchronous;
      synchronous = false;
    }
    if (synchronous
      && !content.isStreamURLReady()) {
      throw new IllegalStateException("Can't run synchronously with unavailable URL");
    }
    let textureManager = this;
    let contentUrl = content.getURL();
    content.getStreamURL({
      urlReady: function (streamUrl) {
        if (contentUrl in textureManager.loadedTextureImages) {
          if (textureObserver.textureUpdated !== undefined) {
            textureObserver.textureUpdated(textureManager.loadedTextureImages[contentUrl]);
          }
        } else if (synchronous) {
          textureManager.load(streamUrl, synchronous, {
            textureLoaded: function (textureImage) {
              // Note that angle is managed with appearance#setTextureTransform
              textureManager.loadedTextureImages[contentUrl] = textureImage;
              if (textureObserver.textureUpdated !== undefined) {
                textureObserver.textureUpdated(textureImage);
              }
            },
            textureError: function (error) {
              if (textureObserver.textureError !== undefined) {
                textureObserver.textureError(error);
              }
            },
            progression: function (part, info, percentage) {
              if (textureObserver.progression !== undefined) {
                textureObserver.progression(part, info, percentage);
              }
            }
          });
        } else {
          if (contentUrl in textureManager.loadingTextureObservers) {
            // If observers list exists, content texture is already being loaded
            // register observer for future notification
            textureManager.loadingTextureObservers[contentUrl].push(textureObserver);
          } else {
            // Create a list of observers that will be notified once texture model is loaded
            let observers = [];
            observers.push(textureObserver);
            textureManager.loadingTextureObservers[contentUrl] = observers;
            textureManager.load(streamUrl, synchronous, {
              textureLoaded: function (textureImage) {
                let observers = textureManager.loadingTextureObservers[contentUrl];
                if (observers) {
                  delete textureManager.loadingTextureObservers[contentUrl];
                  // Note that angle is managed with appearance#setTextureTransform
                  textureManager.loadedTextureImages[contentUrl] = textureImage;
                  for (let i = 0; i < observers.length; i++) {
                    if (observers[i].textureUpdated !== undefined) {
                      observers[i].textureUpdated(textureImage);
                    }
                  }
                }
              },
              textureError: function (error) {
                let observers = textureManager.loadingTextureObservers[contentUrl];
                if (observers) {
                  delete textureManager.loadingTextureObservers[contentUrl];
                  for (let i = 0; i < observers.length; i++) {
                    if (observers[i].textureError !== undefined) {
                      observers[i].textureError(error);
                    }
                  }
                }
              },
              progression: function (part, info, percentage) {
                let observers = textureManager.loadingTextureObservers[contentUrl];
                if (observers) {
                  for (let i = 0; i < observers.length; i++) {
                    if (observers[i].progression !== undefined) {
                      observers[i].progression(part, info, percentage);
                    }
                  }
                }
              }
            });
          }
        }
      },
      urlError: function (status, error) {
        textureObserver.textureError(status);
      }
    });
  }

  /**
   * Manages loading of the image at the given <code>url</code>.
   * @param {string}  url      the URL of the image
   * @param {boolean} [synchronous] if <code>true</code>, this method will return only once image content is loaded.
   * @param {{textureLoaded, textureError, progression}} loadingTextureObserver 
   *             the observer that will be notified once the texture is available. 
   *             It must define <code>textureLoaded(textureImage)</code>,  <code>textureError(error)</code>, 
   *             <code>progression(part, info, percentage)</code> methods  
   *             with <code>textureImage<code> being an instance of <code>Image</code>, 
   *             <code>error</code>, <code>part</code>, <code>info</code> strings 
   *             and <code>percentage</code> a number.
   * @private
   */
  load(url, synchronous, loadingTextureObserver) {
    loadingTextureObserver.progression(TextureManager.READING_TEXTURE, url, 0);
    let textureImage = new Image();
    textureImage.crossOrigin = "anonymous";
    textureImage.url = url;
    let imageErrorListener = ev => {
      textureImage.removeEventListener("load", imageLoadingListener);
      textureImage.removeEventListener("error", imageErrorListener);
      loadingTextureObserver.textureError("Can't load " + url);
    };
    var imageLoadingListener = () => {
      textureImage.removeEventListener("load", imageLoadingListener);
      textureImage.removeEventListener("error", imageErrorListener);
      loadingTextureObserver.progression(TextureManager.READING_TEXTURE, url, 1);

      if (textureImage.transparent === undefined) {
        let request = new XMLHttpRequest();
        request.open("GET", url, synchronous || url.indexOf("app://") >= 0); // Always synchronized under Cordova / iOS
        request.addEventListener("load", () => {
          if (request.readyState === XMLHttpRequest.DONE
            && (request.status === 0 || request.status === 200)) {
            textureImage.transparent = ZIPTools.isTransparentImage(request.response);
          }
          loadingTextureObserver.textureLoaded(textureImage);
        });
        request.send();
      } else {
        loadingTextureObserver.textureLoaded(textureImage);
      }
    };
    if (url.indexOf("jar:") === 0) {
      let entrySeparatorIndex = url.indexOf("!/");
      let imageEntryName = decodeURIComponent(url.substring(entrySeparatorIndex + 2));
      let jarUrl = url.substring(4, entrySeparatorIndex);
      ZIPTools.getZIP(jarUrl, synchronous,
        {
          zipReady: function (zip) {
            try {
              textureImage.addEventListener("load", imageLoadingListener);
              textureImage.addEventListener("error", imageErrorListener);
              let imageEntry = zip.file(imageEntryName);
              let imageData = imageEntry.asBinary();
              let base64Image = btoa(imageData);
              // Detect quickly if the image is a PNG using transparency
              textureImage.transparent = ZIPTools.isTransparentImage(imageData);
              textureImage.src = "data:image;base64," + base64Image;
              // If image is already here or if image loading must be synchronous 
              if (textureImage.width !== 0
                || synchronous) {
                imageLoadingListener();
              }
            } catch (ex) {
              this.zipError(ex);
            }
          },
          zipError: function (error) {
            loadingTextureObserver.textureError("Can't load " + jarUrl);
          },
          progression: function (part, info, percentage) {
            loadingTextureObserver.progression(part, info, percentage);
          }
        });
    } else {
      textureImage.addEventListener("load", imageLoadingListener);
      textureImage.addEventListener("error", imageErrorListener);
      // Prepare download
      textureImage.src = url;
      if (textureImage.width !== 0) {
        // Image is already here
        imageLoadingListener();
      }
    }
  }

  /**
   * Returns <code>true</code> if the texture is shared and its image contains 
   * at least one transparent pixel.
   * @return {boolean}
   */
  isTextureTransparent(textureImage) {
    return textureImage.transparent === true;
  }

  /**
   * Returns the width of the given texture once its rotation angle is applied.
   * @return {number}
   */
  getRotatedTextureWidth(texture) {
    let angle = texture.getAngle();
    if (angle !== 0) {
      return Math.round(Math.abs(texture.getWidth() * Math.cos(angle))
        + Math.abs(texture.getHeight() * Math.sin(angle)));
    } else {
      return texture.getWidth();
    }
  }

  /**
   * Returns the height of the given texture once its rotation angle is applied.
   * @return {number}
   */
  getRotatedTextureHeight(texture) {
    let angle = texture.getAngle();
    if (angle !== 0) {
      return Math.round(Math.abs(texture.getWidth() * Math.sin(angle))
        + Math.abs(texture.getHeight() * Math.cos(angle)));
    } else {
      return texture.getHeight();
    }
  }

  /**
   * Returns an image for error purpose.
   * @package
   * @ignore
   */
  getErrorImage() {
    if (TextureManager.errorImage === undefined) {
      TextureManager.errorImage = this.getColoredImage("#FF0000");
    }
    return TextureManager.errorImage;
  }

  /**
   * Returns an image for wait purpose.
   * @package
   * @ignore
   */
  getWaitImage() {
    if (TextureManager.waitImage === undefined) {
      TextureManager.waitImage = this.getColoredImage("#FFFFFF");
    }
    return TextureManager.waitImage;
  }

  /**
   * Returns an image filled with a color.
   * @param {string} color 
   * @private
   */
  getColoredImage(color) {
    // Create on the fly an image of 2x2 pixels
    let canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 2;
    let context = canvas.getContext('2d');
    context.fillStyle = color;
    context.fillRect(0, 0, 2, 2);
    let coloredImageUrl = canvas.toDataURL();
    let coloredImage = new Image();
    coloredImage.url = coloredImageUrl;
    coloredImage.src = coloredImageUrl;
    return coloredImage;
  }
}

TextureManager.READING_TEXTURE = "Reading texture";

// Singleton
TextureManager.instance = null;
