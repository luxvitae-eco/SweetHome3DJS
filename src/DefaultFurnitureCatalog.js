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

import Big from 'big.js';

import {
  BoxBounds,
  CatalogDoorOrWindow,
  CatalogLight,
  CatalogPieceOfFurniture,
  CatalogShelfUnit,
  FurnitureCatalog,
  FurnitureCategory,
  LightSource,
  ObjectProperty,
  Sash,
} from './SweetHome3D';
import { ContentDigestManager } from './ContentDigestManager';
import { CoreTools } from './CoreTools';
import { URLContent } from './URLContent';
import { IllegalArgumentException } from './core';
import { Locale } from './core';

/**
 * Creates a default furniture catalog read through resources referenced by <code>preferences</code> or
 * from <code>furnitureCatalogUrls</code> if called with two parameters
 * @param {UserPreferences} [preferences]
 * @param {Array} [furnitureCatalogUrls]
 * @param {String} [furnitureResourcesUrlBase]
 * @constructor
 * @extends FurnitureCatalog
 * @author Emmanuel Puybaret
 */
export class DefaultFurnitureCatalog extends FurnitureCatalog {
  constructor(preferences, furnitureCatalogUrls, furnitureResourcesUrlBase) {
    super();
    this.libraries = [];

    let identifiedFurniture = [];
    if (furnitureCatalogUrls === undefined) {
      this.readDefaultFurnitureCatalogs(preferences, identifiedFurniture);
    } else {
      // Two parameters furnitureCatalogUrls, furnitureResourcesUrlBase
      furnitureResourcesUrlBase = furnitureCatalogUrls;
      furnitureCatalogUrls = preferences;
      if (furnitureCatalogUrls != null) {
        for (let i = 0; i < furnitureCatalogUrls.length; i++) {
          let furnitureCatalogUrl = furnitureCatalogUrls[i];
          let resourceBundle = CoreTools.loadResourceBundles(furnitureCatalogUrl.substring(0, furnitureCatalogUrl.lastIndexOf(".json")), Locale.getDefault())
          this.readFurniture(resourceBundle, furnitureCatalogUrl, furnitureResourcesUrlBase, identifiedFurniture);
        }
      }
    }
  }

  /**
   * Returns the furniture libraries at initialization.
   * @return {Object}
   */
  getLibraries() {
    return this.libraries.slice(0);
  }

  /**
   * Reads the default furniture described in properties files.
   * @param {UserPreferences} preferences
   * @param {Object} identifiedFurniture
   * @private
   */
  readDefaultFurnitureCatalogs(preferences, identifiedFurniture) {
    this.readFurnitureCatalog("DefaultFurnitureCatalog", preferences, identifiedFurniture);
  }

  /**
   * Reads furniture of a given catalog family from resources.
   * @param {string} furnitureCatalogFamily
   * @param {UserPreferences} preferences
   * @param {Object} identifiedFurniture
   * @private
   */
  readFurnitureCatalog(furnitureCatalogFamily, preferences, identifiedFurniture) {
    this.readFurniture(preferences.getResourceBundles(furnitureCatalogFamily), null, null, identifiedFurniture);
  }

  /**
   * Reads each piece of furniture described in <code>resource</code> bundle.
   * Resources described in piece properties will be loaded from <code>furnitureCatalogUrl</code>
   * if it isn't <code>null</code> or relative to <code>furnitureResourcesUrlBase</code>.
   * @param {Object[]} resource
   * @param {string} furnitureCatalogUrl
   * @param {string} furnitureResourcesUrlBase
   * @param {Object} identifiedFurniture
   * @private
   */
  readFurniture(
    resource,
    furnitureCatalogUrl,
    furnitureResourcesUrlBase,
    identifiedFurniture
  ) {
    let index = 0;
    while (true) {
      let ignored = 0;
      try {
        ignored = CoreTools.getStringFromKey(resource, this.getKey("ignored", ++index));
      } catch (ex) {
        ignored = null;
      }
      if (ignored == null || !this.parseBoolean(ignored)) {
        let piece = ignored == null ? this.readPieceOfFurniture(resource, index, furnitureCatalogUrl, furnitureResourcesUrlBase) : null;
        if (piece == null) {
          break;
        } else {
          if (piece.getId() != null) {
            if (identifiedFurniture.indexOf(piece.getId()) !== -1) {
              continue;
            } else {
              identifiedFurniture.push(piece.getId());
            }
          }
          let pieceCategory = this.readFurnitureCategory(resource, index);
          this.add(pieceCategory, piece);
        }
      } else {
        // Read model contents to store its digests if they exist
        this.getContent(resource, this.getKey(DefaultFurnitureCatalog.PropertyKey.ICON, index), this.getKey(DefaultFurnitureCatalog.PropertyKey.ICON_DIGEST, index),
          furnitureCatalogUrl, furnitureResourcesUrlBase, false, true);
        this.getContent(resource, this.getKey(DefaultFurnitureCatalog.PropertyKey.PLAN_ICON, index), this.getKey(DefaultFurnitureCatalog.PropertyKey.PLAN_ICON_DIGEST, index),
          furnitureCatalogUrl, furnitureResourcesUrlBase, false, true);
        this.getContent(resource, this.getKey(DefaultFurnitureCatalog.PropertyKey.MODEL, index), this.getKey(DefaultFurnitureCatalog.PropertyKey.MODEL_DIGEST, index),
          furnitureCatalogUrl, furnitureResourcesUrlBase, false, true);
      }
    }
  }

  /**
   * Returns the properties of the piece at the given <code>index</code>
   * different from default properties.
   * @param {Object[]} resource
   * @param {number} index
   * @return {Object}
   */
  getAdditionalProperties(resource, index) {
    let catalogAdditionalProperties = this.getCatalogAdditionalProperties(resource)[index.toString()];
    if (catalogAdditionalProperties != null) {
      let additionalProperties = {};
      for (let key in catalogAdditionalProperties) {
        let property = catalogAdditionalProperties[key];
        if (property.getType() !== ObjectProperty.Type.CONTENT) {
          additionalProperties[property.getName()] = CoreTools.getStringFromKey(resource, key);
        }
      }
      return additionalProperties;
    } else {
      return {};
    }
  }

  /**
   * Returns the contents of the piece at the given <code>index</code>
   * different from default properties.
   * @param {Object[]} resource
   * @param {number} index
   * @param {string} [furnitureCatalogUrl]
   * @param {string} [furnitureResourcesUrlBase]
   * @return {Object}
   */
  getAdditionalContents(resource, index, furnitureCatalogUrl, furnitureResourcesUrlBase) {
    let catalogAdditionalProperties = this.getCatalogAdditionalProperties(resource)[index.toString()];
    if (catalogAdditionalProperties != null) {
      let additionalContents = {};
      for (let key in catalogAdditionalProperties) {
        let property = catalogAdditionalProperties[key];
        if (property.getType() === ObjectProperty.Type.CONTENT) {
          additionalContents[property.getName()] =
            this.getContent(resource, key, null, furnitureCatalogUrl, furnitureResourcesUrlBase, false, true);
        }
      }
      return additionalContents;
    } else {
      return {};
    }
  }

