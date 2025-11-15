/*
 * HomePieceOfFurniture3D.js
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
import {  vec3, vec4, mat4 } from 'gl-matrix';

import {
  HomeFurnitureGroup,
  HomeLight,
  PieceOfFurniture
} from './SweetHome3D';

import { Object3DBranch } from './Object3DBranch';
import {
  IndexedLineArray3D,
  Box3D, Appearance3D, Group3D,
  Shape3D, BranchGroup3D,
  TransformGroup3D,
  Link3D,
} from './scene3d';
import { ModelManager } from './ModelManager';
import { TextureManager } from './TextureManager';

// Requires scene3d.js
//          Object3DBranch.js
//          ModelManager.js
//          HomeObject.js
//          HomePieceOfFurniture.js


/**
 * Creates the 3D piece matching the given home <code>piece</code>.
 * @param {HomePieceOfFurniture} piece
 * @param {Home} home
 * @param {UserPreferences} [preferences]
 * @param {boolean|function} waitModelAndTextureLoadingEnd
 * @constructor
 * @extends Object3DBranch
 * @author Emmanuel Puybaret
 */
export class HomePieceOfFurniture3D extends Object3DBranch {
  constructor(piece, home, preferences, waitModelAndTextureLoadingEnd) {
    if (waitModelAndTextureLoadingEnd === undefined) {
      // 3 parameters
      waitModelAndTextureLoadingEnd = preferences;
      preferences = null;
    }
    super(piece, home, preferences);

    this.createPieceOfFurnitureNode(piece, waitModelAndTextureLoadingEnd);
  }

  /**
   * Creates the piece node with its transform group and add it to the piece branch. 
   * @private
   */
  createPieceOfFurnitureNode(piece, waitModelAndTextureLoadingEnd) {
    let pieceTransformGroup = new TransformGroup3D();
    pieceTransformGroup.setCapability(Group3D.ALLOW_CHILDREN_EXTEND);
    pieceTransformGroup.setCapability(TransformGroup3D.ALLOW_TRANSFORM_WRITE);
    this.addChild(pieceTransformGroup);

    this.loadPieceOfFurnitureModel(waitModelAndTextureLoadingEnd);
  }

  /**
   * @private
   */
  loadPieceOfFurnitureModel(waitModelAndTextureLoadingEnd) {
    // While loading model use a temporary node that displays a white box  
    let waitBranch = new BranchGroup3D();
    let normalization = new TransformGroup3D();
    normalization.addChild(this.getModelBox(vec3.fromValues(1, 1, 1)));
    normalization.setUserData(PieceOfFurniture.IDENTITY_ROTATION);
    waitBranch.addChild(normalization);

    let transformGroup = this.getChild(0);
    transformGroup.removeAllChildren();
    transformGroup.addChild(waitBranch);

    // Set piece model initial location, orientation and size      
    this.updatePieceOfFurnitureTransform();

    let piece = this.getUserData();
    // Store 3D model for possible future changes
    let model = piece.getModel();
    transformGroup.setUserData(model);
    // Load piece real 3D model
    let piece3D = this;
    ModelManager.getInstance().loadModel(model,
      typeof waitModelAndTextureLoadingEnd == "function" ? false : waitModelAndTextureLoadingEnd,
      {
        modelUpdated: function (modelRoot) {
          piece3D.updateModelTransformations(modelRoot);

          let modelRotation = piece.getModelRotation();
          // Add piece model scene to a normalized transform group
          let modelTransformGroup = ModelManager.getInstance().getNormalizedTransformGroup(
            modelRoot, modelRotation, 1, piece.isModelCenteredAtOrigin());
          // Store model rotation for possible future changes
          modelTransformGroup.setUserData(modelRotation);
          piece3D.updatePieceOfFurnitureModelNode(modelRoot, modelTransformGroup, waitModelAndTextureLoadingEnd);
        },
        modelError: function (ex) {
          // In case of problem use a default red box
          piece3D.updatePieceOfFurnitureModelNode(piece3D.getModelBox(vec3.fromValues(1, 0, 0)),
            new TransformGroup3D(), waitModelAndTextureLoadingEnd);
        }
      });
  }

