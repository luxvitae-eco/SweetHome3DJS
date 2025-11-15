import Big from 'big.js';

import {
  CatalogTexture,
  FurnitureCatalog,
  TexturesCatalog,
  TexturesCategory,
} from '../SweetHome3D';

import { DefaultFurnitureCatalog } from '../DefaultFurnitureCatalog';
import { DefaultTexturesCatalog } from '../DefaultTexturesCatalog';
import { CoreTools } from '../CoreTools';
import { LengthUnit } from '../LengthUnit';
import { UUID, UnsupportedOperationException, } from '../core';
import {
  URLContent,
  LocalStorageURLContent,
  IndexedDBURLContent,
  BlobURLContent,
  LocalURLContent,
} from '../URLContent';

import { UserPreferences } from './UserPreferences';
import { DefaultUserPreferences } from './DefaultUserPreferences';

export class RecordedUserPreferences extends UserPreferences {
  static LANGUAGE = "language";
  static UNIT = "unit";
  static CURRENCY = "currency";
  static VALUE_ADDED_TAX_ENABLED = "valueAddedTaxEnabled";
  static DEFAULT_VALUE_ADDED_TAX_PERCENTAGE = "defaultValueAddedTaxPercentage";
  static FURNITURE_CATALOG_VIEWED_IN_TREE = "furnitureCatalogViewedInTree";
  static NAVIGATION_PANEL_VISIBLE = "navigationPanelVisible";
  static EDITING_IN_3D_VIEW_ENABLED = "editingIn3DViewEnabled";
  static AERIAL_VIEW_CENTERED_ON_SELECTION_ENABLED = "aerialViewCenteredOnSelectionEnabled";
  static OBSERVER_CAMERA_SELECTED_AT_CHANGE = "observerCameraSelectedAtChange";
  static MAGNETISM_ENABLED = "magnetismEnabled";
  static RULERS_VISIBLE = "rulersVisible";
  static GRID_VISIBLE = "gridVisible";
  static DEFAULT_FONT_NAME = "defaultFontName";
  static FURNITURE_VIEWED_FROM_TOP = "furnitureViewedFromTop";
  static FURNITURE_MODEL_ICON_SIZE = "furnitureModelIconSize";
  static ROOM_FLOOR_COLORED_OR_TEXTURED = "roomFloorColoredOrTextured";
  static WALL_PATTERN = "wallPattern";
  static NEW_WALL_PATTERN = "newWallPattern";
  static NEW_WALL_THICKNESS = "newWallThickness";
  static NEW_WALL_HEIGHT = "newHomeWallHeight";
  static NEW_WALL_BASEBOARD_THICKNESS = "newWallBaseboardThickness";
  static NEW_WALL_BASEBOARD_HEIGHT = "newWallBaseboardHeight";
  static NEW_FLOOR_THICKNESS = "newFloorThickness";
  static AUTO_SAVE_DELAY_FOR_RECOVERY = "autoSaveDelayForRecovery";
  static RECENT_HOMES = "recentHomes#";
  static IGNORED_ACTION_TIP = "ignoredActionTip#";
  static TEXTURE_NAME = "textureName#";
  static TEXTURE_CREATOR = "textureCreator#";
  static TEXTURE_CATEGORY = "textureCategory#";
  static TEXTURE_IMAGE = "textureImage#";
  static TEXTURE_WIDTH = "textureWidth#";
  static TEXTURE_HEIGHT = "textureHeight#";


  constructor(configuration) {
    super();

    if (configuration !== undefined) {
      this.furnitureCatalogUrls = configuration.furnitureCatalogURLs;
      this.furnitureResourcesUrlBase = configuration.furnitureResourcesURLBase;
      this.texturesCatalogUrls = configuration.texturesCatalogURLs;
      this.texturesResourcesUrlBase = configuration.texturesResourcesURLBase;
      this.writePreferencesUrl = configuration.writePreferencesURL;
      this.readPreferencesUrl = configuration.readPreferencesURL;
      this.writeResourceUrl = configuration.writePreferencesResourceURL !== undefined
        ? configuration.writePreferencesResourceURL : configuration.writeResourceURL;
      this.readResourceUrl = configuration.readPreferencesResourceURL !== undefined
        ? configuration.readPreferencesResourceURL : configuration.readResourceURL;
      this.writingObserver = configuration.writingObserver;
    }

    let userLanguage;
    if (configuration !== undefined && configuration.defaultUserLanguage !== undefined) {
      userLanguage = configuration.defaultUserLanguage;
    } else {
      userLanguage = this.getLanguage();
    }

    this.uploadingBlobs = {};
    this.properties = {};
    this.setFurnitureCatalog(new FurnitureCatalog());
    this.setTexturesCatalog(new TexturesCatalog());
    if (this.readPreferencesUrl) {
      this.updatePreferencesFromProperties(this.properties, userLanguage, false);
      this.readPreferences(this.properties, userLanguage);
    } else {
      // Initialize properties from default preferences
      this.updatePreferencesFromProperties(this.properties, userLanguage, true);
      this.addListeners();
    }

  }