  /**
   * Returns the additional properties defined in resource bundle.
   * @param {Object[]} resource
   * @return {Object}
   * @private
   */
  getCatalogAdditionalProperties(resource) {
    let catalogAdditionalKeys = CoreTools.getFromMap(DefaultFurnitureCatalog.furnitureAdditionalKeys, resource);
    if (catalogAdditionalKeys == null) {
      catalogAdditionalKeys = {};
      CoreTools.putToMap(DefaultFurnitureCatalog.furnitureAdditionalKeys, resource, catalogAdditionalKeys);
      let keys = CoreTools.getKeys(resource);
      for (let i = 0; i < keys.length; i++) {
        let key = keys[i];
        let sharpIndex = key.lastIndexOf('#');
        if (sharpIndex !== -1 && sharpIndex + 1 < key.length) {
          let colonIndex = key.indexOf(':', sharpIndex + 1);
          let pieceIndex = parseInt(key.substring(sharpIndex + 1, colonIndex != -1 ? colonIndex : key.length).trim());
          if (!isNaN(pieceIndex)) {
            let propertyName = key.substring(0, sharpIndex);
            if (!this.isDefaultProperty(propertyName)) {
              let additionalKeys = catalogAdditionalKeys[pieceIndex.toString()];
              if (additionalKeys == null) {
                additionalKeys = {};
                catalogAdditionalKeys[pieceIndex.toString()] = additionalKeys;
              }
              let type = null;
              if (colonIndex > 0) {
                let typeDescription = key.substring(colonIndex + 1);
                if (typeDescription.length > 0) {
                  type = ObjectProperty.Type[typeDescription];
                  if (type === undefined) {
                    // Ignore type
                    type = null;
                  }
                }
              }
              additionalKeys[key] = new ObjectProperty(propertyName, type);
            }
          }
        }
      }
    }
    return catalogAdditionalKeys;
  }

  /**
   * Returns <code>true</code> if the given parameter is the prefix of a default property
   * used as an attribute of a piece of furniture.
   * @param {string} keyPrefix
   * @return {boolean}
   */
  isDefaultProperty(keyPrefix) {
    try {
      DefaultFurnitureCatalog.PropertyKey.fromPrefix(keyPrefix);
      return true;
    } catch (ex) {
      return "ignored" == keyPrefix;
    }
  }