  /**
   * Updates this branch from the home piece it manages.
   */
  update() {
    if (this.isVisible()) {
      let piece = this.getUserData();
      let transformGroup = this.getChild(0);
      let normalization = transformGroup.getChild(0).getChild(0);
      if (piece.getModel().equals(transformGroup.getUserData())
        && Object3DBranch.areModelRotationsEqual(piece.getModelRotation(), normalization.getUserData())) {
        this.updatePieceOfFurnitureModelTransformations();
        this.updatePieceOfFurnitureTransform();
        this.updatePieceOfFurnitureColorAndTexture(false);
      } else {
        this.loadPieceOfFurnitureModel(false);
      }
    }
    this.updatePieceOfFurnitureVisibility();
  }

  /**
   * Sets the transformation applied to piece model to match
   * its location, its angle and its size.
   * @private
   */
  updatePieceOfFurnitureTransform() {
    let transformGroup = this.getChild(0);
    let pieceTransform = ModelManager.getInstance().getPieceOfFurnitureNormalizedModelTransformation(
      this.getUserData(), transformGroup.getChild(0).getChild(0));
    // Change model transformation      
    transformGroup.setTransform(pieceTransform);
  }

  /**
   * Sets the color and the texture applied to piece model.
   * @private
   */
  updatePieceOfFurnitureColorAndTexture(waitTextureLoadingEnd) {
    let piece = this.getUserData();
    let modelNode = this.getModelNode();
    let modelChild = modelNode.getChild(0);
    if (modelChild.getUserData() !== HomePieceOfFurniture3D.DEFAULT_BOX) {
      if (piece.getColor() !== null) {
        this.setColorAndTexture(modelNode, piece.getColor(), null, piece.getShininess(), null, piece.isModelMirrored(), piece.getModelFlags(), false,
          null, null, []);
      } else if (piece.getTexture() !== null) {
        this.setColorAndTexture(modelNode, null, piece.getTexture(), piece.getShininess(), null, piece.isModelMirrored(), piece.getModelFlags(), waitTextureLoadingEnd,
          vec3.fromValues(piece.getWidth(), piece.getHeight(), piece.getDepth()), ModelManager.getInstance().getBounds(modelChild),
          []);
      } else if (piece.getModelMaterials() !== null) {
        this.setColorAndTexture(modelNode, null, null, null, piece.getModelMaterials(), piece.isModelMirrored(), piece.getModelFlags(), waitTextureLoadingEnd,
          vec3.fromValues(piece.getWidth(), piece.getHeight(), piece.getDepth()), ModelManager.getInstance().getBounds(modelChild),
          []);
      } else {
        // Set default material and texture of model
        this.setColorAndTexture(modelNode, null, null, piece.getShininess(), null, piece.isModelMirrored(), piece.getModelFlags(), false, null, null, []);
      }
    }
  }

  /**
   * Returns the node of the filled model.
   * @return {Node}
   * @private
   */
  getModelNode() {
    let transformGroup = this.getChild(0);
    let branchGroup = transformGroup.getChild(0);
    return branchGroup.getChild(0);
  }

  /**
   * Returns the selection node of the model.
   * @return {Node}
   * @private
   */
  getSelectionNode() {
    let transformGroup = this.getChild(0);
    let branchGroup = transformGroup.getChild(0);
    if (branchGroup.getChildren().length > 1
      && branchGroup.getChild(1) instanceof Shape3D) {
      return branchGroup.getChild(1);
    } else {
      return null;
    }
  }

  /**
   * Sets whether this piece model is visible or not.
   * @private
   */
  updatePieceOfFurnitureVisibility() {
    let piece = this.getUserData();
    // Update visibility of filled model shapes
    let visible = this.isVisible();
    let materials = piece.getColor() === null && piece.getTexture() === null
      ? piece.getModelMaterials()
      : null;
    this.setVisible(this.getModelNode(), visible, piece.getModelFlags(), materials);
    let selectionNode = this.getSelectionNode();
    if (selectionNode != null) {
      this.setVisible(selectionNode, this.getUserPreferences() != null
        && this.getUserPreferences().isEditingIn3DViewEnabled()
        && visible && this.getHome() != null
        && this.isSelected(this.getHome().getSelectedItems()), 0, null);
    }
  }

