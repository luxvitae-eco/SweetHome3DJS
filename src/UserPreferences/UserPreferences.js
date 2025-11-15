/*
 * UserPreferences.js
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
import { TextStyle, } from '../SweetHome3D';

import { CoreTools } from '../CoreTools';
import {
  PropertyChangeSupport,
  IllegalArgumentException,
} from '../core';
import { Locale } from '../core';

/**
 * User preferences.
 * @constructor
 * @author Emmanuel Puybaret
 */
export class UserPreferences {
  static DEFAULT_SUPPORTED_LANGUAGES = ["bg", "cs", "de", "el", "en", "es", "fr", "it", "ja", "hu", "nl", "pl", "pt", "pt_BR", "ru", "sv", "vi", "zh_CN", "zh_TW"];

  static DEFAULT_TEXT_STYLE = new TextStyle(18);
  static DEFAULT_ROOM_TEXT_STYLE = new TextStyle(24);

  constructor() {
    this.propertyChangeSupport = new PropertyChangeSupport(this);

    this.initSupportedLanguages(UserPreferences.DEFAULT_SUPPORTED_LANGUAGES);

    this.resourceBundles = [];
    this.furnitureCatalogResourceBundles = [];
    this.texturesCatalogResourceBundles = [];

    /** @type {FurnitureCatalog} */
    this.furnitureCatalog = null;
    /** @type {TexturesCatalog} */
    this.texturesCatalog = null;
    /** @type {PatternsCatalog} */
    this.patternsCatalog = null;
    this.currency = null;
    this.valueAddedTaxEnabled = false
    this.defaultValueAddedTaxPercentage = null;
    /** @type {LengthUnit} */
    this.unit = null;
    this.furnitureCatalogViewedInTree = false;
    this.navigationPanelVisible = true;
    this.editingIn3DViewEnabled = false;
    this.aerialViewCenteredOnSelectionEnabled = false;
    this.observerCameraSelectedAtChange = true;
    this.magnetismEnabled = true;
    this.rulersVisible = true;
    this.gridVisible = true;
    this.defaultFontName = null;
    this.furnitureViewedFromTop = true;
    this.furnitureModelIconSize = 128;
    this.roomFloorColoredOrTextured = true;
    /** @type {TextureImage} */
    this.wallPattern = null;
    /** @type {TextureImage}  */
    this.newWallPattern = null;
    this.newWallThickness = 7.5;
    this.newWallHeight = 250;
    this.newWallBaseboardThickness = 1;
    this.newWallBaseboardHeight = 7;
    this.newRoomFloorColor = null;
    this.newFloorThickness = 12;
    this.autoSaveDelayForRecovery = 0;
    this.recentHomes = [];
    this.autoCompletionStrings = {};
    this.recentColors = [];
    this.recentTextures = [];
    this.homeExamples = [];

    this.ignoredActionTips = {};
  }

  /**
   * Initializes the supportedLanguage property (and potentially the language property if it has to change)
   * @private
   */
  initSupportedLanguages(supportedLanguages) {
    this.supportedLanguages = supportedLanguages;
    // We also initialize the language except if already set and within the supported languages
    if (!this.language || this.supportedLanguages.indexOf(this.language) === -1) {
      let defaultLocale = Locale.getDefault();
      if (defaultLocale === null) {
        defaultLocale = "en";
      }
      this.defaultCountry = "";
      let defaultLanguage = defaultLocale;
      if (defaultLocale.indexOf("_") > 0) {
        this.defaultCountry = defaultLocale.substring(defaultLocale.indexOf("_") + 1, defaultLocale.length);
        defaultLanguage = this.language
          ? this.language.substring(0, this.language.indexOf("_"))
          : defaultLocale.substring(0, defaultLocale.indexOf("_"));
      }
      // Find closest language among supported languages in Sweet Home 3D
      // For example, use simplified Chinese even for Chinese users (zh_?) not from China (zh_CN)
      // unless their exact locale is supported as in Taiwan (zh_TW)
      for (let i = 0; i < this.supportedLanguages.length; i++) {
        let supportedLanguage = this.supportedLanguages[i];
        if (this.defaultCountry != "" && supportedLanguage == defaultLanguage + "_" + this.defaultCountry
          || this.defaultCountry == "" && supportedLanguage == defaultLanguage) {
          this.language = supportedLanguage;
          break; // Found the exact supported language
        } else if (this.language === undefined
          && supportedLanguage.indexOf(defaultLanguage) === 0) {
          this.language = supportedLanguage; // Found a supported language
        }
      }
      // If no language was found, let's use English by default
      if (this.language === undefined) {
        this.language = "en";
      }
      this.updateDefaultLocale();
    }
  }