  /**
   * Returns value of property in properties map, and return defaultValue if value is null or undefined.
   * @param {string, string} properties
   * @param {string} propertyKey
   * @param {any} [defaultValue]
   * @return {any} property's value
   * @private
   */
  getProperty(properties, propertyKey, defaultValue) {
    if (properties[propertyKey] === undefined || properties[propertyKey] === null) {
      return defaultValue;
    }
    return properties[propertyKey];
  }

  /**
   * Returns preferences internal properties.
   * @return {string, string}
   * @private
   */
  getProperties() {
    return this.properties;
  }

  /**
   * Sets value of a property in properties map.
   * @param {string, string} properties
   * @param {string} propertyKey
   * @param {any} propertyValue
   * @private
   */
  setProperty(properties, propertyKey, propertyValue) {
    properties[propertyKey] = propertyValue;
  }

  /**
   * Removes the given property in properties map.
   * @param {string, string} properties
   * @param {string} propertyKey
   * @private
   */
  removeProperty(properties, propertyKey) {
    delete properties[propertyKey];
  }

  /**
   * Updates saved preferences from the given properties.
   * @param {string, string} properties 
   * @param {string}         defaultUserLanguage
   * @param {boolean}        updateCatalogs  
   * @private
   */
  updatePreferencesFromProperties(properties, defaultUserLanguage, updateCatalogs) {
    this.setLanguage(this.getProperty(properties, RecordedUserPreferences.LANGUAGE, defaultUserLanguage));

    // Read default furniture and textures catalog
    if (updateCatalogs) {
      this.updateDefaultCatalogs();
    }
    this.readModifiableTexturesCatalog(properties);

    let defaultPreferences = new DefaultUserPreferences(false, defaultUserLanguage);
    defaultPreferences.setLanguage(this.getLanguage());

    // Fill default patterns catalog
    let patternsCatalog = defaultPreferences.getPatternsCatalog();
    this.setPatternsCatalog(patternsCatalog);

    // Read other preferences
    let unit = LengthUnit[this.getProperty(properties, RecordedUserPreferences.UNIT)];
    if (!unit) {
      unit = defaultPreferences.getLengthUnit();
    }
    this.setUnit(unit);

    this.setCurrency(this.getProperty(properties, RecordedUserPreferences.CURRENCY, defaultPreferences.getCurrency()));
    this.setValueAddedTaxEnabled(
      this.getProperty(properties, RecordedUserPreferences.VALUE_ADDED_TAX_ENABLED,
        '' + defaultPreferences.isValueAddedTaxEnabled()) == 'true');
    let percentage = this.getProperty(properties, RecordedUserPreferences.DEFAULT_VALUE_ADDED_TAX_PERCENTAGE);
    let valueAddedTaxPercentage = defaultPreferences.getDefaultValueAddedTaxPercentage();
    if (percentage !== null) {
      try {
        valueAddedTaxPercentage = new Big(percentage);
      } catch (ex) {
      }
    }
    this.setDefaultValueAddedTaxPercentage(valueAddedTaxPercentage);
    this.setFurnitureCatalogViewedInTree(
      this.getProperty(properties, RecordedUserPreferences.FURNITURE_CATALOG_VIEWED_IN_TREE,
        '' + defaultPreferences.isFurnitureCatalogViewedInTree()) == 'true');
    this.setNavigationPanelVisible(
      this.getProperty(properties, RecordedUserPreferences.NAVIGATION_PANEL_VISIBLE,
        '' + defaultPreferences.isNavigationPanelVisible()) == 'true');
    this.setEditingIn3DViewEnabled(
      this.getProperty(properties, RecordedUserPreferences.EDITING_IN_3D_VIEW_ENABLED,
        '' + defaultPreferences.isEditingIn3DViewEnabled()) == 'true');
    this.setAerialViewCenteredOnSelectionEnabled(
      this.getProperty(properties, RecordedUserPreferences.AERIAL_VIEW_CENTERED_ON_SELECTION_ENABLED,
        '' + defaultPreferences.isAerialViewCenteredOnSelectionEnabled()) == 'true');
    this.setObserverCameraSelectedAtChange(
      this.getProperty(properties, RecordedUserPreferences.OBSERVER_CAMERA_SELECTED_AT_CHANGE,
        '' + defaultPreferences.isObserverCameraSelectedAtChange()) == 'true');
    this.setMagnetismEnabled(
      this.getProperty(properties, RecordedUserPreferences.MAGNETISM_ENABLED, 'true') == 'true');
    this.setRulersVisible(
      this.getProperty(properties, RecordedUserPreferences.RULERS_VISIBLE, '' + defaultPreferences.isMagnetismEnabled()) == 'true');
    this.setGridVisible(
      this.getProperty(properties, RecordedUserPreferences.GRID_VISIBLE, '' + defaultPreferences.isGridVisible()) == 'true');
    this.setDefaultFontName(this.getProperty(properties, RecordedUserPreferences.DEFAULT_FONT_NAME, defaultPreferences.getDefaultFontName()));
    this.setFurnitureViewedFromTop(
      this.getProperty(properties, RecordedUserPreferences.FURNITURE_VIEWED_FROM_TOP,
        '' + defaultPreferences.isFurnitureViewedFromTop()) == 'true');
    this.setFurnitureModelIconSize(parseInt(this.getProperty(properties, RecordedUserPreferences.FURNITURE_MODEL_ICON_SIZE,
      '' + defaultPreferences.getFurnitureModelIconSize())));
    this.setFloorColoredOrTextured(
      this.getProperty(properties, RecordedUserPreferences.ROOM_FLOOR_COLORED_OR_TEXTURED,
        '' + defaultPreferences.isRoomFloorColoredOrTextured()) == 'true');

    try {
      this.setWallPattern(patternsCatalog.getPattern(this.getProperty(properties, RecordedUserPreferences.WALL_PATTERN,
        defaultPreferences.getWallPattern().getName())));
    } catch (ex) {
      // Ensure wall pattern always exists even if new patterns are added in future versions
      this.setWallPattern(defaultPreferences.getWallPattern());
    }

    try {
      if (defaultPreferences.getNewWallPattern() != null) {
        this.setNewWallPattern(patternsCatalog.getPattern(this.getProperty(properties, RecordedUserPreferences.NEW_WALL_PATTERN,
          defaultPreferences.getNewWallPattern().getName())));
      }
    } catch (ex) {
      // Keep new wall pattern unchanged
    }

    this.setNewWallThickness(parseFloat(this.getProperty(properties, RecordedUserPreferences.NEW_WALL_THICKNESS,
      '' + defaultPreferences.getNewWallThickness())));
    this.setNewWallHeight(parseFloat(this.getProperty(properties, RecordedUserPreferences.NEW_WALL_HEIGHT,
      '' + defaultPreferences.getNewWallHeight())));
    this.setNewWallBaseboardThickness(defaultPreferences.getNewWallBaseboardThickness());
    this.setNewWallBaseboardHeight(defaultPreferences.getNewWallBaseboardHeight());
    this.setNewWallBaseboardThickness(parseFloat(this.getProperty(properties, RecordedUserPreferences.NEW_WALL_BASEBOARD_THICKNESS,
      '' + defaultPreferences.getNewWallBaseboardThickness())));
    this.setNewWallBaseboardHeight(parseFloat(this.getProperty(properties, RecordedUserPreferences.NEW_WALL_BASEBOARD_HEIGHT,
      '' + defaultPreferences.getNewWallBaseboardHeight())));
    this.setNewFloorThickness(parseFloat(this.getProperty(properties, RecordedUserPreferences.NEW_FLOOR_THICKNESS,
      '' + defaultPreferences.getNewFloorThickness())));
    this.setAutoSaveDelayForRecovery(parseInt(this.getProperty(properties, RecordedUserPreferences.AUTO_SAVE_DELAY_FOR_RECOVERY,
      '' + defaultPreferences.getAutoSaveDelayForRecovery())));
    // Read recent homes list
    let recentHomes = [];
    for (var i = 1; i <= this.getRecentHomesMaxCount(); i++) {
      let recentHome = this.getProperty(properties, RecordedUserPreferences.RECENT_HOMES + i);
      if (recentHome != null) {
        recentHomes.push(recentHome);
      }
    }
    this.setRecentHomes(recentHomes);

    // Read ignored action tips
    for (var i = 1; ; i++) {
      let ignoredActionTip = this.getProperty(properties, RecordedUserPreferences.IGNORED_ACTION_TIP + i, "");
      if (ignoredActionTip.length == 0) {
        break;
      } else {
        this.ignoredActionTips[ignoredActionTip] = true;
      }
    }
  }

