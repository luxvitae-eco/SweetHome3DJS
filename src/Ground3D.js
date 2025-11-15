/*
 * Ground3D.js
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
  HomeFurnitureGroup,
  Level,
  Room,
} from './SweetHome3D';

import { Object3DBranch } from './Object3DBranch';
import { TextureManager } from './TextureManager';
import {
  Appearance3D, Shape3D, TransformGroup3D, IndexedTriangleArray3D,
  GeometryInfo3D,
} from './scene3d';

/**
 * Creates a 3D ground for the given <code>home</code>.
 * @param {Home} home
 * @param {number} originX
 * @param {number} originY
 * @param {number} width
 * @param {number} depth
 * @param {boolean} waitTextureLoadingEnd
 * @constructor
 * @extends Object3DBranch
 * @author Emmanuel Puybaret
 */
export class Ground3D extends Object3DBranch {
  constructor(home, originX, originY, width, depth, waitTextureLoadingEnd) {
    super();
    this.setUserData(home);
    this.originX = originX;
    this.originY = originY;
    this.width = width;
    this.depth = depth;

    let groundAppearance = new Appearance3D();
    let groundShape = new Shape3D();
    groundShape.setCapability(Shape3D.ALLOW_GEOMETRY_WRITE);
    groundShape.setAppearance(groundAppearance);

    this.addChild(groundShape);

    let backgroundImageAppearance = new Appearance3D();
    this.updateAppearanceMaterial(backgroundImageAppearance, Object3DBranch.DEFAULT_COLOR, Object3DBranch.DEFAULT_COLOR, 0);
    backgroundImageAppearance.setCullFace(Appearance3D.CULL_NONE);

    let transformGroup = new TransformGroup3D();
    // Allow the change of the transformation that sets background image size and position
    transformGroup.setCapability(TransformGroup3D.ALLOW_TRANSFORM_WRITE);
    let backgroundImageShape = new Shape3D(
      new IndexedTriangleArray3D(
        [vec3.fromValues(-0.5, 0, -0.5),
        vec3.fromValues(-0.5, 0, 0.5),
        vec3.fromValues(0.5, 0, 0.5),
        vec3.fromValues(0.5, 0, -0.5)],
        [0, 1, 2, 0, 2, 3],
        [vec2.fromValues(0., 0.),
        vec2.fromValues(1., 0.),
        vec2.fromValues(1., 1.),
        vec2.fromValues(0., 1.)],
        [3, 0, 1, 3, 1, 2],
        [vec3.fromValues(0., 1., 0.)],
        [0, 0, 0, 0, 0, 0]), backgroundImageAppearance);
    transformGroup.addChild(backgroundImageShape);
    this.addChild(transformGroup);

    this.update(waitTextureLoadingEnd);
  }

  /**
   * Updates the geometry and attributes of ground and sublevels.
   * @param {boolean} [waitTextureLoadingEnd]
   */
  update(waitTextureLoadingEnd) {
    if (waitTextureLoadingEnd === undefined) {
      waitTextureLoadingEnd = false;
    }
    let home = this.getUserData();

    // Update background image viewed on ground
    let backgroundImageGroup = this.getChild(1);
    let backgroundImageShape = backgroundImageGroup.getChild(0);
    let backgroundImageAppearance = backgroundImageShape.getAppearance();
    let backgroundImage = null;
    if (home.getEnvironment().isBackgroundImageVisibleOnGround3D()) {
      let levels = home.getLevels();
      if (levels.length > 0) {
        for (let i = levels.length - 1; i >= 0; i--) {
          let level = levels[i];
          if (level.getElevation() == 0
            && level.isViewableAndVisible()
            && level.getBackgroundImage() !== null
            && level.getBackgroundImage().isVisible()) {
            backgroundImage = level.getBackgroundImage();
            break;
          }
        }
      } else if (home.getBackgroundImage() !== null
        && home.getBackgroundImage().isVisible()) {
        backgroundImage = home.getBackgroundImage();
      }
    }
    if (backgroundImage !== null) {
      let ground3d = this;
      TextureManager.getInstance().loadTexture(backgroundImage.getImage(), waitTextureLoadingEnd, {
        textureUpdated: function (texture) {
          // Update image location and size
          let backgroundImageScale = backgroundImage.getScale();
          let imageWidth = backgroundImageScale * texture.width;
          let imageHeight = backgroundImageScale * texture.height;
          let backgroundImageTransform = mat4.create();
          mat4.scale(backgroundImageTransform, backgroundImageTransform, vec3.fromValues(imageWidth, 1, imageHeight));
          let backgroundImageTranslation = mat4.create();
          mat4.fromTranslation(backgroundImageTranslation, vec3.fromValues(imageWidth / 2 - backgroundImage.getXOrigin(), 0.,
            imageHeight / 2 - backgroundImage.getYOrigin()));
          mat4.mul(backgroundImageTransform, backgroundImageTranslation, backgroundImageTransform);
          backgroundImageAppearance.setTextureImage(texture);
          backgroundImageGroup.setTransform(backgroundImageTransform);
          ground3d.updateGround(waitTextureLoadingEnd,
            new java.awt.geom.Rectangle2D.Float(-backgroundImage.getXOrigin(), -backgroundImage.getYOrigin(), imageWidth, imageHeight));
        },
        textureError: function (error) {
          return this.textureUpdated(TextureManager.getInstance().getErrorImage());
        },
        progression: function (part, info, percentage) {
        }
      });
      backgroundImageAppearance.setVisible(true);
    } else {
      backgroundImageAppearance.setVisible(false);
      this.updateGround(waitTextureLoadingEnd, null);
    }
  }

