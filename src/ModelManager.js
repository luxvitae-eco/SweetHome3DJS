/*
 * ModelManager.js
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

import {
  CatalogTexture,
  HomeMaterial,
  HomeTexture,
  Room,
} from './SweetHome3D';

import { DAELoader } from './DAELoader';
import { OBJLoader } from './OBJLoader';
import {
  BoundingBox3D,
  Node3D,
  IndexedLineArray3D,
  Appearance3D, Group3D, IndexedTriangleArray3D,
  Shape3D,
  TransformGroup3D,
  Link3D,
} from './scene3d';
import { ShapeTools } from './ShapeTools';
import { IllegalArgumentException } from './core';
import { System } from './core';
import { Max3DSLoader } from './Max3DSLoader';
import { SimpleURLContent, } from './URLContent';

// (used classes are not needed to view 3D models)

/**
 * Singleton managing 3D models cache.
 * @constructor
 * @author Emmanuel Puybaret
 */
export class ModelManager {
  constructor() {
    this.loadedModelNodes = {};
    this.loadingModelObservers = {};
  }

  /**
   * Returns an instance of this singleton.
   * @return {ModelManager} 
   */
  static getInstance() {
    if (ModelManager.instance == null) {
      ModelManager.instance = new ModelManager();
    }
    return ModelManager.instance;
  }

  /**
   * Clears loaded models cache. 
   */
  clear() {
    this.loadedModelNodes = {};
    this.loadingModelObservers = {};
    if (this.modelLoaders) {
      for (let i = 0; i < this.modelLoaders.length; i++) {
        this.modelLoaders[i].clear();
      }
    }
  }

  /**
   * Returns the minimum size of a model.
   */
  getMinimumSize() {
    return 0.001;
  }

  /**
   * Returns the size of 3D shapes of node after an additional optional transformation.
   * @param {Node3D} node  the root of a model 
   * @param {Array}  [transformation] the optional transformation applied to the model  
   */
  getSize(node, transformation) {
    if (transformation === undefined) {
      transformation = mat4.create();
    }
    let bounds = this.getBounds(node, transformation);
    let lower = vec3.create();
    bounds.getLower(lower);
    let upper = vec3.create();
    bounds.getUpper(upper);
    return vec3.fromValues(Math.max(this.getMinimumSize(), upper[0] - lower[0]),
      Math.max(this.getMinimumSize(), upper[1] - lower[1]),
      Math.max(this.getMinimumSize(), upper[2] - lower[2]));
  }

  /**
   * Returns the center of the bounds of <code>node</code> 3D shapes.
   * @param node  the root of a model
   */
  getCenter(node) {
    let bounds = this.getBounds(node);
    let lower = vec3.create();
    bounds.getLower(lower);
    let upper = vec3.create();
    bounds.getUpper(upper);
    return vec3.fromValues((lower[0] + upper[0]) / 2, (lower[1] + upper[1]) / 2, (lower[2] + upper[2]) / 2);
  }

  /**
   * Returns the bounds of the 3D shapes of node with an additional optional transformation.
   * @param {Node3D} node  the root of a model 
   * @param {Array}  [transformation] the optional transformation applied to the model  
   */
  getBounds(node, transformation) {
    if (transformation === undefined) {
      transformation = mat4.create();
    }
    let objectBounds = new BoundingBox3D(
      vec3.fromValues(Infinity, Infinity, Infinity),
      vec3.fromValues(-Infinity, -Infinity, -Infinity));
    this.computeBounds(node, objectBounds, transformation, !this.isOrthogonalRotation(transformation), this.isDeformed(node));
    return objectBounds;
  }

