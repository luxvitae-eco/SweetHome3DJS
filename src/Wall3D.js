/*
 * Wall3D.js
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
import { vec2, vec3, mat4 } from 'gl-matrix';

import {
  PieceOfFurniture,
  HomeDoorOrWindow,
  HomeFurnitureGroup,
} from './SweetHome3D';

import { Object3DBranch } from './Object3DBranch';
import {
  Group3D, Shape3D, Appearance3D, TransformGroup3D,
  GeometryInfo3D, IndexedLineArray3D,
} from './scene3d';
import { TextureManager } from './TextureManager';

/**
 * Creates the 3D wall matching the given home <code>wall</code>.
 * @param {Wall} wall
 * @param {Home} home
 * @param {UserPreferences} [preferences]
 * @param {boolean} waitModelAndTextureLoadingEnd
 * @constructor
 * @extends Object3DBranch
 * @author Emmanuel Puybaret
 */
export class Wall3D extends Object3DBranch {
  constructor(wall, home, preferences, waitModelAndTextureLoadingEnd) {
    if (waitModelAndTextureLoadingEnd === undefined) {
      // 3 parameters
      waitModelAndTextureLoadingEnd = preferences;
      preferences = null;
    }
    super(wall, home, preferences);

    for (let i = 0; i < 8; i++) {
      let wallSideGroup = new Group3D();
      wallSideGroup.addChild(this.createWallPartShape());
      this.addChild(wallSideGroup);
    }

    // Add selection node
    let wallSelectionShape = new Shape3D();
    wallSelectionShape.setAppearance(this.getSelectionAppearance());
    wallSelectionShape.setCapability(Shape3D.ALLOW_GEOMETRY_WRITE);
    wallSelectionShape.setPickable(false);
    this.addChild(wallSelectionShape);

    this.updateWallGeometry(waitModelAndTextureLoadingEnd);
    this.updateWallAppearance(waitModelAndTextureLoadingEnd);
  }

  /**
   * Returns a new wall part shape with no geometry and a default appearance with
   * a white material.
   * @return {Node3D}
   * @private
   */
  createWallPartShape() {
    let wallShape = new Shape3D();
    wallShape.setCapability(Shape3D.ALLOW_GEOMETRY_WRITE);
    let wallAppearance = new Appearance3D();
    wallShape.setAppearance(wallAppearance);
    this.updateAppearanceMaterial(wallAppearance, Object3DBranch.DEFAULT_COLOR, Object3DBranch.DEFAULT_AMBIENT_COLOR, 0);
    return wallShape;
  }

  update() {
    this.updateWallGeometry(false);
    this.updateWallAppearance(false);
  }

  /**
   * Sets the 3D geometry of this wall shapes that matches its 2D geometry.
   * @param {boolean} waitDoorOrWindowModelsLoadingEnd
   * @private
   */
  updateWallGeometry(waitDoorOrWindowModelsLoadingEnd) {
    this.updateWallSideGeometry(Wall3D.WALL_LEFT_SIDE, waitDoorOrWindowModelsLoadingEnd);
    this.updateWallSideGeometry(Wall3D.WALL_RIGHT_SIDE, waitDoorOrWindowModelsLoadingEnd);
    this.setPickable(this.getHome().getEnvironment().getWallsAlpha() == 0);

    let wallSelectionShape = this.getChild(8);
    wallSelectionShape.addGeometry(this.createWallSelectionGeometry());
    if (wallSelectionShape.getGeometries().length > 1) {
      wallSelectionShape.removeGeometry(0);
    }
  }

  updateWallSideGeometry(wallSide, waitDoorOrWindowModelsLoadingEnd) {
    let wall = this.getUserData();
    let wallTexture;
    let baseboard;
    if (wallSide === Wall3D.WALL_LEFT_SIDE) {
      wallTexture = wall.getLeftSideTexture();
      baseboard = wall.getLeftSideBaseboard();
    } else {
      wallTexture = wall.getRightSideTexture();
      baseboard = wall.getRightSideBaseboard();
    }
    let wallSideGroups = [this.getChild(wallSide),
    this.getChild(wallSide + 2),
    this.getChild(wallSide + 4),
    this.getChild(wallSide + 6)];
    let wallFilledShapes = new Array(wallSideGroups.length);
    let currentGeometriesCounts = new Array(wallSideGroups.length);
    for (var i = 0; i < wallSideGroups.length; i++) {
      wallFilledShapes[i] = wallSideGroups[i].getChild(0);
      currentGeometriesCounts[i] = wallFilledShapes[i].getGeometries().length;
    }
    if (wall.getLevel() == null || wall.getLevel().isViewableAndVisible()) {
      let wallGeometries = [[], [], [], []];
      this.createWallGeometries(wallGeometries[0], wallGeometries[2], wallGeometries[3], wallSide,
        null, wallTexture, waitDoorOrWindowModelsLoadingEnd);
      if (baseboard != null) {
        let baseboardTexture = baseboard.getTexture();
        if (baseboardTexture === null && baseboard.getColor() === null) {
          baseboardTexture = wallTexture;
        }
        this.createWallGeometries(wallGeometries[1], wallGeometries[1], wallGeometries[1], wallSide,
          baseboard, baseboardTexture, waitDoorOrWindowModelsLoadingEnd);
      }
      for (var i = 0; i < wallSideGroups.length; i++) {
        for (var j = 0; j < wallGeometries[i].length; j++) {
          let wallGeometry = wallGeometries[i][j];
          if (wallGeometry !== null) {
            wallFilledShapes[i].addGeometry(wallGeometry);
          }
        }
      }
    }
    for (var i = 0; i < wallSideGroups.length; i++) {
      for (var j = currentGeometriesCounts[i] - 1; j >= 0; j--) {
        wallFilledShapes[i].removeGeometry(j);
      }
    }
  }