  /**
   * @param {boolean} waitTextureLoadingEnd
   * @param {java.awt.geom.Rectangle2D} backgroundImageRectangle
   * @private 
   */
  updateGround(waitTextureLoadingEnd, backgroundImageRectangle) {
    let home = this.getUserData();
    let groundShape = this.getChild(0);
    let currentGeometriesCount = groundShape.getGeometries().length;
    let groundAppearance = groundShape.getAppearance();
    let groundTexture = home.getEnvironment().getGroundTexture();
    if (groundTexture === null) {
      let groundColor = home.getEnvironment().getGroundColor();
      this.updateAppearanceMaterial(groundAppearance, groundColor, groundColor, 0);
      groundAppearance.setTextureImage(null);
    } else {
      this.updateAppearanceMaterial(groundAppearance, Object3DBranch.DEFAULT_COLOR, Object3DBranch.DEFAULT_COLOR, 0);
      this.updateTextureTransform(groundAppearance, groundTexture, true);
      TextureManager.getInstance().loadTexture(groundTexture.getImage(), waitTextureLoadingEnd, {
        textureUpdated: function (texture) {
          groundAppearance.setTextureImage(texture);
        },
        textureError: function (error) {
          return this.textureUpdated(TextureManager.getInstance().getErrorImage());
        }
      });
    }

    let areaRemovedFromGround = new java.awt.geom.Area();
    if (backgroundImageRectangle !== null) {
      areaRemovedFromGround.add(new java.awt.geom.Area(backgroundImageRectangle));
    }
    let undergroundLevelAreas = [];
    let rooms = home.getRooms();
    for (var i = 0; i < rooms.length; i++) {
      let room = rooms[i];
      let roomLevel = room.getLevel();
      if ((roomLevel === null || roomLevel.isViewable())
        && room.isFloorVisible()) {
        let roomPoints = room.getPoints();
        if (roomPoints.length > 2) {
          var roomArea = new java.awt.geom.Area(this.getShape(roomPoints));
          var levelAreas = roomLevel !== null && roomLevel.getElevation() < 0
            ? this.getUndergroundAreas(undergroundLevelAreas, roomLevel)
            : null;
          if (roomLevel === null
            || (roomLevel.getElevation() <= 0
              && roomLevel.isViewableAndVisible())) {
            areaRemovedFromGround.add(roomArea);
            if (levelAreas !== null) {
              levelAreas.roomArea.add(roomArea);
            }
          }
          if (levelAreas !== null) {
            levelAreas.undergroundArea.add(roomArea);
          }
        }
      }
    }

    this.updateUndergroundAreasDugByFurniture(undergroundLevelAreas, home.getFurniture());

    let walls = home.getWalls();
    for (var i = 0; i < walls.length; i++) {
      let wall = walls[i];
      let wallLevel = wall.getLevel();
      if (wallLevel !== null
        && wallLevel.isViewable()
        && wallLevel.getElevation() < 0) {
        var levelAreas = this.getUndergroundAreas(undergroundLevelAreas, wallLevel);
        levelAreas.wallArea.add(new java.awt.geom.Area(this.getShape(wall.getPoints())));
      }
    }
    let undergroundAreas = undergroundLevelAreas;
    for (var i = 0; i < undergroundAreas.length; i++) {
      var levelAreas = undergroundAreas[i];
      var areaPoints = this.getPoints(levelAreas.wallArea);
      for (var j = 0; j < areaPoints.length; j++) {
        var points = areaPoints[j];
        if (!new Room(points).isClockwise()) {
          levelAreas.undergroundArea.add(new java.awt.geom.Area(this.getShape(points)));
        }
      }
    }

    undergroundAreas.sort((levelAreas1, levelAreas2) => {
      let elevationComparison = -(levelAreas1.level.getElevation() - levelAreas2.level.getElevation());
      if (elevationComparison !== 0) {
        return elevationComparison;
      } else {
        return levelAreas1.level.getElevationIndex() - levelAreas2.level.getElevationIndex();
      }
    });
    for (var i = 0; i < undergroundAreas.length; i++) {
      var levelAreas = undergroundAreas[i];
      let level = levelAreas.level;
      let area = levelAreas.undergroundArea;
      let areaAtStart = area.clone();
      levelAreas.undergroundSideArea.add(area.clone());
      for (var j = 0; j < undergroundAreas.length; j++) {
        let otherLevelAreas = undergroundAreas[j];
        if (otherLevelAreas.level.getElevation() < level.getElevation()) {
          var areaPoints = this.getPoints(otherLevelAreas.undergroundArea);
          for (let k = 0; k < areaPoints.length; k++) {
            var points = areaPoints[k];
            if (!new Room(points).isClockwise()) {
              let pointsArea = new java.awt.geom.Area(this.getShape(points));
              area.subtract(pointsArea);
              levelAreas.undergroundSideArea.add(pointsArea);
            }
          }
        }
      }
      var areaPoints = this.getPoints(area);
      for (var j = 0; j < areaPoints.length; j++) {
        var points = areaPoints[j];
        if (new Room(points).isClockwise()) {
          let coveredHole = new java.awt.geom.Area(this.getShape(points));
          coveredHole.exclusiveOr(areaAtStart);
          coveredHole.subtract(areaAtStart);
          levelAreas.upperLevelArea.add(coveredHole);
        } else {
          areaRemovedFromGround.add(new java.awt.geom.Area(this.getShape(points)));
        }
      }
    }
    for (var i = 0; i < undergroundAreas.length; i++) {
      var levelAreas = undergroundAreas[i];
      var roomArea = levelAreas.roomArea;
      if (roomArea !== null) {
        levelAreas.undergroundArea.subtract(roomArea);
      }
    }

    let groundArea = new java.awt.geom.Area(this.getShape(
      [[this.originX, this.originY],
      [this.originX, this.originY + this.depth],
      [this.originX + this.width, this.originY + this.depth],
      [this.originX + this.width, this.originY]]));
    let removedAreaBounds = areaRemovedFromGround.getBounds2D();
    if (!groundArea.getBounds2D().equals(removedAreaBounds)) {
      let outsideGroundArea = groundArea;
      if (areaRemovedFromGround.isEmpty()) {
        removedAreaBounds = new java.awt.geom.Rectangle2D.Float(Math.max(-5000.0, this.originX), Math.max(-5000.0, this.originY), 0, 0);
        removedAreaBounds.add(Math.min(5000.0, this.originX + this.width),
          Math.min(5000.0, this.originY + this.depth));
      } else {
        removedAreaBounds.add(Math.max(removedAreaBounds.getMinX() - 5000.0, this.originX),
          Math.max(removedAreaBounds.getMinY() - 5000.0, this.originY));
        removedAreaBounds.add(Math.min(removedAreaBounds.getMaxX() + 5000.0, this.originX + this.width),
          Math.min(removedAreaBounds.getMaxY() + 5000.0, this.originY + this.depth));
      }
      groundArea = new java.awt.geom.Area(removedAreaBounds);
      outsideGroundArea.subtract(groundArea);
      this.addAreaGeometry(groundShape, groundTexture, outsideGroundArea, 0);
    }
    groundArea.subtract(areaRemovedFromGround);

    undergroundAreas.splice(0, 0, new Ground3D.LevelAreas(new Level("Ground", 0, 0, 0), groundArea));
    let previousLevelElevation = 0;
    for (var i = 0; i < undergroundAreas.length; i++) {
      var levelAreas = undergroundAreas[i];
      let elevation = levelAreas.level.getElevation();
      this.addAreaGeometry(groundShape, groundTexture, levelAreas.undergroundArea, elevation);
      if (previousLevelElevation - elevation > 0) {
        var areaPoints = this.getPoints(levelAreas.undergroundSideArea);
        for (var j = 0; j < areaPoints.length; j++) {
          var points = areaPoints[j];
          this.addAreaSidesGeometry(groundShape, groundTexture, points, elevation, previousLevelElevation - elevation);
        }
        this.addAreaGeometry(groundShape, groundTexture, levelAreas.upperLevelArea, previousLevelElevation);
      }
      previousLevelElevation = elevation;
    }

    for (var i = currentGeometriesCount - 1; i >= 0; i--) {
      groundShape.removeGeometry(i);
    }
  }

