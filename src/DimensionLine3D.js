/*
 * DimensionLine3D.js
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
import { vec3, mat4 } from 'gl-matrix';

import { DimensionLine, Label, CollectionEvent } from './SweetHome3D';

import { Object3DBranch } from './Object3DBranch';
import { Label3D } from './Label3D';
import {
  BoundingBox3D,
  Node3D,
  IndexedLineArray3D,
  Box3D, Appearance3D, Group3D, IndexedTriangleArray3D,
  Shape3D, BranchGroup3D, Background3D,
  TransformGroup3D, DirectionalLight3D, AmbientLight3D,
  Link3D,
  SharedGroup3D,
  GeometryInfo3D,
} from './scene3d';

/**
 * Creates the 3D object matching the given dimension line.
 * @param {DimensionLine} dimensionLine
 * @param {Home} home
 * @param {UserPreferences} preferences
 * @param {boolean} waitForLoading
 * @constructor
 * @extends Object3DBranch
 * @author Emmanuel Puybaret
 */
export class DimensionLine3D extends Object3DBranch {
  constructor(dimensionLine, home, preferences, waitForLoading) {
    super(dimensionLine, home, preferences);

    this.dimensionLineRotations = null;
    this.cameraChangeListener = null;
    this.homeCameraListener = null;
    this.dimensionLinesListener = null;

    this.setCapability(Group3D.ALLOW_CHILDREN_EXTEND);

    this.update();
  }