  /**
  * Creates <code>wall</code> or baseboard geometries computed with windows or doors
  * that intersect wall.
  * @param {Array} bottomGeometries
  * @param {Array} sideGeometries
  * @param {Array} topGeometries
  * @param {number} wallSide
  * @param {Baseboard} baseboard
  * @param {HomeTexture} texture
  * @param {boolean} waitDoorOrWindowModelsLoadingEnd
  * @private
  */
  createWallGeometries(
    bottomGeometries,
    sideGeometries,
    topGeometries,
    wallSide,
    baseboard,
    texture,
    waitDoorOrWindowModelsLoadingEnd
  ) {
    let wall = this.getUserData();
    let wallShape = this.getShape(wall.getPoints());
    let wallSidePoints = this.getWallSidePoints(wallSide);
    let wallSideShape = this.getShape(wallSidePoints);
    let wallSideOrBaseboardPoints = baseboard == null
      ? wallSidePoints
      : this.getWallBaseboardPoints(wallSide);
    let wallSideOrBaseboardShape = this.getShape(wallSideOrBaseboardPoints);
    let wallSideOrBaseboardArea = new java.awt.geom.Area(wallSideOrBaseboardShape);
    let textureReferencePoint = wallSide === Wall3D.WALL_LEFT_SIDE
      ? wallSideOrBaseboardPoints[0].slice(0)
      : wallSideOrBaseboardPoints[wallSideOrBaseboardPoints.length - 1].slice(0);
    let wallElevation = this.getWallElevation(baseboard !== null);
    let topElevationAtStart;
    let topElevationAtEnd;
    if (baseboard === null) {
      topElevationAtStart = this.getWallTopElevationAtStart();
      topElevationAtEnd = this.getWallTopElevationAtEnd();
    } else {
      topElevationAtStart =
        topElevationAtEnd = this.getBaseboardTopElevation(baseboard);
    }
    let maxTopElevation = Math.max(topElevationAtStart, topElevationAtEnd);

    let wallYawAngle = Math.atan2(wall.getYEnd() - wall.getYStart(), wall.getXEnd() - wall.getXStart());
    let cosWallYawAngle = Math.cos(wallYawAngle);
    let sinWallYawAngle = Math.sin(wallYawAngle);
    let wallXStartWithZeroYaw = cosWallYawAngle * wall.getXStart() + sinWallYawAngle * wall.getYStart();
    let wallXEndWithZeroYaw = cosWallYawAngle * wall.getXEnd() + sinWallYawAngle * wall.getYEnd();
    let arcExtent = wall.getArcExtent();
    let roundWall = arcExtent !== null && arcExtent !== 0;
    let topLineAlpha;
    let topLineBeta;
    if (topElevationAtStart === topElevationAtEnd) {
      topLineAlpha = 0;
      topLineBeta = topElevationAtStart;
    } else {
      topLineAlpha = (topElevationAtEnd - topElevationAtStart) / (wallXEndWithZeroYaw - wallXStartWithZeroYaw);
      topLineBeta = topElevationAtStart - topLineAlpha * wallXStartWithZeroYaw;
    }
    let windowIntersections = [];
    let intersectingDoorOrWindows = [];
    let visibleDoorsAndWindows = this.getVisibleDoorsAndWindows(this.getHome().getFurniture());
    for (var i = 0; i < visibleDoorsAndWindows.length; i++) {
      var piece = visibleDoorsAndWindows[i];
      let pieceElevation = piece.getGroundElevation();
      if (pieceElevation + piece.getHeight() > wallElevation
        && pieceElevation < maxTopElevation) {
        let pieceArea = new java.awt.geom.Area(this.getShape(piece.getPoints()));
        let intersectionArea = new java.awt.geom.Area(wallShape);
        intersectionArea.intersect(pieceArea);
        if (!intersectionArea.isEmpty()) {
          let deeperPiece = null;
          if (piece.isParallelToWall(wall)) {
            if (baseboard !== null) {
              // Increase piece depth to ensure baseboard will be cut even if the window is as thick as the wall
              deeperPiece = piece.clone();
              deeperPiece.setDepthInPlan(deeperPiece.getDepth() + 2 * baseboard.getThickness());
            }
            if (typeof HomeDoorOrWindow !== "undefined"
              && piece instanceof HomeDoorOrWindow) {
              if (piece.isWallCutOutOnBothSides()) {
                if (deeperPiece === null) {
                  deeperPiece = piece.clone();
                }
                // Increase piece depth to ensure the wall will be cut on both sides 
                deeperPiece.setDepthInPlan(deeperPiece.getDepth() + 4 * wall.getThickness());
              }
            }
          }
          // Recompute intersection on wall side shape only
          if (deeperPiece !== null) {
            pieceArea = new java.awt.geom.Area(this.getShape(deeperPiece.getPoints()));
            intersectionArea = new java.awt.geom.Area(wallSideOrBaseboardShape);
            intersectionArea.intersect(pieceArea);
          } else {
            intersectionArea = new java.awt.geom.Area(wallSideShape);
            intersectionArea.intersect(pieceArea);
          }
          if (!intersectionArea.isEmpty()
            && (!wall.isTrapezoidal()
              || pieceElevation < this.getMaxElevationAtWallIntersection(intersectionArea, cosWallYawAngle, sinWallYawAngle, topLineAlpha, topLineBeta))) {
            windowIntersections.push(new Wall3D.DoorOrWindowArea(intersectionArea, [piece]));
            intersectingDoorOrWindows.push(piece);
            wallSideOrBaseboardArea.subtract(pieceArea);
          }
        }
      }
    }
    if (windowIntersections.length > 1) {
      for (let windowIndex = 0; windowIndex < windowIntersections.length; windowIndex++) {
        var windowIntersection = windowIntersections[windowIndex];
        let otherWindowIntersections = [];
        let otherWindowIndex = 0;
        for (var i = 0; i < windowIntersections.length; i++) {
          let otherWindowIntersection = windowIntersections[i];
          if (windowIntersection.getArea().isEmpty()) {
            break;
          } else if (otherWindowIndex > windowIndex) {
            let windowsIntersectionArea = new java.awt.geom.Area(otherWindowIntersection.getArea());
            windowsIntersectionArea.intersect(windowIntersection.getArea());
            if (!windowsIntersectionArea.isEmpty()) {
              otherWindowIntersection.getArea().subtract(windowsIntersectionArea);
              windowIntersection.getArea().subtract(windowsIntersectionArea);
              var doorsOrWindows = (windowIntersection.getDoorsOrWindows().slice(0));
              doorsOrWindows.push.apply(doorsOrWindows, otherWindowIntersection.getDoorsOrWindows());
              otherWindowIntersections.push(new Wall3D.DoorOrWindowArea(windowsIntersectionArea, doorsOrWindows));
            }
          }
          otherWindowIndex++;
        }
        windowIntersections.push.apply(windowIntersections, otherWindowIntersections);
      }
    }
    let points = [];
    let previousPoint = null;
    for (var it = wallSideOrBaseboardArea.getPathIterator(null); !it.isDone(); it.next()) {
      var wallPoint = [0, 0];
      if (it.currentSegment(wallPoint) === java.awt.geom.PathIterator.SEG_CLOSE) {
        if (points.length > 2) {
          if (points[0][0] === points[points.length - 1][0]
            && points[0][1] === points[points.length - 1][1]) {
            points.splice(points.length - 1, 1);
          }
          if (points.length > 2) {
            var wallPartPoints = points.slice(0);
            sideGeometries.push(this.createVerticalPartGeometry(wall, wallPartPoints, wallElevation,
              cosWallYawAngle, sinWallYawAngle, topLineAlpha, topLineBeta, baseboard, texture,
              textureReferencePoint, wallSide));
            bottomGeometries.push(this.createHorizontalPartGeometry(wallPartPoints, wallElevation, true, roundWall));
            topGeometries.push(this.createTopPartGeometry(wallPartPoints,
              cosWallYawAngle, sinWallYawAngle, topLineAlpha, topLineBeta, roundWall));
          }
        }
        points.length = 0;
        previousPoint = null;
      } else if (previousPoint === null
        || wallPoint[0] !== previousPoint[0]
        || wallPoint[1] !== previousPoint[1]) {
        points.push(wallPoint);
        previousPoint = wallPoint;
      }
    }

    let level = wall.getLevel();
    previousPoint = null;
    for (let index = 0; index < windowIntersections.length; index++) {
      var windowIntersection = windowIntersections[index];
      if (!windowIntersection.getArea().isEmpty()) {
        for (var it = windowIntersection.getArea().getPathIterator(null); !it.isDone(); it.next()) {
          var wallPoint = [0, 0];
          if (it.currentSegment(wallPoint) === java.awt.geom.PathIterator.SEG_CLOSE) {
            if (points[0][0] === points[points.length - 1][0]
              && points[0][1] === points[points.length - 1][1]) {
              points.splice(points.length - 1, 1);
            }

            if (points.length > 2) {
              var wallPartPoints = points.slice(0);
              var doorsOrWindows = windowIntersection.getDoorsOrWindows();
              if (doorsOrWindows.length > 1) {
                doorsOrWindows.sort((piece1, piece2) => {
                  let piece1Elevation = piece1.getGroundElevation();
                  let piece2Elevation = piece2.getGroundElevation();
                  if (piece1Elevation < piece2Elevation) {
                    return -1;
                  } else if (piece1Elevation > piece2Elevation) {
                    return 1;
                  } else {
                    return 0;
                  }
                });
              }
              let lowestDoorOrWindow = doorsOrWindows[0];
              let lowestDoorOrWindowElevation = lowestDoorOrWindow.getGroundElevation();
              if (lowestDoorOrWindowElevation > wallElevation) {
                if (level != null
                  && level.getElevation() !== wallElevation
                  && lowestDoorOrWindow.getElevation() < Wall3D.LEVEL_ELEVATION_SHIFT) {
                  lowestDoorOrWindowElevation -= Wall3D.LEVEL_ELEVATION_SHIFT;
                }
                sideGeometries.push(this.createVerticalPartGeometry(wall, wallPartPoints, wallElevation,
                  cosWallYawAngle, sinWallYawAngle, 0, lowestDoorOrWindowElevation, baseboard, texture,
                  textureReferencePoint, wallSide));
                bottomGeometries.push(this.createHorizontalPartGeometry(wallPartPoints, wallElevation, true, roundWall));
                sideGeometries.push(this.createHorizontalPartGeometry(wallPartPoints,
                  lowestDoorOrWindowElevation, false, roundWall));
              }
              for (var i = 0; i < doorsOrWindows.length - 1;) {
                let lowerDoorOrWindow = doorsOrWindows[i];
                let lowerDoorOrWindowElevation = lowerDoorOrWindow.getGroundElevation();
                let higherDoorOrWindow = doorsOrWindows[++i];
                let higherDoorOrWindowElevation = higherDoorOrWindow.getGroundElevation();
                while ((lowerDoorOrWindowElevation + lowerDoorOrWindow.getHeight() >= higherDoorOrWindowElevation + higherDoorOrWindow.getHeight()
                  && ++i < doorsOrWindows.length)) {
                  higherDoorOrWindow = doorsOrWindows[i];
                }
                if (i < doorsOrWindows.length
                  && lowerDoorOrWindowElevation + lowerDoorOrWindow.getHeight() < higherDoorOrWindowElevation) {
                  sideGeometries.push(this.createVerticalPartGeometry(wall, wallPartPoints, lowerDoorOrWindowElevation + lowerDoorOrWindow.getHeight(),
                    cosWallYawAngle, sinWallYawAngle, 0, higherDoorOrWindowElevation, baseboard, texture, textureReferencePoint, wallSide));
                  sideGeometries.push(this.createHorizontalPartGeometry(wallPartPoints,
                    lowerDoorOrWindowElevation + lowerDoorOrWindow.getHeight(), true, roundWall));
                  sideGeometries.push(this.createHorizontalPartGeometry(wallPartPoints, higherDoorOrWindowElevation, false, roundWall));
                }
              }
              let highestDoorOrWindow = doorsOrWindows[doorsOrWindows.length - 1];
              let highestDoorOrWindowElevation = highestDoorOrWindow.getGroundElevation();
              for (var i = doorsOrWindows.length - 2; i >= 0; i--) {
                let doorOrWindow = doorsOrWindows[i];
                if (doorOrWindow.getGroundElevation() + doorOrWindow.getHeight() > highestDoorOrWindowElevation + highestDoorOrWindow.getHeight()) {
                  highestDoorOrWindow = doorOrWindow;
                }
              }
              let doorOrWindowTop = highestDoorOrWindowElevation + highestDoorOrWindow.getHeight();
              let generateGeometry = true;
              for (var i = 0; i < wallPartPoints.length; i++) {
                let xTopPointWithZeroYaw = cosWallYawAngle * wallPartPoints[i][0] + sinWallYawAngle * wallPartPoints[i][1];
                let topPointWithZeroYawElevation = topLineAlpha * xTopPointWithZeroYaw + topLineBeta;
                if (doorOrWindowTop > topPointWithZeroYawElevation) {
                  if (topLineAlpha === 0 || roundWall) {
                    generateGeometry = false;
                    break;
                  }
                  let translation = (doorOrWindowTop - topPointWithZeroYawElevation) / topLineAlpha;
                  wallPartPoints[i][0] += (translation * cosWallYawAngle);
                  wallPartPoints[i][1] += (translation * sinWallYawAngle);
                }
              }
              if (generateGeometry) {
                sideGeometries.push(this.createVerticalPartGeometry(wall, wallPartPoints, doorOrWindowTop,
                  cosWallYawAngle, sinWallYawAngle, topLineAlpha, topLineBeta, baseboard, texture, textureReferencePoint, wallSide));
                sideGeometries.push(this.createHorizontalPartGeometry(wallPartPoints, doorOrWindowTop, true, roundWall));
                topGeometries.push(this.createTopPartGeometry(wallPartPoints,
                  cosWallYawAngle, sinWallYawAngle, topLineAlpha, topLineBeta, roundWall));
              }
            }
            points.length = 0;
            previousPoint = null;
          } else if (previousPoint == null
            || wallPoint[0] !== previousPoint[0]
            || wallPoint[1] !== previousPoint[1]) {
            points.push(wallPoint);
            previousPoint = wallPoint;
          }
        }
      }
    }

    if (!roundWall && intersectingDoorOrWindows.length > 0) {
      let epsilon = Math.PI / 720;
      let missingModels = [];
      for (var i = 0; i < intersectingDoorOrWindows.length; i++) {
        var piece = intersectingDoorOrWindows[i];
        if (typeof HomeDoorOrWindow !== "undefined"
          && piece instanceof HomeDoorOrWindow
          && (PieceOfFurniture.DEFAULT_CUT_OUT_SHAPE != piece.getCutOutShape()
            || piece.getWallWidth() !== 1
            || piece.getWallLeft() !== 0
            || piece.getWallHeight() !== 1
            || piece.getWallTop() !== 0)) {
          let angleDifference = Math.abs(wallYawAngle - piece.getAngle()) % (2 * Math.PI);
          if (angleDifference < epsilon
            || angleDifference > 2 * Math.PI - epsilon
            || Math.abs(angleDifference - Math.PI) < epsilon) {
            let frontOrBackSide = Math.abs(angleDifference - Math.PI) < epsilon ? 1 : -1;
            let rotatedModelFrontArea = Wall3D.getRotatedModelFrontArea(piece);
            if (rotatedModelFrontArea !== null
              && (missingModels.length === 0 || !waitDoorOrWindowModelsLoadingEnd)) {
              this.createGeometriesSurroundingDoorOrWindow(piece, rotatedModelFrontArea, frontOrBackSide,
                wall, sideGeometries, topGeometries,
                wallSideOrBaseboardPoints, wallElevation, cosWallYawAngle, sinWallYawAngle, topLineAlpha, topLineBeta,
                texture, textureReferencePoint, wallSide);
            } else {
              missingModels.push(piece);
            }
          }
        }
      }
      if (missingModels.length > 0) {
        let modelManager = ModelManager.getInstance();
        missingModels = missingModels.slice(0);
        let wall3d = this;
        for (var i = 0; i < missingModels.length; i++) {
          let modelObserver = {
            doorOrWindow: missingModels[i],
            modelUpdated: function (modelRoot) {
              let rotatedModelFrontArea = Wall3D.getRotatedModelFrontArea(this.doorOrWindow);
              let frontArea;
              if (rotatedModelFrontArea === null) {
                let rotation = new TransformGroup3D(modelManager.getRotationTransformation(this.doorOrWindow.getModelRotation()));
                rotation.addChild(modelRoot);
                frontArea = modelManager.getFrontArea(this.doorOrWindow.getCutOutShape(), rotation);
                Wall3D.rotatedModelsFrontAreas.push({
                  model: this.doorOrWindow.getModel(),
                  modelRotation: this.doorOrWindow.getModelRotation(),
                  cutOutShape: this.doorOrWindow.getCutOutShape(),
                  frontArea: frontArea
                });
              }

              let angleDifference = Math.abs(wallYawAngle - this.doorOrWindow.getAngle()) % (2 * Math.PI);
              let frontOrBackSide = Math.abs(angleDifference - Math.PI) < epsilon ? 1 : -1;
              if (waitDoorOrWindowModelsLoadingEnd) {
                wall3d.createGeometriesSurroundingDoorOrWindow(this.doorOrWindow, frontArea, frontOrBackSide,
                  wall, sideGeometries, topGeometries, wallSideOrBaseboardPoints, wallElevation, cosWallYawAngle, sinWallYawAngle, topLineAlpha, topLineBeta,
                  texture, textureReferencePoint, wallSide);
              } else {
                missingModels.splice(missingModels.indexOf(this.doorOrWindow), 1);
                if (missingModels.length === 0
                  && this.baseboard == null) {
                  setTimeout(() => {
                    wall3d.updateWallSideGeometry(wallSide, waitDoorOrWindowModelsLoadingEnd);
                  }, 0);
                }
              }
            },
            modelError: function (ex) {
              if (Wall3D.getRotatedModelFrontArea(this.doorOrWindow) === null) {
                Wall3D.rotatedModelsFrontAreas.push({
                  model: this.doorOrWindow.getModel(),
                  modelRotation: this.doorOrWindow.getModelRotation(),
                  cutOutShape: this.doorOrWindow.getCutOutShape(),
                  frontArea: Wall3D.FULL_FACE_CUT_OUT_AREA
                });
              }
              if (!waitDoorOrWindowModelsLoadingEnd) {
                missingModels.splice(missingModels.indexOf(this.doorOrWindow), 1);
              }
            }
          };
          modelManager.loadModel(missingModels[i].getModel(), waitDoorOrWindowModelsLoadingEnd, modelObserver);
        }
      }
    }
  }

