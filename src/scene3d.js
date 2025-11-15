/*
 * scene3d.js
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
import { vec2, vec3, vec4, mat4 } from 'gl-matrix';

import { PropertyChangeSupport } from './core';
import { Triangulator } from './Triangulator';

// Supply a replacement for Math.fround if it doesn't exist 
if (Math.fround === undefined) {
  const doubleToFloatConverter = new Float32Array(1);

  Math.fround = x => {
    doubleToFloatConverter[0] = x;
    return doubleToFloatConverter[0];
  };
}

// Classes used to manage a scene tree of 3D objects displayed by a HTMLCanvas3D instance 
// inspired from Java 3D API

/**
 * Creates an abstract 3D node.
 * @constructor
 * @author Emmanuel Puybaret
 */
export class Node3D {
  setCapability(capability) {
    if (this.capabilities === undefined) {
      this.capabilities = 0;
    }
    this.capabilities |= capability;
  }

  getCapability(capability) {
    if (this.capabilities === undefined) {
      return false;
    } else {
      return (this.capabilities & capability) !== 0;
    }
  }

  getParent() {
    if (this.parent === undefined) {
      return null;
    } else {
      return this.parent;
    }
  }

  /**
   * Returns the user data associated with this object.
   * @return {Object}
   */
  getUserData() {
    if (this.userData === undefined) {
      return null;
    } else {
      return this.userData;
    }
  }

  /**
   * Sets the user data associated with this object. 
   * @param {Object} userData
   */
  setUserData(userData) {
    this.userData = userData;
  }

  /**
   * Returns the string of this object.
   * @return {string}
   */
  getName() {
    if (this.name === undefined) {
      return null;
    } else {
      return this.name;
    }
  }

  /**
   * Sets the name of this object. 
   * @param {string} name
   */
  setName(name) {
    this.name = name;
  }

  /**
   * Adds the property change <code>listener</code> in parameter to this node.
   * @param {string} [propertyName] the name of an optional property to listen
   * @param listener  a callback that will be called with a {@link PropertyChangeEvent} instance
   */
  addPropertyChangeListener(propertyName, listener) {
    if (this.propertyChangeSupport === undefined) {
      this.propertyChangeSupport = new PropertyChangeSupport(this);
    }
    this.propertyChangeSupport.addPropertyChangeListener(propertyName, listener);
  }

  /**
   * Removes the property change <code>listener</code> in parameter from this node.
   * @param listener the listener to remove. If it doesn't exist, it's simply ignored.
   */
  removePropertyChangeListener(propertyName, listener) {
    if (this.propertyChangeSupport !== undefined) {
      this.propertyChangeSupport.removePropertyChangeListener(propertyName, listener);
    }
  }

  /**
   * Returns the property change listeners of this group.
   * @return {Array}   
   */
  getPropertyChangeListeners() {
    if (this.propertyChangeSupport !== undefined) {
      return this.propertyChangeSupport.getPropertyChangeListeners();
    } else {
      return [];
    }
  }

  setPickable(pickable) {
    this.pickable = pickable;
  }

  isPickable() {
    if (this.pickable !== undefined) {
      return this.pickable;
    } else {
      return true;
    }
  }

  clone() {
    let clone = new Node3D();
    this.cloneNodeAttributes(clone);
    return clone;
  }

  /**
   * @package
   * @ignore
   */
  cloneNodeAttributes(clone) {
    if (this.capabilities !== undefined) {
      clone.capabilities = this.capabilities;
    }
    if (this.userData !== undefined) {
      clone.userData = this.userData;
    }
    if (this.name !== undefined) {
      clone.name = this.name;
    }
    if (this.pickable !== undefined) {
      clone.pickable = this.pickable;
    }
  }
}

/**
 * @deprecated Replaced by ModelLoader.READING_MODEL
 */
Node3D.READING_MODEL = "Reading model";
/**
 * @deprecated Replaced by ModelLoader.PARSING_MODEL
 */
Node3D.PARSING_MODEL = "Parsing model";
/**
 * @deprecated Replaced by ModelLoader.BUILDING_MODEL
 */
Node3D.BUILDING_MODEL = "Building model";
/**
 * @deprecated Replaced by ModelLoader.BINDING_MODEL
 */
Node3D.BINDING_MODEL = "Binding model";

/**
 * Creates a 3D shape.
 * @param {IndexedGeometryArray3D} [geometry]
 * @param {Appearance3D} [appearance]
 * @constructor
 * @extends Node3D
 * @author Emmanuel Puybaret
 */
export class Shape3D extends Node3D {
  constructor(geometry, appearance) {
    super();
    if (geometry === undefined) {
      geometry = null;
      appearance = null;
    } else if (appearance === undefined) {
      appearance = null;
    }
    this.appearance = appearance;
    this.bounds = null;
    this.geometries = [];
    if (geometry !== null) {
      this.geometries.push(geometry);
    }
  }

  addGeometry(geometry3D) {
    this.geometries.push(geometry3D);
    // Update bounds
    let lower = vec3.fromValues(Infinity, Infinity, Infinity);
    let upper = vec3.fromValues(-Infinity, -Infinity, -Infinity);
    if (this.bounds !== null) {
      this.bounds.getLower(lower);
      this.bounds.getUpper(upper);
    }
    for (let index = 0; index < geometry3D.vertexIndices.length; index++) {
      let vertex = geometry3D.vertices[geometry3D.vertexIndices[index]];
      vec3.min(lower, lower, vertex);
      vec3.max(upper, upper, vertex);
    }
    this.bounds = new BoundingBox3D(lower, upper);
    if (this.propertyChangeSupport !== undefined) {
      this.propertyChangeSupport.firePropertyChange("GEOMETRY", null, geometry3D);
    }
  }

  setGeometry(geometry3D, index) {
    let oldGeometry3D = this.geometries[index];
    this.geometries[index] = geometry3D;
    // Clear bounds cache
    this.bounds = null;
    if (this.propertyChangeSupport !== undefined) {
      this.propertyChangeSupport.firePropertyChange("GEOMETRY", oldGeometry3D, geometry3D);
    }
  }

  removeGeometry(index) {
    let removedGeometry3D = this.geometries[index];
    this.geometries.splice(index, 1);
    // Clear bounds cache
    this.bounds = null;
    if (this.propertyChangeSupport !== undefined) {
      this.propertyChangeSupport.firePropertyChange("GEOMETRY", removedGeometry3D, null);
    }
  }