  /**
   * Sets the transformations applied to piece model parts.
   * @private 
   */
  updatePieceOfFurnitureModelTransformations() {
    let piece = this.getUserData();
    let modelNode = this.getModelNode();
    if (modelNode.getChild(0).getUserData() !== HomePieceOfFurniture3D.DEFAULT_BOX
      && this.updateModelTransformations(this)) {
      // Update normalized transform group
      let modelTransform = ModelManager.getInstance().
        getNormalizedTransform(modelNode.getChild(0), piece.getModelRotation(), 1, piece.isModelCenteredAtOrigin());
      modelNode.setTransform(modelTransform);
    }
  }

  /**
   * Sets the transformations applied to <code>node</code> children
   * and returns <code>true</code> if a transformation was changed.
   * @param {Node3D} node
   * @private 
   */
  updateModelTransformations(node) {
    let modifiedTransformations = false;
    let transformations = this.getUserData().getModelTransformations();
    let updatedTransformations = null;
    if (transformations !== null) {
      for (let i = 0; i < transformations.length; i++) {
        let transformation = transformations[i];
        let transformName = transformation.getName() + ModelManager.DEFORMABLE_TRANSFORM_GROUP_SUFFIX;
        if (updatedTransformations === null) {
          updatedTransformations = [];
        }
        updatedTransformations.push(transformName);
        modifiedTransformations |= this.updateTransformation(node, transformName, transformation.getMatrix());
      }
    }
    modifiedTransformations |= this.setNotUpdatedTranformationsToIdentity(node, updatedTransformations);
    return modifiedTransformations;
  }

  /**
   * Sets the transformation matrix of the children which user data is equal to <code>transformGroupName</code>.
   * @param {Node3D} node
   * @param {String} transformGroupName
   * @param {Array}  matrix
   * @private 
   */
  updateTransformation(node, transformGroupName, matrix) {
    let modifiedTransformations = false;
    if (node instanceof Group3D) {
      if (node instanceof TransformGroup3D
        && transformGroupName == node.getName()) {
        let transformMatrix = mat4.create();
        node.getTransform(transformMatrix);
        if (matrix[0][0] !== transformMatrix[0]
          || matrix[0][1] !== transformMatrix[4]
          || matrix[0][2] !== transformMatrix[8]
          || matrix[0][3] !== transformMatrix[12]
          || matrix[1][0] !== transformMatrix[1]
          || matrix[1][1] !== transformMatrix[5]
          || matrix[1][2] !== transformMatrix[9]
          || matrix[1][3] !== transformMatrix[13]
          || matrix[2][0] !== transformMatrix[2]
          || matrix[2][1] !== transformMatrix[6]
          || matrix[2][2] !== transformMatrix[10]
          || matrix[2][3] !== transformMatrix[14]) {
          mat4.set(transformMatrix,
            matrix[0][0], matrix[1][0], matrix[2][0], 0,
            matrix[0][1], matrix[1][1], matrix[2][1], 0,
            matrix[0][2], matrix[1][2], matrix[2][2], 0,
            matrix[0][3], matrix[1][3], matrix[2][3], 1);
          node.setTransform(transformMatrix);
          modifiedTransformations = true;
        }
      } else {
        let children = node.getChildren();
        for (let i = 0; i < children.length; i++) {
          modifiedTransformations |= this.updateTransformation(children[i], transformGroupName, matrix);
        }
      }
    }
    // No Link parsing

    return modifiedTransformations;
  }

