/*
 * Object3DBranch.js
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
import { vec2, vec3, mat3 } from 'gl-matrix';

import {
  Room,
} from './SweetHome3D';

import {
  BranchGroup3D, Appearance3D,
} from './scene3d';
import { ShapeTools } from './ShapeTools';

/**
 * Root of a 3D branch that matches a home object. 
 * @param {Object} [item] 
 * @param {Home}   [home]
 * @param {UserPreferences} [userPreferences]
 * @constructor
 * @extends BranchGroup3D
 * @author Emmanuel Puybaret
 */
export class Object3DBranch extends BranchGroup3D {
  constructor(item, home, userPreferences) {
    super();
    if (item !== undefined) {
      this.setUserData(item);
      this.home = home;
      this.userPreferences = userPreferences
    }
  }

  /**
   * Returns home instance or <code>null</code>.
   * @return {Home}
   */
  getHome() {
    return this.home !== undefined ? this.home : null;
  }

  /**
   * Returns user preferences.
   * @return {UserPreferences}
   */
  getUserPreferences() {
    return this.userPreferences !== undefined ? this.userPreferences : null;
  }

  /**
   * Returns the shape matching the coordinates in <code>points</code> array.
   * @param {Array} points
   * @return {Shape}
   * @protected
   * @ignore
   */
  getShape(points) {
    return ShapeTools.getShape(points, true, null);
  }

  /**
   * Updates an appearance with the given colors.
   * @protected
   * @ignore
   */
  updateAppearanceMaterial(appearance, diffuseColor, ambientColor, shininess) {
    if (diffuseColor !== null) {
      appearance.setAmbientColor(vec3.fromValues(((ambientColor >>> 16) & 0xFF) / 255.,
        ((ambientColor >>> 8) & 0xFF) / 255.,
        (ambientColor & 0xFF) / 255.));
      appearance.setDiffuseColor(vec3.fromValues(((diffuseColor >>> 16) & 0xFF) / 255.,
        ((diffuseColor >>> 8) & 0xFF) / 255.,
        (diffuseColor & 0xFF) / 255.));
      appearance.setSpecularColor(vec3.fromValues(shininess, shininess, shininess));
      appearance.setShininess(Math.max(1, shininess * 128));
    } else {
      appearance.setAmbientColor(vec3.fromValues(.2, .2, .2));
      appearance.setDiffuseColor(vec3.fromValues(1, 1, 1));
      appearance.setSpecularColor(vec3.fromValues(shininess, shininess, shininess));
      appearance.setShininess(Math.max(1, shininess * 128));
    }
  }

  /**
   * Updates the texture transformation of an appearance.
   * and scaled if required.
   * @param {Appearance3D} appearance
   * @param {HomeTexture} texture
   * @param {boolean} [scaled]
   */
  updateTextureTransform(appearance, texture, scaled) {
    let textureWidth = texture.getWidth();
    let textureHeight = texture.getHeight();
    if (textureWidth === -1 || textureHeight === -1) {
      // Set a default value of 1m for textures with width and height equal to -1
      // (this may happen for textures retrieved from 3D models)
      textureWidth = 100.;
      textureHeight = 100.;
    }
    let textureXOffset = texture.getXOffset();
    let textureYOffset = texture.getYOffset();
    let textureScale = 1 / texture.getScale();
    let rotation = mat3.create();
    mat3.rotate(rotation, rotation, texture.getAngle());
    let translation = mat3.create();
    let transform = mat3.create();
    // Change scale if required
    if (scaled) {
      mat3.fromTranslation(translation, vec2.fromValues(-textureXOffset / textureScale * textureWidth, -textureYOffset / textureScale * textureHeight));
      mat3.scale(transform, transform, vec2.fromValues(textureScale / textureWidth, textureScale / textureHeight));
    } else {
      mat3.fromTranslation(translation, vec2.fromValues(-textureXOffset / textureScale, -textureYOffset / textureScale));
      mat3.multiplyScalar(transform, transform, textureScale);
    }
    mat3.mul(rotation, rotation, translation);
    mat3.mul(transform, transform, rotation);
    appearance.setTextureTransform(transform);
  }

  /**
   * Updates the texture transformation of an appearance to fit the surface matching <code>areaPoints</code>.
   * @param {Appearance3D} appearance
   * @param {HomeTexture} texture
   * @param {Array} areaPoints
   * @param {boolean} invertY
   */
  updateTextureTransformFittingArea(appearance, texture, areaPoints, invertY) {
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < areaPoints.length; i++) {
      minX = Math.min(minX, areaPoints[i][0]);
      minY = Math.min(minY, areaPoints[i][1]);
      maxX = Math.max(maxX, areaPoints[i][0]);
      maxY = Math.max(maxY, areaPoints[i][1]);
    }
    if (maxX - minX <= 0 || maxY - minY <= 0) {
      this.updateTextureTransform(appearance, texture, true);
    }