  getBounds() {
    if (this.geometries.length === 0) {
      return new BoundingBox3D(
        vec3.fromValues(Infinity, Infinity, Infinity),
        vec3.fromValues(-Infinity, -Infinity, -Infinity));
    } else if (this.bounds === null) {
      // Recompute bounds
      let lower = vec3.fromValues(Infinity, Infinity, Infinity);
      let upper = vec3.fromValues(-Infinity, -Infinity, -Infinity);
      for (let i = 0; i < this.geometries.length; i++) {
        let geometry3D = this.geometries[i];
        if (geometry3D.vertexIndices) {
          for (let index = 0; index < geometry3D.vertexIndices.length; index++) {
            let vertex = geometry3D.vertices[geometry3D.vertexIndices[index]];
            vec3.min(lower, lower, vertex);
            vec3.max(upper, upper, vertex);
          }
        }
      }
      this.bounds = new BoundingBox3D(lower, upper);
    }

    return this.bounds.clone();
  }

  getGeometries() {
    return this.geometries;
  }

  getAppearance() {
    return this.appearance;
  }

  setAppearance(appearance) {
    this.appearance = appearance;
  }

  clone() {
    let clone = new Shape3D(null, this.appearance);
    this.cloneNodeAttributes(clone);
    clone.geometries = this.geometries;
    clone.bounds = this.bounds;
    return clone;
  }
}

Shape3D.ALLOW_GEOMETRY_WRITE = 2;

/**
 * Creates a 3D background.
 * @constructor
 * @extends Node3D
 * @author Emmanuel Puybaret
 */
export class Background3D extends Node3D {
  constructor(group) {
    super();
    this.geometry = group;
    group.parent = this;
  }

  getGeometry() {
    return this.geometry;
  }

  clone() {
    let clone = new Background3D(this.geometry);
    this.cloneNodeAttributes(clone);
    return clone;
  }
}

/**
 * Creates a 3D light.
 * @constructor
 * @extends Node3D
 * @author Emmanuel Puybaret
 */
export class Light3D extends Node3D {
  constructor(color) {
    super();
    this.color = color;
  }

  getColor() {
    return this.color;
  }

  setColor(color) {
    let oldColor = this.color
    this.color = color;
    if (this.propertyChangeSupport !== undefined) {
      this.propertyChangeSupport.firePropertyChange("COLOR", oldColor, color);
    }
  }
}

/**
 * Creates an ambient light.
 * @constructor
 * @extends Light3D
 * @author Emmanuel Puybaret
 */
export class AmbientLight3D extends Light3D {
  constructor(color) {
    super(color);
  }

  clone() {
    let clone = new AmbientLight3D(this.color);
    this.cloneNodeAttributes(clone);
    return clone;
  }
}

/**
 * Creates a directional light.
 * @constructor
 * @extends Light3D
 * @author Emmanuel Puybaret
 */
export class DirectionalLight3D extends Light3D {
  constructor(color, direction) {
    super(color);
    this.direction = direction;
  }

  getDirection() {
    return this.direction;
  }

  clone() {
    let clone = new DirectionalLight3D(this.color, this.direction);
    this.cloneNodeAttributes(clone);
    return clone;
  }
}

/**
 * Creates a group, parent of 3D shapes and other groups.
 * @constructor
 * @extends Node3D
 * @author Emmanuel Puybaret
 */
export class Group3D extends Node3D {
  constructor() {
    super();
    this.children = [];
  }

  addChild(child) {
    this.insertChild(child, this.children.length);
  }

  insertChild(child, index) {
    this.children.splice(index, 0, child);
    child.parent = this;
    if (this.childrenListeners !== undefined) {
      let event = { source: this, child: child, index: index };
      let listeners = this.childrenListeners.slice(0);
      for (let i = 0; i < listeners.length; i++) {
        listeners[i].childAdded(event);
      }
    }
  }

  getChild(index) {
    return this.children[index];
  }

  getChildren() {
    return this.children;
  }

  removeChild(index) {
    let child;
    if (index instanceof Node3D) {
      child = index;
      index = this.children.indexOf(child);
    } else {
      child = this.children[index];
    }
    this.children.splice(index, 1);
    delete child.parent;
    if (this.childrenListeners !== undefined) {
      let event = { source: this, child: child, index: index };
      let listeners = this.childrenListeners.slice(0);
      for (let i = 0; i < listeners.length; i++) {
        listeners[i].childRemoved(event);
      }
    }
  }

  removeAllChildren() {
    for (let i = this.children.length - 1; i >= 0; i--) {
      this.removeChild(i);
    }
  }

  /**
   * Adds the children <code>listener</code> in parameter to this group.
   * @param {{childAdded, childRemoved}} listener  
   */
  addChildrenListener(listener) {
    if (this.childrenListeners === undefined) {
      this.childrenListeners = [];
    }
    this.childrenListeners.push(listener);
  }

  /**
   * Removes the children <code>listener</code> in parameter from this group.
   * @param {{childAdded, childRemoved}} listener  
   */
  removeChildrenListener(listener) {
    if (this.childrenListeners !== undefined) {
      let index = this.childrenListeners.indexOf(listener);
      if (index !== - 1) {
        this.childrenListeners.splice(index, 1);
      }
    }
  }

  /**
   * Returns the children listeners of this group.
   * @return {Array}   
   */
  getChildrenListeners() {
    if (this.childrenListeners !== undefined) {
      return this.childrenListeners.slice(0);
    } else {
      return [];
    }
  }

  setPickable(pickable) {
    super.setPickable(pickable);
    for (let i = 0; i < this.children.length; i++) {
      this.children[i].setPickable(pickable);
    }
  }

  clone() {
    let clone = new Group3D();
    this.cloneNodeAttributes(clone);
    return clone;
  }
}

Group3D.ALLOW_CHILDREN_EXTEND = 1;

/**
 * Creates a branch group with a children list that may change once a 3D scene is already live.
 * @constructor
 * @extends Group3D
 * @author Emmanuel Puybaret
 */
export class BranchGroup3D extends Group3D {
  constructor() {
    super();
  }

  detach() {
    if (this.parent) {
      this.parent.removeChild(this);
    }
  }

  clone() {
    let clone = new BranchGroup3D();
    this.cloneNodeAttributes(clone);
    return clone;
  }
}

/**
 * Creates a shared group that may have multiple links parents.
 * @constructor
 * @extends Group3D
 * @author Emmanuel Puybaret
 */
export class SharedGroup3D extends Group3D {
  constructor() {
    super();
  }

  clone() {
    let clone = new SharedGroup3D();
    this.cloneNodeAttributes(clone);
    return clone;
  }
}