  /**
   * Adds listeners to update catalogs and follow properties to save.
   * @private
   */
  addListeners() {
    let preferences = this;
    this.addPropertyChangeListener("LANGUAGE", () => {
      preferences.updateDefaultCatalogs();
    });

    // Add a listener to track written properties and ignore the other ones during a call to write
    let savedPropertyListener = () => {
      preferences.writtenPropertiesUpdated = true;
    };
    let writtenProperties = ["LANGUAGE", "UNIT", "CURRENCY", "VALUE_ADDED_TAX_ENABLED", "DEFAULT_VALUE_ADDED_TAX_PERCENTAGE",
      "FURNITURE_CATALOG_VIEWED_IN_TREE", "NAVIGATION_PANEL_VISIBLE", "EDITING_IN_3D_VIEW_ENABLED", "AERIAL_VIEW_CENTERED_ON_SELECTION_ENABLED",
      "OBSERVER_CAMERA_SELECTED_AT_CHANGE", "MAGNETISM_ENABLED", "GRID_VISIBLE", "DEFAULT_FONT_NAME", "FURNITURE_VIEWED_FROM_TOP",
      "FURNITURE_MODEL_ICON_SIZE", "ROOM_FLOOR_COLORED_OR_TEXTURED", "NEW_WALL_PATTERN", "NEW_WALL_THICKNESS",
      "NEW_WALL_HEIGHT", "NEW_WALL_BASEBOARD_THICKNESS", "NEW_WALL_BASEBOARD_HEIGHT", "NEW_FLOOR_THICKNESS"];
    for (let i = 0; i < writtenProperties.length; i++) {
      let writtenProperty = writtenProperties[i];
      this.addPropertyChangeListener(writtenProperty, savedPropertyListener);
    }
    this.getTexturesCatalog().addTexturesListener(savedPropertyListener);
  }