    let translation = mat3.create();
    mat3.fromTranslation(translation, vec2.fromValues(-minX, invertY ? minY : -minY));
    let transform = mat3.create();
    mat3.scale(transform, transform, vec2.fromValues(1 / (maxX - minX), 1 / (maxY - minY)));
    mat3.mul(transform, transform, translation);
    appearance.setTextureTransform(transform);
  }

  /**
   * Returns an appearance for selection shapes.
   * @return {Appearance}
   * @ignore
   */
  getSelectionAppearance() {
    let selectionAppearance = new Appearance3D();
    selectionAppearance.setCullFace(Appearance3D.CULL_NONE);
    selectionAppearance.setIllumination(0);
    selectionAppearance.setDiffuseColor(vec3.fromValues(0, 0, 0.7102));
    return selectionAppearance;
  }

  /**
   * Returns the list of polygons points matching the given <code>area</code> with detailed information in
   * <code>areaPoints</code> and <code>areaHoles</code> if they exists.
   * @param {Area} area
   * @param {Array} [areaPoints]
   * @param {Array} [areaHoles]
   * @param {number} flatness
   * @param {boolean} reversed
   * @return {Array}
   * @protected
   * @ignore
   */
  getAreaPoints(area, areaPoints, areaHoles, flatness, reversed) {
    if (flatness === undefined && reversed === undefined) {
      // 3 parameters
      flatness = areaPoints;
      reversed = areaHoles;
      areaPoints = null;
      areaHoles = null;
    }
    let areaPointsLists = [];
    let areaHolesLists = [];
    let currentPathPoints = null;
    let previousPoint = null;
    for (let it = area.getPathIterator(null, flatness); !it.isDone(); it.next()) {
      let point = [0, 0];
      switch ((it.currentSegment(point))) {
        case java.awt.geom.PathIterator.SEG_MOVETO:
          currentPathPoints = [];
          currentPathPoints.push(point);
          previousPoint = point;
          break;
        case java.awt.geom.PathIterator.SEG_LINETO:
          if (point[0] !== previousPoint[0] || point[1] !== previousPoint[1]) {
            currentPathPoints.push(point);
          }
          previousPoint = point;
          break;
        case java.awt.geom.PathIterator.SEG_CLOSE:
          const firstPoint = currentPathPoints[0];
          if (firstPoint[0] === previousPoint[0]
            && firstPoint[1] === previousPoint[1]) {
            currentPathPoints.splice(currentPathPoints.length - 1, 1);
          }
          if (currentPathPoints.length > 2) {
            let areaPartPoints = currentPathPoints;
            let subRoom = new Room(areaPartPoints);
            if (subRoom.getArea() > 0) {
              let pathPointsClockwise = subRoom.isClockwise();
              if (pathPointsClockwise) {
                areaHolesLists.push(currentPathPoints);
              } else {
                areaPointsLists.push(currentPathPoints);
              }
              if (areaPoints !== null || areaHoles !== null) {
                if (pathPointsClockwise !== reversed) {
                  areaPartPoints = currentPathPoints.slice(0);
                  areaPartPoints.reverse();
                }
                if (pathPointsClockwise) {
                  if (areaHoles != null) {
                    areaHoles.push(areaPartPoints);
                  }
                } else {
                  if (areaPoints != null) {
                    areaPoints.push(areaPartPoints);
                  }
                }
              }
            }
          }
          break;
      }
    }

    let areaPointsWithoutHoles = [];
    if ((areaHolesLists.length === 0) && areaPoints !== null) {
      areaPointsWithoutHoles.push.apply(areaPointsWithoutHoles, areaPoints);
    } else if ((areaPointsLists.length === 0) && !(areaHolesLists.length === 0)) {
      if (areaHoles !== null) {
        areaHoles.length = 0;
      }
    } else {
      let sortedAreaPoints;
      let subAreas = [];
      if (areaPointsLists.length > 1) {
        sortedAreaPoints = [];
        for (var i = 0; areaPointsLists.length !== 0;) {
          let testedArea = areaPointsLists[i];
          var j = 0;
          for (; j < areaPointsLists.length; j++) {
            if (i !== j) {
              let testedAreaPoints = areaPointsLists[j];
              var subArea = null;
              for (var k = 0; k < subAreas.length; k++) {
                if (subAreas[k].key === testedAreaPoints) {
                  subArea = subAreas[k].value;
                  break;
                }
              }
              if (subArea == null) {
                subArea = new java.awt.geom.Area(this.getShape(testedAreaPoints.slice(0)));
                subAreas.push({ key: testedAreaPoints, value: subArea });
              }
              if (subArea.contains(testedArea[0][0], testedArea[0][1])) {
                break;
              }
            }
          }
          if (j === areaPointsLists.length) {
            areaPointsLists.splice(i, 1);
            sortedAreaPoints.push(testedArea);
            i = 0;
          } else if (i < areaPointsLists.length) {
            i++;
          } else {
            i = 0;
          }
        }
      } else {
        sortedAreaPoints = areaPointsLists;
      }
      for (var i = sortedAreaPoints.length - 1; i >= 0; i--) {
        let enclosingAreaPartPoints = sortedAreaPoints[i];
        var subArea = null;
        for (var k = 0; k < subAreas.length; k++) {
          if (subAreas[k].key === enclosingAreaPartPoints) {
            subArea = subAreas[k].value;
            break;
          }
        }
        if (subArea === null) {
          subArea = new java.awt.geom.Area(this.getShape(enclosingAreaPartPoints.slice(0)));
        }
        let holesInArea = [];
        for (var k = 0; k < areaHolesLists.length; k++) {
          var holePoints = areaHolesLists[k];
          if (subArea.contains(holePoints[0][0], holePoints[0][1])) {
            holesInArea.push(holePoints);
          }
        }

        let lastEnclosingAreaPointJoiningHoles = null;
        while (holesInArea.length !== 0) {
          let minDistance = Number.MAX_VALUE;
          let closestHolePointsIndex = 0;
          let closestPointIndex = 0;
          let areaClosestPointIndex = 0;
          for (var j = 0; j < holesInArea.length && minDistance > 0; j++) {
            var holePoints = holesInArea[j];
            for (var k = 0; k < holePoints.length && minDistance > 0; k++) {
              for (let l = 0; l < enclosingAreaPartPoints.length && minDistance > 0; l++) {
                let enclosingAreaPartPoint = enclosingAreaPartPoints[l];
                let distance = java.awt.geom.Point2D.distanceSq(holePoints[k][0], holePoints[k][1],
                  enclosingAreaPartPoint[0], enclosingAreaPartPoint[1]);
                if (distance < minDistance
                  && lastEnclosingAreaPointJoiningHoles !== enclosingAreaPartPoint) {
                  minDistance = distance;
                  closestHolePointsIndex = j;
                  closestPointIndex = k;
                  areaClosestPointIndex = l;
                }
              }
            }
          }
          let closestHolePoints = holesInArea[closestHolePointsIndex];
          if (minDistance !== 0) {
            lastEnclosingAreaPointJoiningHoles = enclosingAreaPartPoints[areaClosestPointIndex];
            enclosingAreaPartPoints.splice(areaClosestPointIndex, 0, lastEnclosingAreaPointJoiningHoles);
            enclosingAreaPartPoints.splice(++areaClosestPointIndex, 0, closestHolePoints[closestPointIndex]);
          }
          let lastPartPoints = closestHolePoints.slice(closestPointIndex, closestHolePoints.length);
          for (var k = 0; k < lastPartPoints.length; k++, areaClosestPointIndex++) {
            enclosingAreaPartPoints.splice(areaClosestPointIndex, 0, lastPartPoints[k]);
          }
          let points = closestHolePoints.slice(0, closestPointIndex);
          for (var k = 0; k < points.length; k++, areaClosestPointIndex++) {
            enclosingAreaPartPoints.splice(areaClosestPointIndex, 0, points[k]);
          }

          holesInArea.splice(closestHolePointsIndex, 1);
          areaHolesLists.splice(closestHolePoints, 1);
        }
      }
      for (var k = 0; k < sortedAreaPoints.length; k++) {
        let pathPoints = sortedAreaPoints[k];
        if (reversed) {
          pathPoints.reverse();
        }
        areaPointsWithoutHoles.push(pathPoints.slice(0));
      }
    }
    return areaPointsWithoutHoles;
  }

  /**
   * Returns <code>true</code> if the given arrays contain the same values. 
   * @private
   */
  static areModelRotationsEqual(rotation1, rotation2) {
    if (rotation1 === rotation2) {
      return true;
    } else if (rotation1 == null || rotation2 == null) {
      return false;
    } else {
      for (let i = 0; i < rotation1.length; i++) {
        for (let j = 0; j < rotation2.length; j++) {
          if (rotation1[i][j] !== rotation2[i][j]) {
            return false;
          }
        }
      }
      return true;
    }
  }
}

Object3DBranch.DEFAULT_COLOR = 0xFFFFFF;
Object3DBranch.DEFAULT_AMBIENT_COLOR = 0x333333;