/**
 * Creates a link that allows to use more than once a shared group in the graph.
 * @constructor
 * @extends Node3D
 * @author Emmanuel Puybaret
 */
export class Link3D extends Node3D {
  constructor(sharedGroup) {
    super();
    this.sharedGroup = sharedGroup;
  }

  getSharedGroup() {
    return this.sharedGroup;
  }

  setSharedGroup(sharedGroup) {
    this.sharedGroup = sharedGroup;
  }

  setPickable(pickable) {
    super.setPickable(pickable);
    this.sharedGroup.setPickable(pickable);
  }

  clone() {
    let clone = new Link3D(this.sharedGroup);
    this.cloneNodeAttributes(clone);
    return clone;
  }
}

/**
 * Creates a transform group.
 * @param {mat4} transform
 * @constructor
 * @extends Group3D
 * @author Emmanuel Puybaret
 */
export class TransformGroup3D extends Group3D {
  constructor(transform) {
    super();
    if (transform !== undefined) {
      this.transform = mat4.clone(transform);
    } else {
      this.transform = mat4.create();
    }
  }

  getTransform(transform) {
    mat4.copy(transform, this.transform);
  }

  setTransform(transform) {
    if (!TransformGroup3D.areTransformationsEqual(this.transform, transform)) {
      let oldTransform = mat4.clone(this.transform);
      mat4.copy(this.transform, transform);
      if (this.propertyChangeSupport !== undefined) {
        this.propertyChangeSupport.firePropertyChange("TRANSFORM", oldTransform, transform);
      }
    }
  }

  /**
   * Returns <code>true</code> if transformations in parameter are equal.
   * @param {mat4} transform1
   * @param {mat4} transform2
   * @package
   * @ignore
   */
  static areTransformationsEqual(transform1, transform2) {
    if (transform1
      && transform2
      && transform1.length === transform2.length) {
      for (let i = 0; i < transform1.length; i++) {
        if (transform1[i] !== transform2[i]) {
          return false;
        }
      }
      return true;
    } else {
      return transform1 === transform2;
    }
  }

  /**
   * Return <code>true</code> if the given <code>transform</code> is identity.
   * @param {mat4} transform
   * @package
   * @ignore
   */
  static isIdentity(transform) {
    if (TransformGroup3D.IDENTITY === undefined) {
      TransformGroup3D.IDENTITY = mat4.create();
    }
    return mat4.exactEquals(transform, TransformGroup3D.IDENTITY);
  }

  clone() {
    let clone = new TransformGroup3D(this.transform);
    this.cloneNodeAttributes(clone);
    return clone;
  }
}

TransformGroup3D.ALLOW_TRANSFORM_WRITE = 4;

/**
 * Creates an appearance to store material attributes, transparency and texture.
 * @param {string} name
 * @constructor
 * @author Emmanuel Puybaret
 */
export class Appearance3D {
  constructor(name) {
    if (name !== undefined) {
      this.name = name;
    }
  }

  /**
   * Adds the property change <code>listener</code> in parameter to this object.
   */
  addPropertyChangeListener(listener) {
    if (this.propertyChangeSupport === undefined) {
      this.propertyChangeSupport = new PropertyChangeSupport(this);
    }
    this.propertyChangeSupport.addPropertyChangeListener(listener);
  }

  /**
   * Removes the property change <code>listener</code> in parameter from this object.
   */
  removePropertyChangeListener(listener) {
    if (this.propertyChangeSupport !== undefined) {
      this.propertyChangeSupport.removePropertyChangeListener(listener);
    }
  }

  /**
   * Sets the name of this object. 
   * @param {string} name
   */
  setName(name) {
    this.name = name;
  }

  /**
   * Returns the name of this appearance. 
   * @return {string}
   */
  getName() {
    return this.name;
  }

  /**
   * Sets the ambient color of this appearance. 
   * @param {vec3} ambientColor
   */
  setAmbientColor(ambientColor) {
    let oldAmbientColor = this.ambientColor;
    this.ambientColor = ambientColor;
    if (this.propertyChangeSupport !== undefined) {
      this.propertyChangeSupport.firePropertyChange("AMBIENT_COLOR", oldAmbientColor, ambientColor);
    }
  }

  getAmbientColor() {
    return this.ambientColor;
  }

  /**
   * Sets the emissive color of this appearance. 
   * @param {vec3} emissiveColor
   */
  setEmissiveColor(emissiveColor) {
    let oldEmissiveColor = this.emissiveColor;
    this.emissiveColor = emissiveColor;
    if (this.propertyChangeSupport !== undefined) {
      this.propertyChangeSupport.firePropertyChange("EMISSIVE_COLOR", oldEmissiveColor, emissiveColor);
    }
  }

  getEmissiveColor() {
    return this.emissiveColor;
  }

  /**
   * Sets the diffuse color of this appearance. 
   * @param {vec3} diffuseColor
   */
  setDiffuseColor(diffuseColor) {
    let oldDiffuseColor = this.diffuseColor;
    this.diffuseColor = diffuseColor;
    if (this.propertyChangeSupport !== undefined) {
      this.propertyChangeSupport.firePropertyChange("DIFFUSE_COLOR", oldDiffuseColor, diffuseColor);
    }
  }

  getDiffuseColor() {
    return this.diffuseColor;
  }

  /**
   * Sets the specular color of this appearance. 
   * @param {vec3} specularColor
   */
  setSpecularColor(specularColor) {
    let oldSpecularColor = this.specularColor;
    this.specularColor = specularColor;
    if (this.propertyChangeSupport !== undefined) {
      this.propertyChangeSupport.firePropertyChange("SPECULAR_COLOR", oldSpecularColor, specularColor);
    }
  }

  getSpecularColor() {
    return this.specularColor;
  }

  /**
   * Sets the shininess of this appearance. 
   * @param {number} shininess
   */
  setShininess(shininess) {
    shininess = Math.max(shininess, 1);
    let oldShininess = this.shininess;
    this.shininess = shininess;
    if (this.propertyChangeSupport !== undefined) {
      this.propertyChangeSupport.firePropertyChange("SHININESS", oldShininess, shininess);
    }
  }

  getShininess() {
    return this.shininess;
  }

  /**
   * Sets the transparency of this appearance. 
   * @param {number} transparency
   */
  setTransparency(transparency) {
    let oldTransparency = this.transparency;
    this.transparency = transparency;
    if (this.propertyChangeSupport !== undefined) {
      this.propertyChangeSupport.firePropertyChange("TRANSPARENCY", oldTransparency, transparency);
    }
  }

  getTransparency() {
    return this.transparency;
  }