  /**
   * Updates default locale from preferences language.
   * @private
   */
  updateDefaultLocale() {
    if (this.language.indexOf("_") !== -1
      || this.defaultCountry == "") {
      Locale.setDefault(this.language);
    } else {
      Locale.setDefault(this.language + "_" + this.defaultCountry);
    }
  }

  /**
   * Writes user preferences.
   */
  write() {
    // Does nothing
  }

  /**
   * Adds the property change <code>listener</code> in parameter to these preferences.
   * @since 6.4
   */
  addPropertyChangeListener(listener) {
    this.propertyChangeSupport.addPropertyChangeListener(listener);
  }

  /**
   * Removes the property change <code>listener</code> in parameter from these preferences.
   * @since 6.4
   */
  removePropertyChangeListener(listener) {
    this.propertyChangeSupport.removePropertyChangeListener(listener);
  }

  /**
   * Adds the <code>listener</code> in parameter to these preferences to listen
   * to the changes of the given <code>property</code>.
   * The listener is a function that will receive in parameter an event of {@link PropertyChangeEvent} class.
   */
  addPropertyChangeListener(property, listener) {
    this.propertyChangeSupport.addPropertyChangeListener(property, listener);
  }

  /**
   * Removes the <code>listener</code> in parameter from these preferences.
   */
  removePropertyChangeListener(property, listener) {
    this.propertyChangeSupport.removePropertyChangeListener(property, listener);
  }

  /**
   * Returns the furniture catalog.
   * @ignore
   */
  getFurnitureCatalog() {
    return this.furnitureCatalog;
  }

  /**
   * Sets furniture catalog.
   * @ignore
   */
  setFurnitureCatalog(catalog) {
    this.furnitureCatalog = catalog;
  }

  /**
   * Returns the textures catalog.
   * @ignore
   */
  getTexturesCatalog() {
    return this.texturesCatalog;
  }

  /**
   * Sets textures catalog.
   * @ignore
   */
  setTexturesCatalog(catalog) {
    this.texturesCatalog = catalog;
  }

  /**
   * Returns the patterns catalog available to fill plan areas. 
   */
  getPatternsCatalog() {
    return this.patternsCatalog;
  }

  /**
   * Sets the patterns available to fill plan areas.
   * @ignore
   */
  setPatternsCatalog(catalog) {
    this.patternsCatalog = catalog;
  }

  /**
   * Returns the length unit currently in use.
   * @return {LengthUnit}
   */
  getLengthUnit() {
    return this.unit;
  }

  /**
   * Changes the unit currently in use, and notifies listeners of this change. 
   * @param unit one of the values of Unit.
   */
  setUnit(unit) {
    if (this.unit !== unit) {
      let oldUnit = this.unit;
      this.unit = unit;
      this.propertyChangeSupport.firePropertyChange("UNIT", oldUnit, unit);
    }
  }

  /**
   * Returns the preferred language to display information, noted with an ISO 639 code
   * that may be followed by an underscore and an ISO 3166 code.
   */
  getLanguage() {
    return this.language;
  }

  /**
   * If language can be changed, sets the preferred language to display information, 
   * changes current default locale accordingly and notifies listeners of this change.
   * @param language an ISO 639 code that may be followed by an underscore and an ISO 3166 code
   *            (for example fr, de, it, en_US, zh_CN). 
   */
  setLanguage(language) {
    if (language != this.language && this.isLanguageEditable()) {
      let oldLanguage = this.language;
      this.language = language;
      // Make it accessible to other localized parts (e.g. LengthUnit)
      this.updateDefaultLocale();
      this.resourceBundles = [];
      this.furnitureCatalogResourceBundles = [];
      this.texturesCatalogResourceBundles = [];
      this.propertyChangeSupport.firePropertyChange("LANGUAGE", oldLanguage, language);
    }
  }

  /**
   * Returns <code>true</code> if the language in preferences can be set.
   * @return <code>true</code> except if <code>user.language</code> System property isn't writable.
   * @ignore 
   */
  isLanguageEditable() {
    return true;
  }

  /**
   * Returns the array of default available languages in Sweet Home 3D.
   * @return an array of languages_countries ISO representations
   */
  getDefaultSupportedLanguages() {
    return UserPreferences.DEFAULT_SUPPORTED_LANGUAGES.slice(0);
  }

  /**
   * Returns the array of available languages in Sweet Home 3D including languages in libraries.
   */
  getSupportedLanguages() {
    return this.supportedLanguages.slice(0);
  }

  /**
   * Returns the array of available languages in Sweet Home 3D.
   */
  setSupportedLanguages(supportedLanguages) {
    if (this.supportedLanguages != supportedLanguages) {
      let oldSupportedLanguages = this.supportedLanguages;
      let oldLanguage = this.language;
      this.initSupportedLanguages(supportedLanguages.slice(0));
      this.propertyChangeSupport.firePropertyChange("SUPPORTED_LANGUAGES", oldSupportedLanguages, supportedLanguages);
      if (oldLanguage != this.language) {
        this.propertyChangeSupport.firePropertyChange("LANGUAGE", oldLanguage, this.language);
      }
    }
  }