  /**
   * Returns the list of points that defines the given area.
   * @param {Area} area
   * @return {Array}
   * @private
   */
  getPoints(area) {
    let areaPoints = [];
    let areaPartPoints = [];
    let previousRoomPoint = null;
    for (let it = area.getPathIterator(null, 1); !it.isDone(); it.next()) {
      let roomPoint = [0, 0];
      if (it.currentSegment(roomPoint) === java.awt.geom.PathIterator.SEG_CLOSE) {
        if (areaPartPoints[0][0] === previousRoomPoint[0]
          && areaPartPoints[0][1] === previousRoomPoint[1]) {
          areaPartPoints.splice(areaPartPoints.length - 1, 1);
        }
        if (areaPartPoints.length > 2) {
          areaPoints.push(areaPartPoints.slice(0));
        }
        areaPartPoints.length = 0;
        previousRoomPoint = null;
      } else {
        if (previousRoomPoint === null
          || roomPoint[0] !== previousRoomPoint[0]
          || roomPoint[1] !== previousRoomPoint[1]) {
          areaPartPoints.push(roomPoint);
        }
        previousRoomPoint = roomPoint;
      }
    }
    return areaPoints;
  }

  /**
   * Returns the {@link LevelAreas} instance matching the given level.
   * @param {Object} undergroundAreas
   * @param {Level} level
   * @return {Ground3D.LevelAreas}
   * @private
   */
  getUndergroundAreas(undergroundAreas, level) {
    let levelAreas = null;
    for (let i = 0; i < undergroundAreas.length; i++) {
      if (undergroundAreas[i].level === level) {
        levelAreas = undergroundAreas[i];
        break;
      }
    }
    if (levelAreas === null) {
      undergroundAreas.push(levelAreas = new Ground3D.LevelAreas(level));
    }
    return levelAreas;
  }