  /**
   * Read preferences properties from backend.
   * @param {string, string} properties
   * @private
   */
  readPreferences(properties, defaultUserLanguage) {
    try {
      var preferences = this;
      let updateJsonPreferences = jsonPreferences => {
        if (jsonPreferences != null) {
          let preferencesData = JSON.parse(jsonPreferences);
          for (let i in preferencesData) {
            properties[i] = preferencesData[i];
          }
        }
        preferences.updatePreferencesFromProperties(properties, defaultUserLanguage, true);
        preferences.addListeners();
      };

      if (this.readPreferencesUrl.indexOf(LocalStorageURLContent.LOCAL_STORAGE_PREFIX) === 0) {
        let key = this.readPreferencesUrl.substring(LocalStorageURLContent.LOCAL_STORAGE_PREFIX.length);
        updateJsonPreferences(localStorage.getItem(key));
      } else if (this.readPreferencesUrl.indexOf(IndexedDBURLContent.INDEXED_DB_PREFIX) === 0) {
        new IndexedDBURLContent(this.readPreferencesUrl).getBlob({
          blobReady: function (blob) {
            let reader = new FileReader();
            // Use onload rather that addEventListener for Cordova support
            reader.onload = () => {
              updateJsonPreferences(reader.result);
            };
            reader.readAsText(blob);
          },
          blobError: function (status, error) {
            preferences.updateDefaultCatalogs();
            preferences.addListeners();
            if (status != -1) {
              console.log("Can't read preferences from indexedDB " + status + " " + error);
            }
          }
        });
      } else {
        let request = new XMLHttpRequest();
        let querySeparator = this.readPreferencesUrl.indexOf('?') != -1 ? '&' : '?';
        request.open("GET", this.readPreferencesUrl + querySeparator + "requestId=" + UUID.randomUUID(), true);
        request.addEventListener("load", () => {
          if (request.readyState === XMLHttpRequest.DONE
            && request.status === 200) {
            updateJsonPreferences(request.responseText);
          } else {
            preferences.updateDefaultCatalogs();
            preferences.addListeners();
          }
        });
        let errorListener = ev => {
          console.log("Can't read preferences from server");
          preferences.updateDefaultCatalogs();
          preferences.addListeners();
        };
        request.addEventListener("error", errorListener);
        request.addEventListener("timeout", errorListener);
        request.timeout = 10000;
        request.send();
      }
    } catch (ex) {
      console.log(ex);
      preferences.updateDefaultCatalogs();
      preferences.addListeners();
    }
  }

  /**
   * @private
   */
  updateDefaultCatalogs() {
    // Delete default pieces of current furniture catalog
    let furnitureCatalog = this.getFurnitureCatalog();
    for (var i = furnitureCatalog.getCategories().length - 1; i >= 0; i--) {
      var category = furnitureCatalog.getCategory(i);
      for (var j = category.getFurniture().length - 1; j >= 0; j--) {
        var piece = category.getPieceOfFurniture(j);
        if (!piece.isModifiable()) {
          furnitureCatalog['delete'](piece); // Can't call delete method directly because delete is a JS reserved word 
        }
      }
    }

    // Add default pieces
    let resourceFurnitureCatalog = typeof DefaultFurnitureCatalog === "function"
      ? (Array.isArray(this.furnitureCatalogUrls)
        ? this.readFurnitureCatalogFromResource(this.furnitureCatalogUrls, this.furnitureResourcesUrlBase)
        : new DefaultFurnitureCatalog(this))
      : new FurnitureCatalog();
    for (var i = 0; i < resourceFurnitureCatalog.getCategories().length; i++) {
      var category = resourceFurnitureCatalog.getCategory(i);
      for (var j = 0; j < category.getFurniture().length; j++) {
        var piece = category.getPieceOfFurniture(j);
        furnitureCatalog.add(category, piece);
      }
    }

    // Delete default textures of current textures catalog
    let texturesCatalog = this.getTexturesCatalog();
    for (var i = texturesCatalog.getCategories().length - 1; i >= 0; i--) {
      var category = texturesCatalog.getCategory(i);
      for (var j = category.getTextures().length - 1; j >= 0; j--) {
        var texture = category.getTexture(j);
        if (!texture.isModifiable()) {
          texturesCatalog['delete'](texture);
        }
      }
    }

    // Add default textures
    let resourceTexturesCatalog = typeof DefaultTexturesCatalog === "function"
      ? (Array.isArray(this.texturesCatalogUrls)
        ? this.readTexturesCatalogFromResource(this.texturesCatalogUrls, this.texturesResourcesUrlBase)
        : new DefaultTexturesCatalog(this))
      : new TexturesCatalog();

    for (var i = 0; i < resourceTexturesCatalog.getCategories().length; i++) {
      var category = resourceTexturesCatalog.getCategory(i);
      for (var j = 0; j < category.getTextures().length; j++) {
        var texture = category.getTexture(j);
        texturesCatalog.add(category, texture);
      }
    }
  }