  /**
   * Returns the front area of the given piece if already computed. 
   * @private
   */
  static getRotatedModelFrontArea(piece) {
    let rotatedModelFrontArea = null;
    for (let j = 0; j < Wall3D.rotatedModelsFrontAreas.length; j++) {
      if (Wall3D.rotatedModelsFrontAreas[j].model.equals(piece.getModel())
        && Object3DBranch.areModelRotationsEqual(Wall3D.rotatedModelsFrontAreas[j].modelRotation, piece.getModelRotation())
        && Wall3D.rotatedModelsFrontAreas[j].cutOutShape == piece.getCutOutShape()) {
        return Wall3D.rotatedModelsFrontAreas[j].frontArea;
      }
    }
    return null;
  }

  /**
  * Returns all the visible doors and windows in the given <code>furniture</code>.
  * @param {Array} furniture
  * @return {Array}
  * @private
  */
  getVisibleDoorsAndWindows(furniture) {
    let visibleDoorsAndWindows = [];
    for (let i = 0; i < furniture.length; i++) {
      let piece = furniture[i];
      if (piece.isVisible()
        && (piece.getLevel() == null
          || piece.getLevel().isViewableAndVisible())) {
        if (piece instanceof HomeFurnitureGroup) {
          visibleDoorsAndWindows.push.apply(visibleDoorsAndWindows, this.getVisibleDoorsAndWindows(piece.getFurniture()));
        } else if (piece.isDoorOrWindow()) {
          visibleDoorsAndWindows.push(piece);
        }
      }
    }
    return visibleDoorsAndWindows;
  }