  /**
   * Sets the transformation matrix of the children which user data is not in <code>updatedTransformations</code> to identity.
   * @param {Node3D} node
   * @param {string[]} updatedTransformations
   * @private 
   */
  setNotUpdatedTranformationsToIdentity(node, updatedTransformations) {
    let modifiedTransformations = false;
    if (node instanceof Group3D) {
      if (node instanceof TransformGroup3D
        && node.getName() !== null
        && node.getName().indexOf(ModelManager.DEFORMABLE_TRANSFORM_GROUP_SUFFIX) >= 0
        && node.getName().indexOf(ModelManager.DEFORMABLE_TRANSFORM_GROUP_SUFFIX) === node.getName().length - ModelManager.DEFORMABLE_TRANSFORM_GROUP_SUFFIX.length
        && (updatedTransformations === null
          || updatedTransformations.indexOf(node.getName()) < 0)) {
        let group = node;
        let transform = mat4.create();
        group.getTransform(transform);
        if (!TransformGroup3D.isIdentity(transform)) {
          mat4.identity(transform);
          group.setTransform(transform);
          modifiedTransformations = true;
        }
      }
      let children = node.getChildren();
      for (let i = 0; i < children.length; i++) {
        modifiedTransformations |= this.setNotUpdatedTranformationsToIdentity(children[i], updatedTransformations);
      }
    }

    return modifiedTransformations;
  }

  /**
   * Updates transform group children with <code>modelMode</code>.
   * @private
   */
  updatePieceOfFurnitureModelNode(modelNode, normalization, waitTextureLoadingEnd) {
    normalization.setCapability(TransformGroup3D.ALLOW_TRANSFORM_WRITE);
    normalization.addChild(modelNode);
    // Add model node to branch group
    let modelBranch = new BranchGroup3D();
    modelBranch.addChild(normalization);

    if (this.getHome() != null) {
      // Add selection box node
      let selectionBox = new Shape3D(HomePieceOfFurniture3D.SELECTION_BOX_GEOMETRY, this.getSelectionAppearance());
      selectionBox.setPickable(false);
      modelBranch.addChild(selectionBox);
    }

    let piece = this.getUserData();
    if (piece.isDoorOrWindow()) {
      this.setTransparentShapeNotPickable(modelNode);
    }

    let transformGroup = this.getChild(0);
    // Remove previous nodes    
    transformGroup.removeAllChildren();
    // Add model branch to live scene
    transformGroup.addChild(modelBranch);
    if (piece.isHorizontallyRotated()) {
      // Update piece transformation to ensure its center is correctly placed
      this.updatePieceOfFurnitureTransform();
    }

    // Flip normals if back faces of model are shown
    if (piece.isBackFaceShown()) {
      this.setBackFaceNormalFlip(this.getModelNode(), true);
    }
    // Update piece color, visibility and model mirror
    this.modifiedTexturesCount = 0;
    this.updatePieceOfFurnitureColorAndTexture(waitTextureLoadingEnd);
    this.updatePieceOfFurnitureVisibility();
    // If no texture is customized, report loading end to waitTextureLoadingEnd
    if (this.modifiedTexturesCount === 0
      && typeof waitTextureLoadingEnd == "function") {
      waitTextureLoadingEnd(this);
    }
  }

  /**
   * Returns a box that may replace model. 
   * @private
   */
  getModelBox(color) {
    let boxAppearance = new Appearance3D();
    boxAppearance.setDiffuseColor(color);
    boxAppearance.setAmbientColor(vec3.scale(vec3.create(), color, 0.7));
    let box = new Box3D(0.5, 0.5, 0.5, boxAppearance);
    box.setUserData(HomePieceOfFurniture3D.DEFAULT_BOX);
    return box;
  }