  /**
   * Updates underground level areas dug by the visible furniture placed at underground levels.
   * @param {Object} undergroundLevelAreas
   * @param {Level} level
   * @return {Array} furniture
   * @private
   */
  updateUndergroundAreasDugByFurniture(undergroundLevelAreas, furniture) {
    for (let i = 0; i < furniture.length; i++) {
      let piece = furniture[i];
      let pieceLevel = piece.getLevel();
      if (piece.getGroundElevation() < 0
        && piece.isVisible()
        && pieceLevel !== null
        && pieceLevel.isViewable()
        && pieceLevel.getElevation() < 0) {
        if (piece instanceof HomeFurnitureGroup) {
          this.updateUndergroundAreasDugByFurniture(undergroundLevelAreas, piece.getFurniture());
        } else {
          let levelAreas = this.getUndergroundAreas(undergroundLevelAreas, pieceLevel);
          if (piece.getStaircaseCutOutShape() === null) {
            levelAreas.undergroundArea.add(new java.awt.geom.Area(this.getShape(piece.getPoints())));
          } else {
            levelAreas.undergroundArea.add(ModelManager.getInstance().getAreaOnFloor(piece));
          }
        }
      }
    }
  }

  /**
   * Adds to ground shape the geometry matching the given area.
   * @param {Shape3D} groundShape
   * @param {HomeTexture} groundTexture
   * @param {Area} area
   * @param {number} elevation
   * @private
   */
  addAreaGeometry(groundShape, groundTexture, area, elevation) {
    let areaPoints = this.getAreaPoints(area, 1, false);
    if (areaPoints.length !== 0) {
      let vertexCount = 0;
      let stripCounts = new Array(areaPoints.length);
      for (var i = 0; i < stripCounts.length; i++) {
        stripCounts[i] = areaPoints[i].length;
        vertexCount += stripCounts[i];
      }
      let geometryCoords = new Array(vertexCount);
      let geometryTextureCoords = groundTexture !== null
        ? new Array(vertexCount)
        : null;

      let j = 0;
      for (let index = 0; index < areaPoints.length; index++) {
        let areaPartPoints = areaPoints[index];
        for (var i = 0; i < areaPartPoints.length; i++, j++) {
          let point = areaPartPoints[i];
          geometryCoords[j] = vec3.fromValues(point[0], elevation, point[1]);
          if (groundTexture !== null) {
            geometryTextureCoords[j] = vec2.fromValues(point[0] - this.originX, this.originY - point[1]);
          }
        }
      }

      let geometryInfo = new GeometryInfo3D(GeometryInfo3D.POLYGON_ARRAY);
      geometryInfo.setCoordinates(geometryCoords);
      if (groundTexture !== null) {
        geometryInfo.setTextureCoordinates(geometryTextureCoords);
      }
      geometryInfo.setStripCounts(stripCounts);
      geometryInfo.setCreaseAngle(0);
      geometryInfo.setGeneratedNormals(true);
      groundShape.addGeometry(geometryInfo.getIndexedGeometryArray());
    }
  }