  /**
   * Returns the string matching <code>resourceKey</code> in current language in the 
   * context of <code>resourceClass</code> or for a resource family if <code>resourceClass</code>
   * is a string.
   * If <code>resourceParameters</code> isn't empty the string is considered
   * as a format string, and the returned string will be formatted with these parameters. 
   * This implementation searches first the key in a properties file named as 
   * <code>resourceClass</code>, then if this file doesn't exist, it searches 
   * the key prefixed by <code>resourceClass</code> name and a dot in a package.properties file 
   * in the folder matching the package of <code>resourceClass</code>. 
   * @throws IllegalArgumentException if no string for the given key can be found
   */
  getLocalizedString(resourceClass, resourceKey, resourceParameters) {
    this.getResourceBundles(resourceClass);
    if (resourceClass == "DefaultFurnitureCatalog") {
      return CoreTools.getStringFromKey.apply(null, [this.furnitureCatalogResourceBundles, resourceKey].concat(Array.prototype.slice.call(arguments, 2)));
    } else if (resourceClass == "DefaultTexturesCatalog") {
      return CoreTools.getStringFromKey.apply(null, [this.texturesCatalogResourceBundles, resourceKey].concat(Array.prototype.slice.call(arguments, 2)));
    } else {
      // JSweet-generated code interop: if resourceClass is a constructor, it may contain the Java class full name in __class
      if (resourceClass.__class) {
        let resourceClassArray = resourceClass.__class.split('.');
        resourceClass = resourceClassArray[resourceClassArray.length - 1];
      }
      let key = resourceClass + "." + resourceKey;
      return CoreTools.getStringFromKey.apply(null, [this.resourceBundles, key].concat(Array.prototype.slice.call(arguments, 2)));
    }
  }

  /**
   * Returns the keys of the localized property strings of the given resource family.
   * @throws IllegalArgumentException if the given resourceFamily is not supported
   */
  getLocalizedStringKeys(resourceFamily) {
    if (resourceClass == "DefaultFurnitureCatalog") {
      let keys = {};
      for (let i = 0; i < resourceBundles.length; i++) {
        if (resourceBundles[i] != null) {
          CoreTools.merge(keys, resourceBundles[i]);
        }
      }
      return Object.getOwnPropertyNames(keys);
    } else {
      throw new IllegalArgumentException("unsupported family");
    }
  }

  /**
   * Returns the resource bundle for the given resource family.
   */
  getResourceBundles(resourceClass) {
    if (resourceClass == "DefaultFurnitureCatalog") {
      if (this.furnitureCatalogResourceBundles.length == 0) {
        this.furnitureCatalogResourceBundles = CoreTools.loadResourceBundles("resources/DefaultFurnitureCatalog", Locale.getDefault());
      }
      return this.furnitureCatalogResourceBundles;
    } else if (resourceClass == "DefaultTexturesCatalog") {
      if (this.texturesCatalogResourceBundles.length == 0) {
        this.texturesCatalogResourceBundles = CoreTools.loadResourceBundles("resources/DefaultTexturesCatalog", Locale.getDefault());
      }
      return this.texturesCatalogResourceBundles;
    } else {
      if (this.resourceBundles.length == 0) {
        this.resourceBundles = CoreTools.loadResourceBundles("resources/localization", Locale.getDefault());
      }
      return this.resourceBundles;
    }
  }

  /**
   * Returns the default currency in use, noted with ISO 4217 code, or <code>null</code> 
   * if prices aren't used in application.
   * @ignore
   */
  getCurrency() {
    return this.currency;
  }

  /**
   * Sets the default currency in use.
   * @ignore
   */
  setCurrency(currency) {
    if (currency != this.currency) {
      let oldCurrency = this.currency;
      this.currency = currency;
      this.propertyChangeSupport.firePropertyChange("CURRENCY", oldCurrency, currency);
    }
  }

  /**
   * Returns <code>true</code> if Value Added Tax should be taken in account in prices.
   * @since 6.0
   * @ignore
   */
  isValueAddedTaxEnabled() {
    return this.valueAddedTaxEnabled;
  }

  /**
   * Sets whether Value Added Tax should be taken in account in prices.
   * @param valueAddedTaxEnabled if <code>true</code> VAT will be added to prices.
   * @since 6.0
   * @ignore
   */
  setValueAddedTaxEnabled(valueAddedTaxEnabled) {
    if (this.valueAddedTaxEnabled !== valueAddedTaxEnabled) {
      this.valueAddedTaxEnabled = valueAddedTaxEnabled;
      this.propertyChangeSupport.firePropertyChange("VALUE_ADDED_TAX_ENABLED",
        !valueAddedTaxEnabled, valueAddedTaxEnabled);
    }
  }