  /**
   * Returns the piece of furniture at the given <code>index</code> of a
   * localized <code>resource</code> bundle.
   * @param {Object[]} resource a resource bundle
   * @param {number} index                the index of the read piece
   * @param {string} furnitureCatalogUrl  the URL from which piece resources will be loaded
   *                   or <code>null</code> if it's read from current classpath.
   * @param {string} furnitureResourcesUrlBase the URL used as a base to build the URL to piece resources
   *                   or <code>null</code> if it's read from current classpath or <code>furnitureCatalogUrl</code>
   * @return {CatalogPieceOfFurniture} the read piece of furniture or <code>null</code> if the piece at the given index doesn't exist.
   * @throws MissingResourceException if mandatory keys are not defined.
   */
  readPieceOfFurniture(resource, index, furnitureCatalogUrl, furnitureResourcesUrlBase) {
    let name = null;
    try {
      name = CoreTools.getStringFromKey(resource, this.getKey(DefaultFurnitureCatalog.PropertyKey.NAME, index));
    } catch (ex) {
      return null;
    }
    let id = this.getOptionalString(resource, this.getKey(DefaultFurnitureCatalog.PropertyKey.ID, index), null);
    let description = this.getOptionalString(resource, this.getKey(DefaultFurnitureCatalog.PropertyKey.DESCRIPTION, index), null);
    let information = this.getOptionalString(resource, this.getKey(DefaultFurnitureCatalog.PropertyKey.INFORMATION, index), null);
    let license = this.getOptionalString(resource, this.getKey(DefaultFurnitureCatalog.PropertyKey.LICENSE, index), null);
    let tagsString = this.getOptionalString(resource, this.getKey(DefaultFurnitureCatalog.PropertyKey.TAGS, index), null);
    let tags;
    if (tagsString != null) {
      tags = tagsString.split(/\s*,\s*/);
    } else {
      tags = [];
    }
    let creationDateString = this.getOptionalString(resource, this.getKey(DefaultFurnitureCatalog.PropertyKey.CREATION_DATE, index), null);
    let creationDate = null;
    if (creationDateString != null) {
      try {
        let dateParts = creationDateString.split(/-/);
        creationDate = new Date(dateParts[0], dateParts[1], dateParts[2]).getTime(); // Format: "yyyy-MM-dd"
      } catch (ex) {
        throw new IllegalArgumentException("Can\'t parse date " + creationDateString, ex);
      }
    }
    let gradeString = this.getOptionalString(resource, this.getKey(DefaultFurnitureCatalog.PropertyKey.GRADE, index), null);
    let grade = null;
    if (gradeString != null) {
      grade = parseFloat(gradeString);
    }
    let icon = this.getContent(resource, this.getKey(DefaultFurnitureCatalog.PropertyKey.ICON, index), this.getKey(DefaultFurnitureCatalog.PropertyKey.ICON_DIGEST, index),
      furnitureCatalogUrl, furnitureResourcesUrlBase, false, false);
    let planIcon = this.getContent(resource, this.getKey(DefaultFurnitureCatalog.PropertyKey.PLAN_ICON, index), this.getKey(DefaultFurnitureCatalog.PropertyKey.PLAN_ICON_DIGEST, index),
      furnitureCatalogUrl, furnitureResourcesUrlBase, false, true);
    let multiPartModel = this.getOptionalBoolean(resource, this.getKey(DefaultFurnitureCatalog.PropertyKey.MULTI_PART_MODEL, index), false);
    let model = this.getContent(resource, this.getKey(DefaultFurnitureCatalog.PropertyKey.MODEL, index), this.getKey(DefaultFurnitureCatalog.PropertyKey.MODEL_DIGEST, index),
      furnitureCatalogUrl, furnitureResourcesUrlBase, multiPartModel, false);
    let width = parseFloat(CoreTools.getStringFromKey(resource, this.getKey(DefaultFurnitureCatalog.PropertyKey.WIDTH, index)));
    let depth = parseFloat(CoreTools.getStringFromKey(resource, this.getKey(DefaultFurnitureCatalog.PropertyKey.DEPTH, index)));
    let height = parseFloat(CoreTools.getStringFromKey(resource, this.getKey(DefaultFurnitureCatalog.PropertyKey.HEIGHT, index)));
    let elevation = this.getOptionalFloat(resource, this.getKey(DefaultFurnitureCatalog.PropertyKey.ELEVATION, index), 0);
    let dropOnTopElevation = this.getOptionalFloat(resource, this.getKey(DefaultFurnitureCatalog.PropertyKey.DROP_ON_TOP_ELEVATION, index), height) / height;
    let movable = this.parseBoolean(CoreTools.getStringFromKey(resource, this.getKey(DefaultFurnitureCatalog.PropertyKey.MOVABLE, index)));
    let doorOrWindow = this.parseBoolean(CoreTools.getStringFromKey(resource, this.getKey(DefaultFurnitureCatalog.PropertyKey.DOOR_OR_WINDOW, index)));
    let staircaseCutOutShape = this.getOptionalString(resource, this.getKey(DefaultFurnitureCatalog.PropertyKey.STAIRCASE_CUT_OUT_SHAPE, index), null);
    let modelRotation = this.getModelRotation(resource, this.getKey(DefaultFurnitureCatalog.PropertyKey.MODEL_ROTATION, index));
    let modelFlagsString = this.getOptionalString(resource, this.getKey(DefaultFurnitureCatalog.PropertyKey.MODEL_FLAGS, index), null);
    let modelFlags = 0;
    if (modelFlagsString != null) {
      modelFlags = parseInt(modelFlagsString);
    }
    let modelSizeString = this.getOptionalString(resource, this.getKey(DefaultFurnitureCatalog.PropertyKey.MODEL_SIZE, index), null);
    let modelSize = null;
    if (modelSizeString != null) {
      modelSize = parseInt(modelSizeString);
    }
    let creator = this.getOptionalString(resource, this.getKey(DefaultFurnitureCatalog.PropertyKey.CREATOR, index), null);
    let resizable = this.getOptionalBoolean(resource, this.getKey(DefaultFurnitureCatalog.PropertyKey.RESIZABLE, index), true);
    let deformable = this.getOptionalBoolean(resource, this.getKey(DefaultFurnitureCatalog.PropertyKey.DEFORMABLE, index), true);
    let texturable = this.getOptionalBoolean(resource, this.getKey(DefaultFurnitureCatalog.PropertyKey.TEXTURABLE, index), true);
    let horizontallyRotatable = this.getOptionalBoolean(resource, this.getKey(DefaultFurnitureCatalog.PropertyKey.HORIZONTALLY_ROTATABLE, index), true);
    let price = null;
    try {
      price = new Big(CoreTools.getStringFromKey(resource, this.getKey(DefaultFurnitureCatalog.PropertyKey.PRICE, index)));
    } catch (ex) {
      // By default price is null
    }
    let valueAddedTaxPercentage = null;
    try {
      valueAddedTaxPercentage = new Big(CoreTools.getStringFromKey(resource, this.getKey(DefaultFurnitureCatalog.PropertyKey.VALUE_ADDED_TAX_PERCENTAGE, index)));
    } catch (ex) {
      // By default price is null
    }
    let currency = this.getOptionalString(resource, this.getKey(DefaultFurnitureCatalog.PropertyKey.CURRENCY, index), null);
    let additionalProperties = this.getAdditionalProperties(resource, index);
    let additionalContents = this.getAdditionalContents(resource, index, furnitureCatalogUrl, furnitureResourcesUrlBase);

    if (doorOrWindow) {
      let doorOrWindowCutOutShape = this.getOptionalString(
        resource, this.getKey(DefaultFurnitureCatalog.PropertyKey.DOOR_OR_WINDOW_CUT_OUT_SHAPE, index), null);
      let wallThicknessPercentage = this.getOptionalFloat(
        resource, this.getKey(DefaultFurnitureCatalog.PropertyKey.DOOR_OR_WINDOW_WALL_THICKNESS, index), depth) / depth;
      let wallDistancePercentage = this.getOptionalFloat(
        resource, this.getKey(DefaultFurnitureCatalog.PropertyKey.DOOR_OR_WINDOW_WALL_DISTANCE, index), 0) / depth;
      let wallCutOutOnBothSides = this.getOptionalBoolean(
        resource, this.getKey(DefaultFurnitureCatalog.PropertyKey.DOOR_OR_WINDOW_WALL_CUT_OUT_ON_BOTH_SIDES, index), true);
      let widthDepthDeformable = this.getOptionalBoolean(
        resource, this.getKey(DefaultFurnitureCatalog.PropertyKey.DOOR_OR_WINDOW_WIDTH_DEPTH_DEFORMABLE, index), true);
      let sashes = this.getDoorOrWindowSashes(resource, index, width, depth);
      return new CatalogDoorOrWindow(id, name, description, information, license, tags, creationDate, grade,
        icon, planIcon, model, width, depth, height, elevation, dropOnTopElevation, movable,
        doorOrWindowCutOutShape, wallThicknessPercentage, wallDistancePercentage, wallCutOutOnBothSides, widthDepthDeformable, sashes,
        modelRotation, modelFlags, modelSize, creator, resizable, deformable, texturable, price, valueAddedTaxPercentage, currency,
        additionalProperties, additionalContents);
    } else {
      let lightSources = this.getLightSources(resource, index, width, depth, height);
      let lightSourceMaterialNamesString = this.getOptionalString(
        resource, this.getKey(DefaultFurnitureCatalog.PropertyKey.LIGHT_SOURCE_MATERIAL_NAME, index), null);
      let lightSourceMaterialNames = lightSourceMaterialNamesString != null ? lightSourceMaterialNamesString.split(/ +/) : null;
      if (lightSources != null || lightSourceMaterialNames != null) {
        return new CatalogLight(id, name, description, information, license, tags, creationDate, grade,
          icon, planIcon, model, width, depth, height, elevation, dropOnTopElevation, movable,
          lightSources, lightSourceMaterialNames, staircaseCutOutShape, modelRotation, modelFlags, modelSize, creator,
          resizable, deformable, texturable, horizontallyRotatable, price, valueAddedTaxPercentage, currency,
          additionalProperties, additionalContents);
      } else {
        let shelfElevations = this.getShelfElevations(resource, index, height);
        let shelfBoxes = this.getShelfBoxes(resource, index, width, depth, height);
        if (shelfElevations != null || shelfBoxes != null) {
          return new CatalogShelfUnit(id, name, description, information, license, tags, creationDate, grade,
            icon, planIcon, model, width, depth, height, elevation, dropOnTopElevation, shelfElevations, shelfBoxes,
            movable, staircaseCutOutShape, modelRotation, modelFlags, modelSize, creator,
            resizable, deformable, texturable, horizontallyRotatable, price, valueAddedTaxPercentage, currency,
            additionalProperties, additionalContents);
        } else {
          return new CatalogPieceOfFurniture(id, name, description, information, license, tags, creationDate, grade,
            icon, planIcon, model, width, depth, height, elevation, dropOnTopElevation, movable,
            staircaseCutOutShape, modelRotation, modelFlags, modelSize, creator,
            resizable, deformable, texturable, horizontallyRotatable, price, valueAddedTaxPercentage, currency,
            additionalProperties, additionalContents);
        }
      }
    }
  }

  /**
   * Returns the furniture category of a piece at the given <code>index</code> of a
   * localized <code>resource</code> bundle.
   * @param {Object[]} resource
   * @param {number} index
   * @return {FurnitureCategory}
   * @throws MissingResourceException if mandatory keys are not defined.
   */
  readFurnitureCategory(resource, index) {
    let category = CoreTools.getStringFromKey(resource, this.getKey(DefaultFurnitureCatalog.PropertyKey.CATEGORY, index));
    return new FurnitureCategory(category);
  }

  /**
   * Returns a valid content instance from the resource file or URL value of key.
   * @param {Object[]} resource a resource bundle
   * @param {string} contentKey        the key of a resource content file
   * @param {string} contentDigestKey  the key of the digest of a resource content file
   * @param {string} furnitureUrl the URL of the file containing the target resource if it's not <code>null</code>
   * @param {string} resourceUrlBase the URL used as a base to build the URL to content file
   *           or <code>null</code> if it's read from current classpath or <code>furnitureCatalogUrl</code>.
   * @param {boolean} multiPartModel if <code>true</code> the resource is a multi part resource stored
   *           in a folder with other required resources
   * @param {boolean} optional
   * @return {Object}
   * @throws IllegalArgumentException if the file value doesn't match a valid resource or URL.
   * @private
   */
  getContent(
    resource,
    contentKey,
    contentDigestKey,
    furnitureUrl,
    resourceUrlBase,
    multiPartModel,
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
    // In JavaScript, consider that any URL containing "!/" is accessed through jar protocol
    if (contentFile.indexOf("!/") >= 0 && contentFile.indexOf("jar:") !== 0) {
      url = "jar:" + url;
    }

    let content = URLContent.fromURL(url);
    let contentDigest = this.getOptionalString(resource, contentDigestKey, null);
    if (contentDigest != null && contentDigest.length > 0) {
      ContentDigestManager.getInstance().setContentDigest(content, contentDigest);
    }
    return content;
  }