  /**
   * Returns the furniture catalog contained from the given resources.
   * @param {Array} furnitureCatalogUrls
   * @param {String} furnitureResourcesUrlBase
   * @protected
   */
  readFurnitureCatalogFromResource(furnitureCatalogUrls, furnitureResourcesUrlBase) {
    return new DefaultFurnitureCatalog(furnitureCatalogUrls, furnitureResourcesUrlBase);
  }

  /**
   * Returns the textures catalog contained from the the given resources.
   * @param {Array} texturesCatalogUrls
   * @param {String} texturesResourcesUrlBase
   * @protected
   */
  readTexturesCatalogFromResource(texturesCatalogUrls, texturesResourcesUrlBase) {
    return new DefaultTexturesCatalog(texturesCatalogUrls, texturesResourcesUrlBase);
  }

  /**
   * Reads modifiable textures catalog from preferences.
   * @param {string, string} properties 
   * @private
   */
  readModifiableTexturesCatalog(properties) {
    let texture;
    for (let i = 1; (texture = this.readModifiableTexture(properties, i)) != null; i++) {
      if (texture.getImage().getURL() != "") {
        let textureCategory = this.readModifiableTextureCategory(properties, i);
        this.getTexturesCatalog().add(textureCategory, texture);
      }
    }
  }

  /**
   * Returns the modifiable texture read from <code>properties</code> at the given <code>index</code>.
   * @param {string, string} properties 
   * @param {number} index  the index of the read texture
   * @return the read texture or <code>null</code> if the texture at the given index doesn't exist.
   * @protected
   */
  readModifiableTexture(properties, index) {
    let name = this.getProperty(properties, RecordedUserPreferences.TEXTURE_NAME + index, null);
    if (name == null) {
      // Return null if key textureName# doesn't exist
      return null;
    }
    let image = URLContent.fromURL(this.getProperty(properties, RecordedUserPreferences.TEXTURE_IMAGE + index, ""));
    let width = parseFloat(this.getProperty(properties, RecordedUserPreferences.TEXTURE_WIDTH + index, "0.1"));
    let height = parseFloat(this.getProperty(properties, RecordedUserPreferences.TEXTURE_HEIGHT + index, "0.1"));
    let creator = this.getProperty(properties, RecordedUserPreferences.TEXTURE_CREATOR + index, null);
    return new CatalogTexture(null, name, image, width, height, creator, true);
  }

  /**
  * Returns the category of a texture at the given <code>index</code>
  * read from <code>properties</code>.
   * @param {string, string} properties 
   * @param {number} index  the index of the read texture
   * @protected
  */
  readModifiableTextureCategory(properties, index) {
    let category = this.getProperty(properties, RecordedUserPreferences.TEXTURE_CATEGORY + index, "");
    return new TexturesCategory(category);
  }