  /**
   * Returns the Value Added Tax percentage applied to prices by default, or <code>null</code>
   * if VAT isn't taken into account in the application.
   * @since 6.0
   * @ignore
   */
  getDefaultValueAddedTaxPercentage() {
    return this.defaultValueAddedTaxPercentage;
  }

  /**
   * Sets the Value Added Tax percentage applied to prices by default.
   * @param {Big} valueAddedTaxPercentage the default VAT percentage
   * @since 6.0
   * @ignore
   */
  setDefaultValueAddedTaxPercentage(valueAddedTaxPercentage) {
    if (valueAddedTaxPercentage !== this.defaultValueAddedTaxPercentage
      && (valueAddedTaxPercentage == null || this.defaultValueAddedTaxPercentage == null || !valueAddedTaxPercentage.eq(this.defaultValueAddedTaxPercentage))) {
      let oldValueAddedTaxPercentage = this.defaultValueAddedTaxPercentage;
      this.defaultValueAddedTaxPercentage = valueAddedTaxPercentage;
      this.propertyChangeSupport.firePropertyChange("DEFAULT_VALUE_ADDED_TAX_PERCENTAGE", oldValueAddedTaxPercentage, valueAddedTaxPercentage);

    }
  }

  /**
   * Returns <code>true</code> if the furniture catalog should be viewed in a tree.
   * @return {boolean}
   * @ignore
   */
  isFurnitureCatalogViewedInTree() {
    return this.furnitureCatalogViewedInTree;
  }

  /**
   * Sets whether the furniture catalog should be viewed in a tree or a different way.
   * @param {boolean}
   * @ignore
   */
  setFurnitureCatalogViewedInTree(furnitureCatalogViewedInTree) {
    if (this.furnitureCatalogViewedInTree !== furnitureCatalogViewedInTree) {
      this.furnitureCatalogViewedInTree = furnitureCatalogViewedInTree;
      this.propertyChangeSupport.firePropertyChange("FURNITURE_CATALOG_VIEWED_IN_TREE",
        !furnitureCatalogViewedInTree, furnitureCatalogViewedInTree);
    }
  }

  /**
   * Returns <code>true</code> if the navigation panel should be displayed.
   * @return {boolean}
   */
  isNavigationPanelVisible() {
    return this.navigationPanelVisible;
  }

  /**
   * Sets whether the navigation panel should be displayed or not.
   * @param {boolean} navigationPanelVisible
   */
  setNavigationPanelVisible(navigationPanelVisible) {
    if (this.navigationPanelVisible !== navigationPanelVisible) {
      this.navigationPanelVisible = navigationPanelVisible;
      this.propertyChangeSupport.firePropertyChange("NAVIGATION_PANEL_VISIBLE",
        !navigationPanelVisible, navigationPanelVisible);
    }
  }

  /**
   * Returns whether interactive editing in 3D view is enabled or not.
   * @return {boolean}
   * @since 7.2
   */
  isEditingIn3DViewEnabled() {
    return this.editingIn3DViewEnabled;
  }

  /**
   * Sets whether interactive editing in 3D view is enabled or not.
   * @param {boolean} editingIn3DViewEnabled
   * @since 7.2
   */
  setEditingIn3DViewEnabled(editingIn3DViewEnabled) {
    if (editingIn3DViewEnabled != this.editingIn3DViewEnabled) {
      this.editingIn3DViewEnabled = editingIn3DViewEnabled;
      this.propertyChangeSupport.firePropertyChange("EDITING_IN_3D_VIEW_ENABLED",
        !editingIn3DViewEnabled, editingIn3DViewEnabled);
    }
  }

  /**
   * Returns whether observer camera should be centered on selection or not.
   * @return {boolean}
   */
  isAerialViewCenteredOnSelectionEnabled() {
    return this.aerialViewCenteredOnSelectionEnabled;
  }

  /**
   * Sets whether aerial view should be centered on selection or not.
   * @param {boolean} aerialViewCenteredOnSelectionEnabled
   */
  setAerialViewCenteredOnSelectionEnabled(aerialViewCenteredOnSelectionEnabled) {
    if (aerialViewCenteredOnSelectionEnabled !== this.aerialViewCenteredOnSelectionEnabled) {
      this.aerialViewCenteredOnSelectionEnabled = aerialViewCenteredOnSelectionEnabled;
      this.propertyChangeSupport.firePropertyChange("AERIAL_VIEW_CENTERED_ON_SELECTION_ENABLED",
        !aerialViewCenteredOnSelectionEnabled, aerialViewCenteredOnSelectionEnabled);
    }
  }