  setIllumination(illumination) {
    let oldIllumination = this.illumination;
    this.illumination = illumination;
    if (this.propertyChangeSupport !== undefined) {
      this.propertyChangeSupport.firePropertyChange("ILLUMINATION", oldIllumination, illumination);
    }
  }

  getIllumination() {
    return this.illumination;
  }

  /**
   * Sets the texture image of this appearance. 
   * @param {Image} textureImage
   */
  setTextureImage(textureImage) {
    if (this.textureImage !== textureImage) {
      let oldTextureImage = this.textureImage;
      this.textureImage = textureImage;
      if (this.propertyChangeSupport !== undefined) {
        this.propertyChangeSupport.firePropertyChange("TEXTURE_IMAGE", oldTextureImage, textureImage);
      }
    }
  }

  /**
   * Returns the texture image of this appearance. 
   * @return {Image}
   */
  getTextureImage() {
    return this.textureImage;
  }

  /** 
   * Returns true if x is a power of 2.
   * @param {number} x
   * @return {boolean}
   */
  static isPowerOfTwo(x) {
    return (x & (x - 1)) == 0;
  }

  /**
   * Returns the closest higher number that is a power of 2.
   * @param {number} x
   * @return {number}
   */
  static getNextHighestPowerOfTwo(x) {
    --x;
    for (let i = 1; i < 32; i <<= 1) {
      x = x | x >> i;
    }
    return (x + 1);
  }

  setTextureCoordinatesGeneration(textureCoordinatesGeneration) {
    if (!Appearance3D.areTextureCoordinatesGenerationsEqual(this.textureCoordinatesGeneration, textureCoordinatesGeneration)) {
      let oldTextureCoordinatesGeneration = this.textureCoordinatesGeneration;
      this.textureCoordinatesGeneration = textureCoordinatesGeneration;
      if (this.propertyChangeSupport !== undefined) {
        this.propertyChangeSupport.firePropertyChange("TEXTURE_COORDINATES_GENERATION", oldTextureCoordinatesGeneration, textureCoordinatesGeneration);
      }
    }
  }

  /**
   * @package
   * @ignore
   */
  static areTextureCoordinatesGenerationsEqual(textureCoordinatesGeneration1, textureCoordinatesGeneration2) {
    if (textureCoordinatesGeneration1
      && textureCoordinatesGeneration2) {
      let planeS1 = textureCoordinatesGeneration1.planeS;
      let planeS2 = textureCoordinatesGeneration2.planeS;
      if (planeS1 && planeS2
        && vec4.equals(planeS1, planeS2)) {
        let planeT1 = textureCoordinatesGeneration1.planeT;
        let planeT2 = textureCoordinatesGeneration2.planeT;
        return planeT1 && planeT2
          && vec4.equals(planeT1, planeT2);
      }
      return false;
    } else {
      return textureCoordinatesGeneration1 === textureCoordinatesGeneration2;
    }
  }

  getTextureCoordinatesGeneration() {
    return this.textureCoordinatesGeneration;
  }

  setTextureTransform(textureTransform) {
    if (!TransformGroup3D.areTransformationsEqual(this.textureTransform, textureTransform)) {
      let oldTextureTransform = this.textureTransform;
      this.textureTransform = textureTransform;
      if (this.propertyChangeSupport !== undefined) {
        this.propertyChangeSupport.firePropertyChange("TEXTURE_TRANSFORM", oldTextureTransform, textureTransform);
      }
    }
  }

  getTextureTransform() {
    return this.textureTransform;
  }

  setVisible(visible) {
    let oldVisible = this.visible;
    this.visible = visible;
    if (this.propertyChangeSupport !== undefined) {
      this.propertyChangeSupport.firePropertyChange("VISIBLE", oldVisible, visible);
    }
  }

  isVisible() {
    return this.visible !== false;
  }

  setCullFace(cullFace) {
    let oldCullFace = this.cullFace;
    this.cullFace = cullFace;
    if (this.propertyChangeSupport !== undefined) {
      this.propertyChangeSupport.firePropertyChange("CULL_FACE", oldCullFace, cullFace);
    }
  }

  getCullFace() {
    return this.cullFace;
  }

  setBackFaceNormalFlip(backFaceNormalFlip) {
    let oldBackFaceNormalFlip = this.backFaceNormalFlip;
    this.backFaceNormalFlip = backFaceNormalFlip;
    if (this.propertyChangeSupport !== undefined) {
      this.propertyChangeSupport.firePropertyChange("BACK_FACE_NORMAL_FLIP", oldBackFaceNormalFlip, backFaceNormalFlip);
    }
  }

  getBackFaceNormalFlip() {
    return this.backFaceNormalFlip;
  }

  isBackFaceNormalFlip() {
    return this.backFaceNormalFlip === true;
  }

  clone() {
    let clone = new Appearance3D(this.name);
    for (let attribute in this) {
      if (this.hasOwnProperty(attribute)) {
        clone[attribute] = this[attribute];
      }
    }
    return clone;
  }
}

Appearance3D.CULL_NONE = 0;
Appearance3D.CULL_BACK = 1;
Appearance3D.CULL_FRONT = 2;

/**
 * Creates an indexed 3D geometry array.
 * @param {vec3 []} vertices 
 * @param {number []} vertexIndices
 * @param {vec2 []} textureCoordinates
 * @param {number []} textureCoordinateIndices
 * @constructor
 * @author Emmanuel Puybaret
 */
export class IndexedGeometryArray3D {
  constructor(vertices, vertexIndices, textureCoordinates, textureCoordinateIndices) {
    this.vertices = vertices;
    this.vertexIndices = vertexIndices;
    this.textureCoordinates = textureCoordinates;
    this.textureCoordinateIndices = textureCoordinateIndices;
    this.textureCoordinatesDefined = this.textureCoordinateIndices && this.textureCoordinateIndices.length > 0;
  }

  hasTextureCoordinates() {
    return this.textureCoordinatesDefined;
  }

  /**
   * Disposes the vertices and texture coordinates used by this geometry.
   */
  disposeCoordinates() {
    // Keep this.vertices and this.vertexIndices to possibly compute bounds with transformation 
    delete this.textureCoordinates;
    delete this.textureCoordinateIndices;
  }
}

/**
 * Creates the 3D geometry of an indexed line array.
 * @param {vec3 []} vertices 
 * @param {number []} vertexIndices
 * @param {vec2 []} textureCoordinates
 * @param {number []} textureCoordinateIndices
 * @constructor
 * @extends IndexedGeometryArray3D
 * @author Emmanuel Puybaret
 */