  /**
   * Writes user preferences to properties, and sends to the <code>writePreferencesUrl</code> (if
   * given at the creation) a JSON content describing preferences.
   */
  write() {
    super.write();

    // Write actually preferences only if written properties were updated
    if (this.writtenPropertiesUpdated) {
      let properties = this.getProperties();
      this.writeModifiableTexturesCatalog(properties);

      // Write other preferences
      this.setProperty(properties, RecordedUserPreferences.LANGUAGE, this.getLanguage());
      this.setProperty(properties, RecordedUserPreferences.UNIT, this.getLengthUnit().name());
      let currency = this.getCurrency();
      if (currency === null) {
        this.removeProperty(properties, RecordedUserPreferences.CURRENCY);
      } else {
        this.setProperty(properties, RecordedUserPreferences.CURRENCY, currency);
      }
      this.setProperty(properties, RecordedUserPreferences.VALUE_ADDED_TAX_ENABLED, '' + this.isValueAddedTaxEnabled());
      let valueAddedTaxPercentage = this.getDefaultValueAddedTaxPercentage();
      if (valueAddedTaxPercentage === null) {
        this.removeProperty(properties, RecordedUserPreferences.DEFAULT_VALUE_ADDED_TAX_PERCENTAGE);
      } else {
        this.setProperty(properties, RecordedUserPreferences.DEFAULT_VALUE_ADDED_TAX_PERCENTAGE, valueAddedTaxPercentage.toString());
      }
      this.setProperty(properties, RecordedUserPreferences.FURNITURE_CATALOG_VIEWED_IN_TREE, '' + this.isFurnitureCatalogViewedInTree());
      this.setProperty(properties, RecordedUserPreferences.NAVIGATION_PANEL_VISIBLE, '' + this.isNavigationPanelVisible());
      this.setProperty(properties, RecordedUserPreferences.EDITING_IN_3D_VIEW_ENABLED, '' + this.isEditingIn3DViewEnabled());
      this.setProperty(properties, RecordedUserPreferences.AERIAL_VIEW_CENTERED_ON_SELECTION_ENABLED, '' + this.isAerialViewCenteredOnSelectionEnabled());
      this.setProperty(properties, RecordedUserPreferences.OBSERVER_CAMERA_SELECTED_AT_CHANGE, '' + this.isObserverCameraSelectedAtChange());
      this.setProperty(properties, RecordedUserPreferences.MAGNETISM_ENABLED, '' + this.isMagnetismEnabled());
      this.setProperty(properties, RecordedUserPreferences.RULERS_VISIBLE, '' + this.isRulersVisible());
      this.setProperty(properties, RecordedUserPreferences.GRID_VISIBLE, '' + this.isGridVisible());
      let defaultFontName = this.getDefaultFontName();
      if (defaultFontName == null) {
        this.removeProperty(properties, RecordedUserPreferences.DEFAULT_FONT_NAME);
      } else {
        this.setProperty(properties, RecordedUserPreferences.DEFAULT_FONT_NAME, defaultFontName);
      }
      this.setProperty(properties, RecordedUserPreferences.FURNITURE_VIEWED_FROM_TOP, '' + this.isFurnitureViewedFromTop());
      this.setProperty(properties, RecordedUserPreferences.FURNITURE_MODEL_ICON_SIZE, '' + this.getFurnitureModelIconSize());
      this.setProperty(properties, RecordedUserPreferences.ROOM_FLOOR_COLORED_OR_TEXTURED, '' + this.isRoomFloorColoredOrTextured());
      this.setProperty(properties, RecordedUserPreferences.WALL_PATTERN, this.getWallPattern().getName());
      let newWallPattern = this.getNewWallPattern();
      if (newWallPattern != null) {
        this.setProperty(properties, RecordedUserPreferences.NEW_WALL_PATTERN, newWallPattern.getName());
      }
      this.setProperty(properties, RecordedUserPreferences.NEW_WALL_THICKNESS, '' + this.getNewWallThickness());
      this.setProperty(properties, RecordedUserPreferences.NEW_WALL_HEIGHT, '' + this.getNewWallHeight());
      this.setProperty(properties, RecordedUserPreferences.NEW_WALL_BASEBOARD_THICKNESS, '' + this.getNewWallBaseboardThickness());
      this.setProperty(properties, RecordedUserPreferences.NEW_WALL_BASEBOARD_HEIGHT, '' + this.getNewWallBaseboardHeight());
      this.setProperty(properties, RecordedUserPreferences.NEW_FLOOR_THICKNESS, '' + this.getNewFloorThickness());
      this.setProperty(properties, RecordedUserPreferences.AUTO_SAVE_DELAY_FOR_RECOVERY, '' + this.getAutoSaveDelayForRecovery());
      // Write recent homes list
      let recentHomes = this.getRecentHomes();
      for (var i = 0; i < recentHomes.length && i < this.getRecentHomesMaxCount(); i++) {
        this.setProperty(properties, RecordedUserPreferences.RECENT_HOMES + (i + 1), recentHomes[i]);
      }
      // Write ignored action tips
      let ignoredActionTipsKeys = Object.keys(this.ignoredActionTips);
      for (var i = 0; i < ignoredActionTipsKeys.length; i++) {
        let key = ignoredActionTipsKeys[i];
        if (this.ignoredActionTips[key]) {
          this.setProperty(properties, RecordedUserPreferences.IGNORED_ACTION_TIP + (i + 1), key);
        }
      }

      if (Object.keys(this.uploadingBlobs).length > 0) {
        let preferences = this;
        // Wait blobs uploading end before trying to write preferences referencing them
        setTimeout(() => {
          preferences.write();
        }, 1000);
      } else {
        this.writtenPropertiesUpdated = false;
        this.writePreferences(properties);
      }
    }
  }

