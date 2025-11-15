import {
  FurnitureCatalog,
  PatternsCatalog,
  TexturesCatalog,
} from '../SweetHome3D';

import { DefaultFurnitureCatalog } from '../DefaultFurnitureCatalog';
import { DefaultTexturesCatalog } from '../DefaultTexturesCatalog';
import { LengthUnit } from '../LengthUnit';
import { Locale } from '../core';

import { UserPreferences } from './UserPreferences';
import { DefaultPatternTexture } from './DefaultPatternTexture';


/**
 * Default user preferences.
 * @param {string[]|boolean} [furnitureCatalogUrls]
 * @param {string}   [furnitureResourcesUrlBase]
 * @param {string[]} [texturesCatalogUrls]
 * @param {string}   [texturesResourcesUrlBase]
 * @constructor
 * @extends UserPreferences
 * @author Emmanuel Puybaret
 */
export class DefaultUserPreferences extends UserPreferences {
  constructor(
    furnitureCatalogUrls,
    furnitureResourcesUrlBase,
    texturesCatalogUrls,
    texturesResourcesUrlBase
  ) {
    super();

    let readCatalogs;
    let userLanguage;
    if (furnitureCatalogUrls !== undefined
      && (typeof furnitureCatalogUrls === "boolean")) {
      readCatalogs = furnitureCatalogUrls;
      userLanguage = furnitureResourcesUrlBase;
      this.furnitureCatalogUrls = undefined;
      this.furnitureResourcesUrlBase = undefined;
      this.texturesCatalogUrls = undefined;
      this.texturesResourcesUrlBase = undefined;
    } else {
      readCatalogs = true;
      userLanguage = Locale.getDefault();
      this.furnitureCatalogUrls = furnitureCatalogUrls;
      this.furnitureResourcesUrlBase = furnitureResourcesUrlBase;
      this.texturesCatalogUrls = texturesCatalogUrls;
      this.texturesResourcesUrlBase = texturesResourcesUrlBase;
    }

    // Build default patterns catalog
    let patterns = [];
    patterns.push(new DefaultPatternTexture("foreground"));
    patterns.push(new DefaultPatternTexture("reversedHatchUp"));
    patterns.push(new DefaultPatternTexture("reversedHatchDown"));
    patterns.push(new DefaultPatternTexture("reversedCrossHatch"));
    patterns.push(new DefaultPatternTexture("background"));
    patterns.push(new DefaultPatternTexture("hatchUp"));
    patterns.push(new DefaultPatternTexture("hatchDown"));
    patterns.push(new DefaultPatternTexture("crossHatch"));
    let patternsCatalog = new PatternsCatalog(patterns);
    this.setPatternsCatalog(patternsCatalog);
    this.setFurnitureCatalog(readCatalogs && (typeof DefaultFurnitureCatalog === "function")
      ? (Array.isArray(furnitureCatalogUrls)
        ? new DefaultFurnitureCatalog(furnitureCatalogUrls, furnitureResourcesUrlBase)
        : new DefaultFurnitureCatalog(this))
      : new FurnitureCatalog());
    this.setTexturesCatalog(readCatalogs && (typeof DefaultTexturesCatalog === "function")
      ? (Array.isArray(texturesCatalogUrls)
        ? new DefaultTexturesCatalog(texturesCatalogUrls, texturesResourcesUrlBase)
        : new DefaultTexturesCatalog(this))
      : new TexturesCatalog());

    if (userLanguage == "en_US") {
      this.setUnit(LengthUnit.INCH);
      this.setNewWallThickness(7.62);
      this.setNewWallHeight(243.84);
      this.setNewWallBaseboardThickness(0.9525);
      this.setNewWallBaseboardHeight(6.35);
    } else {
      this.setUnit(LengthUnit.CENTIMETER);
      this.setNewWallThickness(7.5);
      this.setNewWallHeight(250);
      this.setNewWallBaseboardThickness(1);
      this.setNewWallBaseboardHeight(7);
    }

    this.setNewFloorThickness(12);
    this.setNavigationPanelVisible(false);
    this.setWallPattern(patternsCatalog.getPattern("hatchUp"));
    this.setNewWallPattern(this.getWallPattern());
    this.setAerialViewCenteredOnSelectionEnabled(true);
    this.setAutoSaveDelayForRecovery(60000);
  }

  /**
   * Writes user preferences.
   */
  write() {
    super.write();
  }
}