  /**
  * Returns the points of one of the side of this wall.
  * @param {number} wallSide
  * @return {Array}
  * @private
  */
  getWallSidePoints(wallSide) {
    let wall = this.getUserData();
    let wallPoints = wall.getPoints();

    if (wallSide === Wall3D.WALL_LEFT_SIDE) {
      for (let i = (wallPoints.length / 2 | 0); i < wallPoints.length; i++) {
        wallPoints[i][0] = (wallPoints[i][0] + wallPoints[wallPoints.length - i - 1][0]) / 2;
        wallPoints[i][1] = (wallPoints[i][1] + wallPoints[wallPoints.length - i - 1][1]) / 2;
      }
    } else {
      for (let i = 0, n = (wallPoints.length / 2 | 0); i < n; i++) {
        wallPoints[i][0] = (wallPoints[i][0] + wallPoints[wallPoints.length - i - 1][0]) / 2;
        wallPoints[i][1] = (wallPoints[i][1] + wallPoints[wallPoints.length - i - 1][1]) / 2;
      }
    }
    return wallPoints;
  }

  /**
  * Returns the points of one of the baseboard of this wall.
  * @param {number} wallSide
  * @return {Array}
  * @private
  */
  getWallBaseboardPoints(wallSide) {
    let wall = this.getUserData();
    let wallPointsIncludingBaseboards = wall.getPoints$boolean(true);
    let wallPoints = wall.getPoints();

    if (wallSide === Wall3D.WALL_LEFT_SIDE) {
      for (let i = Math.floor(wallPointsIncludingBaseboards.length / 2); i < wallPointsIncludingBaseboards.length; i++) {
        wallPointsIncludingBaseboards[i] = wallPoints[wallPoints.length - i - 1];
      }
    } else {
      for (let i = 0, n = Math.floor(wallPoints.length / 2); i < n; i++) {
        wallPointsIncludingBaseboards[i] = wallPoints[wallPoints.length - i - 1];
      }
    }
    return wallPointsIncludingBaseboards;
  }

  /**
  * Returns the vertical rectangles that join each point of <code>points</code>
  * and spread from <code>minElevation</code> to a top line (y = ax + b) described by <code>topLineAlpha</code>
  * and <code>topLineBeta</code> factors in a vertical plan that is rotated around
  * vertical axis matching <code>cosWallYawAngle</code> and <code>sinWallYawAngle</code>.
  * @param {Wall} wall
  * @param {Array} points
  * @param {number} minElevation
  * @param {number} cosWallYawAngle
  * @param {number} sinWallYawAngle
  * @param {number} topLineAlpha
  * @param {number} topLineBeta
  * @param {Baseboard} baseboard
  * @param {HomeTexture} texture
  * @param {Array} textureReferencePoint
  * @param {number} wallSide
  * @return {IndexedGeometryArray3D}
  * @private
  */
  createVerticalPartGeometry(
    wall,
    points,
    minElevation,
    cosWallYawAngle,
    sinWallYawAngle,
    topLineAlpha,
    topLineBeta,
    baseboard,
    texture,
    textureReferencePoint,
    wallSide
  ) {
    let subpartSize = this.getHome().getEnvironment().getSubpartSizeUnderLight();
    let arcExtent = wall.getArcExtent();
    if ((arcExtent === null || arcExtent === 0) && subpartSize > 0) {
      let pointsList = [];
      pointsList.push(points[0]);
      for (var i = 1; i < points.length; i++) {
        let distance = java.awt.geom.Point2D.distance(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1]) - subpartSize / 2;
        let angle = Math.atan2(points[i][1] - points[i - 1][1], points[i][0] - points[i - 1][0]);
        let cosAngle = Math.cos(angle);
        let sinAngle = Math.sin(angle);
        for (let d = 0; d < distance; d += subpartSize) {
          pointsList.push([(points[i - 1][0] + d * cosAngle), (points[i - 1][1] + d * sinAngle)]);
        }
        pointsList.push(points[i]);
      }
      points = pointsList.slice(0);
    }

    let bottom = new Array(points.length);
    let top = new Array(points.length);
    let pointUCoordinates = new Array(points.length);
    let xStart = wall.getXStart();
    let yStart = wall.getYStart();
    let xEnd = wall.getXEnd();
    let yEnd = wall.getYEnd();
    let arcCircleCenter = null;
    let arcCircleRadius = 0;
    let referencePointAngle = 0;
    if (arcExtent !== null && arcExtent !== 0) {
      arcCircleCenter = [wall.getXArcCircleCenter(), wall.getYArcCircleCenter()];
      arcCircleRadius = java.awt.geom.Point2D.distance(arcCircleCenter[0], arcCircleCenter[1], xStart, yStart);
      referencePointAngle = Math.fround(Math.atan2(textureReferencePoint[1] - arcCircleCenter[1], textureReferencePoint[0] - arcCircleCenter[0]));
    }
    for (var i = 0; i < points.length; i++) {
      bottom[i] = vec3.fromValues(points[i][0], minElevation, points[i][1]);
      let topY = this.getWallPointElevation(points[i][0], points[i][1], cosWallYawAngle, sinWallYawAngle, topLineAlpha, topLineBeta);
      top[i] = vec3.fromValues(points[i][0], topY, points[i][1]);
    }
    let distanceSqToWallMiddle = new Array(points.length);
    for (var i = 0; i < points.length; i++) {
      if (arcCircleCenter === null) {
        distanceSqToWallMiddle[i] = java.awt.geom.Line2D.ptLineDistSq(xStart, yStart, xEnd, yEnd, bottom[i][0], bottom[i][2]);
      } else {
        distanceSqToWallMiddle[i] = arcCircleRadius - java.awt.geom.Point2D.distance(arcCircleCenter[0], arcCircleCenter[1], bottom[i][0], bottom[i][2]);
        distanceSqToWallMiddle[i] *= distanceSqToWallMiddle[i];
      }
    }
    let rectanglesCount = points.length;
    let usedRectangle = new Array(points.length);
    if (baseboard === null) {
      for (var i = 0; i < points.length - 1; i++) {
        usedRectangle[i] = distanceSqToWallMiddle[i] > 0.001
          || distanceSqToWallMiddle[i + 1] > 0.001;
        if (!usedRectangle[i]) {
          rectanglesCount--;
        }
      }
      usedRectangle[usedRectangle.length - 1] = distanceSqToWallMiddle[0] > 0.001
        || distanceSqToWallMiddle[points.length - 1] > 0.001;
      if (!usedRectangle[usedRectangle.length - 1]) {
        rectanglesCount--;
      }
      if (rectanglesCount === 0) {
        return null;
      }
    } else {
      for (var i = 0; i < usedRectangle.length; i++) {
        usedRectangle[i] = true;
      }
    }

    let coords = [];
    for (var index = 0; index < points.length; index++) {
      if (usedRectangle[index]) {
        var y = minElevation;
        let point1 = bottom[index];
        var nextIndex = (index + 1) % points.length;
        let point2 = bottom[nextIndex];
        if (subpartSize > 0) {
          for (var yMax = Math.min(top[index][1], top[nextIndex][1]) - subpartSize / 2; y < yMax; y += subpartSize) {
            coords.push(point1);
            coords.push(point2);
            point1 = vec3.fromValues(bottom[index][0], y, bottom[index][2]);
            point2 = vec3.fromValues(bottom[nextIndex][0], y, bottom[nextIndex][2]);
            coords.push(point2);
            coords.push(point1);
          }
        }
        coords.push(point1);
        coords.push(point2);
        coords.push(top[nextIndex]);
        coords.push(top[index]);
      }
    }

    let geometryInfo = new GeometryInfo3D(GeometryInfo3D.QUAD_ARRAY);
    geometryInfo.setCoordinates(coords.slice(0));