  /**
   * Sends user preferences stored in properties to backend.
   * @param {string, string} properties
   * @private
   */
  writePreferences(properties) {
    if (this.writePreferencesUrl) {
      let preferences = this;
      if (this.writingPreferences) {
        // Avoid writing preferences twice at the same time
        setTimeout(() => {
          preferences.writePreferences(properties);
        }, 100);
      } else {
        this.writingPreferences = true;
        let jsonPreferences = JSON.stringify(properties);
        let successHandler = () => {
          if (preferences.writingObserver !== undefined
            && preferences.writingObserver.writeSucceeded) {
            preferences.writingObserver.writeSucceeded(properties);
          }
          setTimeout(() => {
            delete preferences.writingPreferences;
          }, 500);
        };
        let errorHandler = (status, error) => {
          if (preferences.writingObserver !== undefined
            && preferences.writingObserver.writeFailed) {
            preferences.writingObserver.writeFailed(properties, status, error);
          }
          setTimeout(() => {
            delete preferences.writingPreferences;
            // Retry
            preferences.writePreferences(properties);
          }, 10000);
        };

        if (this.writePreferencesUrl.indexOf(LocalStorageURLContent.LOCAL_STORAGE_PREFIX) === 0) {
          try {
            let key = this.writePreferencesUrl.substring(LocalStorageURLContent.LOCAL_STORAGE_PREFIX.length);
            localStorage.setItem(key, jsonPreferences);
            successHandler();
            delete preferences.writingPreferences;
          } catch (ex) {
            errorHandler(ex, ex.message);
          }
        } else if (this.writePreferencesUrl.indexOf(IndexedDBURLContent.INDEXED_DB_PREFIX) === 0) {
          let preferencesContent = new BlobURLContent(new Blob([jsonPreferences], { type: 'application/json' }));
          preferencesContent.writeBlob(this.writePreferencesUrl, "", {
            blobSaved: function (content, name) {
              URL.revokeObjectURL(preferencesContent.getURL());
              successHandler();
            },
            blobError: function (status, error) {
              URL.revokeObjectURL(preferencesContent.getURL());
              errorHandler(status, error);
            }
          });
        } else {
          let request = new XMLHttpRequest();
          let querySeparator = this.writePreferencesUrl.indexOf('?') != -1 ? '&' : '?';
          request.open("POST", this.writePreferencesUrl + querySeparator + "updateId=" + UUID.randomUUID(), true);
          request.addEventListener('load', (ev) => {
            if (request.readyState === XMLHttpRequest.DONE) {
              if (request.status === 200) {
                successHandler();
              } else {
                errorHandler(request.status, request.responseText);
              }
            }
          });
          let errorListener = ev => {
            errorHandler(0, "Can't post " + preferences.writePreferencesUrl);
          };
          request.addEventListener("error", errorListener);
          request.addEventListener("timeout", errorListener);
          request.send(jsonPreferences);
        }
      }
    }
  }

  /**
   * Sets which action tip should be ignored.
   * @ignore
   */
  setActionTipIgnored(actionKey) {
    this.ignoredActionTips[actionKey] = true;
    super.setActionTipIgnored(actionKey);
  }

  /**
   * Returns whether an action tip should be ignored or not.
   * @ignore
   */
  isActionTipIgnored(actionKey) {
    let ignoredActionTip = this.ignoredActionTips[actionKey];
    return ignoredActionTip === true;
  }

  /**
   * Resets the display flag of action tips.
   * @ignore
   */
  resetIgnoredActionTips() {
    let keys = Object.keys(this.ignoredActionTips);
    for (let i = 0; i < keys.length; i++) {
      this.ignoredActionTips[keys[i]] = false;
    }
    super.resetIgnoredActionTips();
  }

  /**
   * Throws an exception because these user preferences can't manage language libraries.
   * @ignore
   */
  addLanguageLibrary(location) {
    throw new UnsupportedOperationException();
  }

  /**
   * Throws an exception because these user preferences can't manage additional language libraries.
   * @ignore
   */
  languageLibraryExists(location) {
    throw new UnsupportedOperationException();
  }

  /**
   * Returns <code>true</code> if the furniture library at the given <code>location</code> exists.
   * @ignore
   */
  furnitureLibraryExists(location) {
    throw new UnsupportedOperationException();
  }

  /**
   * Throws an exception because these user preferences can't manage additional furniture libraries.
   * @ignore
   */
  addFurnitureLibrary(location) {
    throw new UnsupportedOperationException();
  }

  /**
   * Returns <code>true</code> if the textures library at the given <code>location</code> exists.
   * @ignore
   */
  texturesLibraryExists(location) {
    throw new UnsupportedOperationException();
  }

  /**
   * Throws an exception because these user preferences can't manage additional textures libraries.
   * @ignore
   */
  addTexturesLibrary(location) {
    throw new UnsupportedOperationException();
  }

  /**
   * Throws an exception because these user preferences don't manage additional libraries.
   * @ignore
   */
  getLibraries() {
    throw new UnsupportedOperationException();
  }