  /**
   * Sets the material and texture attribute of all <code>Shape3D</code> children nodes of <code>node</code> 
   * from the given <code>color</code> and <code>texture</code>. 
   * @private
   */
  setColorAndTexture(
    node,
    color,
    texture,
    shininess,
    materials,
    mirrored,
    modelFlags,
    waitTextureLoadingEnd,
    pieceSize,
    modelBounds,
    modifiedAppearances
  ) {
    if (node instanceof Group3D) {
      // Set material and texture of all children
      let children = node.getChildren();
      for (var i = 0; i < children.length; i++) {
        this.setColorAndTexture(children[i], color,
          texture, shininess, materials, mirrored, modelFlags, waitTextureLoadingEnd,
          pieceSize, modelBounds, modifiedAppearances);
      }
    } else if (node instanceof Link3D) {
      this.setColorAndTexture(node.getSharedGroup(), color,
        texture, shininess, materials, mirrored, modelFlags, waitTextureLoadingEnd,
        pieceSize, modelBounds, modifiedAppearances);
    } else if (node instanceof Shape3D) {
      let shape = node;
      let shapeName = shape.getName();
      let appearance = shape.getAppearance();
      if (appearance === null) {
        appearance = new Appearance3D();
        node.setAppearance(appearance);
      }

      // Check appearance wasn't already changed
      if (modifiedAppearances.indexOf(appearance) === -1) {
        let defaultAppearance = null;
        let colorModified = color !== null;
        let textureModified = !colorModified
          && texture !== null;
        let materialModified = !colorModified
          && !textureModified
          && materials !== null && materials.length > 0;
        let appearanceModified = colorModified
          || textureModified
          || materialModified
          || shininess !== null
          || mirrored
          || modelFlags != 0;
        let windowPane = shapeName !== null
          && shapeName.indexOf(ModelManager.WINDOW_PANE_SHAPE_PREFIX) === 0;
        if (!windowPane && appearanceModified
          || windowPane && materialModified) {
          // Store shape default appearance 
          // (global color or texture change doesn't have effect on window panes)
          if (appearance.defaultAppearance === undefined) {
            appearance.defaultAppearance = appearance.clone();
          }
          defaultAppearance = appearance.defaultAppearance;
        }
        let materialShininess = 0.;
        if (appearanceModified) {
          materialShininess = shininess !== null
            ? shininess
            : (appearance.getSpecularColor() !== undefined
              && appearance.getShininess() !== undefined
              ? appearance.getShininess() / 128
              : 0);
        }
        if (colorModified) {
          // Change color only of shapes that are not window panes
          if (windowPane) {
            this.restoreDefaultAppearance(appearance, null);
          } else {
            // Change material if no default texture is displayed on the shape
            // (textures always keep the colors of their image file)
            this.updateAppearanceMaterial(appearance, color, color, materialShininess);
            if (defaultAppearance.getTransparency() !== undefined) {
              appearance.setTransparency(defaultAppearance.getTransparency());
            }
            if (defaultAppearance.getCullFace() !== undefined) {
              appearance.setCullFace(defaultAppearance.getCullFace());
            }
            appearance.setTextureCoordinatesGeneration(defaultAppearance.getTextureCoordinatesGeneration());
            appearance.setTextureImage(null);
          }
        } else if (textureModified) {
          // Change texture only of shapes that are not window panes
          if (windowPane) {
            this.restoreDefaultAppearance(appearance, null);
          } else {
            appearance.setTextureCoordinatesGeneration(this.getTextureCoordinates(appearance, texture, pieceSize, modelBounds));
            this.updateTextureTransform(appearance, texture, true);
            this.updateAppearanceMaterial(appearance, Object3DBranch.DEFAULT_COLOR, Object3DBranch.DEFAULT_AMBIENT_COLOR, materialShininess);
            TextureManager.getInstance().loadTexture(texture.getImage(), 0,
              typeof waitTextureLoadingEnd == "function" ? false : waitTextureLoadingEnd,
              this.getTextureObserver(appearance, mirrored, modelFlags, waitTextureLoadingEnd));
          }
        } else if (materialModified) {
          let materialFound = false;
          // Apply color, texture and shininess of the material named as appearance name
          for (var i = 0; i < materials.length; i++) {
            let material = materials[i];
            if (material !== null
              && (material.getKey() != null
                && material.getKey() == appearance.getName()
                || material.getKey() == null
                && material.getName() == appearance.getName())) {
              if (material.getShininess() !== null) {
                materialShininess = material.getShininess();
              }
              color = material.getColor();
              if (color !== null
                && (color & 0xFF000000) != 0) {
                this.updateAppearanceMaterial(appearance, color, color, materialShininess);
                if (defaultAppearance.getTransparency() !== undefined) {
                  appearance.setTransparency(defaultAppearance.getTransparency());
                }
                if (defaultAppearance.getCullFace() !== undefined) {
                  appearance.setCullFace(defaultAppearance.getCullFace());
                }
                appearance.setTextureImage(null);
              } else if (color === null && material.getTexture() !== null) {
                var materialTexture = material.getTexture();
                if (this.isTexturesCoordinatesDefined(shape)) {
                  this.restoreDefaultTextureCoordinatesGeneration(appearance);
                  this.updateTextureTransform(appearance, materialTexture);
                } else {
                  appearance.setTextureCoordinatesGeneration(this.getTextureCoordinates(appearance, material.getTexture(), pieceSize, modelBounds));
                  this.updateTextureTransform(appearance, materialTexture, true);
                }
                this.updateAppearanceMaterial(appearance, Object3DBranch.DEFAULT_COLOR, Object3DBranch.DEFAULT_AMBIENT_COLOR, materialShininess);
                var materialTexture = material.getTexture();
                TextureManager.getInstance().loadTexture(materialTexture.getImage(), 0,
                  typeof waitTextureLoadingEnd == "function" ? false : waitTextureLoadingEnd,
                  this.getTextureObserver(appearance, mirrored, modelFlags, waitTextureLoadingEnd));
              } else {
                this.restoreDefaultAppearance(appearance, material.getShininess());
              }
              materialFound = true;
              break;
            }
          }
          if (!materialFound) {
            this.restoreDefaultAppearance(appearance, null);
          }
        } else {
          this.restoreDefaultAppearance(appearance, shininess);
        }

        this.setCullFace(appearance, mirrored, (modelFlags & PieceOfFurniture.SHOW_BACK_FACE) != 0);

        // Store modified appearances to avoid changing their values more than once
        modifiedAppearances.push(appearance);
      }
    }
  }