    if (texture !== null) {
      let halfThicknessSq;
      if (baseboard !== null) {
        halfThicknessSq = wall.getThickness() / 2 + baseboard.getThickness();
        halfThicknessSq *= halfThicknessSq;
      } else {
        halfThicknessSq = (wall.getThickness() * wall.getThickness()) / 4;
      }
      let textureCoords = new Array(coords.length);
      let firstTextureCoords = vec2.fromValues(0, minElevation);
      let j = 0;
      let epsilon = arcCircleCenter === null
        ? wall.getThickness() / 10000.0
        : halfThicknessSq / 4;
      for (var index = 0; index < points.length; index++) {
        if (usedRectangle[index]) {
          var nextIndex = (index + 1) % points.length;
          let textureCoords1;
          let textureCoords2;
          if (Math.abs(distanceSqToWallMiddle[index] - halfThicknessSq) < epsilon
            && Math.abs(distanceSqToWallMiddle[nextIndex] - halfThicknessSq) < epsilon) {
            let firstHorizontalTextureCoords;
            let secondHorizontalTextureCoords;
            if (arcCircleCenter === null) {
              firstHorizontalTextureCoords = java.awt.geom.Point2D.distance(textureReferencePoint[0], textureReferencePoint[1],
                points[index][0], points[index][1]);
              secondHorizontalTextureCoords = java.awt.geom.Point2D.distance(textureReferencePoint[0], textureReferencePoint[1],
                points[nextIndex][0], points[nextIndex][1]);
            } else {
              if (pointUCoordinates[index] === undefined) {
                var pointAngle = Math.fround(Math.atan2(points[index][1] - arcCircleCenter[1], points[index][0] - arcCircleCenter[0]));
                pointAngle = this.adjustAngleOnReferencePointAngle(pointAngle, referencePointAngle, arcExtent);
                pointUCoordinates[index] = (pointAngle - referencePointAngle) * arcCircleRadius;
              }
              if (pointUCoordinates[nextIndex] === undefined) {
                var pointAngle = Math.fround(Math.atan2(points[nextIndex][1] - arcCircleCenter[1], points[nextIndex][0] - arcCircleCenter[0]));
                pointAngle = this.adjustAngleOnReferencePointAngle(pointAngle, referencePointAngle, arcExtent);
                pointUCoordinates[nextIndex] = (pointAngle - referencePointAngle) * arcCircleRadius;
              }
              firstHorizontalTextureCoords = pointUCoordinates[index];
              secondHorizontalTextureCoords = pointUCoordinates[nextIndex];
            }
            if (wallSide === Wall3D.WALL_LEFT_SIDE && texture.isLeftToRightOriented()) {
              firstHorizontalTextureCoords = -firstHorizontalTextureCoords;
              secondHorizontalTextureCoords = -secondHorizontalTextureCoords;
            }

            textureCoords1 = vec2.fromValues(firstHorizontalTextureCoords, minElevation);
            textureCoords2 = vec2.fromValues(secondHorizontalTextureCoords, minElevation);
          } else {
            textureCoords1 = firstTextureCoords;
            let horizontalTextureCoords = java.awt.geom.Point2D.distance(points[index][0], points[index][1], points[nextIndex][0],
              points[nextIndex][1]);
            textureCoords2 = vec2.fromValues(horizontalTextureCoords, minElevation);
          }

          if (subpartSize > 0) {
            var y = minElevation;
            for (var yMax = Math.min(top[index][1], top[nextIndex][1]) - subpartSize / 2; y < yMax; y += subpartSize) {
              textureCoords[j++] = textureCoords1;
              textureCoords[j++] = textureCoords2;
              textureCoords1 = vec2.fromValues(textureCoords1[0], y);
              textureCoords2 = vec2.fromValues(textureCoords2[0], y);
              textureCoords[j++] = textureCoords2;
              textureCoords[j++] = textureCoords1;
            }
          }
          textureCoords[j++] = textureCoords1;
          textureCoords[j++] = textureCoords2;
          textureCoords[j++] = vec2.fromValues(textureCoords2[0], top[nextIndex][1]);
          textureCoords[j++] = vec2.fromValues(textureCoords1[0], top[index][1]);
        }
      }
      geometryInfo.setTextureCoordinates(textureCoords);
    }
    if (arcCircleCenter === null) {
      geometryInfo.setCreaseAngle(0);
    }
    geometryInfo.setGeneratedNormals(true);
    return geometryInfo.getIndexedGeometryArray();
  }

  /**
   * Returns the maximum wall elevation of each point of the given intersection.
   * @param {Area} pieceWallIntersection
   * @param {number} cosWallYawAngle
   * @param {number} sinWallYawAngle
   * @param {number} topLineAlpha
   * @param {number} topLineBeta
   * @return {number}
   * @private
   */
  getMaxElevationAtWallIntersection(
    pieceWallIntersection,
    cosWallYawAngle,
    sinWallYawAngle,
    topLineAlpha,
    topLineBeta
  ) {
    let maxElevation = -Infinity;
    for (let it = pieceWallIntersection.getPathIterator(null); !it.isDone(); it.next()) {
      let wallPoint = [0, 0];
      if (it.currentSegment(wallPoint) !== java.awt.geom.PathIterator.SEG_CLOSE) {
        maxElevation = Math.max(maxElevation, this.getWallPointElevation(wallPoint[0], wallPoint[1],
          cosWallYawAngle, sinWallYawAngle, topLineAlpha, topLineBeta));
      }
    }
    return maxElevation;
  }

  /**
  * Returns the elevation of the wall at the given point.
  * @param {number} xWallPoint
  * @param {number} yWallPoint
  * @param {number} cosWallYawAngle
  * @param {number} sinWallYawAngle
  * @param {number} topLineAlpha
  * @param {number} topLineBeta
  * @return {number}
  * @private
  */
  getWallPointElevation(
    xWallPoint,
    yWallPoint,
    cosWallYawAngle,
    sinWallYawAngle,
    topLineAlpha,
    topLineBeta
  ) {
    let xTopPointWithZeroYaw = cosWallYawAngle * xWallPoint + sinWallYawAngle * yWallPoint;
    return (topLineAlpha * xTopPointWithZeroYaw + topLineBeta);
  }

  /**
  * Returns <code>pointAngle</code> plus or minus 2 PI to ensure <code>pointAngle</code> value
  * will be greater or lower than <code>referencePointAngle</code> depending on <code>arcExtent</code> direction.
  * @param {number} pointAngle
  * @param {number} referencePointAngle
  * @param {number} arcExtent
  * @return {number}
  * @private
  */
  adjustAngleOnReferencePointAngle(pointAngle, referencePointAngle, arcExtent) {
    if (arcExtent > 0) {
      if ((referencePointAngle > 0
        && (pointAngle < 0
          || pointAngle < referencePointAngle))
        || (referencePointAngle < 0
          && pointAngle < referencePointAngle)) {
        pointAngle += 2 * Math.PI;
      }
    } else {
      if ((referencePointAngle < 0
        && (pointAngle > 0
          || referencePointAngle < pointAngle))
        || (referencePointAngle > 0
          && referencePointAngle < pointAngle)) {
        pointAngle -= 2 * Math.PI;
      }
    }
    return pointAngle;
  }

  /**
  * Returns the geometry of an horizontal part of a wall or a baseboard at <code>y</code>.
  * @param {Array} points
  * @param {number} y
  * @param {boolean} reverseOrder
  * @param {boolean} roundWall
  * @return {IndexedGeometryArray3D}
  * @private
  */
  createHorizontalPartGeometry(points, y, reverseOrder, roundWall) {
    let coords = new Array(points.length);
    for (let i = 0; i < points.length; i++) {
      coords[i] = vec3.fromValues(points[i][0], y, points[i][1]);
    }
    let geometryInfo = new GeometryInfo3D(GeometryInfo3D.POLYGON_ARRAY);
    geometryInfo.setCoordinates(reverseOrder ? coords.reverse() : coords);
    geometryInfo.setStripCounts([coords.length]);
    if (roundWall) {
      geometryInfo.setCreaseAngle(0);
    }
    geometryInfo.setGeneratedNormals(true);
    return geometryInfo.getIndexedGeometryArray();
  }

  /**
  * Returns the geometry of the top part of a wall or a baseboard.
  * @param {Array} points
  * @param {number} cosWallYawAngle
  * @param {number} sinWallYawAngle
  * @param {number} topLineAlpha
  * @param {number} topLineBeta
  * @param {boolean} roundWall
  * @return {IndexedGeometryArray3D}
  * @private
  */
  createTopPartGeometry(
    points,
    cosWallYawAngle,
    sinWallYawAngle,
    topLineAlpha,
    topLineBeta,
    roundWall
  ) {
    let coords = new Array(points.length);
    for (let i = 0; i < points.length; i++) {
      let xTopPointWithZeroYaw = cosWallYawAngle * points[i][0] + sinWallYawAngle * points[i][1];
      let topY = (topLineAlpha * xTopPointWithZeroYaw + topLineBeta);
      coords[i] = vec3.fromValues(points[i][0], topY, points[i][1]);
    }
    let geometryInfo = new GeometryInfo3D(GeometryInfo3D.POLYGON_ARRAY);
    geometryInfo.setCoordinates(coords);
    geometryInfo.setStripCounts([coords.length]);
    if (roundWall) {
      geometryInfo.setCreaseAngle(0);
    }
    geometryInfo.setGeneratedNormals(true);
    return geometryInfo.getIndexedGeometryArray();
  }

  /**
  * Creates the geometry surrounding the given non rectangular door or window.
  * @param {HomeDoorOrWindow} doorOrWindow
  * @param {Area} doorOrWindowFrontArea
  * @param {number} frontOrBackSide
  * @param {Wall} wall
  * @param {Array} wallGeometries
  * @param {Array} wallTopGeometries
  * @param {Array} wallSidePoints
  * @param {number} wallElevation
  * @param {number} cosWallYawAngle
  * @param {number} sinWallYawAngle
  * @param {number} topLineAlpha
  * @param {number} topLineBeta
  * @param {HomeTexture} texture
  * @param {Array} textureReferencePoint
  * @param {number} wallSide
  * @private
  */
  createGeometriesSurroundingDoorOrWindow(
    doorOrWindow,
    doorOrWindowFrontArea,
    frontOrBackSide,
    wall,
    wallGeometries,
    wallTopGeometries,
    wallSidePoints,
    wallElevation,
    cosWallYawAngle,
    sinWallYawAngle,
    topLineAlpha,
    topLineBeta,
    texture,
    textureReferencePoint,
    wallSide
  ) {
    if (doorOrWindow.getModelTransformations() !== null) {
      doorOrWindowFrontArea = new java.awt.geom.Area(doorOrWindowFrontArea);
      doorOrWindowFrontArea.transform(java.awt.geom.AffineTransform.getTranslateInstance(0.5, 0.5));
      doorOrWindowFrontArea.transform(java.awt.geom.AffineTransform.getScaleInstance(
        doorOrWindow.getWidth() * doorOrWindow.getWallWidth(),
        doorOrWindow.getHeight() * doorOrWindow.getWallHeight()));
      doorOrWindowFrontArea.transform(java.awt.geom.AffineTransform.getTranslateInstance(
        doorOrWindow.getWallLeft() * doorOrWindow.getWidth(),
        (1 - doorOrWindow.getWallHeight() - doorOrWindow.getWallTop()) * doorOrWindow.getHeight()));
      doorOrWindowFrontArea.transform(java.awt.geom.AffineTransform.getScaleInstance(
        1 / doorOrWindow.getWidth(),
        1 / doorOrWindow.getHeight()));
      doorOrWindowFrontArea.transform(java.awt.geom.AffineTransform.getTranslateInstance(-0.5, -0.5));
    }

    let fullFaceArea = new java.awt.geom.Area(Wall3D.FULL_FACE_CUT_OUT_AREA);
    fullFaceArea.subtract(doorOrWindowFrontArea);
    if (!fullFaceArea.isEmpty()) {
      let doorOrWindowDepth = doorOrWindow.getDepth();
      let xPieceSide = (doorOrWindow.getX() - frontOrBackSide * doorOrWindowDepth / 2 * Math.sin(doorOrWindow.getAngle()));
      let yPieceSide = (doorOrWindow.getY() + frontOrBackSide * doorOrWindowDepth / 2 * Math.cos(doorOrWindow.getAngle()));
      let wallFirstPoint = wallSide === Wall3D.WALL_LEFT_SIDE
        ? wallSidePoints[0]
        : wallSidePoints[wallSidePoints.length - 1];
      let wallSecondPoint = wallSide === Wall3D.WALL_LEFT_SIDE
        ? wallSidePoints[(wallSidePoints.length / 2 | 0) - 1]
        : wallSidePoints[(wallSidePoints.length / 2 | 0)];
      let frontSideToWallDistance = java.awt.geom.Line2D.ptLineDist(wallFirstPoint[0], wallFirstPoint[1], wallSecondPoint[0],
        wallSecondPoint[1], xPieceSide, yPieceSide);
      let position = java.awt.geom.Line2D.relativeCCW(wallFirstPoint[0], wallFirstPoint[1],
        wallSecondPoint[0], wallSecondPoint[1], xPieceSide, yPieceSide);
      let depthTranslation = frontOrBackSide * (0.5 - position * frontSideToWallDistance / doorOrWindowDepth);

      let frontAreaTransform = ModelManager.getInstance().getPieceOfFurnitureNormalizedModelTransformation(doorOrWindow, null);
      let frontAreaTranslation = mat4.create();
      mat4.fromTranslation(frontAreaTranslation, vec3.fromValues(0, 0, depthTranslation));
      mat4.mul(frontAreaTransform, frontAreaTransform, frontAreaTranslation);

      let invertedFrontAreaTransform = mat4.create();
      mat4.invert(invertedFrontAreaTransform, frontAreaTransform);
      let wallPath = new java.awt.geom.GeneralPath();
      let wallPoint = vec3.fromValues(wallFirstPoint[0], wallElevation, wallFirstPoint[1]);
      vec3.transformMat4(wallPoint, wallPoint, invertedFrontAreaTransform);
      wallPath.moveTo(wallPoint[0], wallPoint[1]);
      wallPoint = vec3.fromValues(wallSecondPoint[0], wallElevation, wallSecondPoint[1]);
      vec3.transformMat4(wallPoint, wallPoint, invertedFrontAreaTransform);
      wallPath.lineTo(wallPoint[0], wallPoint[1]);
      let topWallPoint1 = vec3.fromValues(wallSecondPoint[0], this.getWallPointElevation(wallSecondPoint[0], wallSecondPoint[1], cosWallYawAngle, sinWallYawAngle, topLineAlpha, topLineBeta), wallSecondPoint[1]);
      vec3.transformMat4(topWallPoint1, topWallPoint1, invertedFrontAreaTransform);
      wallPath.lineTo(topWallPoint1[0], topWallPoint1[1]);
      let topWallPoint2 = vec3.fromValues(wallFirstPoint[0], this.getWallPointElevation(wallFirstPoint[0], wallFirstPoint[1], cosWallYawAngle, sinWallYawAngle, topLineAlpha, topLineBeta), wallFirstPoint[1]);
      vec3.transformMat4(topWallPoint2, topWallPoint2, invertedFrontAreaTransform);
      wallPath.lineTo(topWallPoint2[0], topWallPoint2[1]);
      wallPath.closePath();

      let doorOrWindowSurroundingPath = new java.awt.geom.GeneralPath();
      doorOrWindowSurroundingPath.moveTo(-0.5, -0.5);
      doorOrWindowSurroundingPath.lineTo(-0.5, 0.5);
      doorOrWindowSurroundingPath.lineTo(0.5, 0.5);
      doorOrWindowSurroundingPath.lineTo(0.5, -0.5);
      doorOrWindowSurroundingPath.closePath();

      let doorOrWindowSurroundingArea = new java.awt.geom.Area(doorOrWindowSurroundingPath);
      doorOrWindowSurroundingArea.intersect(new java.awt.geom.Area(wallPath));
      doorOrWindowSurroundingArea.subtract(doorOrWindowFrontArea);
      let flatness = 0.5 / (Math.max(doorOrWindow.getWidth(), doorOrWindow.getHeight()));
      if (!doorOrWindowSurroundingArea.isEmpty()) {
        let reversed = frontOrBackSide > 0 !== (wallSide === Wall3D.WALL_RIGHT_SIDE) !== doorOrWindow.isModelMirrored();
        let doorOrWindowSurroundingAreasPoints = this.getAreaPoints(doorOrWindowSurroundingArea, flatness, reversed);
        if (!(doorOrWindowSurroundingAreasPoints.length === 0)) {
          let stripCounts = new Array(doorOrWindowSurroundingAreasPoints.length);
          let vertexCount = 0;
          for (var i = 0; i < doorOrWindowSurroundingAreasPoints.length; i++) {
            var areaPoints = doorOrWindowSurroundingAreasPoints[i];
            stripCounts[i] = areaPoints.length + 1;
            vertexCount += stripCounts[i];
          }
          let halfWallThickness = wall.getThickness() / 2;
          let deltaXToWallMiddle = halfWallThickness * sinWallYawAngle;
          let deltaZToWallMiddle = -halfWallThickness * cosWallYawAngle;
          if (wallSide === Wall3D.WALL_LEFT_SIDE) {
            deltaXToWallMiddle *= -1;
            deltaZToWallMiddle *= -1;
          }
          let coords = new Array(vertexCount);
          let borderCoords = ([]);
          let slopingTopCoords = ([]);
          let textureCoords;
          let borderTextureCoords;
          if (texture != null) {
            textureCoords = new Array(coords.length);
            borderTextureCoords = [];
          } else {
            textureCoords = null;
            borderTextureCoords = null;
          }
          var i = 0;
          for (let index = 0; index < doorOrWindowSurroundingAreasPoints.length; index++) {
            var areaPoints = doorOrWindowSurroundingAreasPoints[index];
            let point = vec3.fromValues(areaPoints[0][0], areaPoints[0][1], 0);
            vec3.transformMat4(point, point, frontAreaTransform);
            let textureCoord = null;
            if (texture != null) {
              var horizontalTextureCoords = java.awt.geom.Point2D.distance(textureReferencePoint[0], textureReferencePoint[1], point[0], point[2]);
              if (wallSide === Wall3D.WALL_LEFT_SIDE && texture.isLeftToRightOriented()) {
                horizontalTextureCoords = -horizontalTextureCoords;
              }
              textureCoord = vec2.fromValues(horizontalTextureCoords, point[1]);
            }
            let distanceToTop = java.awt.geom.Line2D.ptLineDistSq(topWallPoint1[0], topWallPoint1[1], topWallPoint2[0], topWallPoint2[1],
              areaPoints[0][0], areaPoints[0][1]);

            for (let j = 0; j < areaPoints.length; j++, i++) {
              coords[i] = point;
              if (texture != null) {
                textureCoords[i] = textureCoord;
              }

              let nextPointIndex = j < areaPoints.length - 1
                ? j + 1
                : 0;
              let coordsList;
              let nextDistanceToTop = java.awt.geom.Line2D.ptLineDistSq(topWallPoint1[0], topWallPoint1[1], topWallPoint2[0], topWallPoint2[1],
                areaPoints[nextPointIndex][0], areaPoints[nextPointIndex][1]);
              if (distanceToTop < 1.0E-10 && nextDistanceToTop < 1.0E-10) {
                coordsList = slopingTopCoords;
              } else {
                coordsList = borderCoords;
              }

              let nextPoint = vec3.fromValues(areaPoints[nextPointIndex][0], areaPoints[nextPointIndex][1], 0);
              vec3.transformMat4(nextPoint, nextPoint, frontAreaTransform);
              coordsList.push(point);
              coordsList.push(vec3.fromValues(point[0] + deltaXToWallMiddle, point[1], point[2] + deltaZToWallMiddle));
              coordsList.push(vec3.fromValues(nextPoint[0] + deltaXToWallMiddle, nextPoint[1], nextPoint[2] + deltaZToWallMiddle));
              coordsList.push(nextPoint);

              let nextTextureCoord = null;
              if (texture != null) {
                var horizontalTextureCoords = java.awt.geom.Point2D.distance(textureReferencePoint[0], textureReferencePoint[1],
                  nextPoint[0], nextPoint[2]);
                if (wallSide === Wall3D.WALL_LEFT_SIDE && texture.isLeftToRightOriented()) {
                  horizontalTextureCoords = -horizontalTextureCoords;
                }
                nextTextureCoord = vec2.fromValues(horizontalTextureCoords, nextPoint[1]);
                if (coordsList === borderCoords) {
                  borderTextureCoords.push(textureCoord);
                  borderTextureCoords.push(textureCoord);
                  borderTextureCoords.push(nextTextureCoord);
                  borderTextureCoords.push(nextTextureCoord);
                }
              }

              distanceToTop = nextDistanceToTop;
              point = nextPoint;
              textureCoord = nextTextureCoord;
            }

            coords[i] = point;
            if (texture != null) {
              textureCoords[i] = textureCoord;
            }
            i++;
          }

          let geometryInfo = new GeometryInfo3D(GeometryInfo3D.POLYGON_ARRAY);
          geometryInfo.setStripCounts(stripCounts);
          geometryInfo.setCoordinates(coords);
          if (texture !== null) {
            geometryInfo.setTextureCoordinates(textureCoords);
          }
          geometryInfo.setGeneratedNormals(true);
          wallGeometries.push(geometryInfo.getIndexedGeometryArray());

          if (borderCoords.length > 0) {
            geometryInfo = new GeometryInfo3D(GeometryInfo3D.QUAD_ARRAY);
            geometryInfo.setCoordinates(borderCoords.slice(0));
            if (texture !== null) {
              geometryInfo.setTextureCoordinates(borderTextureCoords.slice(0));
            }
            geometryInfo.setCreaseAngle(Math.PI / 2);
            geometryInfo.setGeneratedNormals(true);
            wallGeometries.push(geometryInfo.getIndexedGeometryArray());
          }

          if (slopingTopCoords.length > 0) {
            geometryInfo = new GeometryInfo3D(GeometryInfo3D.QUAD_ARRAY);
            geometryInfo.setCoordinates(slopingTopCoords.slice(0));
            geometryInfo.setGeneratedNormals(true);
            wallTopGeometries.push(geometryInfo.getIndexedGeometryArray());
          }
        }
      }
    }
  }

  /**
  * Returns the elevation of the wall managed by this 3D object.
  * @param {boolean} ignoreFloorThickness
  * @return {number}
  * @private
  */
  getWallElevation(ignoreFloorThickness) {
    let wall = this.getUserData();
    let level = wall.getLevel();
    if (level === null) {
      return 0;
    } else if (ignoreFloorThickness) {
      return level.getElevation();
    } else {
      let floorThicknessBottomWall = this.getFloorThicknessBottomWall();
      if (floorThicknessBottomWall > 0) {
        floorThicknessBottomWall -= Wall3D.LEVEL_ELEVATION_SHIFT;
      }
      return level.getElevation() - floorThicknessBottomWall;
    }
  }

  /**
  * Returns the floor thickness at the bottom of the wall managed by this 3D object.
  * @return {number}
  * @private
  */
  getFloorThicknessBottomWall() {
    let wall = this.getUserData();
    let level = wall.getLevel();
    if (level == null) {
      return 0;
    } else {
      let levels = this.getHome().getLevels();
      if (!(levels.length === 0) && levels[0].getElevation() === level.getElevation()) {
        return 0;
      } else {
        return level.getFloorThickness();
      }
    }
  }

  /**
  * Returns the elevation of the wall top at its start.
  * @return {number}
  * @private
  */
  getWallTopElevationAtStart() {
    let wallHeight = this.getUserData().getHeight();
    let wallHeightAtStart;
    if (wallHeight !== null) {
      wallHeightAtStart = wallHeight + this.getWallElevation(false) + this.getFloorThicknessBottomWall();
    } else {
      wallHeightAtStart = this.getHome().getWallHeight() + this.getWallElevation(false) + this.getFloorThicknessBottomWall();
    }
    return wallHeightAtStart + this.getTopElevationShift();
  }

  /**
   * @private
   */
  getTopElevationShift() {
    let level = this.getUserData().getLevel();
    if (level !== null) {
      let levels = this.getHome().getLevels();
      if (levels[levels.length - 1] !== level) {
        return Wall3D.LEVEL_ELEVATION_SHIFT;
      }
    }
    return 0;
  }

  /**
   * Returns the elevation of the wall top at its end.
   * @return {number}
   * @private
   */
  getWallTopElevationAtEnd() {
    let wall = this.getUserData();
    if (wall.isTrapezoidal()) {
      return wall.getHeightAtEnd() + this.getWallElevation(false) + this.getFloorThicknessBottomWall() + this.getTopElevationShift();
    } else {
      return this.getWallTopElevationAtStart();
    }
  }

  /**
  * Returns the elevation of the given baseboard top.
  * @param {Baseboard} baseboard
  * @return {number}
  * @private
  */
  getBaseboardTopElevation(baseboard) {
    return baseboard.getHeight() + this.getWallElevation(true);
  }

  /**
   * Returns the selection geometry of this wall.
   * @return {IndexedGeometryArray3D}
   * @private
   */
  createWallSelectionGeometry() {
    let wall = this.getUserData();
    let wallElevation = this.getWallElevation(true);
    let leftSideBaseboard = wall.getLeftSideBaseboard();
    let rightSideBaseboard = wall.getRightSideBaseboard();
    let wallPoints = wall.getPoints();
    let wallPointsIncludingBaseboards = wall.getPoints(true);
    let selectionCoordinates = new Array(wallPoints.length * 2
      + (leftSideBaseboard != null ? 4 : 0)
      + (rightSideBaseboard != null ? 4 : 0));
    let indices = new Array(wallPoints.length * 4
      + (leftSideBaseboard != null ? 12 : 4)
      + (rightSideBaseboard != null ? 12 : 4));
    // Contour at bottom
    let j = 0, k = 0;
    for (var i = 0; i < wallPoints.length; i++, j++) {
      selectionCoordinates[j] = vec3.fromValues(wallPointsIncludingBaseboards[i][0], wallElevation, wallPointsIncludingBaseboards[i][1]);
      indices[k++] = j;
      if (i > 0) {
        indices[k++] = j;
      }
    }
    indices[k++] = 0;

    // Compute wall angles and top line factors to generate top contour
    let topElevationAtStart = this.getWallTopElevationAtStart();
    let topElevationAtEnd = this.getWallTopElevationAtEnd();
    let wallYawAngle = Math.atan2(wall.getYEnd() - wall.getYStart(), wall.getXEnd() - wall.getXStart());
    let cosWallYawAngle = Math.cos(wallYawAngle);
    let sinWallYawAngle = Math.sin(wallYawAngle);
    let wallXStartWithZeroYaw = cosWallYawAngle * wall.getXStart() + sinWallYawAngle * wall.getYStart();
    let wallXEndWithZeroYaw = cosWallYawAngle * wall.getXEnd() + sinWallYawAngle * wall.getYEnd();
    let topLineAlpha;
    let topLineBeta;
    if (topElevationAtStart == topElevationAtEnd) {
      topLineAlpha = 0;
      topLineBeta = topElevationAtStart;
    } else {
      topLineAlpha = (topElevationAtEnd - topElevationAtStart) / (wallXEndWithZeroYaw - wallXStartWithZeroYaw);
      topLineBeta = topElevationAtStart - topLineAlpha * wallXStartWithZeroYaw;
    }

    // Contour at top
    for (var i = 0; i < wallPoints.length; i++, j++) {
      let xTopPointWithZeroYaw = cosWallYawAngle * wallPoints[i][0] + sinWallYawAngle * wallPoints[i][1];
      let topY = topLineAlpha * xTopPointWithZeroYaw + topLineBeta;
      selectionCoordinates[j] = vec3.fromValues(wallPoints[i][0], topY, wallPoints[i][1]);
      indices[k++] = j;
      if (i > 0) {
        indices[k++] = j;
      }
    }
    indices[k++] = wallPoints.length;

    // Vertical lines at corners
    indices[k++] = 0;
    if (leftSideBaseboard != null) {
      var leftBaseboardHeight = this.getBaseboardTopElevation(leftSideBaseboard);
      selectionCoordinates[j] = vec3.fromValues(wallPointsIncludingBaseboards[0][0], Math.min(leftBaseboardHeight, topElevationAtStart), wallPointsIncludingBaseboards[0][1]);
      indices[k++] = j;
      indices[k++] = j++;
      selectionCoordinates[j] = vec3.fromValues(wallPoints[0][0], Math.min(leftBaseboardHeight, topElevationAtStart), wallPoints[0][1]);
      indices[k++] = j;
      indices[k++] = j++;
    }
    indices[k++] = wallPoints.length;
    indices[k++] = wallPoints.length / 2 - 1;
    if (leftSideBaseboard != null) {
      var leftBaseboardHeight = this.getBaseboardTopElevation(leftSideBaseboard);
      selectionCoordinates[j] = vec3.fromValues(wallPointsIncludingBaseboards[wallPoints.length / 2 - 1][0], Math.min(leftBaseboardHeight, topElevationAtEnd), wallPointsIncludingBaseboards[wallPoints.length / 2 - 1][1]);
      indices[k++] = j;
      indices[k++] = j++;
      selectionCoordinates[j] = vec3.fromValues(wallPoints[wallPoints.length / 2 - 1][0], Math.min(leftBaseboardHeight, topElevationAtEnd), wallPoints[wallPoints.length / 2 - 1][1]);
      indices[k++] = j;
      indices[k++] = j++;
    }
    indices[k++] = wallPoints.length + wallPoints.length / 2 - 1;
    indices[k++] = wallPoints.length - 1;
    if (rightSideBaseboard != null) {
      var rightBaseboardHeight = this.getBaseboardTopElevation(rightSideBaseboard);
      selectionCoordinates[j] = vec3.fromValues(wallPointsIncludingBaseboards[wallPoints.length - 1][0], Math.min(rightBaseboardHeight, topElevationAtStart), wallPointsIncludingBaseboards[wallPoints.length - 1][1]);
      indices[k++] = j;
      indices[k++] = j++;
      selectionCoordinates[j] = vec3.fromValues(wallPoints[wallPoints.length - 1][0], Math.min(rightBaseboardHeight, topElevationAtStart), wallPoints[wallPoints.length - 1][1]);
      indices[k++] = j;
      indices[k++] = j++;
    }
    indices[k++] = 2 * wallPoints.length - 1;
    indices[k++] = wallPoints.length / 2;
    if (rightSideBaseboard != null) {
      var rightBaseboardHeight = this.getBaseboardTopElevation(rightSideBaseboard);
      selectionCoordinates[j] = vec3.fromValues(wallPointsIncludingBaseboards[wallPoints.length / 2][0], Math.min(rightBaseboardHeight, topElevationAtEnd), wallPointsIncludingBaseboards[wallPoints.length / 2][1]);
      indices[k++] = j;
      indices[k++] = j++;
      selectionCoordinates[j] = vec3.fromValues(wallPoints[wallPoints.length / 2][0], Math.min(rightBaseboardHeight, topElevationAtEnd), wallPoints[wallPoints.length / 2][1]);
      indices[k++] = j;
      indices[k++] = j++;
    }
    indices[k++] = wallPoints.length + wallPoints.length / 2;

    return new IndexedLineArray3D(selectionCoordinates, indices);
  }

  /**
  * Sets wall appearance with its color, texture and transparency.
  * @param {boolean} waitTextureLoadingEnd
  * @private
  */
  updateWallAppearance(waitTextureLoadingEnd) {
    let wall = this.getUserData();
    let wallsTopColor = wall.getTopColor();
    let wallLeftSideGroups = [this.getChild(0), this.getChild(2), this.getChild(4), this.getChild(6)];
    let wallRightSideGroups = [this.getChild(1), this.getChild(3), this.getChild(5), this.getChild(7)];
    for (let i = 0; i < wallLeftSideGroups.length; i++) {
      if (i === 1) {
        let leftSideBaseboard = wall.getLeftSideBaseboard();
        if (leftSideBaseboard != null) {
          var texture = leftSideBaseboard.getTexture();
          var color = leftSideBaseboard.getColor();
          if (color === null && texture === null) {
            texture = wall.getLeftSideTexture();
            color = wall.getLeftSideColor();
          }
          this.updateFilledWallSideAppearance(wallLeftSideGroups[i].getChild(0).getAppearance(),
            texture, waitTextureLoadingEnd, color, wall.getLeftSideShininess());
        }
        let rightSideBaseboard = wall.getRightSideBaseboard();
        if (rightSideBaseboard != null) {
          var texture = rightSideBaseboard.getTexture();
          var color = rightSideBaseboard.getColor();
          if (color == null && texture == null) {
            texture = wall.getRightSideTexture();
            color = wall.getRightSideColor();
          }
          this.updateFilledWallSideAppearance(wallRightSideGroups[i].getChild(0).getAppearance(),
            texture, waitTextureLoadingEnd, color, wall.getRightSideShininess());
        }
      } else if (i !== 3 || wallsTopColor == null) {
        this.updateFilledWallSideAppearance(wallLeftSideGroups[i].getChild(0).getAppearance(),
          wall.getLeftSideTexture(), waitTextureLoadingEnd, wall.getLeftSideColor(), wall.getLeftSideShininess());
        this.updateFilledWallSideAppearance(wallRightSideGroups[i].getChild(0).getAppearance(),
          wall.getRightSideTexture(), waitTextureLoadingEnd, wall.getRightSideColor(), wall.getRightSideShininess());
      } else {
        this.updateFilledWallSideAppearance(wallLeftSideGroups[i].getChild(0).getAppearance(),
          null, waitTextureLoadingEnd, wallsTopColor, 0);
        this.updateFilledWallSideAppearance(wallRightSideGroups[i].getChild(0).getAppearance(),
          null, waitTextureLoadingEnd, wallsTopColor, 0);
      }
    }

    let selectionShapeAppearance = this.getChild(8).getAppearance();
    selectionShapeAppearance.setVisible(this.getUserPreferences() != null
      && this.getUserPreferences().isEditingIn3DViewEnabled()
      && this.getHome().isItemSelected(wall));
  }

  /**
  * Sets filled wall side appearance with its color, texture, transparency and visibility.
  * @param {Appearance3D} wallSideAppearance
  * @param {HomeTexture} wallSideTexture
  * @param {boolean} waitTextureLoadingEnd
  * @param {number} wallSideColor
  * @param {number} shininess
  * @private
  */
  updateFilledWallSideAppearance(
    wallSideAppearance,
    wallSideTexture,
    waitTextureLoadingEnd,
    wallSideColor,
    shininess
  ) {
    if (wallSideTexture == null) {
      this.updateAppearanceMaterial(wallSideAppearance, wallSideColor, wallSideColor, shininess);
      wallSideAppearance.setTextureImage(null);
    } else {
      this.updateAppearanceMaterial(wallSideAppearance, Object3DBranch.DEFAULT_COLOR, Object3DBranch.DEFAULT_AMBIENT_COLOR, shininess);
      this.updateTextureTransform(wallSideAppearance, wallSideTexture, true);
      TextureManager.getInstance().loadTexture(wallSideTexture.getImage(), waitTextureLoadingEnd, {
        textureUpdated: function (texture) {
          wallSideAppearance.setTextureImage(texture);
        },
        textureError: function (error) {
          return this.textureUpdated(TextureManager.getInstance().getErrorImage());
        }
      });
    }
    let wallsAlpha = this.getHome().getEnvironment().getWallsAlpha();
    wallSideAppearance.setTransparency(wallsAlpha);
  }

  /**
  * An area used to compute holes in walls.
   * @constructor
   * @private
  */
  static DoorOrWindowArea(area, doorsOrWindows) {
    this.area = area;
    this.doorsOrWindows = doorsOrWindows;
  }
}

Wall3D.LEVEL_ELEVATION_SHIFT = 0.1;
Wall3D.FULL_FACE_CUT_OUT_AREA = new java.awt.geom.Area(new java.awt.geom.Rectangle2D.Float(-0.5, 0.5, 1, 1));
Wall3D.WALL_LEFT_SIDE = 0;
Wall3D.WALL_RIGHT_SIDE = 1;

Wall3D.rotatedModelsFrontAreas = [];

class DoorOrWindowArea {
  getArea() {
    return this.area;
  }

  getDoorsOrWindows() {
    return this.doorsOrWindows;
  }
}

Wall3D.DoorOrWindowArea = DoorOrWindowArea;