  /**
   * Save modifiable textures to catalog.json and upload new resources.
   * @param {string, string} properties 
   * @private
   */
  writeModifiableTexturesCatalog(properties) {
    if (this.writeResourceUrl && this.readResourceUrl) {
      let index = 1;
      let texturesCatalog = this.getTexturesCatalog();
      let preferences = this;
      for (let i = 0; i < texturesCatalog.getCategoriesCount(); i++) {
        let textureCategory = texturesCatalog.getCategory(i);
        for (let j = 0; j < textureCategory.getTexturesCount(); j++) {
          let catalogTexture = textureCategory.getTexture(j);
          const textureImage = catalogTexture.getImage();
          if (catalogTexture.isModifiable()
            && textureImage instanceof URLContent) {
            this.setProperty(properties, RecordedUserPreferences.TEXTURE_NAME + index, catalogTexture.getName());
            this.setProperty(properties, RecordedUserPreferences.TEXTURE_CATEGORY + index, textureCategory.getName());
            this.setProperty(properties, RecordedUserPreferences.TEXTURE_WIDTH + index, catalogTexture.getWidth());
            this.setProperty(properties, RecordedUserPreferences.TEXTURE_HEIGHT + index, catalogTexture.getHeight());
            if (catalogTexture.getCreator() != null) {
              this.setProperty(properties, RecordedUserPreferences.TEXTURE_CREATOR + index, catalogTexture.getCreator());
            } else {
              this.removeProperty(properties, RecordedUserPreferences.TEXTURE_CREATOR + index);
            }

            if (textureImage instanceof LocalURLContent
              && (!(textureImage instanceof LocalStorageURLContent)
                || this.writeResourceUrl.indexOf(LocalStorageURLContent.LOCAL_STORAGE_PREFIX) < 0)
              && (!(textureImage instanceof IndexedDBURLContent)
                || this.writeResourceUrl.indexOf(IndexedDBURLContent.INDEXED_DB_PREFIX) < 0)) {
              if (!this.isSavedContentInResourceScope(textureImage)) {
                let textureImageFileName = this.uploadingBlobs[textureImage.getURL()];
                if (textureImageFileName === undefined) {
                  textureImage.getBlob({
                    textureImage: textureImage,
                    blobReady: function (blob) {
                      textureImageFileName = UUID.randomUUID();
                      preferences.uploadingBlobs[this.textureImage.getURL()] = textureImageFileName;
                      let imageExtension = blob.type == "image/png" ? ".png" : ".jpg";
                      let loadListener = (textureImage, fileName, textureIndex) => {
                        if (!preferences.isSavedContentInResourceScope(textureImage)) {
                          let savedContent = URLContent.fromURL(
                            CoreTools.format(preferences.readResourceUrl.replace(/(%[^s])/g, "%$1"), encodeURIComponent(fileName)));
                          textureImage.setSavedContent(savedContent);
                        }
                        delete preferences.uploadingBlobs[textureImage.getURL()];
                        preferences.setProperty(properties, RecordedUserPreferences.TEXTURE_IMAGE + textureIndex, textureImage.getSavedContent().getURL());
                      };
                      preferences.writeResource(textureImage, textureImageFileName + imageExtension, index, loadListener);
                    },
                    blobError: function (status, error) {
                      contentsObserver.resourcesError(status, error);
                    }
                  });
                }
              } else {
                // Always update uploading blobs map because blob may have been saved elsewhere
                delete preferences.uploadingBlobs[textureImage.getURL()];
                this.setProperty(properties, RecordedUserPreferences.TEXTURE_IMAGE + index, textureImage.getSavedContent().getURL());
              }
            } else if (textureImage instanceof URLContent) {
              this.setProperty(properties, RecordedUserPreferences.TEXTURE_IMAGE + index, textureImage.getURL());
            }
            index++;
          }
        }
      }

      // Remove obsolete keys
      for (; this.getProperty(properties, RecordedUserPreferences.TEXTURE_NAME + index, null) != null; index++) {
        this.removeProperty(properties, RecordedUserPreferences.TEXTURE_NAME + index);
        this.removeProperty(properties, RecordedUserPreferences.TEXTURE_IMAGE + index);
        this.removeProperty(properties, RecordedUserPreferences.TEXTURE_CATEGORY + index);
        this.removeProperty(properties, RecordedUserPreferences.TEXTURE_WIDTH + index);
        this.removeProperty(properties, RecordedUserPreferences.TEXTURE_HEIGHT + index);
        this.removeProperty(properties, RecordedUserPreferences.TEXTURE_CREATOR + index);
      }
    }
  }

  /**
   * Returns <code>true</code> if the saved content of the given content exists 
   * and depends on the scope where the resources managed by preferences are saved.
   * @param {URLContent} urlContent  content
   * @private
   */
  isSavedContentInResourceScope(urlContent) {
    let savedContent = urlContent.getSavedContent();
    return savedContent !== null
      && (!(savedContent instanceof IndexedDBURLContent)
        || this.writeResourceUrl.indexOf(IndexedDBURLContent.INDEXED_DB_PREFIX) < 0
        || savedContent.getURL().indexOf(this.writeResourceUrl.substring(0, this.writeResourceUrl.indexOf('?'))) === 0);
  }

  /**
   * @param {BlobURLContent} urlContent  blob content
   * @param {string} path unique file name of the written resource
   * @param {number} index
   * @param {function()} loadListener called when content is uploaded
   * @private
   */
  writeResource(urlContent, path, index, loadListener) {
    let preferences = this;
    urlContent.writeBlob(this.writeResourceUrl, path, {
      blobSaved: function (content, name) {
        if (preferences.writingObserver !== undefined
          && preferences.writingObserver.writeSucceeded) {
          preferences.writingObserver.writeSucceeded(content.getBlob());
        }
        loadListener(content, path, index);
      },
      blobError: function (status, error) {
        if (preferences.writingObserver !== undefined
          && preferences.writingObserver.writeFailed) {
          preferences.writingObserver.writeFailed(urlContent.getBlob(), status, error);
        }
        // In case of error, wait 10s before attempting a new upload
        setTimeout(() => {
          // Check it wasn't saved elsewhere
          if (urlContent.getSavedContent() === null) {
            preferences.writeResource(urlContent, path, index, loadListener);
          } else {
            loadListener(urlContent, index);
          }
        }, 10000);
      }
    });
  }
}