export class IndexedLineArray3D extends IndexedGeometryArray3D {
  constructor(vertices, vertexIndices, textureCoordinates, textureCoordinateIndices) {
    super(vertices, vertexIndices, textureCoordinates, textureCoordinateIndices);
  }
}

/**
 * Creates the 3D geometry of an indexed triangle array.
 * @param {vec3 []} vertices 
 * @param {number []} vertexIndices
 * @param {vec2 []} textureCoordinates
 * @param {number []} textureCoordinateIndices
 * @param {vec3 []} normals 
 * @param {number []} normalsIndices
 * @constructor
 * @extends IndexedGeometryArray3D
 * @author Emmanuel Puybaret
 */
export class IndexedTriangleArray3D extends IndexedGeometryArray3D {
  constructor(
    vertices,
    vertexIndices,
    textureCoordinates,
    textureCoordinateIndices,
    normals,
    normalIndices
  ) {
    super(vertices, vertexIndices, textureCoordinates, textureCoordinateIndices);
    this.normals = normals;
    this.normalIndices = normalIndices;
  }

  /**
   * Disposes the vertices, texture coordinates and normals used by this geometry.
   */
  disposeCoordinates() {
    super.disposeCoordinates();
    delete this.normals;
    delete this.normalIndices;
  }
}

/**
 * Creates a 3D bounding box.
 * @param {vec3} lower
 * @param {vec3} upper
 * @constructor
 * @author Emmanuel Puybaret
 */
export class BoundingBox3D {
  constructor(lower, upper) {
    this.lower = lower !== undefined
      ? vec3.clone(lower)
      : vec3.fromValues(-1.0, -1.0, -1.0);
    this.upper = upper !== undefined
      ? vec3.clone(upper)
      : vec3.fromValues(1.0, 1.0, 1.0);
  }

  /**
   * Returns a copy of the lower point of this bounding box.
   * @return {vec3}
   */
  getLower(p) {
    vec3.copy(p, this.lower);
  }

  /**
   * Returns a copy of the upper point of this bounding box.
   * @return {vec3}
   */
  getUpper(p) {
    vec3.copy(p, this.upper);
  }

  /**
   * Returns <code>true</code> if this bounding box is undefined.
   * @return {boolean}
   */
  isEmpty() {
    return this.lower[0] === Infinity
      && this.lower[1] === Infinity
      && this.lower[2] === Infinity
      && this.upper[0] === -Infinity
      && this.upper[1] === -Infinity
      && this.upper[2] === -Infinity;
  }

  /** 
   * Combines this bounding box by the bounds or point given in parameter.
   * @param {BoundingBox3D|vec3} bounds
   */
  combine(bounds) {
    if (bounds instanceof BoundingBox3D) {
      if (this.lower[0] > bounds.lower[0]) {
        this.lower[0] = bounds.lower[0];
      }
      if (this.lower[1] > bounds.lower[1]) {
        this.lower[1] = bounds.lower[1];
      }
      if (this.lower[2] > bounds.lower[2]) {
        this.lower[2] = bounds.lower[2];
      }
      if (this.upper[0] < bounds.upper[0]) {
        this.upper[0] = bounds.upper[0];
      }
      if (this.upper[1] < bounds.upper[1]) {
        this.upper[1] = bounds.upper[1];
      }
      if (this.upper[2] < bounds.upper[2]) {
        this.upper[2] = bounds.upper[2];
      }
    } else {
      let point = bounds;
      if (this.lower[0] > point[0]) {
        this.lower[0] = point[0];
      }
      if (this.lower[1] > point[1]) {
        this.lower[1] = point[1];
      }
      if (this.lower[2] > point[2]) {
        this.lower[2] = point[2];
      }
      if (this.upper[0] < point[0]) {
        this.upper[0] = point[0];
      }
      if (this.upper[1] < point[1]) {
        this.upper[1] = point[1];
      }
      if (this.upper[2] < point[2]) {
        this.upper[2] = point[2];
      }
    }
  }

  /** 
   * Returns <code>true</code> if the point given in parameter intersects this bounding box.
   * @param {vec3} point
   */
  intersect(point) {
    return !this.isEmpty()
      && point[0] >= this.lower[0]
      && point[0] <= this.upper[0]
      && point[1] >= this.lower[1]
      && point[1] <= this.upper[1]
      && point[2] >= this.lower[2]
      && point[2] <= this.upper[2];
  }