  /**
   * Returns a texture observer that will update the given <code>appearance</code>.
   * @private
   */
  getTextureObserver(appearance, mirrored, modelFlags, waitTextureLoadingEnd) {
    let piece3D = this;
    this.modifiedTexturesCount++;
    return {
      textureUpdated: function (textureImage) {
        if (TextureManager.getInstance().isTextureTransparent(textureImage)) {
          appearance.setCullFace(Appearance3D.CULL_NONE);
        } else {
          let defaultAppearance = appearance.defaultAppearance;
          if (defaultAppearance !== null
            && defaultAppearance.getCullFace() !== null) {
            appearance.setCullFace(defaultAppearance.getCullFace());
          }
        }
        if (appearance.getTextureImage() !== textureImage) {
          appearance.setTextureImage(textureImage);
        }

        piece3D.setCullFace(appearance, mirrored, (modelFlags & PieceOfFurniture.SHOW_BACK_FACE) != 0);

        // If all customized textures are loaded, report loading end to waitTextureLoadingEnd
        if (--piece3D.modifiedTexturesCount === 0
          && typeof waitTextureLoadingEnd == "function") {
          waitTextureLoadingEnd(piece3D);
        }
      },
      textureError: function (error) {
        return this.textureUpdated(TextureManager.getInstance().getErrorImage());
      }
    };
  }

  /**
   * Returns a texture coordinates generator that wraps the given texture on front face.
   * @private
   */
  getTextureCoordinates(appearance, texture, pieceSize, modelBounds) {
    let lower = vec3.create();
    modelBounds.getLower(lower);
    let upper = vec3.create();
    modelBounds.getUpper(upper);
    let minimumSize = ModelManager.getInstance().getMinimumSize();
    let sx = pieceSize[0] / Math.max(upper[0] - lower[0], minimumSize);
    let sw = -lower[0] * sx;
    let ty = pieceSize[1] / Math.max(upper[1] - lower[1], minimumSize);
    let tz = pieceSize[2] / Math.max(upper[2] - lower[2], minimumSize);
    let tw = -lower[1] * ty + upper[2] * tz;
    return {
      planeS: vec4.fromValues(sx, 0, 0, sw),
      planeT: vec4.fromValues(0, ty, -tz, tw)
    };
  }

  /**
   * Returns <code>true</code> if all the geometries of the given <code>shape</code> define some texture coordinates.
   * @private
   */
  isTexturesCoordinatesDefined(shape) {
    let geometries = shape.getGeometries();
    for (let i = 0, n = geometries.length; i < n; i++) {
      if (!geometries[i].hasTextureCoordinates()) {
        return false;
      }
    }
    return true;
  }

