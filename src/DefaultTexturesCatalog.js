/*
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
  TexturesCatalog, CatalogTexture, TexturesCategory,
} from './SweetHome3D';

import { ContentDigestManager } from './ContentDigestManager';
import { CoreTools } from './CoreTools';
import { URLContent } from './URLContent';
import { Locale } from './core';

/**
 * Creates a default textures catalog read through resources referenced by <code>preferences</code> or
 * from <code>texturesCatalogUrls</code> if called with two parameters
 * @param {UserPreferences} [preferences]
 * @param {Array} [texturesCatalogUrls]
 * @param {String} [texturesResourcesUrlBase]
 * @constructor
 * @extends TexturesCatalog
 * @author Emmanuel Puybaret
 */
export class DefaultTexturesCatalog extends TexturesCatalog {
  constructor(preferences, texturesCatalogUrls, texturesResourcesUrlBase) {
    super();
    this.libraries = [];

    let identifiedTextures = [];
    if (texturesCatalogUrls === undefined) {
      // One parameter: preferences
      this.readDefaultTexturesCatalogs(preferences, identifiedTextures);
    } else {
      // Two parameters: texturesCatalogUrls, texturesResourcesUrlBase
      texturesResourcesUrlBase = texturesCatalogUrls;
      texturesCatalogUrls = preferences;
      if (texturesCatalogUrls != null) {
        for (let i = 0; i < texturesCatalogUrls.length; i++) {
          let texturesCatalogUrl = texturesCatalogUrls[i];
          let resourceBundle = CoreTools.loadResourceBundles(
            texturesCatalogUrl.substring(0, texturesCatalogUrl.lastIndexOf(".json")),
            Locale.getDefault());
          this.readTextures(resourceBundle, texturesCatalogUrl, texturesResourcesUrlBase, identifiedTextures);
        }
      }
    }
  }

  /**
   * Returns the textures libraries at initialization.
   * @return {Object}
   */
  getLibraries() {
    return this.libraries.slice(0);
  }

  /**
   * Reads the default textures described in properties files.
   * @param {UserPreferences} preferences
   * @param {Object} identifiedTextures
   * @private
   */
  readDefaultTexturesCatalogs(preferences, identifiedTextures) {
    this.readTexturesCatalog("DefaultTexturesCatalog", preferences, identifiedTextures);
  }

  /**
   * Reads textures of a given catalog family from resources.
   * @param {string} texturesCatalogFamily
   * @param {UserPreferences} preferences
   * @param {Object} identifiedTextures
   * @private
   */
  readTexturesCatalog(texturesCatalogFamily, preferences, identifiedTextures) {
    this.readTextures(preferences.getResourceBundles(texturesCatalogFamily), null, null, identifiedTextures);
  }

  /**
   * Reads each texture described in <code>resource</code> bundle.
   * Resources described in texture properties will be loaded from <code>texturesCatalogUrl</code>
   * if it isn't <code>null</code> or relative to <code>texturesResourcesUrlBase</code>.
   * @param {Object[]} resource
   * @param {string} texturesCatalogUrl
   * @param {string} texturesResourcesUrlBase
   * @param {Object} identifiedTextures
   * @private
   */
  readTextures(resource, texturesCatalogUrl, texturesResourcesUrlBase, identifiedTextures) {
    let index = 0;
    while (true) {
      let ignored = 0;
      try {
        ignored = CoreTools.getStringFromKey(resource, this.getKey("ignored", ++index));
      } catch (ex) {
        ignored = null;
      }
      if (ignored == null || "true" != ignored) {
        let texture = ignored == null ? this.readTexture(resource, index, texturesCatalogUrl, texturesResourcesUrlBase) : null;
        if (texture == null) {
          break;
        } else {
          if (texture.getId() != null) {
            if (identifiedTextures.indexOf(texture.getId()) !== -1) {
              continue;
            } else {
              identifiedTextures.push(texture.getId());
            }
          }
          let textureCategory = this.readTexturesCategory(resource, index);
          this.add(textureCategory, texture);
        }
      } else {
        // Read image content to store its digest if it exists
        this.getContent(resource, this.getKey(DefaultTexturesCatalog.PropertyKey.IMAGE, index), this.getKey(DefaultTexturesCatalog.PropertyKey.ICON_DIGEST, index),
          texturesCatalogUrl, texturesResourcesUrlBase, true);
      }
    }
  }