  /** 
   * Transforms this bounding box by the given matrix.
   * @param {mat4} transform
   */
  transform(transform) {
    if (!this.isEmpty()) {
      let xUpper = this.upper[0];
      let yUpper = this.upper[1];
      let zUpper = this.upper[2];
      let xLower = this.lower[0];
      let yLower = this.lower[1];
      let zLower = this.lower[2];

      let vector = vec3.fromValues(xUpper, yUpper, zUpper);
      vec3.transformMat4(vector, vector, transform);
      this.upper[0] = vector[0];
      this.upper[1] = vector[1];
      this.upper[2] = vector[2];
      this.lower[0] = vector[0];
      this.lower[1] = vector[1];
      this.lower[2] = vector[2];

      vec3.set(vector, xLower, yUpper, zUpper);
      vec3.transformMat4(vector, vector, transform);
      if (vector[0] > this.upper[0]) {
        this.upper[0] = vector[0];
      }
      if (vector[1] > this.upper[1]) {
        this.upper[1] = vector[1];
      }
      if (vector[2] > this.upper[2]) {
        this.upper[2] = vector[2];
      }
      if (vector[0] < this.lower[0]) {
        this.lower[0] = vector[0];
      }
      if (vector[1] < this.lower[1]) {
        this.lower[1] = vector[1];
      }
      if (vector[2] < this.lower[2]) {
        this.lower[2] = vector[2];
      }

      vec3.set(vector, xLower, yLower, zUpper);
      vec3.transformMat4(vector, vector, transform);
      if (vector[0] > this.upper[0]) {
        this.upper[0] = vector[0];
      }
      if (vector[1] > this.upper[1]) {
        this.upper[1] = vector[1];
      }
      if (vector[2] > this.upper[2]) {
        this.upper[2] = vector[2];
      }
      if (vector[0] < this.lower[0]) {
        this.lower[0] = vector[0];
      }
      if (vector[1] < this.lower[1]) {
        this.lower[1] = vector[1];
      }
      if (vector[2] < this.lower[2]) {
        this.lower[2] = vector[2];
      }

      vec3.set(vector, xUpper, yLower, zUpper);
      vec3.transformMat4(vector, vector, transform);
      if (vector[0] > this.upper[0]) {
        this.upper[0] = vector[0];
      }
      if (vector[1] > this.upper[1]) {
        this.upper[1] = vector[1];
      }
      if (vector[2] > this.upper[2]) {
        this.upper[2] = vector[2];
      }
      if (vector[0] < this.lower[0]) {
        this.lower[0] = vector[0];
      }
      if (vector[1] < this.lower[1]) {
        this.lower[1] = vector[1];
      }
      if (vector[2] < this.lower[2]) {
        this.lower[2] = vector[2];
      }

      vec3.set(vector, xLower, yUpper, zLower);
      vec3.transformMat4(vector, vector, transform);
      if (vector[0] > this.upper[0]) {
        this.upper[0] = vector[0];
      }
      if (vector[1] > this.upper[1]) {
        this.upper[1] = vector[1];
      }
      if (vector[2] > this.upper[2]) {
        this.upper[2] = vector[2];
      }
      if (vector[0] < this.lower[0]) {
        this.lower[0] = vector[0];
      }
      if (vector[1] < this.lower[1]) {
        this.lower[1] = vector[1];
      }
      if (vector[2] < this.lower[2]) {
        this.lower[2] = vector[2];
      }

      vec3.set(vector, xUpper, yUpper, zLower);
      vec3.transformMat4(vector, vector, transform);
      if (vector[0] > this.upper[0]) {
        this.upper[0] = vector[0];
      }
      if (vector[1] > this.upper[1]) {
        this.upper[1] = vector[1];
      }
      if (vector[2] > this.upper[2]) {
        this.upper[2] = vector[2];
      }
      if (vector[0] < this.lower[0]) {
        this.lower[0] = vector[0];
      }
      if (vector[1] < this.lower[1]) {
        this.lower[1] = vector[1];
      }
      if (vector[2] < this.lower[2]) {
        this.lower[2] = vector[2];
      }

      vec3.set(vector, xLower, yLower, zLower);
      vec3.transformMat4(vector, vector, transform);
      if (vector[0] > this.upper[0]) {
        this.upper[0] = vector[0];
      }
      if (vector[1] > this.upper[1]) {
        this.upper[1] = vector[1];
      }
      if (vector[2] > this.upper[2]) {
        this.upper[2] = vector[2];
      }
      if (vector[0] < this.lower[0]) {
        this.lower[0] = vector[0];
      }
      if (vector[1] < this.lower[1]) {
        this.lower[1] = vector[1];
      }
      if (vector[2] < this.lower[2]) {
        this.lower[2] = vector[2];
      }

      vec3.set(vector, xUpper, yLower, zLower);
      vec3.transformMat4(vector, vector, transform);
      if (vector[0] > this.upper[0]) {
        this.upper[0] = vector[0];
      }
      if (vector[1] > this.upper[1]) {
        this.upper[1] = vector[1];
      }
      if (vector[2] > this.upper[2]) {
        this.upper[2] = vector[2];
      }
      if (vector[0] < this.lower[0]) {
        this.lower[0] = vector[0];
      }
      if (vector[1] < this.lower[1]) {
        this.lower[1] = vector[1];
      }
      if (vector[2] < this.lower[2]) {
        this.lower[2] = vector[2];
      }
    }
  }

  clone() {
    return new BoundingBox3D(this.lower, this.upper);
  }
}

/**
 * Creates a 3D box shape.
 * @param {number} xdim
 * @param {number} ydim
 * @param {number} zdim
 * @param {Appearance3D} appearance
 * @constructor
 * @extends Shape3D
 * @author Emmanuel Puybaret
 */
export class Box3D extends Shape3D {
  constructor(xdim, ydim, zdim, appearance) {
    super(new IndexedTriangleArray3D([vec3.fromValues(-xdim, -ydim, -zdim),
    vec3.fromValues(xdim, -ydim, -zdim),
    vec3.fromValues(xdim, -ydim, zdim),
    vec3.fromValues(-xdim, -ydim, zdim),
    vec3.fromValues(-xdim, ydim, -zdim),
    vec3.fromValues(-xdim, ydim, zdim),
    vec3.fromValues(xdim, ydim, zdim),
    vec3.fromValues(xdim, ydim, -zdim)],
      [0, 1, 2, 0, 2, 3,
        4, 5, 6, 4, 6, 7,
        0, 3, 5, 0, 5, 4,
        1, 7, 6, 1, 6, 2,
        0, 4, 7, 0, 7, 1,
        2, 6, 5, 2, 5, 3],
      [vec2.fromValues(0., 0.),
      vec2.fromValues(1., 0.),
      vec2.fromValues(1., 1.),
      vec2.fromValues(0., 1.)],
      [0, 1, 2, 0, 2, 3,
        3, 0, 1, 3, 1, 2,
        0, 1, 2, 0, 2, 3,
        1, 2, 3, 1, 3, 0,
        1, 2, 3, 1, 3, 0,
        1, 2, 3, 1, 3, 0],
      [vec3.fromValues(0., -1., 0.),
      vec3.fromValues(0., 1., 0.),
      vec3.fromValues(-1., 0., 0.),
      vec3.fromValues(1., 0., 0.),
      vec3.fromValues(0., 0., -1.),
      vec3.fromValues(0., 0., 1.)],
      [0, 0, 0, 0, 0, 0,
        1, 1, 1, 1, 1, 1,
        2, 2, 2, 2, 2, 2,
        3, 3, 3, 3, 3, 3,
        4, 4, 4, 4, 4, 4,
        5, 5, 5, 5, 5, 5]), appearance);
    this.bounds = new BoundingBox3D(vec3.fromValues(-xdim, -ydim, -zdim), vec3.fromValues(xdim, ydim, zdim));
  }
}

/**
 * Creates data used to build the geometry of a shape.
 * @param {number} geometry type
 * @constructor
 * @author Emmanuel Puybaret
 */
export class GeometryInfo3D {
  constructor(type) {
    this.type = type;
  }

  /**
   * Sets the coordinates of the vertices of the geometry.
   * @param {vec3 []} vertices
   */
  setCoordinates(vertices) {
    this.vertices = vertices;
  }

  /**
   * Sets the indices of each vertex of the geometry.
   * @param {vec3 []} coordinatesIndices
   */
  setCoordinateIndices(coordinatesIndices) {
    this.coordinatesIndices = coordinatesIndices;
  }

  /**
   * Sets the coordinates of the normals of the geometry.
   * @param {vec3 []} normals
   */
  setNormals(normals) {
    this.normals = normals;
  }

  /**
   * Sets the indices of each normal of the geometry.
   * @param {vec3 []} normalIndices
   */
  setNormalIndices(normalIndices) {
    this.normalIndices = normalIndices;
  }