  /**
   * Returns whether the observer camera should be selected at each change.
   * @return {boolean}
   * @since 5.5
   */
  isObserverCameraSelectedAtChange() {
    return this.observerCameraSelectedAtChange;
  }

  /**
   * Sets whether the observer camera should be selected at each change.
   * @param {boolean} observerCameraSelectedAtChange
   * @since 5.5
   */
  setObserverCameraSelectedAtChange(observerCameraSelectedAtChange) {
    if (observerCameraSelectedAtChange !== this.observerCameraSelectedAtChange) {
      this.observerCameraSelectedAtChange = observerCameraSelectedAtChange;
      this.propertyChangeSupport.firePropertyChange("OBSERVER_CAMERA_SELECTED_AT_CHANGE",
        !observerCameraSelectedAtChange, observerCameraSelectedAtChange);
    }
  }

  /**
   * Returns <code>true</code> if magnetism is enabled.
   * @return {boolean} <code>true</code> by default.
   */
  isMagnetismEnabled() {
    return this.magnetismEnabled;
  }

  /**
   * Sets whether magnetism is enabled or not, and notifies
   * listeners of this change. 
   * @param {boolean} magnetismEnabled <code>true</code> if magnetism is enabled,
   *          <code>false</code> otherwise.
   */
  setMagnetismEnabled(magnetismEnabled) {
    if (this.magnetismEnabled !== magnetismEnabled) {
      this.magnetismEnabled = magnetismEnabled;
      this.propertyChangeSupport.firePropertyChange("MAGNETISM_ENABLED",
        !magnetismEnabled, magnetismEnabled);
    }
  }

  /**
   * Returns <code>true</code> if rulers are visible.
   * @return {boolean} <code>true</code> by default.
   * @ignore
   */
  isRulersVisible() {
    return this.rulersVisible;
  }

  /**
   * Sets whether rulers are visible or not, and notifies
   * listeners of this change. 
   * @param {boolean} rulersVisible <code>true</code> if rulers are visible,
   *          <code>false</code> otherwise.
   * @ignore
   */
  setRulersVisible(rulersVisible) {
    if (this.rulersVisible !== rulersVisible) {
      this.rulersVisible = rulersVisible;
      this.propertyChangeSupport.firePropertyChange("RULERS_VISIBLE",
        !rulersVisible, rulersVisible);
    }
  }

  /**
   * Returns <code>true</code> if plan grid visible.
   * @return {boolean} <code>true</code> by default.
   */
  isGridVisible() {
    return this.gridVisible;
  }

  /**
   * Sets whether plan grid is visible or not, and notifies
   * listeners of this change. 
   * @param {boolean} gridVisible <code>true</code> if grid is visible,
   *          <code>false</code> otherwise.
   */
  setGridVisible(gridVisible) {
    if (this.gridVisible !== gridVisible) {
      this.gridVisible = gridVisible;
      this.propertyChangeSupport.firePropertyChange("GRID_VISIBLE",
        !gridVisible, gridVisible);
    }
  }

  /**
   * Returns the name of the font that should be used by default or <code>null</code> 
   * if the default font should be the default one in the application.
   * @return {string}
   */
  getDefaultFontName() {
    return this.defaultFontName;
  }

  /**
   * Sets the name of the font that should be used by default.
   * @param {string} defaultFontName
   */
  setDefaultFontName(defaultFontName) {
    if (defaultFontName != this.defaultFontName) {
      let oldName = this.defaultFontName;
      this.defaultFontName = defaultFontName;
      this.propertyChangeSupport.firePropertyChange("DEFAULT_FONT_NAME", oldName, defaultFontName);
    }
  }

  /**
   * Returns <code>true</code> if furniture should be viewed from its top in plan.
   * @return {boolean}
   */
  isFurnitureViewedFromTop() {
    return this.furnitureViewedFromTop;
  }

  /**
   * Sets how furniture icon should be displayed in plan, and notifies
   * listeners of this change. 
   * @param {boolean} furnitureViewedFromTop if <code>true</code> the furniture 
   *    should be viewed from its top.
   */
  setFurnitureViewedFromTop(furnitureViewedFromTop) {
    if (this.furnitureViewedFromTop !== furnitureViewedFromTop) {
      this.furnitureViewedFromTop = furnitureViewedFromTop;
      this.propertyChangeSupport.firePropertyChange("FURNITURE_VIEWED_FROM_TOP",
        !furnitureViewedFromTop, furnitureViewedFromTop);
    }
  }

  /**
   * Returns the size used to generate icons of furniture viewed from top.
   * @since 5.5
   */
  getFurnitureModelIconSize() {
    return this.furnitureModelIconSize;
  }