  /**
   * Returns the texture at the given <code>index</code> of a
   * localized <code>resource</code> bundle.
   * @param {Object[]} resource a resource bundle
   * @param {number} index                the index of the read texture
   * @param {string} texturesCatalogUrl  the URL from which texture resources will be loaded
   *                   or <code>null</code> if it's read from current classpath.
   * @param {string} texturesResourcesUrlBase the URL used as a base to build the URL to texture resources
   *                   or <code>null</code> if it's read from current classpath or <code>texturesCatalogUrl</code>
   * @return {CatalogTexture} the read texture or <code>null</code> if the texture at the given index doesn't exist.
   * @throws MissingResourceException if mandatory keys are not defined.
   */
  readTexture(resource, index, texturesCatalogUrl, texturesResourcesUrlBase) {
    let name = null;
    try {
      name = CoreTools.getStringFromKey(resource, this.getKey(DefaultTexturesCatalog.PropertyKey.NAME, index));
    } catch (ex) {
      return null;
    }
    let image = this.getContent(resource, this.getKey(DefaultTexturesCatalog.PropertyKey.IMAGE, index), this.getKey(DefaultTexturesCatalog.PropertyKey.IMAGE_DIGEST, index),
      texturesCatalogUrl, texturesResourcesUrlBase, false);
    let width = parseFloat(CoreTools.getStringFromKey(resource, this.getKey(DefaultTexturesCatalog.PropertyKey.WIDTH, index)));
    let height = parseFloat(CoreTools.getStringFromKey(resource, this.getKey(DefaultTexturesCatalog.PropertyKey.HEIGHT, index)));
    let creator = this.getOptionalString(resource, this.getKey(DefaultTexturesCatalog.PropertyKey.CREATOR, index), null);
    let id = this.getOptionalString(resource, this.getKey(DefaultTexturesCatalog.PropertyKey.ID, index), null);
    return new CatalogTexture(id, name, image, width, height, creator);
  }

  /**
   * Returns the category of a texture at the given <code>index</code> of a
   * localized <code>resource</code> bundle.
   * @throws MissingResourceException if mandatory keys are not defined.
   * @param {Object[]} resource
   * @param {number} index
   * @return {TexturesCategory}
   */
  readTexturesCategory(resource, index) {
    let category = CoreTools.getStringFromKey(resource, this.getKey(DefaultTexturesCatalog.PropertyKey.CATEGORY, index));
    return new TexturesCategory(category);
  }

  /**
   * Returns a valid content instance from the resource file or URL value of key.
   * @param {Object[]} resource a resource bundle
   * @param {string} contentKey        the key of a resource content file
   * @param {string} contentDigestKey  the key of the digest of a resource content file
   * @param {string} texturesUrl the URL of the file containing the target resource if it's not <code>null</code>
   * @param {string} resourceUrlBase the URL used as a base to build the URL to content file
   *      or <code>null</code> if it's read from current classpath or <code>texturesCatalogUrl</code>.
   * @param {boolean} optional
   * @return {Object}
   * @throws IllegalArgumentException if the file value doesn't match a valid resource or URL.
   * @private
   */
  getContent(
    resource,
    contentKey,
    contentDigestKey,
    texturesUrl,
    resourceUrlBase,
    optional
  ) {
    let contentFile = optional
      ? this.getOptionalString(resource, contentKey, null)
      : CoreTools.getStringFromKey(resource, contentKey);
    if (optional && contentFile == null) {
      return null;
    }

    let url = null;
    if (resourceUrlBase != null) {
      url = resourceUrlBase + contentFile;
    } else {
      url = contentFile;
    }
    let content = URLContent.fromURL(url);
    let contentDigest = this.getOptionalString(resource, contentDigestKey, null);
    if (contentDigest != null && contentDigest.length > 0) {
      ContentDigestManager.getInstance().setContentDigest(content, contentDigest);
    }
    return content;
  }