  /**
   * Returns model rotation parsed from key value.
   * @param {Object[]} resource
   * @param {string} key
   * @return {Array}
   * @private
   */
  getModelRotation(resource, key) {
    try {
      let modelRotationString = CoreTools.getStringFromKey(resource, key);
      let values = modelRotationString.split(/ +/, 9);
      if (values.length === 9) {
        return [
          [parseFloat(values[0]), parseFloat(values[1]), parseFloat(values[2])],
          [parseFloat(values[3]), parseFloat(values[4]), parseFloat(values[5])],
          [parseFloat(values[6]), parseFloat(values[7]), parseFloat(values[8])]];
      } else {
        return null;
      }
    } catch (ex) {
      return null;
    }
  }

  /**
   * Returns optional door or windows sashes.
   * @param {Object[]} resource
   * @param {number} index
   * @param {number} doorOrWindowWidth
   * @param {number} doorOrWindowDepth
   * @return {Array}
   * @private
   */
  getDoorOrWindowSashes(resource, index, doorOrWindowWidth, doorOrWindowDepth) {
    let sashes;
    let sashXAxisString = this.getOptionalString(resource, this.getKey(DefaultFurnitureCatalog.PropertyKey.DOOR_OR_WINDOW_SASH_X_AXIS, index), null);
    if (sashXAxisString != null) {
      let sashXAxisValues = sashXAxisString.split(/ +/);
      let sashYAxisValues = CoreTools.getStringFromKey(resource, this.getKey(DefaultFurnitureCatalog.PropertyKey.DOOR_OR_WINDOW_SASH_Y_AXIS, index)).split(/ +/);
      if (sashYAxisValues.length !== sashXAxisValues.length) {
        throw new IllegalArgumentException(
          "Expected " + sashXAxisValues.length + " values in " + this.getKey(DefaultFurnitureCatalog.PropertyKey.DOOR_OR_WINDOW_SASH_Y_AXIS, index) + " key");
      }
      let sashWidths = CoreTools.getStringFromKey(resource, this.getKey(DefaultFurnitureCatalog.PropertyKey.DOOR_OR_WINDOW_SASH_WIDTH, index)).split(/ +/);
      if (sashWidths.length !== sashXAxisValues.length) {
        throw new IllegalArgumentException(
          "Expected " + sashXAxisValues.length + " values in " + this.getKey(DefaultFurnitureCatalog.PropertyKey.DOOR_OR_WINDOW_SASH_WIDTH, index) + " key");
      }
      let sashStartAngles = CoreTools.getStringFromKey(resource, this.getKey(DefaultFurnitureCatalog.PropertyKey.DOOR_OR_WINDOW_SASH_START_ANGLE, index)).split(/ +/);
      if (sashStartAngles.length !== sashXAxisValues.length) {
        throw new IllegalArgumentException(
          "Expected " + sashXAxisValues.length + " values in " + this.getKey(DefaultFurnitureCatalog.PropertyKey.DOOR_OR_WINDOW_SASH_START_ANGLE, index) + " key");
      }
      let sashEndAngles = CoreTools.getStringFromKey(resource, this.getKey(DefaultFurnitureCatalog.PropertyKey.DOOR_OR_WINDOW_SASH_END_ANGLE, index)).split(/ +/);
      if (sashEndAngles.length !== sashXAxisValues.length) {
        throw new IllegalArgumentException(
          "Expected " + sashXAxisValues.length + " values in " + this.getKey(DefaultFurnitureCatalog.PropertyKey.DOOR_OR_WINDOW_SASH_END_ANGLE, index) + " key");
      }

      sashes = new Array(sashXAxisValues.length);
      for (let i = 0; i < sashes.length; i++) {
        sashes[i] = new Sash(parseFloat(sashXAxisValues[i]) / doorOrWindowWidth,
          parseFloat(sashYAxisValues[i]) / doorOrWindowDepth,
          parseFloat(sashWidths[i]) / doorOrWindowWidth,
          parseFloat(sashStartAngles[i]) * Math.PI / 180,
          parseFloat(sashEndAngles[i]) * Math.PI / 180);
      }
    } else {
      sashes = [];
    }
    return sashes;
  }

  /**
   * Returns optional light sources.
   * @param {Object[]} resource
   * @param {number} index
   * @param {number} lightWidth
   * @param {number} lightDepth
   * @param {number} lightHeight
   * @return {Array}
   * @private
   */
  getLightSources(resource, index, lightWidth, lightDepth, lightHeight) {
    let lightSources = null;
    let lightSourceXString = this.getOptionalString(resource, this.getKey(DefaultFurnitureCatalog.PropertyKey.LIGHT_SOURCE_X, index), null);
    if (lightSourceXString != null) {
      let lightSourceX = lightSourceXString.split(/ +/);
      let lightSourceY = CoreTools.getStringFromKey(resource, this.getKey(DefaultFurnitureCatalog.PropertyKey.LIGHT_SOURCE_Y, index)).split(/ +/);
      if (lightSourceY.length !== lightSourceX.length) {
        throw new IllegalArgumentException(
          "Expected " + lightSourceX.length + " values in " + this.getKey(DefaultFurnitureCatalog.PropertyKey.LIGHT_SOURCE_Y, index) + " key");
      }
      let lightSourceZ = CoreTools.getStringFromKey(resource, this.getKey(DefaultFurnitureCatalog.PropertyKey.LIGHT_SOURCE_Z, index)).split(/ +/);
      if (lightSourceZ.length !== lightSourceX.length) {
        throw new IllegalArgumentException(
          "Expected " + lightSourceX.length + " values in " + this.getKey(DefaultFurnitureCatalog.PropertyKey.LIGHT_SOURCE_Z, index) + " key");
      }
      let lightSourceColors = CoreTools.getStringFromKey(resource, this.getKey(DefaultFurnitureCatalog.PropertyKey.LIGHT_SOURCE_COLOR, index)).split(/ +/);
      if (lightSourceColors.length !== lightSourceX.length) {
        throw new IllegalArgumentException(
          "Expected " + lightSourceX.length + " values in " + this.getKey(DefaultFurnitureCatalog.PropertyKey.LIGHT_SOURCE_COLOR, index) + " key");
      }
      let lightSourceDiametersString = this.getOptionalString(resource, this.getKey(DefaultFurnitureCatalog.PropertyKey.LIGHT_SOURCE_DIAMETER, index), null);
      let lightSourceDiameters = null;
      if (lightSourceDiametersString != null) {
        lightSourceDiameters = lightSourceDiametersString.split(/ +/);
        if (lightSourceDiameters.length !== lightSourceX.length) {
          throw new IllegalArgumentException(
            "Expected " + lightSourceX.length + " values in " + this.getKey(DefaultFurnitureCatalog.PropertyKey.LIGHT_SOURCE_DIAMETER, index) + " key");
        }
      } else {
        lightSourceDiameters = null;
      }

      lightSources = new Array(lightSourceX.length);
      for (let i = 0; i < lightSources.length; i++) {
        let color = lightSourceColors[i].indexOf("#") === 0
          ? parseInt(lightSourceColors[i].substring(1), 16)
          : parseInt(lightSourceColors[i]);
        lightSources[i] = new LightSource(
          parseFloat(lightSourceX[i]) / lightWidth,
          parseFloat(lightSourceY[i]) / lightDepth,
          parseFloat(lightSourceZ[i]) / lightHeight,
          color,
          lightSourceDiameters != null
            ? parseFloat(lightSourceDiameters[i]) / lightWidth
            : null);
      }
    }
    return lightSources;
  }