  /**
   * Sets the name of the font that should be used by default.
   * @since 5.5
   */
  setFurnitureModelIconSize(furnitureModelIconSize) {
    if (furnitureModelIconSize !== this.furnitureModelIconSize) {
      let oldSize = this.furnitureModelIconSize;
      this.furnitureModelIconSize = furnitureModelIconSize;
      this.propertyChangeSupport.firePropertyChange("FURNITURE_MODEL_ICON_SIZE", oldSize, furnitureModelIconSize);
    }
  }

  /**
   * Returns <code>true</code> if room floors should be rendered with color or texture in plan.
   * @return <code>false</code> by default.
   */
  isRoomFloorColoredOrTextured() {
    return this.roomFloorColoredOrTextured;
  }

  /**
   * Sets whether room floors should be rendered with color or texture, 
   * and notifies listeners of this change. 
   * @param roomFloorColoredOrTextured <code>true</code> if floor color 
   *          or texture is used, <code>false</code> otherwise.
   */
  setFloorColoredOrTextured(roomFloorColoredOrTextured) {
    if (this.roomFloorColoredOrTextured !== roomFloorColoredOrTextured) {
      this.roomFloorColoredOrTextured = roomFloorColoredOrTextured;
      this.propertyChangeSupport.firePropertyChange("ROOM_FLOOR_COLORED_OR_TEXTURED",
        !roomFloorColoredOrTextured, roomFloorColoredOrTextured);
    }
  }

  /**
   * Returns the wall pattern in plan used by default.
   * @return {TextureImage}
   * @ignore
   */
  getWallPattern() {
    return this.wallPattern;
  }

  /**
   * Sets how walls should be displayed in plan by default, and notifies
   * listeners of this change.
   * @ignore
   */
  setWallPattern(wallPattern) {
    if (this.wallPattern !== wallPattern) {
      let oldWallPattern = this.wallPattern;
      this.wallPattern = wallPattern;
      this.propertyChangeSupport.firePropertyChange("WALL_PATTERN",
        oldWallPattern, wallPattern);
    }
  }

  /**
   * Returns the pattern used for new walls in plan or <code>null</code> if it's not set.
   * @return {TextureImage}
   */
  getNewWallPattern() {
    return this.newWallPattern;
  }

  /**
   * Sets how new walls should be displayed in plan, and notifies
   * listeners of this change.
   */
  setNewWallPattern(newWallPattern) {
    if (this.newWallPattern !== newWallPattern) {
      let oldWallPattern = this.newWallPattern;
      this.newWallPattern = newWallPattern;
      this.propertyChangeSupport.firePropertyChange("NEW_WALL_PATTERN",
        oldWallPattern, newWallPattern);
    }
  }

  /**
   * Returns default thickness of new walls in home. 
   */
  getNewWallThickness() {
    return this.newWallThickness;
  }

  /**
   * Sets default thickness of new walls in home, and notifies
   * listeners of this change.  
   */
  setNewWallThickness(newWallThickness) {
    if (this.newWallThickness !== newWallThickness) {
      let oldDefaultThickness = this.newWallThickness;
      this.newWallThickness = newWallThickness;
      this.propertyChangeSupport.firePropertyChange("NEW_WALL_THICKNESS",
        oldDefaultThickness, newWallThickness);
    }
  }

  /**
   * Returns default wall height of new home walls. 
   */
  getNewWallHeight() {
    return this.newWallHeight;
  }

  /**
   * Sets default wall height of new walls, and notifies
   * listeners of this change. 
   */
  setNewWallHeight(newWallHeight) {
    if (this.newWallHeight !== newWallHeight) {
      let oldWallHeight = this.newWallHeight;
      this.newWallHeight = newWallHeight;
      this.propertyChangeSupport.firePropertyChange("NEW_WALL_HEIGHT",
        oldWallHeight, newWallHeight);
    }
  }

  /**
   * Returns default baseboard thickness of new walls in home. 
   */
  getNewWallBaseboardThickness() {
    return this.newWallBaseboardThickness;
  }

  /**
   * Sets default baseboard thickness of new walls in home, and notifies
   * listeners of this change.  
   */
  setNewWallBaseboardThickness(newWallBaseboardThickness) {
    if (this.newWallBaseboardThickness !== newWallBaseboardThickness) {
      let oldThickness = this.newWallBaseboardThickness;
      this.newWallBaseboardThickness = newWallBaseboardThickness;
      this.propertyChangeSupport.firePropertyChange("NEW_WALL_SIDEBOARD_THICKNESS",
        oldThickness, newWallBaseboardThickness);
    }
  }

  /**
   * Returns default baseboard height of new home walls. 
   */
  getNewWallBaseboardHeight() {
    return this.newWallBaseboardHeight;
  }

