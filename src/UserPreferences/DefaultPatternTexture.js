import { URLContent, } from '../URLContent';
import { ZIPTools } from '../URLContent';

/**
 * Creates a pattern built from resources.
 * @param {string} name
 * @constructor
 * @ignore
 * @author Emmanuel Puybaret
 */
export class DefaultPatternTexture {
  static __class = "com.eteks.sweethome3d.io.DefaultPatternTexture";
  static __interfaces = ["com.eteks.sweethome3d.model.TextureImage"];
  static __transients = ["image"];

  constructor(name) {
    this.name = name;
    this.image = new URLContent(ZIPTools.getScriptFolder() + "resources/patterns/" + this.name + ".png");
  }

  /**
   * Returns the name of this texture.
   * @return {string}
   */
  getName() {
    return this.name;
  }

  /**
   * Returns the creator of this texture.
   * @return {string}
   */
  getCreator() {
    return null;
  }

  /**
   * Returns the content of the image used for this texture.
   * @return {Object}
   */
  getImage() {
    return this.image;
  }

  /**
   * Returns the width of the image in centimeters.
   * @return {number}
   */
  getWidth() {
    return 10;
  }

  /**
   * Returns the height of the image in centimeters.
   * @return {number}
   */
  getHeight() {
    return 10;
  }

  /**
   * Returns <code>true</code> if the object in parameter is equal to this texture.
   * @param {Object} obj
   * @return {boolean}
   */
  equals(obj) {
    if (obj === this) {
      return true;
    } else if (obj instanceof DefaultPatternTexture) {
      let pattern = obj;
      return pattern.name == this.name;
    } else {
      return false;
    }
  }
}