  update() {
    let dimensionLine = this.getUserData();
    if (dimensionLine.isVisibleIn3D()
      && (dimensionLine.getLevel() == null
        || dimensionLine.getLevel().isViewableAndVisible())) {
      let dimensionLineLength = dimensionLine.getLength();
      let lengthText = this.getUserPreferences().getLengthUnit().getFormat().format(dimensionLineLength);
      let lengthStyle = dimensionLine.getLengthStyle();
      if (lengthStyle == null) {
        lengthStyle = this.getUserPreferences().getDefaultTextStyle(DimensionLine);
      }
      if (lengthStyle.getFontName() == null) {
        lengthStyle = lengthStyle.deriveStyle(this.getUserPreferences().getDefaultFontName());
      }
      let fontName = lengthStyle.getFontName();
      if (fontName === null) {
        fontName = "sans-serif";
      }
      let fontHeight = lengthStyle.getFontSize();
      if (["Times", "Serif", "Helvetica"].indexOf(fontName) === -1) {
        fontHeight *= 1.18;
      }
      let fontDescent = 0.23 * fontHeight;
      let fontAscent = fontHeight - fontDescent;
      let offset = dimensionLine.getOffset();
      let zTranslation = offset <= 0
        ? -fontDescent - 1
        : fontAscent + 1;
      let transformGroup;
      var linesShape;
      let linesAppearance;
      let selectionLinesShape;
      let selectionAppearance;
      if (this.getChildren().length === 0) {
        let group = new BranchGroup3D();

        const transformGroup = new TransformGroup3D();
        transformGroup.setCapability(TransformGroup3D.ALLOW_TRANSFORM_WRITE);
        const labelTransformGroup = new TransformGroup3D();
        labelTransformGroup.setCapability(TransformGroup3D.ALLOW_TRANSFORM_WRITE);
        transformGroup.addChild(labelTransformGroup);

        var lengthLabel = new Label(lengthText, 0, zTranslation);
        lengthLabel.setColor(dimensionLine.getColor());
        lengthLabel.setStyle(lengthStyle);
        lengthLabel.setPitch(0);
        var label3D = new Label3D(lengthLabel, null, false);
        labelTransformGroup.addChild(label3D);

        var linesShape = new Shape3D();
        linesAppearance = new Appearance3D();
        linesAppearance.setIllumination(0);
        linesShape.setAppearance(linesAppearance);
        linesShape.setCapability(Shape3D.ALLOW_GEOMETRY_WRITE);
        transformGroup.addChild(linesShape);

        selectionLinesShape = new Shape3D();
        selectionAppearance = this.getSelectionAppearance();
        selectionLinesShape.setAppearance(this.getSelectionAppearance());
        selectionLinesShape.setCapability(Shape3D.ALLOW_GEOMETRY_WRITE);
        selectionLinesShape.setPickable(false);
        transformGroup.addChild(selectionLinesShape);

        group.addChild(transformGroup);
        this.addChild(group);
      } else {
        transformGroup = this.getChild(0).getChild(0);
        var label3D = transformGroup.getChild(0).getChild(0);
        var lengthLabel = label3D.getUserData();
        lengthLabel.setText(lengthText);
        lengthLabel.setY(zTranslation);
        lengthLabel.setColor(dimensionLine.getColor());
        lengthLabel.setStyle(lengthStyle);
        label3D.update();

        linesShape = transformGroup.getChild(1);
        linesAppearance = linesShape.getAppearance();

        selectionLinesShape = transformGroup.getChild(2);
        selectionAppearance = selectionLinesShape.getAppearance();
      }

      let elevationStart = dimensionLine.getElevationStart();
      // eslint-disable-next-line no-undef -- @todo Import this
      let startPointTransform = mat4.create();
      // eslint-disable-next-line no-undef -- @todo Import this
      mat4.fromTranslation(startPointTransform, vec3.fromValues(
        dimensionLine.getXStart(), dimensionLine.getLevel() != null ? dimensionLine.getLevel().getElevation() + elevationStart : elevationStart, dimensionLine.getYStart()));

      if (this.dimensionLineRotations == null) {
        this.dimensionLineRotations = mat4.create();
      }
      let elevationAngle = Math.atan2(dimensionLine.getElevationEnd() - elevationStart,
        dimensionLine.getXEnd() - dimensionLine.getXStart());
      mat4.fromZRotation(this.dimensionLineRotations, elevationAngle);
      let rotation = mat4.create();
      let endsAngle = Math.atan2(dimensionLine.getYStart() - dimensionLine.getYEnd(),
        dimensionLine.getXEnd() - dimensionLine.getXStart());
      mat4.fromYRotation(rotation, endsAngle);
      mat4.mul(this.dimensionLineRotations, this.dimensionLineRotations, rotation);
      rotation = mat4.create();
      mat4.fromXRotation(rotation, -dimensionLine.getPitch());
      mat4.mul(this.dimensionLineRotations, this.dimensionLineRotations, rotation);
      mat4.mul(startPointTransform, startPointTransform, this.dimensionLineRotations);

      let offsetTransform = mat4.create();
      mat4.fromTranslation(offsetTransform, vec3.fromValues(0, 0, offset));
      mat4.mul(startPointTransform, startPointTransform, offsetTransform);
      transformGroup.setTransform(startPointTransform);

      // Handle dimension lines
      let endMarkSize = dimensionLine.getEndMarkSize() / 2;
      let linesCoordinates = new Array(7 * 2);
      linesCoordinates[0] = vec3.fromValues(0, 0, 0);
      linesCoordinates[1] = vec3.fromValues(dimensionLineLength, 0, 0);
      linesCoordinates[2] = vec3.fromValues(-endMarkSize, 0, endMarkSize);
      linesCoordinates[3] = vec3.fromValues(endMarkSize, 0, -endMarkSize);
      linesCoordinates[4] = vec3.fromValues(0, 0, endMarkSize);
      linesCoordinates[5] = vec3.fromValues(0, 0, -endMarkSize);
      linesCoordinates[6] = vec3.fromValues(dimensionLineLength - endMarkSize, 0, endMarkSize);
      linesCoordinates[7] = vec3.fromValues(dimensionLineLength + endMarkSize, 0, -endMarkSize);
      linesCoordinates[8] = vec3.fromValues(dimensionLineLength, 0, endMarkSize);
      linesCoordinates[9] = vec3.fromValues(dimensionLineLength, 0, -endMarkSize);
      linesCoordinates[10] = vec3.fromValues(0, 0, -offset);
      linesCoordinates[11] = vec3.fromValues(0, 0, -endMarkSize);
      linesCoordinates[12] = vec3.fromValues(dimensionLineLength, 0, -offset);
      linesCoordinates[13] = vec3.fromValues(dimensionLineLength, 0, -endMarkSize);
      let lines = new IndexedLineArray3D(linesCoordinates,
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
      linesShape.setGeometry(lines, 0);
      selectionLinesShape.setGeometry(lines, 0);
      this.updateAppearanceMaterial(linesAppearance, dimensionLine.getColor() != null ? dimensionLine.getColor() : 0, 0, 0);

      let home = this.getHome();
      let selectionVisible = this.getUserPreferences() != null
        && this.getUserPreferences().isEditingIn3DViewEnabled()
        && home.isItemSelected(dimensionLine);
      // As there's no line thickness in WebGL just display either shapes
      selectionAppearance.setVisible(selectionVisible);
      linesAppearance.setVisible(!selectionVisible)

      this.updateLengthLabelDirection(home.getCamera());

      let dimensionLine3D = this;
      if (this.cameraChangeListener == null) {
        // Add camera listener to update length label direction
        this.cameraChangeListener = ev => {
          let dimensionLine = dimensionLine3D.getUserData();
          if (dimensionLine3D.getChildren().length > 0
            && dimensionLine.isVisibleIn3D()
            && (dimensionLine.getLevel() == null
              || dimensionLine.getLevel().isViewableAndVisible())) {
            let propertyName = ev.getPropertyName();
            if ("X" == propertyName
              || "Y" == propertyName
              || "Z" == propertyName) {
              dimensionLine3D.updateLengthLabelDirection(ev.getSource());
            }
          }
        };
        this.homeCameraListener = ev => {
          ev.getOldValue().removePropertyChangeListener(dimensionLine3D.cameraChangeListener);
          ev.getNewValue().addPropertyChangeListener(dimensionLine3D.cameraChangeListener);
          dimensionLine3D.updateLengthLabelDirection(home.getCamera());
        };
        this.dimensionLinesListener = ev => {
          if (ev.getType() === CollectionEvent.Type.DELETE
            && ev.getItem() === dimensionLine) {
            home.getCamera().removePropertyChangeListener(dimensionLine3D.cameraChangeListener);
            home.removePropertyChangeListener("CAMERA", dimensionLine3D.homeCameraListener);
            home.removeDimensionLinesListener(dimensionLine3D.dimensionLinesListener);
          }
        };
        home.getCamera().addPropertyChangeListener(this.cameraChangeListener);
        home.addPropertyChangeListener("CAMERA", this.homeCameraListener);
        home.addDimensionLinesListener(this.dimensionLinesListener);
      }
    } else {
      this.removeAllChildren();
      this.dimensionLineRotations = null;
      if (this.cameraChangeListener != null) {
        this.getHome().getCamera().removePropertyChangeListener(this.cameraChangeListener);
        this.getHome().removePropertyChangeListener("CAMERA", this.homeCameraListener);
        this.getHome().removeDimensionLinesListener(this.dimensionLinesListener);
        this.cameraChangeListener = null;
        this.homeCameraListener = null;
        this.dimensionLinesListener = null;
      }
    }
  }

  /**
   * Updates length label direction to ensure it's always visible in the direction of writing.
   * @param {Camera} camera
   * @private
   */
  updateLengthLabelDirection(camera) {
    let dimensionLine = this.getUserData();
    let dimensionLineNormal = vec3.fromValues(0, 1, 0);
    vec3.transformMat4(dimensionLineNormal, dimensionLineNormal, this.dimensionLineRotations);

    let cameraToDimensionLineDirection = vec3.fromValues((dimensionLine.getXEnd() + dimensionLine.getXStart()) / 2 - camera.getX(),
      (dimensionLine.getElevationEnd() + dimensionLine.getElevationStart()) / 2 - camera.getZ(),
      (dimensionLine.getYEnd() + dimensionLine.getYStart()) / 2 - camera.getY());

    let labelTransformGroup = this.getChild(0).getChild(0).getChild(0);
    let labelTransform = mat4.create();
    mat4.fromTranslation(labelTransform, vec3.fromValues(dimensionLine.getLength() / 2, 0, 0));
    let labelRotation = mat4.create();
    mat4.fromZRotation(labelRotation, vec3.dot(dimensionLineNormal, cameraToDimensionLineDirection) > 0 ? Math.PI : 0);
    mat4.mul(labelTransform, labelTransform, labelRotation);
    labelTransformGroup.setTransform(labelTransform);
  }
}