  /**
   * Adds to ground shape the geometry matching the given area sides.
   * @param {Shape3D} groundShape
   * @param {HomeTexture} groundTexture
   * @param {Array} areaPoints
   * @param {number} elevation
   * @param {number} sideHeight
   * @private
   */
  addAreaSidesGeometry(groundShape, groundTexture, areaPoints, elevation, sideHeight) {
    let geometryCoords = new Array(areaPoints.length * 4);
    let geometryTextureCoords = groundTexture !== null
      ? new Array(geometryCoords.length)
      : null;
    for (let i = 0, j = 0; i < areaPoints.length; i++) {
      let point = areaPoints[i];
      let nextPoint = areaPoints[i < areaPoints.length - 1 ? i + 1 : 0];
      geometryCoords[j++] = vec3.fromValues(point[0], elevation, point[1]);
      geometryCoords[j++] = vec3.fromValues(point[0], elevation + sideHeight, point[1]);
      geometryCoords[j++] = vec3.fromValues(nextPoint[0], elevation + sideHeight, nextPoint[1]);
      geometryCoords[j++] = vec3.fromValues(nextPoint[0], elevation, nextPoint[1]);
      if (groundTexture !== null) {
        let distance = java.awt.geom.Point2D.distance(point[0], point[1], nextPoint[0], nextPoint[1]);
        geometryTextureCoords[j - 4] = vec2.fromValues(point[0], elevation);
        geometryTextureCoords[j - 3] = vec2.fromValues(point[0], elevation + sideHeight);
        geometryTextureCoords[j - 2] = vec2.fromValues(point[0] - distance, elevation + sideHeight);
        geometryTextureCoords[j - 1] = vec2.fromValues(point[0] - distance, elevation);
      }
    }

    let geometryInfo = new GeometryInfo3D(GeometryInfo3D.QUAD_ARRAY);
    geometryInfo.setCoordinates(geometryCoords);
    if (groundTexture !== null) {
      geometryInfo.setTextureCoordinates(geometryTextureCoords);
    }
    geometryInfo.setCreaseAngle(0);
    geometryInfo.setGeneratedNormals(true);
    groundShape.addGeometry(geometryInfo.getIndexedGeometryArray());
  }
}

/**
 * Areas of underground levels.
 * @constructor
 * @private
 */
class LevelAreas {
  constructor(level, undergroundArea) {
    if (undergroundArea === undefined) {
      undergroundArea = new java.awt.geom.Area();
    }
    this.level = level;
    this.undergroundArea = undergroundArea;
    this.roomArea = new java.awt.geom.Area();
    this.wallArea = new java.awt.geom.Area();
    this.undergroundSideArea = new java.awt.geom.Area();
    this.upperLevelArea = new java.awt.geom.Area();
  }
}

Ground3D.LevelAreas = LevelAreas;