  /**
   * Sets the texture coordinates of the vertices of the geometry.
   * @param {vec2 []} textureCoordinates
   */
  setTextureCoordinates(textureCoordinates) {
    this.textureCoordinates = textureCoordinates;
  }

  /**
   * Sets the indices of texture coordinates of the geometry.
   * @param {vec2 []} textureCoordinateIndices
   */
  setTextureCoordinateIndices(textureCoordinateIndices) {
    this.textureCoordinateIndices = textureCoordinateIndices;
  }

  /**
   * Sets the strip counts of a polygon geometry.
   * @param {number []} stripCounts
   */
  setStripCounts(stripCounts) {
    this.stripCounts = stripCounts;
  }

  /**
   * Sets the contour counts of a polygon geometry.
   * @param {number []} contourCounts
   * @private
   */
  setContourCounts(contourCounts) {
    this.contourCounts = contourCounts; // TODO implement countours
  }

  /**
   * Generates the crease angle used to generate the normals of a geometry.
   * @param {number} creaseAngle
   */
  setCreaseAngle(creaseAngle) {
    this.creaseAngle = creaseAngle;
  }

  /**
   * Sets whether the normals of the geometry should be generated or not.
   * @param {boolean} generatedNormals
   */
  setGeneratedNormals(generatedNormals) {
    this.generatedNormals = generatedNormals;
  }

  /**
   * Generates the normals and their indices for the shape defined by the given vertices and their indices.
   * @private
   */
  computeNormals(vertices, coordinatesIndices, normals, normalIndices) {
    let creaseAngle;
    if (this.creaseAngle === undefined) {
      creaseAngle = 44. * Math.PI / 180.;
    } else {
      creaseAngle = this.creaseAngle;
    }
    // Generate normals
    let vector1 = vec3.create();
    let vector2 = vec3.create();
    if (creaseAngle > 0) {
      let sharedVertices = [];
      for (var i = 0; i < coordinatesIndices.length; i += 3) {
        var vertex = vertices[coordinatesIndices[i + 1]];
        vec3.sub(vector1, vertices[coordinatesIndices[i + 2]], vertex);
        vec3.sub(vector2, vertices[coordinatesIndices[i]], vertex);
        var normal = vec3.cross(vec3.create(), vector1, vector2);
        for (var j = 0; j < 3; j++) {
          // Add vertex index to the list of shared vertices 
          var sharedVertex = { normal: normal };
          var vertexIndex = coordinatesIndices[i + j];
          sharedVertex.nextVertex = sharedVertices[vertexIndex];
          sharedVertices[vertexIndex] = sharedVertex;
          // Add normal to normals set
          normals.push(normal);
          normalIndices.push(normals.length - 1);
        }
      }

      // Adjust the normals of shared vertices belonging to the smoothing group
      let crossProduct = vec3.create();
      for (var i = 0; i < coordinatesIndices.length; i += 3) {
        for (var j = 0; j < 3; j++) {
          var vertexIndex = coordinatesIndices[i + j];
          var normalIndex = normalIndices[i + j];
          let defaultNormal = normals[normalIndex];
          var normal = vec3.create();
          for (var sharedVertex = sharedVertices[vertexIndex];
            sharedVertex !== undefined;
            sharedVertex = sharedVertex.nextVertex) {
            // Take into account only normals of shared vertex with a crease angle  
            // smaller than the given one 
            if (sharedVertex.normal === defaultNormal) {
              vec3.add(normal, normal, sharedVertex.normal);
            } else {
              let dotProduct = vec3.dot(sharedVertex.normal, defaultNormal);
              // Eliminate angles > PI/2 quickly if dotProduct is negative
              if (dotProduct > 0 || creaseAngle > Math.PI / 2) {
                let angle = Math.abs(Math.atan2(vec3.length(vec3.cross(crossProduct, sharedVertex.normal, defaultNormal)), dotProduct));
                if (angle < creaseAngle - 1E-3) {
                  vec3.add(normal, normal, sharedVertex.normal);
                }
              }
            }
          }

          if (vec3.squaredLength(normal) !== 0) {
            vec3.normalize(normal, normal);
          } else {
            // If smoothing leads to a null normal, use default normal
            vec3.copy(normal, defaultNormal);
            vec3.normalize(normal, normal);
          }
          // Store updated normal
          normals[normalIndex] = normal;
        }
      }
    } else {
      for (var i = 0; i < coordinatesIndices.length; i += 3) {
        var vertex = vertices[coordinatesIndices[i + 1]];
        vec3.sub(vector1, vertices[coordinatesIndices[i + 2]], vertex);
        vec3.sub(vector2, vertices[coordinatesIndices[i]], vertex);
        var normal = vec3.cross(vec3.create(), vector1, vector2);
        vec3.normalize(normal, normal);
        var normalIndex = normals.length - 1;
        if (normals.length === 0
          || !vec3.exactEquals(normals[normalIndex], normal)) {
          // Add normal to normals set
          normals.push(normal);
          normalIndex++;
        }
        for (var j = 0; j < 3; j++) {
          normalIndices.push(normalIndex);
        }
      }
    }
  }