  /**
   * Sets default baseboard height of new walls, and notifies
   * listeners of this change. 
   */
  setNewWallBaseboardHeight(newWallBaseboardHeight) {
    if (this.newWallBaseboardHeight !== newWallBaseboardHeight) {
      let oldHeight = this.newWallBaseboardHeight;
      this.newWallBaseboardHeight = newWallBaseboardHeight;
      this.propertyChangeSupport.firePropertyChange("NEW_WALL_SIDEBOARD_HEIGHT",
        oldHeight, newWallBaseboardHeight);
    }
  }

  /**
   * Returns the default color of new rooms in home.
   * @since 6.4
   */
  getNewRoomFloorColor() {
    return this.newRoomFloorColor;
  }

  /**
   * Sets the default color of new rooms in home, and notifies
   * listeners of this change.
   * @since 6.4
   */
  setNewRoomFloorColor(newRoomFloorColor) {
    if (this.newRoomFloorColor !== newRoomFloorColor) {
      let oldRoomFloorColor = this.newRoomFloorColor;
      this.newRoomFloorColor = newRoomFloorColor;
      this.propertyChangeSupport.firePropertyChange("NEW_ROOM_FLOOR_COLOR",
        oldRoomFloorColor, newRoomFloorColor);
    }
  }

  /**
   * Returns default thickness of the floor of new levels in home. 
   */
  getNewFloorThickness() {
    return this.newFloorThickness;
  }

  /**
   * Sets default thickness of the floor of new levels in home, and notifies
   * listeners of this change.  
   */
  setNewFloorThickness(newFloorThickness) {
    if (this.newFloorThickness !== newFloorThickness) {
      let oldFloorThickness = this.newFloorThickness;
      this.newFloorThickness = newFloorThickness;
      this.propertyChangeSupport.firePropertyChange("NEW_FLOOR_THICKNESS",
        oldFloorThickness, newFloorThickness);
    }
  }

  /**
   * Returns the delay between two automatic save operations of homes for recovery purpose.
   * @return a delay in milliseconds or 0 to disable auto save.
   * @ignore
   */
  getAutoSaveDelayForRecovery() {
    return this.autoSaveDelayForRecovery;
  }

  /**
   * Sets the delay between two automatic save operations of homes for recovery purpose.
   * @ignore
   */
  setAutoSaveDelayForRecovery(autoSaveDelayForRecovery) {
    if (this.autoSaveDelayForRecovery !== autoSaveDelayForRecovery) {
      let oldAutoSaveDelayForRecovery = this.autoSaveDelayForRecovery;
      this.autoSaveDelayForRecovery = autoSaveDelayForRecovery;
      this.propertyChangeSupport.firePropertyChange("AUTO_SAVE_DELAY_FOR_RECOVERY",
        oldAutoSaveDelayForRecovery, autoSaveDelayForRecovery);
    }
  }

  /**
   * Returns an unmodifiable list of the recent homes.
   * @ignore
   */
  getRecentHomes() {
    return this.recentHomes.slice(0);
  }

  /**
   * Sets the recent homes list and notifies listeners of this change.
   * @ignore
   */
  setRecentHomes(recentHomes) {
    if (recentHomes != this.recentHomes) {
      let oldRecentHomes = this.recentHomes;
      this.recentHomes = recentHomes.slice(0);
      this.propertyChangeSupport.firePropertyChange("RECENT_HOMES",
        oldRecentHomes, this.getRecentHomes());
    }
  }

  /**
   * Returns the maximum count of homes that should be proposed to the user.
   * @ignore
   */
  getRecentHomesMaxCount() {
    return 10;
  }

  /**
   * Returns the maximum count of stored cameras in homes that should be proposed to the user.
   * @ignore
   */
  getStoredCamerasMaxCount() {
    return 50;
  }

  /**
   * Sets which action tip should be ignored.
   * <br>This method should be overridden to store the ignore information.
   * By default it just notifies listeners of this change. 
   * @ignore
   */
  setActionTipIgnored(actionKey) {
    this.propertyChangeSupport.firePropertyChange("IGNORED_ACTION_TIP", null, actionKey);
  }

  /**
   * Returns whether an action tip should be ignored or not. 
   * <br>This method should be overridden to return the display information
   * stored in setActionTipIgnored.
   * By default it returns <code>true</code>. 
   * @ignore
   */
  isActionTipIgnored(actionKey) {
    return true;
  }

  /**
   * Resets the ignore flag of action tips.
   * <br>This method should be overridden to clear all the display flags.
   * By default it just notifies listeners of this change. 
   * @ignore
   */
  resetIgnoredActionTips() {
    this.propertyChangeSupport.firePropertyChange("IGNORED_ACTION_TIP", null, null);
  }

  /**
   * Returns the default text style of a class of selectable item. 
   * @ignore
   */
  getDefaultTextStyle(selectableClass) {
    if (selectableClass.name == "Room") {
      return UserPreferences.DEFAULT_ROOM_TEXT_STYLE;
    } else {
      return UserPreferences.DEFAULT_TEXT_STYLE;
    }
  }