  /**
   * Returns the value of <code>propertyKey</code> in <code>resource</code>,
   * or <code>defaultValue</code> if the property doesn't exist.
   * @param {Object[]} resource
   * @param {string} propertyKey
   * @param {string} defaultValue
   * @return {string}
   * @private
   */
  getOptionalString(resource, propertyKey, defaultValue) {
    try {
      return CoreTools.getStringFromKey(resource, propertyKey);
    } catch (ex) {
      return defaultValue;
    }
  }

  /** 
   * @private 
   */
  getKey(keyPrefix, textureIndex) {
    return keyPrefix + "#" + textureIndex;
  }
}

DefaultTexturesCatalog["__class"] = "com.eteks.sweethome3d.io.DefaultTexturesCatalog";

DefaultTexturesCatalog.texturesAdditionalKeys = {};

/**
 * The keys of the properties values read in bundles.
 * @enum
 * @property {DefaultTexturesCatalog.PropertyKey} ID
 * The key for the ID of a texture (optional).
 * Two textures read in a textures catalog can't have the same ID
 * and the second one will be ignored.
 * @property {DefaultTexturesCatalog.PropertyKey} NAME
 * The key for the name of a texture (mandatory).
 * @property {DefaultTexturesCatalog.PropertyKey} CATEGORY
 * The key for the category's name of a texture (mandatory).
 * A new category with this name will be created if it doesn't exist.
 * @property {DefaultTexturesCatalog.PropertyKey} IMAGE
 * The key for the icon file of a texture (mandatory).
 * This icon file can be either the path to an image relative to classpath
 * or an absolute URL. It should be encoded in application/x-www-form-urlencoded
 * format if needed.
 * @property {DefaultTexturesCatalog.PropertyKey} IMAGE_DIGEST
 * The key for the SHA-1 digest of the icon file of a texture (optional).
 * This property is used to compare faster catalog resources with the ones of a read home,
 * and should be encoded in Base64.
 * will be considered as being necessary to view correctly the 3D model.
 * @property {DefaultTexturesCatalog.PropertyKey} WIDTH
 * The key for the width in centimeters of a texture (mandatory).
 * @property {DefaultTexturesCatalog.PropertyKey} HEIGHT
 * The key for the height in centimeters of a texture (mandatory).
 * @property {DefaultTexturesCatalog.PropertyKey} CREATOR
 * The key for the creator of a texture (optional).
 * @class
 */
DefaultTexturesCatalog.PropertyKey = {
  /**
   * The key for the ID of a texture (optional). 
   * Two textures read in a textures catalog can't have the same ID
   * and the second one will be ignored.   
   */
  ID: "id",
  /**
   * The key for the name of a texture (mandatory).
   */
  NAME: "name",
  /**
   * The key for the category's name of a texture (mandatory).
   * A new category with this name will be created if it doesn't exist.
   */
  CATEGORY: "category",
  /**
   * The key for the image file of a texture (mandatory). 
   * This image file can be either the path to an image relative to classpath
   * or an absolute URL. It should be encoded in application/x-www-form-urlencoded  
   * format if needed. 
   */
  IMAGE: "image",
  /**
   * The key for the SHA-1 digest of the image file of a texture (optional). 
   * This property is used to compare faster catalog resources with the ones of a read home,
   * and should be encoded in Base64.  
   */
  IMAGE_DIGEST: "imageDigest",
  /**
   * The key for the width in centimeters of a texture (mandatory).
   */
  WIDTH: "width",
  /**
   * The key for the height in centimeters of a texture (mandatory).
   */
  HEIGHT: "height",
  /**
   * The key for the creator of a texture (optional).
   */
  CREATOR: "creator",

  getKey: function (keyPrefix, textureIndex) {
    return keyPrefix + "#" + textureIndex;
  },
}