  /**
   * Sets the cull face of the given <code>appearance</code>.
   * @private
   */
  setCullFace(appearance, mirrored, backFaceShown) {
    // Change cull face 
    if (appearance.getCullFace() !== Appearance3D.CULL_NONE) {
      let cullFace = appearance.getCullFace() !== undefined
        ? appearance.getCullFace()
        : Appearance3D.CULL_BACK;
      let defaultCullFace = appearance.defaultCullFace;
      if (defaultCullFace === undefined) {
        appearance.defaultCullFace = (defaultCullFace = cullFace);
      }
      appearance.setCullFace((mirrored ^ backFaceShown ^ defaultCullFace === Appearance3D.CULL_FRONT)
        ? Appearance3D.CULL_FRONT
        : Appearance3D.CULL_BACK);
    }
  }

  /**
   * Restores default material and texture of the given <code>appearance</code>.
   * @private
   */
  restoreDefaultAppearance(appearance, shininess) {
    if (appearance.defaultAppearance !== undefined) {
      let defaultAppearance = appearance.defaultAppearance;
      if (defaultAppearance.getAmbientColor() !== undefined) {
        appearance.setAmbientColor(defaultAppearance.getAmbientColor());
      }
      if (defaultAppearance.getDiffuseColor() !== undefined) {
        appearance.setDiffuseColor(defaultAppearance.getDiffuseColor());
        if (shininess !== null) {
          appearance.setSpecularColor(vec3.fromValues(shininess, shininess, shininess));
          appearance.setShininess(shininess * 128);
        } else {
          appearance.setSpecularColor(defaultAppearance.getSpecularColor());
          appearance.setShininess(defaultAppearance.getShininess());
        }
      }
      if (defaultAppearance.getTransparency() !== undefined) {
        appearance.setTransparency(defaultAppearance.getTransparency());
      }
      if (appearance.getCullFace() !== undefined) {
        appearance.setCullFace(defaultAppearance.getCullFace());
      }
      if (defaultAppearance.getTextureCoordinatesGeneration() !== undefined) {
        appearance.setTextureCoordinatesGeneration(defaultAppearance.getTextureCoordinatesGeneration());
      }
      if (appearance.getTextureImage() !== undefined) {
        appearance.setTextureImage(defaultAppearance.getTextureImage());
      }
    }
  }

  /**
   * Restores default texture coordinates generation of the given <code>appearance</code>.
   * @private
   */
  restoreDefaultTextureCoordinatesGeneration(appearance) {
    if (appearance.defaultAppearance !== undefined) {
      let defaultAppearance = appearance.defaultAppearance;
      if (defaultAppearance.getTextureCoordinatesGeneration() !== undefined) {
        appearance.setTextureCoordinatesGeneration(defaultAppearance.getTextureCoordinatesGeneration());
      }
    }
  }

  /**
   * Sets the visible attribute of the <code>Shape3D</code> children nodes of <code>node</code>.
   * @private
   */
  setVisible(node, visible, modelFlags, materials) {
    if (node instanceof Group3D) {
      // Set visibility of all children
      let children = node.getChildren();
      for (var i = 0; i < children.length; i++) {
        this.setVisible(children[i], visible, modelFlags, materials);
      }
    } else if (node instanceof Link3D) {
      this.setVisible(node.getSharedGroup(), visible, modelFlags, materials);
    } else if (node instanceof Shape3D) {
      let shape = node;
      let appearance = shape.getAppearance();
      if (appearance === null) {
        appearance = new Appearance3D();
        node.setAppearance(appearance);
      }
      let shapeName = shape.getName();
      if (visible
        && shapeName !== null
        && shapeName.indexOf(ModelManager.LIGHT_SHAPE_PREFIX) === 0
        && this.getHome() !== null
        && !this.isSelected(this.getHome().getSelectedItems())
        && (typeof HomeLight === "undefined"
          || this.getUserData() instanceof HomeLight)) {
        // Don't display light sources shapes of unselected lights
        visible = false;
      }

      if (visible) {
        let appearanceName = appearance.getName();
        if (appearanceName != null) {
          if ((modelFlags & PieceOfFurniture.HIDE_EDGE_COLOR_MATERIAL) != 0
            && appearanceName.indexOf(ModelManager.EDGE_COLOR_MATERIAL_PREFIX) === 0) {
            visible = false;
          } else if (materials != null) {
            // Check whether the material color used by this shape isn't invisible 
            for (var i = 0; i < materials.length; i++) {
              let material = materials[i];
              if (material !== null
                && material.getName() == appearanceName) {
                let color = material.getColor();
                visible = color === null
                  || (color & 0xFF000000) !== 0;
                break;
              }
            }
          }
        }
      }

      // Change visibility
      appearance.setVisible(visible);
    }
  }