  /**
   * Returns the strings that may be used for the auto completion of the given <code>property</code>.
   * @ignore
   */
  getAutoCompletionStrings(property) {
    let propertyAutoCompletionStrings = this.autoCompletionStrings.get(property);
    if (propertyAutoCompletionStrings !== undefined) {
      return propertyAutoCompletionStrings.slice(0);
    } else {
      return [];
    }
  }

  /**
   * Adds the given string to the list of the strings used in auto completion of a <code>property</code>
   * and notifies listeners of this change.
   * @ignore
   */
  addAutoCompletionString(property, autoCompletionString) {
    if (autoCompletionString !== null
      && autoCompletionString.length > 0) {
      let propertyAutoCompletionStrings = this.autoCompletionStrings[property];
      if (propertyAutoCompletionStrings === undefined) {
        propertyAutoCompletionStrings = [];
      } else if (propertyAutoCompletionStrings.indexOf(autoCompletionString) < 0) {
        propertyAutoCompletionStrings = propertyAutoCompletionStrings.slice(0);
      } else {
        return;
      }
      propertyAutoCompletionStrings.splice(0, 0, autoCompletionString);
      this.setAutoCompletionStrings(property, propertyAutoCompletionStrings);
    }
  }

  /**
   * Sets the auto completion strings list of the given <code>property</code> and notifies listeners of this change.
   * @ignore
   */
  setAutoCompletionStrings(property, autoCompletionStrings) {
    let propertyAutoCompletionStrings = this.autoCompletionStrings[property];
    if (autoCompletionStrings != propertyAutoCompletionStrings) {
      this.autoCompletionStrings[property] = autoCompletionStrings.slice(0);
      this.propertyChangeSupport.firePropertyChange("AUTO_COMPLETION_STRINGS",
        null, property);
    }
  }

  /**
   * Returns the list of properties with auto completion strings. 
   * @ignore
   */
  getAutoCompletedProperties() {
    if (this.autoCompletionStrings !== null) {
      return Object.keys(this.autoCompletionStrings);
    } else {
      return [];
    }
  }

  /**
   * Returns the list of the recent colors.
   * @ignore
   */
  getRecentColors() {
    return this.recentColors;
  }

  /**
   * Sets the recent colors list and notifies listeners of this change.
   * @ignore
   */
  setRecentColors(recentColors) {
    if (recentColors != this.recentColors) {
      let oldRecentColors = this.recentColors;
      this.recentColors = recentColors.slice(0);
      this.propertyChangeSupport.firePropertyChange("RECENT_COLORS",
        oldRecentColors, this.getRecentColors());
    }
  }

  /**
   * Returns the list of the recent textures.
   * @ignore
   */
  getRecentTextures() {
    return this.recentTextures;
  }

  /**
   * Sets the recent colors list and notifies listeners of this change.
   * @ignore
   */
  setRecentTextures(recentTextures) {
    if (recentTextures != this.recentTextures) {
      let oldRecentTextures = this.recentTextures;
      this.recentTextures = recentTextures.slice(0);
      this.propertyChangeSupport.firePropertyChange("RECENT_TEXTURES",
        oldRecentTextures, this.getRecentTextures());
    }
  }

  /**
   * Sets the home examples available for the user.
   * @param {HomeDescriptor[]} homeExamples an array of examples
   * @since 5.5
   * @ignore
   */
  setHomeExamples(homeExamples) {
    if (homeExamples != this.homeExamples) {
      let oldExamples = this.homeExamples;
      this.homeExamples = homeExamples.slice(0);
      this.propertyChangeSupport.firePropertyChange("HOME_EXAMPLES",
        oldExamples, this.getHomeExamples());
    }
  }

  /**
   * Returns the home examples available for the user.
   * @return {HomeDescriptor[]} an array of examples.
   * @since 5.5
   * @ignore
   */
  getHomeExamples() {
    return this.homeExamples;
  }

  /**
   * @return {boolean} <code>true</code> if updates should be checked.
   * @ignore
   */
  isCheckUpdatesEnabled() {
    // Empty implementation because it is used by the controller but useless for the Web version
  }

  /**
   * Sets whether updates should be checked or not.
   * @param {boolean} updatesChecked 
   * @since 4.0
   */
  setCheckUpdatesEnabled(updatesChecked) {
    // Empty implementation because it is used by the controller but useless for the Web version
  }

  /**
   * Returns <code>true</code> if large imported images should be resized without requesting user.
   * @ignore
   */
  isImportedImageResizedWithoutPrompting() {
    return true;
  }
}

/**
 * Be reference by `SweetHome3D.ts`, 
 * due to circular dependency this can't be removed at the moment.
 * 
 * @deprecated Change to ESM later.
 */
window.UserPreferences = UserPreferences;