  /**
   * Returns an instance of {@link IndexedTriangleArray3D} configured from 
   * the geometry data.
   */
  getIndexedGeometryArray() {
    if (this.vertices && !this.coordinatesIndices) {
      this.coordinatesIndices = new Array(this.vertices.length);
      if (this.generatedNormals
        && (this.creaseAngle === undefined
          || this.creaseAngle > 0)) {
        // Ensure each coordinate indices are unique otherwise normals might not be computed correctly
        for (var i = 0; i < this.coordinatesIndices.length; i++) {
          for (let j = 0; j < this.vertices.length; j++) {
            if (vec3.exactEquals(this.vertices[i], this.vertices[j])) {
              this.coordinatesIndices[i] = j;
              break;
            }
          }
        }
      } else {
        for (var i = 0; i < this.coordinatesIndices.length; i++) {
          this.coordinatesIndices[i] = i;
        }
      }
    }
    if (this.textureCoordinates && !this.textureCoordinateIndices) {
      this.textureCoordinateIndices = new Array(this.textureCoordinates.length);
      for (var i = 0; i < this.textureCoordinateIndices.length; i++) {
        this.textureCoordinateIndices[i] = i;
      }
    }
    if (this.normals && !this.normalIndices && !this.generatedNormals) {
      this.normalIndices = new Array(this.normals.length);
      for (var i = 0; i < this.normalIndices.length; i++) {
        this.normalIndices[i] = i;
      }
    }
    let triangleCoordinatesIndices;
    let triangleTextureCoordinateIndices;
    let triangleNormalIndices;
    if (this.type === GeometryInfo3D.POLYGON_ARRAY) {
      triangleCoordinatesIndices = [];
      triangleTextureCoordinateIndices = [];
      triangleNormalIndices = [];
      new Triangulator().triangulate(this.vertices, this.coordinatesIndices,
        this.textureCoordinates ? this.textureCoordinateIndices : [],
        this.normals ? this.normalIndices : [],
        this.stripCounts,
        triangleCoordinatesIndices, triangleTextureCoordinateIndices, triangleNormalIndices);
    } else if (this.type === GeometryInfo3D.QUAD_ARRAY) {
      triangleCoordinatesIndices = [];
      triangleTextureCoordinateIndices = [];
      triangleNormalIndices = [];
      for (var i = 0; i < this.coordinatesIndices.length; i += 4) {
        triangleCoordinatesIndices.push(this.coordinatesIndices[i]);
        triangleCoordinatesIndices.push(this.coordinatesIndices[i + 1]);
        triangleCoordinatesIndices.push(this.coordinatesIndices[i + 2]);
        triangleCoordinatesIndices.push(this.coordinatesIndices[i + 2]);
        triangleCoordinatesIndices.push(this.coordinatesIndices[i + 3]);
        triangleCoordinatesIndices.push(this.coordinatesIndices[i]);
        if (this.textureCoordinateIndices) {
          triangleTextureCoordinateIndices.push(this.textureCoordinateIndices[i]);
          triangleTextureCoordinateIndices.push(this.textureCoordinateIndices[i + 1]);
          triangleTextureCoordinateIndices.push(this.textureCoordinateIndices[i + 2]);
          triangleTextureCoordinateIndices.push(this.textureCoordinateIndices[i + 2]);
          triangleTextureCoordinateIndices.push(this.textureCoordinateIndices[i + 3]);
          triangleTextureCoordinateIndices.push(this.textureCoordinateIndices[i]);
        }
        if (this.normalIndices) {
          triangleNormalIndices.push(this.normalIndices[i]);
          triangleNormalIndices.push(this.normalIndices[i + 1]);
          triangleNormalIndices.push(this.normalIndices[i + 2]);
          triangleNormalIndices.push(this.normalIndices[i + 2]);
          triangleNormalIndices.push(this.normalIndices[i + 3]);
          triangleNormalIndices.push(this.normalIndices[i]);
        }
      }
    } else if (this.type === GeometryInfo3D.TRIANGLE_STRIP_ARRAY) {
      triangleCoordinatesIndices = [];
      triangleTextureCoordinateIndices = [];
      triangleNormalIndices = [];
      for (var i = 0, index = 0; i < this.stripCounts.length; i++) {
        var stripCount = this.stripCounts[i];
        for (var k = 0; k < stripCount - 2; k++) {
          let nextVertexIndex = index + (k % 2 === 0 ? k + 1 : k + 2);
          let nextNextVertexIndex = index + (k % 2 === 0 ? k + 2 : k + 1);
          triangleCoordinatesIndices.push(this.coordinatesIndices[index + k]);
          triangleCoordinatesIndices.push(this.coordinatesIndices[nextVertexIndex]);
          triangleCoordinatesIndices.push(this.coordinatesIndices[nextNextVertexIndex]);
          if (this.textureCoordinateIndices) {
            triangleTextureCoordinateIndices.push(this.textureCoordinateIndices[index + k]);
            triangleTextureCoordinateIndices.push(this.textureCoordinateIndices[nextVertexIndex]);
            triangleTextureCoordinateIndices.push(this.textureCoordinateIndices[nextNextVertexIndex]);
          }
          if (this.normalIndices) {
            triangleNormalIndices.push(this.normalIndices[index + k]);
            triangleNormalIndices.push(this.normalIndices[nextVertexIndex]);
            triangleNormalIndices.push(this.normalIndices[nextNextVertexIndex]);
          }
        }
        index += stripCount;
      }
    } else if (this.type === GeometryInfo3D.TRIANGLE_FAN_ARRAY) {
      triangleCoordinatesIndices = [];
      triangleTextureCoordinateIndices = [];
      triangleNormalIndices = [];
      for (var i = 0, index = 0; i < this.stripCounts.length; i++) {
        var stripCount = this.stripCounts[i];
        for (var k = 0; k < stripCount - 2; k++) {
          triangleCoordinatesIndices.push(this.coordinatesIndices[index]);
          triangleCoordinatesIndices.push(this.coordinatesIndices[index + k + 1]);
          triangleCoordinatesIndices.push(this.coordinatesIndices[index + k + 2]);
          if (this.textureCoordinateIndices) {
            triangleTextureCoordinateIndices.push(this.textureCoordinateIndices[index]);
            triangleTextureCoordinateIndices.push(this.textureCoordinateIndices[index + k + 1]);
            triangleTextureCoordinateIndices.push(this.textureCoordinateIndices[index + k + 2]);
          }
          if (this.normalIndices) {
            triangleNormalIndices.push(this.normalIndices[index]);
            triangleNormalIndices.push(this.normalIndices[index + k + 1]);
            triangleNormalIndices.push(this.normalIndices[index + k + 2]);
          }
        }
        index += stripCount;
      }
    } else {
      triangleCoordinatesIndices = this.vertices ? this.coordinatesIndices : [];
      triangleTextureCoordinateIndices = this.textureCoordinates ? this.textureCoordinateIndices : [];
      triangleNormalIndices = this.normals ? this.normalIndices : [];
    }

    let normals;
    if (this.generatedNormals) {
      normals = [];
      triangleNormalIndices = [];
      this.computeNormals(this.vertices, triangleCoordinatesIndices, normals, triangleNormalIndices);
    } else {
      normals = this.normals;
    }

    return new IndexedTriangleArray3D(this.vertices, triangleCoordinatesIndices,
      this.textureCoordinates, triangleTextureCoordinateIndices,
      normals, triangleNormalIndices);
  }
}

GeometryInfo3D.TRIANGLE_ARRAY = 0;
GeometryInfo3D.TRIANGLE_STRIP_ARRAY = 1;
GeometryInfo3D.TRIANGLE_FAN_ARRAY = 2;
GeometryInfo3D.QUAD_ARRAY = 10;
GeometryInfo3D.POLYGON_ARRAY = 20;

/**
 * Creates an IncorrectFormat3DException instance.
 * @constructor
 */
export class IncorrectFormat3DException {
  constructor(message) {
    this.message = message;
  }
}