  /**
   * Returns <code>true</code> if this 3D piece is visible.
   * @private
   */
  isVisible() {
    let piece = this.getUserData();
    return piece.isVisible()
      && (piece.getLevel() === null
        || piece.getLevel().isViewableAndVisible());
  }

  /**
   * Returns <code>true</code> if this piece of furniture belongs to <code>selectedItems</code>.
   * @private
   */
  isSelected(selectedItems) {
    for (let i = 0; i < selectedItems.length; i++) {
      let item = selectedItems[i];
      if (item === this.getUserData()
        || (item instanceof HomeFurnitureGroup
          && this.isSelected(item.getFurniture()))) {
        return true;
      }
    }
    return false;
  }

  /**
   * Sets whether all <code>Shape3D</code> children nodes of <code>node</code> should have 
   * their normal flipped or not.
   * Caution !!! Should be executed only once per instance 
   * @param backFaceNormalFlip <code>true</code> if normals should be flipped.
   * @private
   */
  setBackFaceNormalFlip(node, backFaceNormalFlip) {
    if (node instanceof Group3D) {
      // Set back face normal flip of all children
      let children = node.getChildren();
      for (let i = 0; i < children.length; i++) {
        this.setBackFaceNormalFlip(children[i], backFaceNormalFlip);
      }
    } else if (node instanceof Link3D) {
      this.setBackFaceNormalFlip(node.getSharedGroup(), backFaceNormalFlip);
    } else if (node instanceof Shape3D) {
      let appearance = node.getAppearance();
      if (appearance === null) {
        appearance = new Appearance3D();
        node.setAppearance(appearance);
      }
      // Change back face normal flip
      appearance.setBackFaceNormalFlip(
        backFaceNormalFlip ^ appearance.getCullFace() === Appearance3D.CULL_FRONT);
    }
  }

  /**
   * Cancels the pickability of the <code>Shape3D</code> children nodes of <code>node</code> 
   * when it uses a transparent appearance. 
   * @private
   */
  setTransparentShapeNotPickable(node) {
    if (node instanceof Group3D) {
      let children = node.getChildren();
      for (let i = 0; i < children.length; i++) {
        this.setTransparentShapeNotPickable(children[i]);
      }
    } else if (node instanceof Link3D) {
      this.setTransparentShapeNotPickable(node.getSharedGroup());
    } else if (node instanceof Shape3D) {
      let appearance = node.getAppearance();
      if (appearance !== null
        && appearance.getTransparency() > 0) {
        node.setPickable(false);
      }
    }
  }
}

HomePieceOfFurniture3D.DEFAULT_BOX = new Object();
HomePieceOfFurniture3D.SELECTION_BOX_GEOMETRY = new IndexedLineArray3D(
  [vec3.fromValues(-0.5, -0.5, -0.5),
  vec3.fromValues(0.5, -0.5, -0.5),
  vec3.fromValues(0.5, 0.5, -0.5),
  vec3.fromValues(-0.5, 0.5, -0.5),
  vec3.fromValues(-0.5, -0.5, 0.5),
  vec3.fromValues(0.5, -0.5, 0.5),
  vec3.fromValues(0.5, 0.5, 0.5),
  vec3.fromValues(-0.5, 0.5, 0.5)],
  [0, 1, 1, 2, 2, 3, 3, 0, 4, 5, 5, 6, 6, 7, 7, 4, 0, 4, 1, 5, 2, 6, 3, 7, 4, 6, 5, 7]);