  /**
   * Returns optional shelf elevations.
   * @param {Object[]} resource
   * @param {number} index
   * @param {number} height
   * @private
   */
  getShelfElevations(resource, index, height) {
    let shelfElevations = null;
    let shelfElevationsString = this.getOptionalString(resource, this.getKey(DefaultFurnitureCatalog.PropertyKey.SHELF_ELEVATIONS, index), null);
    if (shelfElevationsString != null) {
      let values = shelfElevationsString.split(/ +/);
      shelfElevations = new Array(values.length);
      for (let i = 0; i < values.length; i++) {
        shelfElevations[i] = parseFloat(values[i]) / height;
      }
    }
    return shelfElevations;
  }

  /**
   * Returns optional shelf boxes.
   * @param {Object[]} resource
   * @param {number} index
   * @param {number} width
   * @param {number} depth
   * @param {number} height
   * @private
   */
  getShelfBoxes(resource, index, width, depth, height) {
    let shelfBoxes = null;
    let shelfBoxesString = this.getOptionalString(resource, this.getKey(DefaultFurnitureCatalog.PropertyKey.SHELF_BOXES, index), null);
    if (shelfBoxesString != null) {
      let values = shelfBoxesString.split(/ +/);
      if (values.length % 6 != 0) {
        throw new IllegalArgumentException(
          "Expected a multiple of 6 values in " + this.getKey(DefaultFurnitureCatalog.PropertyKey.SHELF_BOXES, index) + " key");
      } else {
        shelfBoxes = new Array(values.length / 6);
        for (let i = 0; i < shelfBoxes.length; i++) {
          shelfBoxes[i] = new BoxBounds(
            parseFloat(values[i * 6]) / width,
            parseFloat(values[i * 6 + 1]) / depth,
            parseFloat(values[i * 6 + 2]) / height,
            parseFloat(values[i * 6 + 3]) / width,
            parseFloat(values[i * 6 + 4]) / depth,
            parseFloat(values[i * 6 + 5]) / height);
        }
      }
    }
    return shelfBoxes;
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
   * Returns the value of <code>propertyKey</code> in <code>resource</code>,
   * or <code>defaultValue</code> if the property doesn't exist.
   * @param {Object[]} resource
   * @param {string} propertyKey
   * @param {number} defaultValue
   * @return {number}
   * @private
   */
  getOptionalFloat(resource, propertyKey, defaultValue) {
    try {
      return parseFloat(CoreTools.getStringFromKey(resource, propertyKey));
    } catch (ex) {
      return defaultValue;
    }
  }

  /**
   * Returns the boolean value of <code>propertyKey</code> in <code>resource</code>,
   * or <code>defaultValue</code> if the property doesn't exist.
   * @param {Object[]} resource
   * @param {string} propertyKey
   * @param {boolean} defaultValue
   * @return {boolean}
   * @private
   */
  getOptionalBoolean(resource, propertyKey, defaultValue) {
    try {
      return this.parseBoolean(CoreTools.getStringFromKey(resource, propertyKey));
    } catch (ex) {
      return defaultValue;
    }
  }

  /**
   * @private 
   */
  parseBoolean(s) {
    return "true" == s;
  }

  /** 
   * @private 
   */
  getKey(keyPrefix, pieceIndex) {
    return keyPrefix + "#" + pieceIndex;
  }
}

DefaultFurnitureCatalog["__class"] = "com.eteks.sweethome3d.io.DefaultFurnitureCatalog";

DefaultFurnitureCatalog.furnitureAdditionalKeys = {};

/**
 * The keys of the properties values read in bundles.
 * @enum
 * @property {DefaultFurnitureCatalog.PropertyKey} ID
 * The key for the ID of a piece of furniture (optional).
 * Two pieces of furniture read in a furniture catalog can't have the same ID
 * and the second one will be ignored.
 * @property {DefaultFurnitureCatalog.PropertyKey} NAME
 * The key for the name of a piece of furniture (mandatory).
 * @property {DefaultFurnitureCatalog.PropertyKey} DESCRIPTION
 * The key for the description of a piece of furniture (optional).
 * This may give detailed information about a piece of furniture.
 * @property {DefaultFurnitureCatalog.PropertyKey} INFORMATION
 * The key for some additional information associated to a piece of furniture (optional).
 * This information may contain some HTML code or a link to an external web site.
 * @property {DefaultFurnitureCatalog.PropertyKey} LICENSE
 * The key for the license associated to a piece of furniture (optional).
 * @property {DefaultFurnitureCatalog.PropertyKey} TAGS
 * The key for the tags or keywords associated to a piece of furniture (optional).
 * Tags are separated by commas with possible heading or trailing spaces.
 * @property {DefaultFurnitureCatalog.PropertyKey} CREATION_DATE
 * The key for the creation or publication date of a piece of furniture at
 * <code>yyyy-MM-dd</code> format (optional).
 * @property {DefaultFurnitureCatalog.PropertyKey} GRADE
 * The key for the grade of a piece of furniture (optional).
 * @property {DefaultFurnitureCatalog.PropertyKey} CATEGORY
 * The key for the category's name of a piece of furniture (mandatory).
 * A new category with this name will be created if it doesn't exist.
 * @property {DefaultFurnitureCatalog.PropertyKey} ICON
 * The key for the icon file of a piece of furniture (mandatory).
 * This icon file can be either the path to an image relative to classpath
 * or an absolute URL. It should be encoded in application/x-www-form-urlencoded
 * format if needed.
 * @property {DefaultFurnitureCatalog.PropertyKey} ICON_DIGEST
 * The key for the SHA-1 digest of the icon file of a piece of furniture (optional).
 * This property is used to compare faster catalog resources with the ones of a read home,
 * and should be encoded in Base64.
 * @property {DefaultFurnitureCatalog.PropertyKey} PLAN_ICON
 * The key for the plan icon file of a piece of furniture (optional).
 * This icon file can be either the path to an image relative to classpath
 * or an absolute URL. It should be encoded in application/x-www-form-urlencoded
 * format if needed.
 * @property {DefaultFurnitureCatalog.PropertyKey} PLAN_ICON_DIGEST
 * The key for the SHA-1 digest of the plan icon file of a piece of furniture (optional).
 * This property is used to compare faster catalog resources with the ones of a read home,
 * and should be encoded in Base64.
 * @property {DefaultFurnitureCatalog.PropertyKey} MODEL
 * The key for the 3D model file of a piece of furniture (mandatory).
 * The 3D model file can be either a path relative to classpath
 * or an absolute URL.  It should be encoded in application/x-www-form-urlencoded
 * format if needed.
 * @property {DefaultFurnitureCatalog.PropertyKey} MODEL_SIZE
 * The key for the size of the 3D model of a piece of furniture (optional).
 * If model content is a file this should contain the file size.
 * @property {DefaultFurnitureCatalog.PropertyKey} MODEL_DIGEST
 * The key for the SHA-1 digest of the 3D model file of a piece of furniture (optional).
 * This property is used to compare faster catalog resources with the ones of a read home,
 * and should be encoded in Base64.
 * @property {DefaultFurnitureCatalog.PropertyKey} MULTI_PART_MODEL
 * The key for a piece of furniture with multiple parts (optional).
 * If the value of this key is <code>true</code>, all the files
 * stored in the same folder as the 3D model file (MTL, texture files...)
 * will be considered as being necessary to view correctly the 3D model.
 * @property {DefaultFurnitureCatalog.PropertyKey} WIDTH
 * The key for the width in centimeters of a piece of furniture (mandatory).
 * @property {DefaultFurnitureCatalog.PropertyKey} DEPTH
 * The key for the depth in centimeters of a piece of furniture (mandatory).
 * @property {DefaultFurnitureCatalog.PropertyKey} HEIGHT
 * The key for the height in centimeters of a piece of furniture (mandatory).
 * @property {DefaultFurnitureCatalog.PropertyKey} MOVABLE
 * The key for the movability of a piece of furniture (mandatory).
 * If the value of this key is <code>true</code>, the piece of furniture
 * will be considered as a movable piece.
 * @property {DefaultFurnitureCatalog.PropertyKey} DOOR_OR_WINDOW
 * The key for the door or window type of a piece of furniture (mandatory).
 * If the value of this key is <code>true</code>, the piece of furniture
 * will be considered as a door or a window.
 * @property {DefaultFurnitureCatalog.PropertyKey} DOOR_OR_WINDOW_CUT_OUT_SHAPE
 * The key for the shape of a door or window used to cut out walls when they intersect it (optional).
 * This shape should be defined with the syntax of the d attribute of a
 * <a href="http://www.w3.org/TR/SVG/paths.html">SVG path element</a>
 * and should fit in a square spreading from (0, 0) to (1, 1) which will be
 * scaled afterwards to the real size of the piece.
 * If not specified, then this shape will be automatically computed from the actual shape of the model.
 * @property {DefaultFurnitureCatalog.PropertyKey} DOOR_OR_WINDOW_WALL_THICKNESS
 * The key for the wall thickness in centimeters of a door or a window (optional).
 * By default, a door or a window has the same depth as the wall it belongs to.
 * @property {DefaultFurnitureCatalog.PropertyKey} DOOR_OR_WINDOW_WALL_DISTANCE
 * The key for the distance in centimeters of a door or a window to its wall (optional).
 * By default, this distance is zero.
 * @property {DefaultFurnitureCatalog.PropertyKey} DOOR_OR_WINDOW_WALL_CUT_OUT_ON_BOTH_SIDES
 * The key for the wall cut out rule of a door or a window (optional, <code>true</code> by default).
 * By default, a door or a window placed on a wall and parallel to it will cut out the both sides of that wall
 * even if its depth is smaller than the wall thickness or if it intersects only one side of the wall.
 * If the value of this key is <code>false</code>, a door or a window will only dig the wall
 * at its intersection, and will cut the both sides of a wall only if it intersects both of them.
 * @property {DefaultFurnitureCatalog.PropertyKey} DOOR_OR_WINDOW_WIDTH_DEPTH_DEFORMABLE
 * The key for the width/depth deformability of a door or a window (optional, <code>true</code> by default).
 * By default, the depth of a door or a window can be changed and adapted to
 * the wall thickness where it's placed regardless of its width. To avoid this deformation
 * in the case of open doors, the value of this key can be set to <code>false</code>.
 * Doors and windows with their width/depth deformability set to <code>false</code>
 * and their {@link HomeDoorOrWindow#isBoundToWall() bouldToWall} flag set to <code>true</code>
 * will also make a hole in the wall when they are placed whatever their depth.
 * @property {DefaultFurnitureCatalog.PropertyKey} DOOR_OR_WINDOW_SASH_X_AXIS
 * The key for the sash axis distance(s) of a door or a window along X axis (optional).
 * If a door or a window has more than one sash, the values of each sash should be
 * separated by spaces.
 * @property {DefaultFurnitureCatalog.PropertyKey} DOOR_OR_WINDOW_SASH_Y_AXIS
 * The key for the sash axis distance(s) of a door or a window along Y axis
 * (mandatory if sash axis distance along X axis is defined).
 * @property {DefaultFurnitureCatalog.PropertyKey} DOOR_OR_WINDOW_SASH_WIDTH
 * The key for the sash width(s) of a door or a window
 * (mandatory if sash axis distance along X axis is defined).
 * @property {DefaultFurnitureCatalog.PropertyKey} DOOR_OR_WINDOW_SASH_START_ANGLE
 * The key for the sash start angle(s) of a door or a window
 * (mandatory if sash axis distance along X axis is defined).
 * @property {DefaultFurnitureCatalog.PropertyKey} DOOR_OR_WINDOW_SASH_END_ANGLE
 * The key for the sash end angle(s) of a door or a window
 * (mandatory if sash axis distance along X axis is defined).
 * @property {DefaultFurnitureCatalog.PropertyKey} LIGHT_SOURCE_X
 * The key for the abscissa(s) of light sources in a light (optional).
 * If a light has more than one light source, the values of each light source should
 * be separated by spaces.
 * @property {DefaultFurnitureCatalog.PropertyKey} LIGHT_SOURCE_Y
 * The key for the ordinate(s) of light sources in a light (mandatory if light source abscissa is defined).
 * @property {DefaultFurnitureCatalog.PropertyKey} LIGHT_SOURCE_Z
 * The key for the elevation(s) of light sources in a light (mandatory if light source abscissa is defined).
 * @property {DefaultFurnitureCatalog.PropertyKey} LIGHT_SOURCE_COLOR
 * The key for the color(s) of light sources in a light (mandatory if light source abscissa is defined).
 * @property {DefaultFurnitureCatalog.PropertyKey} LIGHT_SOURCE_DIAMETER
 * The key for the diameter(s) of light sources in a light (optional).
 * @property {DefaultFurnitureCatalog.PropertyKey} STAIRCASE_CUT_OUT_SHAPE
 * The key for the shape used to cut out upper levels when they intersect with a piece
 * like a staircase (optional). This shape should be defined with the syntax of
 * the d attribute of a <a href="http://www.w3.org/TR/SVG/paths.html">SVG path element</a>
 * and should fit in a square spreading from (0, 0) to (1, 1) which will be scaled afterwards
 * to the real size of the piece.
 * @property {DefaultFurnitureCatalog.PropertyKey} ELEVATION
 * The key for the elevation in centimeters of a piece of furniture (optional).
 * @property {DefaultFurnitureCatalog.PropertyKey} DROP_ON_TOP_ELEVATION
 * The key for the preferred elevation (from the bottom of a piece) at which should be placed
 * an object dropped on a piece (optional). A negative value means that the piece should be ignored
 * when an object is dropped on it. By default, this elevation is equal to its height.
 * @property {DefaultFurnitureCatalog.PropertyKey} SHELF_ELEVATIONS
 * The key for the shelf elevation(s) at which other objects can be placed on a piece of furniture
 * from its bottom (optional).
 * @property {DefaultFurnitureCatalog.PropertyKey} SHELF_BOXES
 * The key for the shelf box(es) in which other objects can be placed in a piece of furniture (optional).
 * Each box is defined by the 6 values of the x, y, z coordinates of its left front bottom corner and
 * its right back top corner.
 * @property {DefaultFurnitureCatalog.PropertyKey} MODEL_ROTATION
 * The key for the transformation matrix values applied to a piece of furniture (optional).
 * If the 3D model of a piece of furniture isn't correctly oriented,
 * the value of this key should give the 9 values of the transformation matrix
 * that will orient it correctly.
 * @property {DefaultFurnitureCatalog.PropertyKey} CREATOR
 * The key for the creator of a piece of furniture (optional).
 * @property {DefaultFurnitureCatalog.PropertyKey} RESIZABLE
 * The key for the resizability of a piece of furniture (optional, <code>true</code> by default).
 * If the value of this key is <code>false</code>, the piece of furniture
 * will be considered as a piece with a fixed size.
 * @property {DefaultFurnitureCatalog.PropertyKey} DEFORMABLE
 * The key for the deformability of a piece of furniture (optional, <code>true</code> by default).
 * If the value of this key is <code>false</code>, the piece of furniture
 * will be considered as a piece that should always keep its proportions when resized.
 * @property {DefaultFurnitureCatalog.PropertyKey} TEXTURABLE
 * The key for the texturable capability of a piece of furniture (optional, <code>true</code> by default).
 * If the value of this key is <code>false</code>, the piece of furniture
 * will be considered as a piece that will always keep the same color or texture.
 * @property {DefaultFurnitureCatalog.PropertyKey} HORIZONTALLY_ROTATABLE
 * The key for the ability of a piece of furniture to rotate around a horizontal axis (optional, <code>true</code> by default).
 * If the value of this key is <code>false</code>, the piece of furniture
 * will be considered as a piece that can't be horizontally rotated.
 * @property {DefaultFurnitureCatalog.PropertyKey} PRICE
 * The key for the price of a piece of furniture (optional).
 * @property {DefaultFurnitureCatalog.PropertyKey} VALUE_ADDED_TAX_PERCENTAGE
 * The key for the VAT percentage of a piece of furniture (optional).
 * @property {DefaultFurnitureCatalog.PropertyKey} CURRENCY
 * The key for the currency ISO 4217 code of the price of a piece of furniture (optional).
 * @class
 */
DefaultFurnitureCatalog.PropertyKey = {
  /**
   * The key for the ID of a piece of furniture (optional). 
   * Two pieces of furniture read in a furniture catalog can't have the same ID
   * and the second one will be ignored.   
   */
  ID: "id",
  /**
   * The key for the name of a piece of furniture (mandatory).
   */
  NAME: "name",
  /**
   * The key for the description of a piece of furniture (optional). 
   * This may give detailed information about a piece of furniture.
   */
  DESCRIPTION: "description",
  /**
   * The key for some additional information associated to a piece of furniture (optional).
   * This information may contain some HTML code or a link to an external web site.
   */
  INFORMATION: "information",
  /**
   * The key for the license associated to a piece of furniture (optional).
   */
  LICENSE: "license",
  /**
   * The key for the tags or keywords associated to a piece of furniture (optional). 
   * Tags are separated by commas with possible heading or trailing spaces. 
   */
  TAGS: "tags",
  /**
   * The key for the creation or publication date of a piece of furniture at 
   * <code>yyyy-MM-dd</code> format (optional).
   */
  CREATION_DATE: "creationDate",
  /**
   * The key for the grade of a piece of furniture (optional).
   */
  GRADE: "grade",
  /**
   * The key for the category's name of a piece of furniture (mandatory).
   * A new category with this name will be created if it doesn't exist.
   */
  CATEGORY: "category",
  /**
   * The key for the icon file of a piece of furniture (mandatory). 
   * This icon file can be either the path to an image relative to classpath
   * or an absolute URL. It should be encoded in application/x-www-form-urlencoded  
   * format if needed. 
   */
  ICON: "icon",
  /**
   * The key for the SHA-1 digest of the icon file of a piece of furniture (optional). 
   * This property is used to compare faster catalog resources with the ones of a read home,
   * and should be encoded in Base64.  
   */
  ICON_DIGEST: "iconDigest",
  /**
   * The key for the plan icon file of a piece of furniture (optional).
   * This icon file can be either the path to an image relative to classpath
   * or an absolute URL. It should be encoded in application/x-www-form-urlencoded  
   * format if needed.
   */
  PLAN_ICON: "planIcon",
  /**
   * The key for the SHA-1 digest of the plan icon file of a piece of furniture (optional). 
   * This property is used to compare faster catalog resources with the ones of a read home,
   * and should be encoded in Base64.  
   */
  PLAN_ICON_DIGEST: "planIconDigest",
  /**
   * The key for the 3D model file of a piece of furniture (mandatory).
   * The 3D model file can be either a relative path 
   * or an absolute URL.  It should be encoded in application/x-www-form-urlencoded  
   * format if needed.
   */
  MODEL: "model",
  /**
   * The key for the size of the 3D model of a piece of furniture (optional).
   * If model content is a file this should contain the file size. 
   */
  MODEL_SIZE: "modelSize",
  /**
   * The key for the SHA-1 digest of the 3D model file of a piece of furniture (optional). 
   * This property is used to compare faster catalog resources with the ones of a read home,
   * and should be encoded in Base64.  
   */
  MODEL_DIGEST: "modelDigest",
  /**
   * The key for a piece of furniture with multiple parts (optional).
   * If the value of this key is <code>true</code>, all the files
   * stored in the same folder as the 3D model file (MTL, texture files...)
   * will be considered as being necessary to view correctly the 3D model. 
   */
  MULTI_PART_MODEL: "multiPartModel",
  /**
   * The key for the width in centimeters of a piece of furniture (mandatory).
   */
  WIDTH: "width",
  /**
   * The key for the depth in centimeters of a piece of furniture (mandatory).
   */
  DEPTH: "depth",
  /**
   * The key for the height in centimeters of a piece of furniture (mandatory).
   */
  HEIGHT: "height",
  /**
   * The key for the movability of a piece of furniture (mandatory).
   * If the value of this key is <code>true</code>, the piece of furniture
   * will be considered as a movable piece. 
   */
  MOVABLE: "movable",
  /**
   * The key for the door or window type of a piece of furniture (mandatory).
   * If the value of this key is <code>true</code>, the piece of furniture
   * will be considered as a door or a window. 
   */
  DOOR_OR_WINDOW: "doorOrWindow",
  /**
   * The key for the shape of a door or window used to cut out walls when they intersect it (optional).
   * This shape should be defined with the syntax of the d attribute of a 
   * <a href="http://www.w3.org/TR/SVG/paths.html">SVG path element</a>
   * and should fit in a square spreading from (0, 0) to (1, 1) which will be 
   * scaled afterwards to the real size of the piece. 
   * If not specified, then this shape will be automatically computed from the actual shape of the model.  
   */
  DOOR_OR_WINDOW_CUT_OUT_SHAPE: "doorOrWindowCutOutShape",
  /**
   * The key for the wall thickness in centimeters of a door or a window (optional).
   * By default, a door or a window has the same depth as the wall it belongs to.
   */
  DOOR_OR_WINDOW_WALL_THICKNESS: "doorOrWindowWallThickness",
  /**
   * The key for the distance in centimeters of a door or a window to its wall (optional).
   * By default, this distance is zero.
   */
  DOOR_OR_WINDOW_WALL_DISTANCE: "doorOrWindowWallDistance",
  /**
   * The key for the wall cut out rule of a door or a window (optional, <code>true</code> by default).
   * By default, a door or a window placed on a wall and parallel to it will cut out the both sides of that wall  
   * even if its depth is smaller than the wall thickness or if it intersects only one side of the wall.
   * If the value of this key is <code>false</code>, a door or a window will only dig the wall 
   * at its intersection, and will cut the both sides of a wall only if it intersects both of them.
   */
  DOOR_OR_WINDOW_WALL_CUT_OUT_ON_BOTH_SIDES: "doorOrWindowWallCutOutOnBothSides",
  /**
   * The key for the width/depth deformability of a door or a window (optional, <code>true</code> by default).
   * By default, the depth of a door or a window can be changed and adapted to 
   * the wall thickness where it's placed regardless of its width. To avoid this deformation
   * in the case of open doors, the value of this key can be set to <code>false</code>. 
   * Doors and windows with their width/depth deformability set to <code>false</code> 
   * and their {@link HomeDoorOrWindow#isBoundToWall() bouldToWall} flag set to <code>true</code>
   * will also make a hole in the wall when they are placed whatever their depth. 
   */
  DOOR_OR_WINDOW_WIDTH_DEPTH_DEFORMABLE: "doorOrWindowWidthDepthDeformable",
  /**
   * The key for the sash axis distance(s) of a door or a window along X axis (optional).
   * If a door or a window has more than one sash, the values of each sash should be 
   * separated by spaces.  
   */
  DOOR_OR_WINDOW_SASH_X_AXIS: "doorOrWindowSashXAxis",
  /**
   * The key for the sash axis distance(s) of a door or a window along Y axis 
   * (mandatory if sash axis distance along X axis is defined).
   */
  DOOR_OR_WINDOW_SASH_Y_AXIS: "doorOrWindowSashYAxis",
  /**
   * The key for the sash width(s) of a door or a window  
   * (mandatory if sash axis distance along X axis is defined).
   */
  DOOR_OR_WINDOW_SASH_WIDTH: "doorOrWindowSashWidth",
  /**
   * The key for the sash start angle(s) of a door or a window  
   * (mandatory if sash axis distance along X axis is defined).
   */
  DOOR_OR_WINDOW_SASH_START_ANGLE: "doorOrWindowSashStartAngle",
  /**
   * The key for the sash end angle(s) of a door or a window  
   * (mandatory if sash axis distance along X axis is defined).
   */
  DOOR_OR_WINDOW_SASH_END_ANGLE: "doorOrWindowSashEndAngle",
  /**
   * The key for the abscissa(s) of light sources in a light (optional).
   * If a light has more than one light source, the values of each light source should 
   * be separated by spaces.
   */
  LIGHT_SOURCE_X: "lightSourceX",
  /**
   * The key for the ordinate(s) of light sources in a light (mandatory if light source abscissa is defined).
   */
  LIGHT_SOURCE_Y: "lightSourceY",
  /**
   * The key for the elevation(s) of light sources in a light (mandatory if light source abscissa is defined).
   */
  LIGHT_SOURCE_Z: "lightSourceZ",
  /**
   * The key for the color(s) of light sources in a light (mandatory if light source abscissa is defined).
   */
  LIGHT_SOURCE_COLOR: "lightSourceColor",
  /**
   * The key for the diameter(s) of light sources in a light (optional).
   */
  LIGHT_SOURCE_DIAMETER: "lightSourceDiameter",
  /**
   * The key for the material name(s) of light source shapes in the 3D model of a light (optional).
   */
  LIGHT_SOURCE_MATERIAL_NAME: "lightSourceMaterialName",
  /**
   * The key for the shape used to cut out upper levels when they intersect with a piece   
   * like a staircase (optional). This shape should be defined with the syntax of 
   * the d attribute of a <a href="http://www.w3.org/TR/SVG/paths.html">SVG path element</a>
   * and should fit in a square spreading from (0, 0) to (1, 1) which will be scaled afterwards 
   * to the real size of the piece. 
   */
  STAIRCASE_CUT_OUT_SHAPE: "staircaseCutOutShape",
  /**
   * The key for the elevation in centimeters of a piece of furniture (optional).
   */
  ELEVATION: "elevation",
  /**
   * The key for the preferred elevation (from the bottom of a piece) at which should be placed  
   * an object dropped on a piece (optional). A negative value means that the piece should be ignored
   * when an object is dropped on it. By default, this elevation is equal to its height. 
   */
  DROP_ON_TOP_ELEVATION: "dropOnTopElevation",
  /**
   * The key for the shelf elevation(s) at which other objects can be placed on a piece of furniture
   * from its bottom (optional).
   */
  SHELF_ELEVATIONS: "shelfElevations",
  /**
   * The key for the shelf box(es) in which other objects can be placed in a piece of furniture (optional).
   * Each box is defined by the 6 values of the x, y, z coordinates of its left front bottom corner and
   * its right back top corner.
   */
  SHELF_BOXES: "shelfBoxes",
  /**
   * The key for the transformation matrix values applied to a piece of furniture (optional).
   * If the 3D model of a piece of furniture isn't correctly oriented, 
   * the value of this key should give the 9 values of the transformation matrix 
   * that will orient it correctly.  
   */
  MODEL_ROTATION: "modelRotation",
  /**
   * The key for the creator of a piece of furniture (optional).
   */
  CREATOR: "creator",
  /**
   * The key for the resizability of a piece of furniture (optional, <code>true</code> by default).
   * If the value of this key is <code>false</code>, the piece of furniture
   * will be considered as a piece with a fixed size. 
   */
  RESIZABLE: "resizable",
  /**
   * The key for the deformability of a piece of furniture (optional, <code>true</code> by default).
   * If the value of this key is <code>false</code>, the piece of furniture
   * will be considered as a piece that should always keep its proportions when resized. 
   */
  DEFORMABLE: "deformable",
  /**
   * The key for the texturable capability of a piece of furniture (optional, <code>true</code> by default).
   * If the value of this key is <code>false</code>, the piece of furniture
   * will be considered as a piece that will always keep the same color or texture. 
   */
  TEXTURABLE: "texturable",
  /**
   * The key for the ability of a piece of furniture to rotate around a horizontal axis (optional, <code>true</code> by default).
   * If the value of this key is <code>false</code>, the piece of furniture
   * will be considered as a piece that can't be horizontally rotated. 
   */
  HORIZONTALLY_ROTATABLE: "horizontallyRotatable",
  /**
   * The key for the price of a piece of furniture (optional).
   */
  PRICE: "price",
  /**
   * The key for the VAT percentage of a piece of furniture (optional).
   */
  VALUE_ADDED_TAX_PERCENTAGE: "valueAddedTaxPercentage",
  /**
   * The key for the currency ISO 4217 code of the price of a piece of furniture (optional).
   */
  CURRENCY: "currency",

  getKey: function (keyPrefix, pieceIndex) {
    return keyPrefix + "#" + pieceIndex;
  },

  fromPrefix: function (keyPrefix) {
    for (let key in DefaultFurnitureCatalog.PropertyKey) {
      if (DefaultFurnitureCatalog.PropertyKey[key] == keyPrefix) {
        return key;
      }
    }
    // eslint-disable-next-line no-undef -- @todo Import this
    throw new IllegalArgumentException("Unknow prefix " + keyPrefix);
  }
}