  /**
   * Returns true if the rotation matrix matches only rotations of 
   * a multiple of 90° degrees around x, y or z axis.
   * @private
   */
  isOrthogonalRotation(transformation) {
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        // Return false if the matrix contains a value different from 0 1 or -1
        if (Math.abs(transformation[i * 4 + j]) > 1E-6
          && Math.abs(transformation[i * 4 + j] - 1) > 1E-6
          && Math.abs(transformation[i * 4 + j] + 1) > 1E-6) {
          return false;
        }
      }
    }
    return true;
  }

  /**
   * @private
   */
  computeBounds(
    node,
    bounds,
    parentTransformation,
    transformShapeGeometry,
    deformedGeometry
  ) {
    if (node instanceof Group3D) {
      if (node instanceof TransformGroup3D) {
        parentTransformation = mat4.clone(parentTransformation);
        mat4.mul(parentTransformation, parentTransformation, node.transform);
      }
      // Compute the bounds of all the node children
      for (let i = 0; i < node.children.length; i++) {
        this.computeBounds(node.children[i], bounds, parentTransformation, transformShapeGeometry, deformedGeometry);
      }
    } else if (node instanceof Link3D) {
      this.computeBounds(node.getSharedGroup(), bounds, parentTransformation, transformShapeGeometry, deformedGeometry);
    } else if (node instanceof Shape3D) {
      let shapeBounds;
      if (transformShapeGeometry
        || deformedGeometry
        && !this.isOrthogonalRotation(parentTransformation)) {
        shapeBounds = this.computeTransformedGeometryBounds(node, parentTransformation);
      } else {
        shapeBounds = node.getBounds();
        shapeBounds.transform(parentTransformation);
      }
      bounds.combine(shapeBounds);
    }
  }

  /**
   * @private
   */
  computeTransformedGeometryBounds(shape, transformation) {
    let lower = vec3.fromValues(Infinity, Infinity, Infinity);
    let upper = vec3.fromValues(-Infinity, -Infinity, -Infinity);
    for (let i = 0; i < shape.geometries.length; i++) {
      // geometry instanceof IndexedGeometryArray3D
      let geometry = shape.geometries[i];
      let vertex = vec3.create();
      for (let index = 0; index < geometry.vertexIndices.length; index++) {
        vec3.copy(vertex, geometry.vertices[geometry.vertexIndices[index]]);
        this.updateBounds(vertex, transformation, lower, upper);
      }
    }
    return new BoundingBox3D(lower, upper);
  }

  /**
   * @private
   */
  updateBounds(vertex, transformation, lower, upper) {
    if (transformation !== null) {
      vec3.transformMat4(vertex, vertex, transformation);
    }
    vec3.min(lower, lower, vertex);
    vec3.max(upper, upper, vertex);
  }

  /**
   * Returns a transform group that will transform the model node
   * to let it fill a box of the given width centered on the origin.
   * @param {Node3D} node     the root of a model with any size and location
   * @param {Array}  modelRotation the rotation applied to the model before normalization 
   *                 or <code>null</code> if no transformation should be applied to node.
   * @param {number} width    the width of the box
   * @param {boolean} [modelCenteredAtOrigin] if <code>true</code> or missing, center will be moved 
   *                 to match the origin after the model rotation is applied
   */
  getNormalizedTransformGroup(node, modelRotation, width, modelCenteredAtOrigin) {
    return new TransformGroup3D(this.getNormalizedTransform(
      node, modelRotation, width, modelCenteredAtOrigin !== false));
  }

  /**
   * Returns a transformation matrix that will transform the model node
   * to let it fill a box of the given width centered on the origin.
   * @param {Node3D} node     the root of a model with any size and location
   * @param {?Array} modelRotation the rotation applied to the model before normalization 
   *                 or <code>null</code> if no transformation should be applied to node.
   * @param {number} width    the width of the box
   * @param {boolean} [modelCenteredAtOrigin] if <code>true</code> center will be moved to match the origin 
   *                 after the model rotation is applied
   */
  getNormalizedTransform(node, modelRotation, width, modelCenteredAtOrigin) {
    // Get model bounding box size 
    let modelBounds = this.getBounds(node);
    let lower = vec3.create();
    modelBounds.getLower(lower);
    let upper = vec3.create();
    modelBounds.getUpper(upper);
    // Translate model to its center
    let translation = mat4.create();
    mat4.translate(translation, translation, vec3.fromValues(
      -lower[0] - (upper[0] - lower[0]) / 2,
      -lower[1] - (upper[1] - lower[1]) / 2,
      -lower[2] - (upper[2] - lower[2]) / 2));

    let modelTransform;
    if (modelRotation !== undefined && modelRotation !== null) {
      // Get model bounding box size with model rotation
      let rotationTransform = this.getRotationTransformation(modelRotation);
      mat4.mul(rotationTransform, rotationTransform, translation);
      let rotatedModelBounds = this.getBounds(node, rotationTransform);
      rotatedModelBounds.getLower(lower);
      rotatedModelBounds.getUpper(upper);
      modelTransform = mat4.create();
      if (modelCenteredAtOrigin) {
        // Move model back to its new center
        mat4.translate(modelTransform, modelTransform, vec3.fromValues(
          -lower[0] - (upper[0] - lower[0]) / 2,
          -lower[1] - (upper[1] - lower[1]) / 2,
          -lower[2] - (upper[2] - lower[2]) / 2));
      }
      mat4.mul(modelTransform, modelTransform, rotationTransform);
    } else {
      modelTransform = translation;
    }

    // Scale model to make it fill a 1 unit wide box
    let scaleOneTransform = mat4.create();
    mat4.scale(scaleOneTransform, scaleOneTransform,
      vec3.fromValues(width / Math.max(this.getMinimumSize(), upper[0] - lower[0]),
        width / Math.max(this.getMinimumSize(), upper[1] - lower[1]),
        width / Math.max(this.getMinimumSize(), upper[2] - lower[2])));
    mat4.mul(scaleOneTransform, scaleOneTransform, modelTransform);
    return scaleOneTransform;
  }

  /**
   * Returns a transformation matching the given rotation.
   * @param {Array}  modelRotation  the desired rotation.
   * @ignore
   */
  getRotationTransformation(modelRotation) {
    let modelTransform = mat4.create();
    modelTransform[0] = modelRotation[0][0];
    modelTransform[4] = modelRotation[0][1];
    modelTransform[8] = modelRotation[0][2];
    modelTransform[1] = modelRotation[1][0];
    modelTransform[5] = modelRotation[1][1];
    modelTransform[9] = modelRotation[1][2];
    modelTransform[2] = modelRotation[2][0];
    modelTransform[6] = modelRotation[2][1];
    modelTransform[10] = modelRotation[2][2];
    return modelTransform;
  }

  /**
   * Returns a transformation able to place in the scene the normalized model 
   * of the given <code>piece</code>.
   * @param {HomePieceOfFurniture} piece  a piece of furniture
   * @param {Node3D} [normalizedModelNode]  the node matching the normalized model of the piece. 
   *              This parameter is required only if the piece is rotated horizontally
   * @ignore
   */
  getPieceOfFurnitureNormalizedModelTransformation(piece, normalizedModelNode) {
    // Set piece size
    let scale = mat4.create();
    let pieceWidth = piece.getWidth();
    // If piece model is mirrored, inverse its width
    if (piece.isModelMirrored()) {
      pieceWidth *= -1;
    }
    mat4.scale(scale, scale, vec3.fromValues(pieceWidth, piece.getHeight(), piece.getDepth()));

    let modelTransform;
    let height;
    if (piece.isHorizontallyRotated() && normalizedModelNode !== undefined && normalizedModelNode !== null) {
      let horizontalRotationAndScale = mat4.create();
      // Change its angle around horizontal axes
      if (piece.getPitch() != 0) {
        mat4.fromXRotation(horizontalRotationAndScale, -piece.getPitch());
      }
      if (piece.getRoll() != 0) {
        let rollRotation = mat4.create();
        mat4.fromZRotation(rollRotation, -piece.getRoll());
        mat4.mul(horizontalRotationAndScale, rollRotation, horizontalRotationAndScale);
      }
      mat4.mul(horizontalRotationAndScale, horizontalRotationAndScale, scale);

      // Compute center location when the piece is rotated around horizontal axes
      let rotatedModelBounds = this.getBounds(normalizedModelNode, horizontalRotationAndScale);
      let lower = vec3.create();
      rotatedModelBounds.getLower(lower);
      let upper = vec3.create();
      rotatedModelBounds.getUpper(upper);
      modelTransform = mat4.create();
      mat4.translate(modelTransform, modelTransform, vec3.fromValues(
        -lower[0] - (upper[0] - lower[0]) / 2,
        -lower[1] - (upper[1] - lower[1]) / 2,
        -lower[2] - (upper[2] - lower[2]) / 2));
      mat4.mul(modelTransform, modelTransform, horizontalRotationAndScale);
      height = Math.max(this.getMinimumSize(), upper[1] - lower[1]);
    } else {
      modelTransform = scale;
      height = piece.getHeight();
    }

    // Change its angle around y axis
    let verticalRotation = mat4.create();
    mat4.fromYRotation(verticalRotation, -piece.getAngle());
    mat4.mul(verticalRotation, verticalRotation, modelTransform);

    // Translate it to its location
    let pieceTransform = mat4.create();
    let levelElevation;
    if (piece.getLevel() !== null) {
      levelElevation = piece.getLevel().getElevation();
    } else {
      levelElevation = 0;
    }
    mat4.translate(pieceTransform, pieceTransform, vec3.fromValues(
      piece.getX(),
      piece.getElevation() + height / 2 + levelElevation,
      piece.getY()));
    mat4.mul(pieceTransform, pieceTransform, verticalRotation);
    return pieceTransform;
  }

  /**
   * Reads a 3D node from content with supported loaders
   * and notifies the loaded model to the given <code>modelObserver</code> once available
   * with its <code>modelUpdated</code> and <code>modelError</code> methods. 
   * @param {URLContent} content an object containing a model
   * @param {boolean} [synchronous] optional parameter equal to false by default
   * @param {{modelUpdated, modelError, progression}} modelObserver  
   *            the observer containing <code>modelUpdated(model)</code>, <code>modelError(error)</code>, 
   *            <code>progression(part, info, percentage)</code> optional methods that will be 
   *            notified once the model is available or if an error happens,  
   *            with <code>model<code> being an instance of <code>Node3D</code>, 
   *            <code>error</code>, <code>part</code>, <code>info</code> strings 
   *            and <code>percentage</code> a number.
   */
  loadModel(content, synchronous, modelObserver) {
    if (modelObserver === undefined) {
      modelObserver = synchronous;
      synchronous = false;
    }
    let modelManager = this;
    let contentUrl = content.getURL();
    if (contentUrl in this.loadedModelNodes) {
      // Notify cached model to observer with a clone of the model
      let model = this.loadedModelNodes[contentUrl];
      if (modelObserver.modelUpdated !== undefined) {
        modelObserver.modelUpdated(this.cloneNode(model));
      }
    } else if (synchronous) {
      this.load(content, synchronous, {
        modelLoaded: function (loadedModel) {
          modelManager.loadedModelNodes[contentUrl] = loadedModel;
          if (modelObserver.modelUpdated !== undefined) {
            modelObserver.modelUpdated(modelManager.cloneNode(loadedModel));
          }
        },
        modelError: function (err) {
          if (modelObserver.modelError !== undefined) {
            modelObserver.modelError(err);
          }
        },
        progression: function (part, info, percentage) {
          if (modelObserver.progression !== undefined) {
            modelObserver.progression(part, info, percentage);
          }
        }
      });
    } else {
      if (contentUrl in this.loadingModelObservers) {
        // If observers list exists, content model is already being loaded
        // register observer for future notification
        this.loadingModelObservers[contentUrl].push(modelObserver);
      } else {
        // Create a list of observers that will be notified once content model is loaded
        let observers = [];
        observers.push(modelObserver);
        this.loadingModelObservers[contentUrl] = observers;

        this.load(content, synchronous, {
          modelLoaded: function (loadedModel) {
            modelManager.loadedModelNodes[contentUrl] = loadedModel;
            let observers = modelManager.loadingModelObservers[contentUrl];
            if (observers) {
              for (let i = 0; i < observers.length; i++) {
                if (observers[i].modelUpdated !== undefined) {
                  observers[i].modelUpdated(modelManager.cloneNode(loadedModel));
                }
              }
            }
          },
          modelError: function (err) {
            let observers = modelManager.loadingModelObservers[contentUrl];
            if (observers) {
              delete modelManager.loadingModelObservers[contentUrl];
              for (let i = 0; i < observers.length; i++) {
                if (observers[i].modelError !== undefined) {
                  observers[i].modelError(err);
                }
              }
            }
          },
          progression: function (part, info, percentage) {
            let observers = modelManager.loadingModelObservers[contentUrl];
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
  }

  /**
   * Removes the model matching the given content from the manager. 
   * @param {URLContent} content an object containing a model
   * @param {boolean}    disposeGeometries if <code>true</code> model geometries will be disposed too
   */
  unloadModel(content, disposeGeometries) {
    let contentUrl = content.getURL();
    let modelRoot = this.loadedModelNodes[contentUrl];
    delete this.loadedModelNodes[contentUrl];
    delete this.loadingModelObservers[contentUrl];
    if (disposeGeometries) {
      this.disposeGeometries(modelRoot);
    }
  }

  /**
   * Frees geometry data of the given <code>node</code>.
   * @param {Node3D} node  the root of a model
   * @package 
   */
  disposeGeometries(node) {
    if (node instanceof Group3D) {
      for (var i = 0; i < node.children.length; i++) {
        this.disposeGeometries(node.children[i]);
      }
    } else if (node instanceof Link3D) {
      // Not a problem to dispose more than once geometries of a shared group
      this.disposeGeometries(node.getSharedGroup());
    } else if (node instanceof Shape3D) {
      let geometries = node.getGeometries();
      for (var i = 0; i < geometries.length; i++) {
        geometries[i].disposeCoordinates();
      }
    }
  }

  /**
   * Returns a clone of the given <code>node</code>.
   * All the children and the attributes of the given node are duplicated except the geometries 
   * and the texture images of shapes.
   * @param {Node3D} node  the root of a model 
   * @param {Array}  [clonedSharedGroups]
   */
  cloneNode(node, clonedSharedGroups) {
    if (clonedSharedGroups === undefined) {
      return this.cloneNode(node, []);
    } else {
      let clonedNode = node.clone();
      if (node instanceof Shape3D) {
        let clonedAppearance;
        if (node.getAppearance()) {
          clonedNode.setAppearance(node.getAppearance().clone());
        }
      } else if (node instanceof Link3D) {
        let clonedLink = node.clone();
        // Force duplication of shared groups too if not duplicated yet
        let sharedGroup = clonedLink.getSharedGroup();
        if (sharedGroup !== null) {
          let clonedSharedGroup = null;
          for (var i = 0; i < clonedSharedGroups.length; i++) {
            if (clonedSharedGroups[i].sharedGroup === sharedGroup) {
              clonedSharedGroup = clonedSharedGroups[i].clonedSharedGroup;
              break;
            }
          }
          if (clonedSharedGroup === null) {
            clonedSharedGroup = this.cloneNode(sharedGroup, clonedSharedGroups);
            clonedSharedGroups.push({
              sharedGroup: sharedGroup,
              clonedSharedGroup: clonedSharedGroup
            });
          }
          clonedLink.setSharedGroup(clonedSharedGroup);
        }
        return clonedLink;
      } else {
        clonedNode = node.clone();
        if (node instanceof Group3D) {
          let children = node.getChildren();
          for (var i = 0; i < children.length; i++) {
            let clonedChild = this.cloneNode(children[i], clonedSharedGroups);
            clonedNode.addChild(clonedChild);
          }
        }
      }
      return clonedNode;
    }
  }

  /**
   * Loads the node from <code>content</code> with supported loaders.
   * @param {URLContent} content an object containing a model
   * @param {boolean} [synchronous] optional parameter equal to false by default
   * @param {{modelLoaded, modelError, progression}} modelObserver  
   *           the observer that will be notified once the model is available
   *           or if an error happens
   * @private
   */
  load(content, synchronous, modelObserver) {
    if (modelObserver === undefined) {
      // 2 parameters (content, modelObserver)
      modelObserver = synchronous;
      synchronous = false;
    }

    let contentUrl = content.getURL();
    if (!this.modelLoaders) {
      // As model loaders are reentrant, use the same loaders for multiple loading
      this.modelLoaders = [new OBJLoader()];
      // Optional loaders
      if (typeof DAELoader !== "undefined") {
        this.modelLoaders.push(new DAELoader());
      }
      if (typeof Max3DSLoader !== "undefined") {
        this.modelLoaders.push(new Max3DSLoader());
      }
    }
    let modelManager = this;
    let modelLoadingObserver = {
      modelLoaderIndex: 0,
      modelLoaded: function (model) {
        let bounds = modelManager.getBounds(model);
        if (!bounds.isEmpty()) {
          modelManager.updateWindowPanesTransparency(model);
          modelManager.updateDeformableModelHierarchy(model);
          modelManager.replaceMultipleSharedShapes(model);
          model.setUserData(content);
          modelObserver.modelLoaded(model);
        } else if (++this.modelLoaderIndex < modelManager.modelLoaders.length) {
          modelManager.modelLoaders[this.modelLoaderIndex].load(contentUrl, synchronous, this);
        } else {
          this.modelError("Unsupported 3D format");
        }
      },
      modelError: function (err) {
        modelObserver.modelError(err);
      },
      progression: function (part, info, percentage) {
        modelObserver.progression(part, info, percentage);
      }
    };
    modelManager.modelLoaders[0].load(contentUrl, synchronous, modelLoadingObserver);
  }

  /**
 * Updates the transparency of window panes shapes.
 * @private
 */
  updateWindowPanesTransparency(node) {
    if (node instanceof Group3D) {
      for (let i = 0; i < node.children.length; i++) {
        this.updateWindowPanesTransparency(node.children[i]);
      }
    } else if (node instanceof Link3D) {
      this.updateWindowPanesTransparency(node.getSharedGroup());
    } else if (node instanceof Shape3D) {
      let name = node.getName();
      if (name
        && name.indexOf(ModelManager.WINDOW_PANE_SHAPE_PREFIX) === 0) {
        let appearance = node.getAppearance();
        if (appearance === null) {
          appearance = new Appearance3D();
          node.setAppearance(appearance);
        }
        if (appearance.getTransparency() === undefined) {
          appearance.setTransparency(0.5);
        }
      }
    }
  }

  /**
   * Updates the hierarchy of nodes with intermediate pickable nodes to help deforming models.
   * @param {Group3D} group
   * @private 
  */
  updateDeformableModelHierarchy(group) {
    // Try to reorganize node hierarchy of mannequin model
    if (this.containsNode(group, ModelManager.MANNEQUIN_ABDOMEN_PREFIX)
      && this.containsNode(group, ModelManager.MANNEQUIN_CHEST_PREFIX)
      && this.containsNode(group, ModelManager.MANNEQUIN_PELVIS_PREFIX)
      && this.containsNode(group, ModelManager.MANNEQUIN_NECK_PREFIX)
      && this.containsNode(group, ModelManager.MANNEQUIN_HEAD_PREFIX)
      && this.containsNode(group, ModelManager.MANNEQUIN_LEFT_SHOULDER_PREFIX)
      && this.containsNode(group, ModelManager.MANNEQUIN_LEFT_ARM_PREFIX)
      && this.containsNode(group, ModelManager.MANNEQUIN_LEFT_ELBOW_PREFIX)
      && this.containsNode(group, ModelManager.MANNEQUIN_LEFT_FOREARM_PREFIX)
      && this.containsNode(group, ModelManager.MANNEQUIN_LEFT_WRIST_PREFIX)
      && this.containsNode(group, ModelManager.MANNEQUIN_LEFT_HAND_PREFIX)
      && this.containsNode(group, ModelManager.MANNEQUIN_LEFT_HIP_PREFIX)
      && this.containsNode(group, ModelManager.MANNEQUIN_LEFT_THIGH_PREFIX)
      && this.containsNode(group, ModelManager.MANNEQUIN_LEFT_KNEE_PREFIX)
      && this.containsNode(group, ModelManager.MANNEQUIN_LEFT_LEG_PREFIX)
      && this.containsNode(group, ModelManager.MANNEQUIN_LEFT_ANKLE_PREFIX)
      && this.containsNode(group, ModelManager.MANNEQUIN_LEFT_FOOT_PREFIX)
      && this.containsNode(group, ModelManager.MANNEQUIN_RIGHT_SHOULDER_PREFIX)
      && this.containsNode(group, ModelManager.MANNEQUIN_RIGHT_ARM_PREFIX)
      && this.containsNode(group, ModelManager.MANNEQUIN_RIGHT_ELBOW_PREFIX)
      && this.containsNode(group, ModelManager.MANNEQUIN_RIGHT_FOREARM_PREFIX)
      && this.containsNode(group, ModelManager.MANNEQUIN_RIGHT_WRIST_PREFIX)
      && this.containsNode(group, ModelManager.MANNEQUIN_RIGHT_HAND_PREFIX)
      && this.containsNode(group, ModelManager.MANNEQUIN_RIGHT_HIP_PREFIX)
      && this.containsNode(group, ModelManager.MANNEQUIN_RIGHT_THIGH_PREFIX)
      && this.containsNode(group, ModelManager.MANNEQUIN_RIGHT_KNEE_PREFIX)
      && this.containsNode(group, ModelManager.MANNEQUIN_RIGHT_LEG_PREFIX)
      && this.containsNode(group, ModelManager.MANNEQUIN_RIGHT_ANKLE_PREFIX)
      && this.containsNode(group, ModelManager.MANNEQUIN_RIGHT_FOOT_PREFIX)) {
      // Head
      let head = this.extractNodes(group, ModelManager.MANNEQUIN_HEAD_PREFIX, null);
      let headGroup = this.createPickableTransformGroup(ModelManager.MANNEQUIN_NECK_PREFIX, [head]);

      // Left arm
      let leftHand = this.extractNodes(group, ModelManager.MANNEQUIN_LEFT_HAND_PREFIX, null);
      let leftHandGroup = this.createPickableTransformGroup(ModelManager.MANNEQUIN_LEFT_WRIST_PREFIX, [leftHand]);
      let leftForearm = this.extractNodes(group, ModelManager.MANNEQUIN_LEFT_FOREARM_PREFIX, null);
      let leftWrist = this.extractNodes(group, ModelManager.MANNEQUIN_LEFT_WRIST_PREFIX, null);
      let leftForearmGroup = this.createPickableTransformGroup(ModelManager.MANNEQUIN_LEFT_ELBOW_PREFIX, [leftForearm, leftWrist, leftHandGroup]);
      let leftArm = this.extractNodes(group, ModelManager.MANNEQUIN_LEFT_ARM_PREFIX, null);
      let leftElbow = this.extractNodes(group, ModelManager.MANNEQUIN_LEFT_ELBOW_PREFIX, null);
      let leftArmGroup = this.createPickableTransformGroup(ModelManager.MANNEQUIN_LEFT_SHOULDER_PREFIX, [leftArm, leftElbow, leftForearmGroup]);

      // Right arm
      let rightHand = this.extractNodes(group, ModelManager.MANNEQUIN_RIGHT_HAND_PREFIX, null);
      let rightHandGroup = this.createPickableTransformGroup(ModelManager.MANNEQUIN_RIGHT_WRIST_PREFIX, [rightHand]);
      let rightForearm = this.extractNodes(group, ModelManager.MANNEQUIN_RIGHT_FOREARM_PREFIX, null);
      let rightWrist = this.extractNodes(group, ModelManager.MANNEQUIN_RIGHT_WRIST_PREFIX, null);
      let rightForearmGroup = this.createPickableTransformGroup(ModelManager.MANNEQUIN_RIGHT_ELBOW_PREFIX, [rightForearm, rightWrist, rightHandGroup]);
      let rightArm = this.extractNodes(group, ModelManager.MANNEQUIN_RIGHT_ARM_PREFIX, null);
      let rightElbow = this.extractNodes(group, ModelManager.MANNEQUIN_RIGHT_ELBOW_PREFIX, null);
      let rightArmGroup = this.createPickableTransformGroup(ModelManager.MANNEQUIN_RIGHT_SHOULDER_PREFIX, [rightArm, rightElbow, rightForearmGroup]);

      // Chest
      let chest = this.extractNodes(group, ModelManager.MANNEQUIN_CHEST_PREFIX, null);
      let leftShoulder = this.extractNodes(group, ModelManager.MANNEQUIN_LEFT_SHOULDER_PREFIX, null);
      let rightShoulder = this.extractNodes(group, ModelManager.MANNEQUIN_RIGHT_SHOULDER_PREFIX, null);
      let neck = this.extractNodes(group, ModelManager.MANNEQUIN_NECK_PREFIX, null);
      let chestGroup = this.createPickableTransformGroup(ModelManager.MANNEQUIN_ABDOMEN_CHEST_PREFIX, [chest, leftShoulder, leftArmGroup, rightShoulder, rightArmGroup, neck, headGroup]);

      // Left leg
      let leftFoot = this.extractNodes(group, ModelManager.MANNEQUIN_LEFT_FOOT_PREFIX, null);
      let leftFootGroup = this.createPickableTransformGroup(ModelManager.MANNEQUIN_LEFT_ANKLE_PREFIX, [leftFoot]);
      let leftLeg = this.extractNodes(group, ModelManager.MANNEQUIN_LEFT_LEG_PREFIX, null);
      let leftAnkle = this.extractNodes(group, ModelManager.MANNEQUIN_LEFT_ANKLE_PREFIX, null);
      let leftLegGroup = this.createPickableTransformGroup(ModelManager.MANNEQUIN_LEFT_KNEE_PREFIX, [leftLeg, leftAnkle, leftFootGroup]);
      let leftThigh = this.extractNodes(group, ModelManager.MANNEQUIN_LEFT_THIGH_PREFIX, null);
      let leftKnee = this.extractNodes(group, ModelManager.MANNEQUIN_LEFT_KNEE_PREFIX, null);
      let leftThighGroup = this.createPickableTransformGroup(ModelManager.MANNEQUIN_LEFT_HIP_PREFIX, [leftThigh, leftKnee, leftLegGroup]);

      // Right leg
      let rightFoot = this.extractNodes(group, ModelManager.MANNEQUIN_RIGHT_FOOT_PREFIX, null);
      let rightFootGroup = this.createPickableTransformGroup(ModelManager.MANNEQUIN_RIGHT_ANKLE_PREFIX, [rightFoot]);
      let rightLeg = this.extractNodes(group, ModelManager.MANNEQUIN_RIGHT_LEG_PREFIX, null);
      let rightAnkle = this.extractNodes(group, ModelManager.MANNEQUIN_RIGHT_ANKLE_PREFIX, null);
      let rightLegGroup = this.createPickableTransformGroup(ModelManager.MANNEQUIN_RIGHT_KNEE_PREFIX, [rightLeg, rightAnkle, rightFootGroup]);
      let rightThigh = this.extractNodes(group, ModelManager.MANNEQUIN_RIGHT_THIGH_PREFIX, null);
      let rightKnee = this.extractNodes(group, ModelManager.MANNEQUIN_RIGHT_KNEE_PREFIX, null);
      let rightThighGroup = this.createPickableTransformGroup(ModelManager.MANNEQUIN_RIGHT_HIP_PREFIX, [rightThigh, rightKnee, rightLegGroup]);

      // Pelvis
      let pelvis = this.extractNodes(group, ModelManager.MANNEQUIN_PELVIS_PREFIX, null);
      let leftHip = this.extractNodes(group, ModelManager.MANNEQUIN_LEFT_HIP_PREFIX, null);
      let rightHip = this.extractNodes(group, ModelManager.MANNEQUIN_RIGHT_HIP_PREFIX, null);
      let pelvisGroup = this.createPickableTransformGroup(ModelManager.MANNEQUIN_ABDOMEN_PELVIS_PREFIX, [pelvis, leftHip, leftThighGroup, rightHip, rightThighGroup]);

      let abdomen = this.extractNodes(group, ModelManager.MANNEQUIN_ABDOMEN_PREFIX, null);
      group.addChild(abdomen);
      group.addChild(chestGroup);
      group.addChild(pelvisGroup);
    } else {
      // Reorganize rotating openings
      this.updateSimpleDeformableModelHierarchy(group, null, ModelManager.HINGE_PREFIX, ModelManager.OPENING_ON_HINGE_PREFIX, ModelManager.WINDOW_PANE_ON_HINGE_PREFIX, ModelManager.MIRROR_ON_HINGE_PREFIX);
      this.updateSimpleDeformableModelHierarchy(group, null, ModelManager.BALL_PREFIX, ModelManager.ARM_ON_BALL_PREFIX, null, null);
      // Reorganize sliding openings
      this.updateSimpleDeformableModelHierarchy(group, ModelManager.UNIQUE_RAIL_PREFIX, ModelManager.RAIL_PREFIX, ModelManager.OPENING_ON_RAIL_PREFIX, ModelManager.WINDOW_PANE_ON_RAIL_PREFIX, ModelManager.MIRROR_ON_RAIL_PREFIX);
      // Reorganize sub hierarchies
      let movedNodes = [];
      while (this.updateDeformableModelSubTransformedHierarchy(group, group, [ModelManager.HINGE_PREFIX, ModelManager.BALL_PREFIX, ModelManager.RAIL_PREFIX],
        [ModelManager.OPENING_ON_HINGE_PREFIX, ModelManager.ARM_ON_BALL_PREFIX, ModelManager.OPENING_ON_RAIL_PREFIX], movedNodes)) {
      }
    }
  }

  /**
   * @param {Group3D} group
   * @param {string} uniqueReferenceNodePrefix
   * @param {string} referenceNodePrefix
   * @param {string} openingPrefix
   * @param {string} openingPanePrefix
   * @param {string} openingMirrorPrefix
   * @private 
   */
  updateSimpleDeformableModelHierarchy(
    group,
    uniqueReferenceNodePrefix,
    referenceNodePrefix,
    openingPrefix,
    openingPanePrefix,
    openingMirrorPrefix
  ) {
    if (this.containsNode(group, openingPrefix + 1)
      || (openingPanePrefix !== null && this.containsNode(group, openingPanePrefix + 1))
      || (openingMirrorPrefix !== null && this.containsNode(group, openingMirrorPrefix + 1))) {
      if (this.containsNode(group, referenceNodePrefix + 1)) {
        // Reorganize openings with multiple reference nodes
        var i = 1;
        do {
          var referenceNode = this.extractNodes(group, referenceNodePrefix + i, null);
          var opening = this.extractNodes(group, openingPrefix + i, null);
          var openingPane = openingPanePrefix !== null ? this.extractNodes(group, openingPanePrefix + i, null) : null;
          var openingMirror = openingMirrorPrefix !== null ? this.extractNodes(group, openingMirrorPrefix + i, null) : null;
          let openingGroup = this.createPickableTransformGroup(referenceNodePrefix + i, [opening, openingPane, openingMirror]);
          group.addChild(referenceNode);
          group.addChild(openingGroup);
          i++;
        } while (this.containsNode(group, referenceNodePrefix + i)
          && (this.containsNode(group, openingPrefix + i)
            || (openingPanePrefix !== null && this.containsNode(group, openingPanePrefix + i))
            || (openingMirrorPrefix !== null && this.containsNode(group, openingMirrorPrefix + i))));
      } else if (uniqueReferenceNodePrefix !== null
        && this.containsNode(group, uniqueReferenceNodePrefix)) {
        // Reorganize openings with a unique reference node
        var referenceNode = this.extractNodes(group, uniqueReferenceNodePrefix, null);
        group.addChild(referenceNode);
        var i = 1;
        do {
          var opening = this.extractNodes(group, openingPrefix + i, null);
          var openingPane = this.extractNodes(group, openingPanePrefix + i, null);
          var openingMirror = this.extractNodes(group, openingMirrorPrefix + i, null);
          group.addChild(this.createPickableTransformGroup(referenceNodePrefix + i, [opening, openingPane, openingMirror]));
          i++;
        } while (this.containsNode(group, openingPrefix + i)
        || this.containsNode(group, openingPanePrefix + i)
          || this.containsNode(group, openingMirrorPrefix + i));
      }
    }
  }

  /**
   * Returns <code>true</code> if the given <code>node</code> or a node in its hierarchy
   * contains a node which name, stored in user data, starts with <code>prefix</code>.
   * @param {Node3D} node   a node
   * @param {string} prefix a string
   */
  containsNode(node, prefix) {
    let name = node.getName();
    if (name !== null
      && name.indexOf(prefix) === 0) {
      return true;
    }
    if (node instanceof Group3D) {
      for (let i = node.getChildren().length - 1; i >= 0; i--) {
        if (this.containsNode(node.getChild(i), prefix)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Searches among the given <code>node</code> and its children the nodes which name, stored in user data, starts with <code>name</code>,
   * then returns a group containing the found nodes.
   * @param {Node3D} node
   * @param {string} name
   * @param {Group3D} destinationGroup
   * @private
   */
  extractNodes(node, name, destinationGroup) {
    if (node.getName() !== null
      && node.getName().indexOf(name) === 0) {
      node.getParent().removeChild(node);
      if (destinationGroup === null) {
        destinationGroup = new Group3D();
      }
      destinationGroup.addChild(node);
    }
    if (node instanceof Group3D) {
      // Enumerate children
      for (let i = node.getChildren().length - 1; i >= 0; i--) {
        destinationGroup = this.extractNodes(node.getChild(i), name, destinationGroup);
      }
    }
    return destinationGroup;
  }

  /**
   * Returns a pickable group with its <code>children</code> and the given reference node as user data.
   * @param {string} deformableGroupPrefix
   * @param {Array}  children
   * @private
   */
  createPickableTransformGroup(deformableGroupPrefix, children) {
    let transformGroup = new TransformGroup3D();
    transformGroup.setCapability(TransformGroup3D.ALLOW_TRANSFORM_WRITE);
    transformGroup.setName(deformableGroupPrefix + ModelManager.DEFORMABLE_TRANSFORM_GROUP_SUFFIX);
    // Store the node around which objects should turn
    for (let i = 0; i < children.length; i++) {
      if (children[i] !== null) {
        transformGroup.addChild(children[i]);
      }
    }
    return transformGroup;
  }

  /**
   * Updates the first node found in the given <code>group</code> which specifies a transformation
   * which should depend on another transformed node.
   * @param {Group3D} group
   * @param {Node3D}  node  
   * @param {Array}   referenceNodePrefixes
   * @param {Array}   subTransformationOpeningPrefixes
   * @param {Array}   movedNodes
   * @return {boolean} <code>true</code> if such a node was found and attached to another transformation
   * @private
   */
  updateDeformableModelSubTransformedHierarchy(
    group,
    node,
    referenceNodePrefixes,
    subTransformationOpeningPrefixes,
    movedNodes
  ) {
    if (group !== node
      && movedNodes.indexOf(node) < 0) {
      let name = node.getName();
      if (name !== null) {
        for (var i = 0; i < referenceNodePrefixes.length; i++) {
          let prefix = referenceNodePrefixes[i];
          if (name.indexOf(prefix) === 0) {
            let index = name.indexOf(ModelManager.SUB_TRANSFORMATION_SEPARATOR);
            if (index > 0) {
              for (let j = 0; j < subTransformationOpeningPrefixes.length; j++) {
                let subTransformationIndex = name.indexOf(subTransformationOpeningPrefixes[j], index + ModelManager.SUB_TRANSFORMATION_SEPARATOR.length);
                if (subTransformationIndex >= 0) {
                  if (movedNodes.indexOf(node) < 0) {
                    movedNodes.push(node);
                  }
                  let referenceNode = node.getParent();
                  let parent = referenceNode.getParent();
                  if (parent !== null) {
                    let nodeIndex = parent.getChildren().indexOf(referenceNode);
                    let pickableGroup = parent.getChild(++nodeIndex);
                    while (!(pickableGroup instanceof TransformGroup3D)) {
                      pickableGroup = parent.getChild(++nodeIndex);
                    }
                    let lastDigitIndex = subTransformationIndex + subTransformationOpeningPrefixes[j].length;
                    while (lastDigitIndex < name.length && name.charAt(lastDigitIndex) >= '0' && name.charAt(lastDigitIndex) <= '9') {
                      lastDigitIndex++;
                    }
                    // Remove node and its sibling group and attach it to parent transformation
                    if (this.attachNodesToPickableTransformGroup(group,
                      referenceNodePrefixes[j] + name.substring(subTransformationIndex + subTransformationOpeningPrefixes[j].length, lastDigitIndex),
                      [referenceNode, pickableGroup])) {
                      return true;
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
    if (node instanceof Group3D) {
      let children = node.getChildren();
      for (var i = children.length - 1; i >= 0; i--) {
        if (this.updateDeformableModelSubTransformedHierarchy(group, children[i], referenceNodePrefixes, subTransformationOpeningPrefixes, movedNodes)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * @param {Node3D} node  the root of a model
   * @param {string} groupPrefix
   * @param {Array}  movedNodes
   * @return {boolean}
   * @private
   */
  attachNodesToPickableTransformGroup(node, groupPrefix, movedNodes) {
    if (node instanceof TransformGroup3D
      && (groupPrefix + ModelManager.DEFORMABLE_TRANSFORM_GROUP_SUFFIX) == node.getName()) {
      let group = node;
      for (var i = 0; i < movedNodes.length; i++) {
        let movedNode = movedNodes[i];
        movedNode.getParent().removeChild(movedNode);
        group.addChild(movedNode);
      }
      return true;
    } else if (node instanceof Group3D) {
      let children = node.getChildren();
      for (var i = 0; i < children.length; i++) {
        if (this.attachNodesToPickableTransformGroup(children[i], groupPrefix, movedNodes)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Returns <code>true</code> if the given <code>node</code> or its children contains at least a deformable group.
   * @param {Node3D} node  the root of a model
   * @return {boolean}
   */
  containsDeformableNode(node) {
    if (node instanceof TransformGroup3D
      && node.getName() !== null
      && node.getName().indexOf(ModelManager.DEFORMABLE_TRANSFORM_GROUP_SUFFIX) >= 0
      && node.getName().indexOf(ModelManager.DEFORMABLE_TRANSFORM_GROUP_SUFFIX) === (node.getName().length - ModelManager.DEFORMABLE_TRANSFORM_GROUP_SUFFIX.length)) {
      return true;
    } else if (node instanceof Group3D) {
      let children = node.getChildren();
      for (let i = 0; i < children.length; i++) {
        if (this.containsDeformableNode(children[i])) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Returns <code>true</code> if the given <code>node</code> or its children contains is a deformed transformed group.
   * @param {Node3D} node  a node
   * @return {boolean}
   * @private
   */
  isDeformed(node) {
    if (node instanceof TransformGroup3D
      && node.getName() !== null
      && node.getName().indexOf(ModelManager.DEFORMABLE_TRANSFORM_GROUP_SUFFIX) >= 0
      && node.getName().indexOf(ModelManager.DEFORMABLE_TRANSFORM_GROUP_SUFFIX) === (node.getName().length - ModelManager.DEFORMABLE_TRANSFORM_GROUP_SUFFIX.length)) {
      let transform = mat4.create();
      node.getTransform(transform);
      return !TransformGroup3D.isIdentity(transform);
    } else if (node instanceof Group3D) {
      let children = node.getChildren();
      for (let i = 0; i < children.length; i++) {
        if (this.isDeformed(children[i])) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Returns the materials used by the children shapes of the given <code>node</code>,
   * attributing their <code>creator</code> to them.
   * @param {Node3D} node
   * @param {boolean} ignoreEdgeColorMaterial
   * @param {string} [creator]
   */
  getMaterials(node, ignoreEdgeColorMaterial, creator) {
    if (creator === undefined) {
      if (ignoreEdgeColorMaterial === undefined) {
        ignoreEdgeColorMaterial = false;
        creator = null;
      } else {
        creator = ignoreEdgeColorMaterial;
      }
    }

    let appearances = [];
    this.searchAppearances(node, ignoreEdgeColorMaterial, appearances);
    let materials = [];
    for (let i = 0; i < appearances.length; i++) {
      let appearance = appearances[i];
      let color = null;
      let shininess = null;
      let diffuseColor = appearance.getDiffuseColor();
      if (diffuseColor != null) {
        color = 0xFF000000
          | (Math.round(diffuseColor[0] * 255) << 16)
          | (Math.round(diffuseColor[1] * 255) << 8)
          | Math.round(diffuseColor[2] * 255);
        shininess = appearance.getShininess() != null ? appearance.getShininess() / 128 : null;
      }
      let appearanceTexture = appearance.getTextureImage();
      let texture = null;
      if (appearanceTexture != null) {
        let textureImageUrl = appearanceTexture.url;
        if (textureImageUrl != null) {
          let textureImage = new SimpleURLContent(textureImageUrl);
          let textureImageName = textureImageUrl.substring(textureImageUrl.lastIndexOf('/') + 1);
          let lastPoint = textureImageName.lastIndexOf('.');
          if (lastPoint !== -1) {
            textureImageName = textureImageName.substring(0, lastPoint);
          }
          texture = new HomeTexture(
            new CatalogTexture(null, textureImageName, textureImage, -1, -1, creator));
        }
      }
      let materialName = appearance.getName();
      if (materialName === undefined) {
        materialName = null;
      }
      let homeMaterial = new HomeMaterial(materialName, color, texture, shininess);
      for (let j = 0; j < materials.length; j++) {
        if (materials[j].getName() == homeMaterial.getName()) {
          // Don't add twice materials with the same name
          homeMaterial = null;
          break;
        }
      }
      if (homeMaterial != null) {
        materials.push(homeMaterial);
      }
    }
    materials.sort((m1, m2) => {
      let name1 = m1.getName();
      let name2 = m2.getName();
      if (name1 != null) {
        if (name2 != null) {
          return name1.localeCompare(name2);
        } else {
          return 1;
        }
      } else if (name2 != null) {
        return -1;
      } else {
        return 0;
      }
    });
    return materials;
  }

  /**
   * @param {Node3D}  node
   * @param {boolean} ignoreEdgeColorMaterial
   * @param {Array}   appearances
   * @private
   */
  searchAppearances(node, ignoreEdgeColorMaterial, appearances) {
    if (node instanceof Group3D) {
      let children = node.getChildren();
      for (let i = 0; i < children.length; i++) {
        this.searchAppearances(children[i], ignoreEdgeColorMaterial, appearances);
      }
    } else if (node instanceof Link3D) {
      this.searchAppearances(node.getSharedGroup(), ignoreEdgeColorMaterial, appearances);
    } else if (node instanceof Shape3D) {
      let appearance = node.getAppearance();
      if (appearance !== null
        && (!ignoreEdgeColorMaterial
          || !(appearance.getName().indexOf(ModelManager.EDGE_COLOR_MATERIAL_PREFIX) === 0))
        && appearances.indexOf(appearance) === -1) {
        appearances.push(appearance);
      }
    }
  }

  /**
   * Replaces multiple shared shapes of the given <code>node</code> with one shape with transformed geometries.
   * @param {BranchGroup3D} modelRoot
   * @private
   */
  replaceMultipleSharedShapes(modelRoot) {
    let sharedShapes = [];
    this.searchSharedShapes(modelRoot, sharedShapes, false);
    for (let i = 0; i < sharedShapes.length; i++) {
      if (sharedShapes[i].value > 1) {
        let transformations = [];
        let shape = sharedShapes[i].key;
        this.searchShapeTransformations(modelRoot, shape, transformations, mat4.create());
        // Replace shared shape by a unique shape with transformed geometries
        let newShape = shape.clone();
        let geometries = newShape.getGeometries();
        for (let j = 0; j < geometries.length; j++) {
          let newGeometry = this.getTransformedGeometry(geometries[j], transformations);
          if (newGeometry === null) {
            return;
          }
          newShape.setGeometry(newGeometry, j);
        }
        this.removeSharedShape(modelRoot, shape);
        modelRoot.addChild(newShape);
      }
    }
  }

  /**
   * Searches all the shapes which are shared among the children of the given <code>node</code>.
   * @param {Node3D} node  a node
   * @param {Array}  sharedShapes 
   * @param {boolean} childOfSharedGroup
   * @private
   */
  searchSharedShapes(node, sharedShapes, childOfSharedGroup) {
    if (node instanceof Group3D) {
      let children = node.getChildren();
      for (var i = 0; i < children.length; i++) {
        this.searchSharedShapes(children[i], sharedShapes, childOfSharedGroup);
      }
    } else if (node instanceof Link3D) {
      this.searchSharedShapes(node.getSharedGroup(), sharedShapes, true);
    } else if (node instanceof Shape3D) {
      if (childOfSharedGroup) {
        for (var i = 0; i < sharedShapes.length; i++) {
          if (sharedShapes[i].key === node) {
            sharedShapes[i].value++;
            return;
          }
        }
        sharedShapes.push({ key: node, value: 1 });
      }
    }
  }

  /**
   * Searches all the transformations applied to a shared <code>shape</code> child of the given <b>node</b>.
   * @param {Node3D}  node  a node
   * @param {Shape3D} shape 
   * @param {mat4[]} transformations
   * @param {mat4}    parentTransformations
   */
  searchShapeTransformations(node, shape, transformations, parentTransformations) {
    if (node instanceof Group3D) {
      if (!(node instanceof TransformGroup3D)
        || !this.isDeformed(node)) {
        if (node instanceof TransformGroup3D) {
          parentTransformations = mat4.clone(parentTransformations);
          let transform = mat4.create();
          node.getTransform(transform);
          mat4.mul(parentTransformations, parentTransformations, transform);
        }
        let children = node.getChildren();
        for (let i = 0; i < children.length; i++) {
          this.searchShapeTransformations(children[i], shape, transformations, parentTransformations);
        }
      }
    } else if (node instanceof Link3D) {
      this.searchShapeTransformations(node.getSharedGroup(), shape, transformations, parentTransformations);
    } else if (node === shape) {
      transformations.push(parentTransformations);
    }
  }

  /**
   * Returns a new geometry where coordinates are transformed with the given transformations.
   * @param {IndexedGeometryArray3D} geometry
   * @param {mat4[]} transformations
   * @return {IndexedGeometryArray3D}
   */
  getTransformedGeometry(geometry, transformations) {
    let offsetIndex = 0;
    let offsetVertex = 0;
    let newVertexIndices = new Array(transformations.length * geometry.vertexIndices.length);
    for (var i = 0; i < transformations.length; i++) {
      for (var j = 0, n = geometry.vertexIndices.length; j < n; j++) {
        newVertexIndices[offsetIndex + j] = offsetVertex + geometry.vertexIndices[j];
      }
      offsetIndex += geometry.vertexIndices.length;
      offsetVertex += geometry.vertices.length;
    }

    let newTextureCoordinateIndices = new Array(transformations.length * geometry.textureCoordinateIndices.length);
    offsetIndex = 0;
    for (var i = 0; i < transformations.length; i++) {
      for (var j = 0, n = geometry.textureCoordinateIndices.length; j < n; j++) {
        newTextureCoordinateIndices[offsetIndex + j] = geometry.textureCoordinateIndices[j];
      }
      offsetIndex += geometry.textureCoordinateIndices.length;
    }

    offsetVertex = 0;
    let newVertices = new Array(transformations.length * geometry.vertices.length);
    for (var i = 0; i < transformations.length; i++) {
      for (var j = 0, n = geometry.vertices.length; j < n; j++) {
        let vertex = vec3.clone(geometry.vertices[j]);
        vec3.transformMat4(vertex, vertex, transformations[i]);
        newVertices[offsetVertex + j] = vertex;
      }
      offsetVertex += geometry.vertices.length;
    }

    if (geometry instanceof IndexedLineArray3D) {
      return new IndexedLineArray3D(newVertices, newVertexIndices, geometry.textureCoordinates, newTextureCoordinateIndices);
    } else if (geometry instanceof IndexedTriangleArray3D) {
      let newNormalIndices = new Array(transformations.length * geometry.normalIndices.length);
      offsetIndex = 0;
      var offsetNormal = 0;
      for (var i = 0; i < transformations.length; i++) {
        for (var j = 0, n = geometry.normalIndices.length; j < n; j++) {
          newNormalIndices[offsetIndex + j] = offsetNormal + geometry.normalIndices[j];
        }
        offsetIndex += geometry.normalIndices.length;
        offsetNormal += geometry.normals.length;
      }

      var offsetNormal = 0;
      let newNormals = new Array(transformations.length * geometry.normals.length);
      for (var i = 0; i < transformations.length; i++) {
        for (var j = 0, n = geometry.normals.length; j < n; j++) {
          let normal = vec3.clone(geometry.normals[j]);
          vec3.transformMat4(normal, normal, transformations[i]);
          vec3.normalize(normal, normal);
          newNormals[offsetNormal + j] = normal;
        }
        offsetNormal += geometry.normals.length;
      }

      return new IndexedTriangleArray3D(newVertices, newVertexIndices, geometry.textureCoordinates, newTextureCoordinateIndices, newNormals, newNormalIndices);
    } else {
      return null;
    }
  }

  /**
   * Removes the shared shape from the children of the given <code>node</code>.
   * @param {Node3D} node  a node
   * @param {Shape3D} shape 
   */
  removeSharedShape(node, shape) {
    if (node instanceof Group3D) {
      if (!(node instanceof TransformGroup3D)
        || !this.isDeformed(node)) {
        let children = node.getChildren();
        for (let i = children.length - 1; i >= 0; i--) {
          this.removeSharedShape(children[i], shape);
        }
        if (children.length === 0
          && node.getParent() instanceof Group3D) {
          node.getParent().removeChild(node);
        }
      }
    } else if (node instanceof Link3D) {
      let sharedGroup = node.getSharedGroup();
      this.removeSharedShape(sharedGroup, shape);
      if (sharedGroup.children.length == 0) {
        node.getParent().removeChild(node);
      }
    } else if (node === shape) {
      node.getParent().removeChild(node);
    }
  }

  /**
   * Returns the shape matching the given cut out shape if not <code>null</code> 
   * or the 2D area of the 3D shapes children of the <code>node</code> 
   * projected on its front side. The returned area is normalized in a 1 unit square
   * centered at the origin.
   */
  getFrontArea(cutOutShape, node) {
    let frontArea;
    if (cutOutShape !== null) {
      frontArea = new java.awt.geom.Area(this.getShape(cutOutShape));
      frontArea.transform(java.awt.geom.AffineTransform.getScaleInstance(1, -1));
      frontArea.transform(java.awt.geom.AffineTransform.getTranslateInstance(-0.5, 0.5));
    } else {
      let vertexCount = this.getVertexCount(node);
      if (vertexCount < 1000000) {
        let frontAreaWithHoles = new java.awt.geom.Area();
        this.computeBottomOrFrontArea(node, frontAreaWithHoles, mat4.create(), false, false);
        frontArea = new java.awt.geom.Area();
        let currentPathPoints = [];
        let previousRoomPoint = null;
        for (let it = frontAreaWithHoles.getPathIterator(null, 1); !it.isDone(); it.next()) {
          let areaPoint = [0, 0];
          switch (it.currentSegment(areaPoint)) {
            case java.awt.geom.PathIterator.SEG_MOVETO:
            case java.awt.geom.PathIterator.SEG_LINETO:
              if (previousRoomPoint === null
                || areaPoint[0] !== previousRoomPoint[0]
                || areaPoint[1] !== previousRoomPoint[1]) {
                currentPathPoints.push(areaPoint);
              }
              previousRoomPoint = areaPoint;
              break;
            case java.awt.geom.PathIterator.SEG_CLOSE:
              if (currentPathPoints[0][0] === previousRoomPoint[0]
                && currentPathPoints[0][1] === previousRoomPoint[1]) {
                currentPathPoints.splice(currentPathPoints.length - 1, 1);
              }
              if (currentPathPoints.length > 2) {
                let pathPoints = currentPathPoints.slice(0);
                let subRoom = new Room(pathPoints);
                if (subRoom.getArea() > 0) {
                  if (!subRoom.isClockwise()) {
                    let currentPath = new java.awt.geom.GeneralPath();
                    currentPath.moveTo(pathPoints[0][0], pathPoints[0][1]);
                    for (let i = 1; i < pathPoints.length; i++) {
                      currentPath.lineTo(pathPoints[i][0], pathPoints[i][1]);
                    }
                    currentPath.closePath();
                    frontArea.add(new java.awt.geom.Area(currentPath));
                  }
                }
              }
              currentPathPoints.length = 0;
              previousRoomPoint = null;
              break;
          }
        }
        let bounds = frontAreaWithHoles.getBounds2D();
        frontArea.transform(java.awt.geom.AffineTransform.getTranslateInstance(-bounds.getCenterX(), -bounds.getCenterY()));
        frontArea.transform(java.awt.geom.AffineTransform.getScaleInstance(1 / bounds.getWidth(), 1 / bounds.getHeight()));
      }
      else {
        frontArea = new java.awt.geom.Area(new java.awt.geom.Rectangle2D.Float(-0.5, -0.5, 1, 1));
      }
    }
    return frontArea;
  }

  /**
   * Returns the 2D area of the 3D shapes children of the given scene 3D <code>node</code>
   * projected on the floor (plan y = 0), or of the given staircase if <code>node</code> is an
   * instance of <code>HomePieceOfFurniture</code>.
   * @param {Node3D|HomePieceOfFurniture} node
   * @return {Area}
   */
  getAreaOnFloor(node) {
    if (node instanceof Node3D) {
      let modelAreaOnFloor;
      let vertexCount = this.getVertexCount(node);
      if (vertexCount < 10000) {
        modelAreaOnFloor = new java.awt.geom.Area();
        this.computeBottomOrFrontArea(node, modelAreaOnFloor, mat4.create(), true, true);
      } else {
        let vertices = [];
        this.computeVerticesOnFloor(node, vertices, mat4.create());
        if (vertices.length > 0) {
          let surroundingPolygon = this.getSurroundingPolygon(vertices.slice(0));
          let generalPath = new java.awt.geom.GeneralPath(java.awt.geom.Path2D.WIND_NON_ZERO, surroundingPolygon.length);
          generalPath.moveTo(surroundingPolygon[0][0], surroundingPolygon[0][1]);
          for (let i = 0; i < surroundingPolygon.length; i++) {
            generalPath.lineTo(surroundingPolygon[i][0], surroundingPolygon[i][1]);
          }
          generalPath.closePath();
          modelAreaOnFloor = new java.awt.geom.Area(generalPath);
        } else {
          modelAreaOnFloor = new java.awt.geom.Area();
        }
      }
      return modelAreaOnFloor;
    } else {
      let staircase = node;
      if (staircase.getStaircaseCutOutShape() === null) {
        throw new IllegalArgumentException("No cut out shape associated to piece");
      }
      let shape = this.getShape(staircase.getStaircaseCutOutShape());
      let staircaseArea = new java.awt.geom.Area(shape);
      if (staircase.isModelMirrored()) {
        staircaseArea = this.getMirroredArea(staircaseArea);
      }
      let staircaseTransform = java.awt.geom.AffineTransform.getTranslateInstance(
        staircase.getX() - staircase.getWidth() / 2,
        staircase.getY() - staircase.getDepth() / 2);
      staircaseTransform.concatenate(java.awt.geom.AffineTransform.getRotateInstance(staircase.getAngle(),
        staircase.getWidth() / 2, staircase.getDepth() / 2));
      staircaseTransform.concatenate(java.awt.geom.AffineTransform.getScaleInstance(staircase.getWidth(), staircase.getDepth()));
      staircaseArea.transform(staircaseTransform);
      return staircaseArea;
    }
  }

  /**
   * Returns the total count of vertices in all geometries.
   * @param {Node3D} node
   * @return {number}
   * @private
   */
  getVertexCount(node) {
    let count = 0;
    if (node instanceof Group3D) {
      let children = node.getChildren();
      for (let i = 0; i < children.length; i++) {
        count += this.getVertexCount(children[i]);
      }
    } else if (node instanceof Link3D) {
      count = this.getVertexCount(node.getSharedGroup());
    } else if (node instanceof Shape3D) {
      let appearance = node.getAppearance();
      if (appearance.isVisible()) {
        let geometries = node.getGeometries();
        for (let i = 0, n = geometries.length; i < n; i++) {
          let geometry = geometries[i];
          count += geometry.vertices.length;
        }
      }
    }
    return count;
  }

  /**
   * Computes the 2D area on floor or on front side of the 3D shapes children of <code>node</code>.
   * @param {Node3D} node
   * @param {Area} nodeArea
   * @param {mat4} parentTransformations
   * @param {boolean} ignoreTransparentShapes
   * @param {boolean} bottom
   * @private
   */
  computeBottomOrFrontArea(node, nodeArea, parentTransformations, ignoreTransparentShapes, bottom) {
    if (node instanceof Group3D) {
      if (node instanceof TransformGroup3D) {
        parentTransformations = mat4.clone(parentTransformations);
        let transform = mat4.create();
        node.getTransform(transform);
        mat4.mul(parentTransformations, parentTransformations, transform);
      }
      let children = node.getChildren();
      for (let i = 0; i < children.length; i++) {
        this.computeBottomOrFrontArea(children[i], nodeArea, parentTransformations, ignoreTransparentShapes, bottom);
      }
    } else if (node instanceof Link3D) {
      this.computeBottomOrFrontArea(node.getSharedGroup(), nodeArea, parentTransformations, ignoreTransparentShapes, bottom);
    } else if (node instanceof Shape3D) {
      let appearance = node.getAppearance();
      if (appearance.isVisible()
        && (!ignoreTransparentShapes
          || appearance.getTransparency() === undefined
          || appearance.getTransparency() < 1)) {
        let geometries = node.getGeometries();
        for (let i = 0, n = geometries.length; i < n; i++) {
          let geometry = geometries[i];
          this.computeBottomOrFrontGeometryArea(geometry, nodeArea, parentTransformations, bottom);
        }
      }
    }
  }

  /**
   * Computes the bottom area of a 3D geometry if <code>bottom</code> is <code>true</code>,
   * and the front area if not.
   * @param {IndexedGeometryArray3D} geometryArray
   * @param {Area} nodeArea
   * @param {mat4} parentTransformations
   * @param {boolean} bottom
   * @private
   */
  computeBottomOrFrontGeometryArea(geometryArray, nodeArea, parentTransformations, bottom) {
    if (geometryArray instanceof IndexedTriangleArray3D) {
      let vertexCount = geometryArray.vertices.length;
      let vertices = new Array(vertexCount * 2);
      let vertex = vec3.create();
      for (let index = 0, i = 0; index < vertices.length; i++) {
        vec3.copy(vertex, geometryArray.vertices[i]);
        vec3.transformMat4(vertex, vertex, parentTransformations);
        vertices[index++] = vertex[0];
        if (bottom) {
          vertices[index++] = vertex[2];
        } else {
          vertices[index++] = vertex[1];
        }
      }

      let geometryPath = new java.awt.geom.GeneralPath(java.awt.geom.Path2D.WIND_NON_ZERO, 1000);
      for (let i = 0, triangleIndex = 0, n = geometryArray.vertexIndices.length; i < n; i += 3) {
        this.addTriangleToPath(geometryArray, geometryArray.vertexIndices[i], geometryArray.vertexIndices[i + 1], geometryArray.vertexIndices[i + 2], vertices,
          geometryPath, triangleIndex++, nodeArea);
      }
      nodeArea.add(new java.awt.geom.Area(geometryPath));
    }
  }

  /**
   * Adds to <code>nodePath</code> the triangle joining vertices at
   * vertexIndex1, vertexIndex2, vertexIndex3 indices,
   * only if the triangle has a positive orientation.
   * @param {javax.media.j3d.GeometryArray} geometryArray
   * @param {number} vertexIndex1
   * @param {number} vertexIndex2
   * @param {number} vertexIndex3
   * @param {Array} vertices
   * @param {GeneralPath} geometryPath
   * @param {number} triangleIndex
   * @param {Area} nodeArea
   * @private
   */
  addTriangleToPath(
    geometryArray,
    vertexIndex1,
    vertexIndex2,
    vertexIndex3,
    vertices,
    geometryPath,
    triangleIndex,
    nodeArea
  ) {
    let xVertex1 = vertices[2 * vertexIndex1];
    let yVertex1 = vertices[2 * vertexIndex1 + 1];
    let xVertex2 = vertices[2 * vertexIndex2];
    let yVertex2 = vertices[2 * vertexIndex2 + 1];
    let xVertex3 = vertices[2 * vertexIndex3];
    let yVertex3 = vertices[2 * vertexIndex3 + 1];
    if ((xVertex2 - xVertex1) * (yVertex3 - yVertex2) - (yVertex2 - yVertex1) * (xVertex3 - xVertex2) > 0) {
      if (triangleIndex > 0 && triangleIndex % 1000 === 0) {
        nodeArea.add(new java.awt.geom.Area(geometryPath));
        geometryPath.reset();
      }
      geometryPath.moveTo(xVertex1, yVertex1);
      geometryPath.lineTo(xVertex2, yVertex2);
      geometryPath.lineTo(xVertex3, yVertex3);
      geometryPath.closePath();
    }
  }

  /**
   * Computes the vertices coordinates projected on floor of the 3D shapes children of <code>node</code>.
   * @param {Node3D} node
   * @param {Array} vertices
   * @param {mat4} parentTransformations
   * @private
   */
  computeVerticesOnFloor(node, vertices, parentTransformations) {
    if (node instanceof Group3D) {
      if (node instanceof TransformGroup3D) {
        parentTransformations = mat4.clone(parentTransformations);
        let transform = mat4.create();
        node.getTransform(transform);
        mat4.mul(parentTransformations, parentTransformations, transform);
      }
      let children = node.getChildren();
      for (let i = 0; i < children.length; i++) {
        this.computeVerticesOnFloor(children[i], vertices, parentTransformations);
      }
    } else if (node instanceof Link3D) {
      this.computeVerticesOnFloor(node.getSharedGroup(), vertices, parentTransformations);
    } else if (node instanceof Shape3D) {
      let appearance = node.getAppearance();
      if (appearance.isVisible()
        && (appearance.getTransparency() === undefined
          || appearance.getTransparency() < 1)) {
        let geometries = node.getGeometries();
        for (let i = 0, n = geometries.length; i < n; i++) {
          let geometryArray = geometries[i];
          let vertexCount = geometryArray.vertices.length;
          let vertex = vec3.create();
          for (let index = 0, j = 0; index < vertexCount; j++, index++) {
            vec3.copy(vertex, geometryArray.vertices[j]);
            vec3.transformMat4(vertex, vertex, parentTransformations);
            vertices.push([vertex[0], vertex[2]]);
          }
        }
      }
    }
  }

  /**
   * Returns the convex polygon that surrounds the given <code>vertices</code>.
   * From Andrew's monotone chain 2D convex hull algorithm described at
   * http://softsurfer.com/Archive/algorithm%5F0109/algorithm%5F0109.htm
   * @param {Array} vertices
   * @return {Array}
   * @private
   */
  getSurroundingPolygon(vertices) {
    vertices.sort((vertex1, vertex2) => {
      let testedValue;
      if (vertex1[0] === vertex2[0]) {
        testedValue = vertex2[1] - vertex1[1];
      } else {
        testedValue = vertex2[0] - vertex1[0];
      }
      if (testedValue > 0) {
        return 1;
      } else if (testedValue < 0) {
        return -1;
      } else {
        return 0;
      }
    });
    let polygon = new Array(vertices.length);
    let bottom = 0;
    let top = -1;
    let i;

    let minMin = 0;
    let minMax;
    let xmin = vertices[0][0];
    for (i = 1; i < vertices.length; i++) {
      if (vertices[i][0] !== xmin) {
        break;
      }
    }
    minMax = i - 1;
    if (minMax === vertices.length - 1) {
      polygon[++top] = vertices[minMin];
      if (vertices[minMax][1] !== vertices[minMin][1]) {
        polygon[++top] = vertices[minMax];
      }
      polygon[++top] = vertices[minMin];
      var surroundingPolygon = new Array(top + 1);
      System.arraycopy(polygon, 0, surroundingPolygon, 0, surroundingPolygon.length);
      return surroundingPolygon;
    }

    let maxMin;
    let maxMax = vertices.length - 1;
    let xMax = vertices[vertices.length - 1][0];
    for (i = vertices.length - 2; i >= 0; i--) {
      if (vertices[i][0] !== xMax) {
        break;
      }
    }
    maxMin = i + 1;

    polygon[++top] = vertices[minMin];
    i = minMax;
    while (++i <= maxMin) {
      if (this.isLeft(vertices[minMin], vertices[maxMin], vertices[i]) >= 0 && i < maxMin) {
        continue;
      }
      while (top > 0) {
        if (this.isLeft(polygon[top - 1], polygon[top], vertices[i]) > 0) {
          break;
        } else {
          top--;
        }
      }
      polygon[++top] = vertices[i];
    }

    if (maxMax !== maxMin) {
      polygon[++top] = vertices[maxMax];
    }
    bottom = top;
    i = maxMin;
    while (--i >= minMax) {
      if (this.isLeft(vertices[maxMax], vertices[minMax], vertices[i]) >= 0 && i > minMax) {
        continue;
      }
      while (top > bottom) {
        if (this.isLeft(polygon[top - 1], polygon[top], vertices[i]) > 0) {
          break;
        } else {
          top--;
        }
      }
      polygon[++top] = vertices[i];
    }
    if (minMax !== minMin) {
      polygon[++top] = vertices[minMin];
    }
    var surroundingPolygon = new Array(top + 1);
    System.arraycopy(polygon, 0, surroundingPolygon, 0, surroundingPolygon.length);
    return surroundingPolygon;
  }

  isLeft(vertex0, vertex1, vertex2) {
    return (vertex1[0] - vertex0[0]) * (vertex2[1] - vertex0[1])
      - (vertex2[0] - vertex0[0]) * (vertex1[1] - vertex0[1]);
  }

  /**
   * Returns the mirror area of the given <code>area</code>.
   * @param {Area} area
   * @return {Area}
   * @private
   */
  getMirroredArea(area) {
    let mirrorPath = new java.awt.geom.GeneralPath();
    let point = [0, 0, 0, 0, 0, 0];
    for (let it = area.getPathIterator(null); !it.isDone(); it.next()) {
      switch (it.currentSegment(point)) {
        case java.awt.geom.PathIterator.SEG_MOVETO:
          mirrorPath.moveTo(1 - point[0], point[1]);
          break;
        case java.awt.geom.PathIterator.SEG_LINETO:
          mirrorPath.lineTo(1 - point[0], point[1]);
          break;
        case java.awt.geom.PathIterator.SEG_QUADTO:
          mirrorPath.quadTo(1 - point[0], point[1], 1 - point[2], point[3]);
          break;
        case java.awt.geom.PathIterator.SEG_CUBICTO:
          mirrorPath.curveTo(1 - point[0], point[1], 1 - point[2], point[3], 1 - point[4], point[5]);
          break;
        case java.awt.geom.PathIterator.SEG_CLOSE:
          mirrorPath.closePath();
          break;
      }
    }
    return new java.awt.geom.Area(mirrorPath);
  }

  /**
   * Returns the shape matching the given <a href="http://www.w3.org/TR/SVG/paths.html">SVG path shape</a>.
   * @param {string} svgPathShape
   * @return {Shape}
   */
  getShape(svgPathShape) {
    return ShapeTools.getShape(svgPathShape);
  }
}

/**
 * Special shapes prefix;
 */
ModelManager.SPECIAL_SHAPE_PREFIX = "sweethome3d_";
/**
 * <code>Shape3D</code> name prefix for window pane shapes. 
 */
ModelManager.WINDOW_PANE_SHAPE_PREFIX = ModelManager.SPECIAL_SHAPE_PREFIX + "window_pane";
/**
 * <code>Shape3D</code> name prefix for mirror shapes. 
 */
ModelManager.MIRROR_SHAPE_PREFIX = ModelManager.SPECIAL_SHAPE_PREFIX + "window_mirror";
/**
 * <code>Shape3D</code> name prefix for lights. 
 */
ModelManager.LIGHT_SHAPE_PREFIX = ModelManager.SPECIAL_SHAPE_PREFIX + "light";
/**
 * <code>Node</code> user data prefix for mannequin parts.
 */
ModelManager.MANNEQUIN_ABDOMEN_PREFIX = ModelManager.SPECIAL_SHAPE_PREFIX + "mannequin_abdomen";
ModelManager.MANNEQUIN_CHEST_PREFIX = ModelManager.SPECIAL_SHAPE_PREFIX + "mannequin_chest";
ModelManager.MANNEQUIN_PELVIS_PREFIX = ModelManager.SPECIAL_SHAPE_PREFIX + "mannequin_pelvis";
ModelManager.MANNEQUIN_NECK_PREFIX = ModelManager.SPECIAL_SHAPE_PREFIX + "mannequin_neck";
ModelManager.MANNEQUIN_HEAD_PREFIX = ModelManager.SPECIAL_SHAPE_PREFIX + "mannequin_head";
ModelManager.MANNEQUIN_LEFT_SHOULDER_PREFIX = ModelManager.SPECIAL_SHAPE_PREFIX + "mannequin_left_shoulder";
ModelManager.MANNEQUIN_LEFT_ARM_PREFIX = ModelManager.SPECIAL_SHAPE_PREFIX + "mannequin_left_arm";
ModelManager.MANNEQUIN_LEFT_ELBOW_PREFIX = ModelManager.SPECIAL_SHAPE_PREFIX + "mannequin_left_elbow";
ModelManager.MANNEQUIN_LEFT_FOREARM_PREFIX = ModelManager.SPECIAL_SHAPE_PREFIX + "mannequin_left_forearm";
ModelManager.MANNEQUIN_LEFT_WRIST_PREFIX = ModelManager.SPECIAL_SHAPE_PREFIX + "mannequin_left_wrist";
ModelManager.MANNEQUIN_LEFT_HAND_PREFIX = ModelManager.SPECIAL_SHAPE_PREFIX + "mannequin_left_hand";
ModelManager.MANNEQUIN_LEFT_HIP_PREFIX = ModelManager.SPECIAL_SHAPE_PREFIX + "mannequin_left_hip";
ModelManager.MANNEQUIN_LEFT_THIGH_PREFIX = ModelManager.SPECIAL_SHAPE_PREFIX + "mannequin_left_thigh";
ModelManager.MANNEQUIN_LEFT_KNEE_PREFIX = ModelManager.SPECIAL_SHAPE_PREFIX + "mannequin_left_knee";
ModelManager.MANNEQUIN_LEFT_LEG_PREFIX = ModelManager.SPECIAL_SHAPE_PREFIX + "mannequin_left_leg";
ModelManager.MANNEQUIN_LEFT_ANKLE_PREFIX = ModelManager.SPECIAL_SHAPE_PREFIX + "mannequin_left_ankle";
ModelManager.MANNEQUIN_LEFT_FOOT_PREFIX = ModelManager.SPECIAL_SHAPE_PREFIX + "mannequin_left_foot";
ModelManager.MANNEQUIN_RIGHT_SHOULDER_PREFIX = ModelManager.SPECIAL_SHAPE_PREFIX + "mannequin_right_shoulder";
ModelManager.MANNEQUIN_RIGHT_ARM_PREFIX = ModelManager.SPECIAL_SHAPE_PREFIX + "mannequin_right_arm";
ModelManager.MANNEQUIN_RIGHT_ELBOW_PREFIX = ModelManager.SPECIAL_SHAPE_PREFIX + "mannequin_right_elbow";
ModelManager.MANNEQUIN_RIGHT_FOREARM_PREFIX = ModelManager.SPECIAL_SHAPE_PREFIX + "mannequin_right_forearm";
ModelManager.MANNEQUIN_RIGHT_WRIST_PREFIX = ModelManager.SPECIAL_SHAPE_PREFIX + "mannequin_right_wrist";
ModelManager.MANNEQUIN_RIGHT_HAND_PREFIX = ModelManager.SPECIAL_SHAPE_PREFIX + "mannequin_right_hand";
ModelManager.MANNEQUIN_RIGHT_HIP_PREFIX = ModelManager.SPECIAL_SHAPE_PREFIX + "mannequin_right_hip";
ModelManager.MANNEQUIN_RIGHT_THIGH_PREFIX = ModelManager.SPECIAL_SHAPE_PREFIX + "mannequin_right_thigh";
ModelManager.MANNEQUIN_RIGHT_KNEE_PREFIX = ModelManager.SPECIAL_SHAPE_PREFIX + "mannequin_right_knee";
ModelManager.MANNEQUIN_RIGHT_LEG_PREFIX = ModelManager.SPECIAL_SHAPE_PREFIX + "mannequin_right_leg";
ModelManager.MANNEQUIN_RIGHT_ANKLE_PREFIX = ModelManager.SPECIAL_SHAPE_PREFIX + "mannequin_right_ankle";
ModelManager.MANNEQUIN_RIGHT_FOOT_PREFIX = ModelManager.SPECIAL_SHAPE_PREFIX + "mannequin_right_foot";

ModelManager.MANNEQUIN_ABDOMEN_CHEST_PREFIX = ModelManager.SPECIAL_SHAPE_PREFIX + "mannequin_abdomen_chest";
ModelManager.MANNEQUIN_ABDOMEN_PELVIS_PREFIX = ModelManager.SPECIAL_SHAPE_PREFIX + "mannequin_abdomen_pelvis";
/**
 * <code>Node</code> user data prefix for ball / rotating  joints.
 */
ModelManager.BALL_PREFIX = ModelManager.SPECIAL_SHAPE_PREFIX + "ball_";
ModelManager.ARM_ON_BALL_PREFIX = ModelManager.SPECIAL_SHAPE_PREFIX + "arm_on_ball_";
/**
 * <code>Node</code> user data prefix for hinge / rotating opening joints.
 */
ModelManager.HINGE_PREFIX = ModelManager.SPECIAL_SHAPE_PREFIX + "hinge_";
ModelManager.OPENING_ON_HINGE_PREFIX = ModelManager.SPECIAL_SHAPE_PREFIX + "opening_on_hinge_";
ModelManager.WINDOW_PANE_ON_HINGE_PREFIX = ModelManager.WINDOW_PANE_SHAPE_PREFIX + "_on_hinge_";
ModelManager.MIRROR_ON_HINGE_PREFIX = ModelManager.MIRROR_SHAPE_PREFIX + "_on_hinge_";
/**
 * <code>Node</code> user data prefix for rail / sliding opening joints.
 */
ModelManager.UNIQUE_RAIL_PREFIX = ModelManager.SPECIAL_SHAPE_PREFIX + "unique_rail";
ModelManager.RAIL_PREFIX = ModelManager.SPECIAL_SHAPE_PREFIX + "rail_";
ModelManager.OPENING_ON_RAIL_PREFIX = ModelManager.SPECIAL_SHAPE_PREFIX + "opening_on_rail_";
ModelManager.WINDOW_PANE_ON_RAIL_PREFIX = ModelManager.WINDOW_PANE_SHAPE_PREFIX + "_on_rail_";
ModelManager.MIRROR_ON_RAIL_PREFIX = ModelManager.MIRROR_SHAPE_PREFIX + "_on_rail_";
/**
 * <code>Node</code> user data separator for sub transformations.
 */
ModelManager.SUB_TRANSFORMATION_SEPARATOR = "_and_";
/**
 * Deformable group suffix.
 */
ModelManager.DEFORMABLE_TRANSFORM_GROUP_SUFFIX = "_transformation";

ModelManager.EDGE_COLOR_MATERIAL_PREFIX = "edge_color";

// Singleton
ModelManager.instance = null;

/**
 * For backward compatibility.
 * @deprecated
 * @ignore
 */
ModelManager.prototype.getPieceOFFurnitureNormalizedModelTransformation = ModelManager.prototype.getPieceOfFurnitureNormalizedModelTransformation;
