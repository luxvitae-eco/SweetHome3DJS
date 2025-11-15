/*
 * ShapeTools.js
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

import {
  Polyline,
} from './SweetHome3D';

/**
 * Gathers some useful tools for shapes.
 * @class
 * @author Emmanuel Puybaret
 */
let ShapeTools = {
  parsedShapes: {}
};

/**
 * Returns the line stroke matching the given line styles.
 * @param {number} thickness
 * @param {Polyline.CapStyle} capStyle
 * @param {Polyline.JoinStyle} joinStyle
 * @param {number[]} dashPattern
 * @param {number} dashOffset
 * @return {Object}
 */
ShapeTools.getStroke = (thickness, capStyle, joinStyle, dashPattern, dashOffset) => {
  let strokeCapStyle;
  switch (capStyle) {
    case Polyline.CapStyle.ROUND:
      strokeCapStyle = java.awt.BasicStroke.CAP_ROUND;
      break;
    case Polyline.CapStyle.SQUARE:
      strokeCapStyle = java.awt.BasicStroke.CAP_SQUARE;
      break;
    default:
      strokeCapStyle = java.awt.BasicStroke.CAP_BUTT;
      break;
  }

  let strokeJoinStyle;
  switch (joinStyle) {
    case Polyline.JoinStyle.ROUND:
    case Polyline.JoinStyle.CURVED:
      strokeJoinStyle = java.awt.BasicStroke.JOIN_ROUND;
      break;
    case Polyline.JoinStyle.BEVEL:
      strokeJoinStyle = java.awt.BasicStroke.JOIN_BEVEL;
      break;
    default:
      strokeJoinStyle = java.awt.BasicStroke.JOIN_MITER;
      break;
  }

  let dashPhase = 0;
  if (dashPattern != null) {
    if (!Array.isArray(dashPattern)) {
      dashPattern = undefined;
      dashPhase = undefined;
    } else {
      dashPattern = dashPattern.slice(0);
      for (let i = 0; i < dashPattern.length; i++) {
        dashPattern[i] *= thickness;
        dashPhase += dashPattern[i];
      }
      dashPhase *= dashOffset;
    }
  }
  return new java.awt.BasicStroke(thickness, strokeCapStyle, strokeJoinStyle, 10, dashPattern, dashPhase);
}

/**
 * Returns the shape of a polyline.
 * @param {Array} points
 * @param {boolean} curved
 * @param {boolean} closedPath
 * @return {Object}
 */
ShapeTools.getPolylineShape = (points, curved, closedPath) => {
  if (curved) {
    let polylineShape = new java.awt.geom.GeneralPath();
    for (let i = 0, n = closedPath ? points.length : points.length - 1; i < n; i++) {
      let curve2D = new java.awt.geom.CubicCurve2D.Float();
      let previousPoint = points[i === 0 ? points.length - 1 : i - 1];
      let point = points[i];
      let nextPoint = points[i === points.length - 1 ? 0 : i + 1];
      let vectorToBisectorPoint = [nextPoint[0] - previousPoint[0], nextPoint[1] - previousPoint[1]];
      let nextNextPoint = points[(i + 2) % points.length];
      let vectorToBisectorNextPoint = [point[0] - nextNextPoint[0], point[1] - nextNextPoint[1]];
      curve2D.setCurve(point[0], point[1],
        point[0] + (i !== 0 || closedPath ? vectorToBisectorPoint[0] / 3.625 : 0),
        point[1] + (i !== 0 || closedPath ? vectorToBisectorPoint[1] / 3.625 : 0),
        nextPoint[0] + (i !== points.length - 2 || closedPath ? vectorToBisectorNextPoint[0] / 3.625 : 0),
        nextPoint[1] + (i !== points.length - 2 || closedPath ? vectorToBisectorNextPoint[1] / 3.625 : 0),
        nextPoint[0], nextPoint[1]);
      polylineShape.append(curve2D, true);
    }
    return polylineShape;
  } else {
    return ShapeTools.getShape(points, closedPath, null);
  }
}

/**
 * Returns the shape matching the coordinates in <code>points</code> array 
 * or the shape matching the given <a href="http://www.w3.org/TR/SVG/paths.html">SVG path shape</a> 
 * if the first parameter is a string.
 * @param {Array|string} points array or a SVG path 
 * @param {boolean} [closedPath]
 * @param {java.awt.geom.AffineTransform} [transform]
 * @return {Object}
 * @protected
 * @ignore
 */
ShapeTools.getShape = (points, closedPath, transform) => {
  if (points instanceof Array) {
    let path = new java.awt.geom.GeneralPath();
    path.moveTo(Math.fround(points[0][0]), Math.fround(points[0][1]));
    for (let i = 1; i < points.length; i++) {
      path.lineTo(Math.fround(points[i][0]), Math.fround(points[i][1]));
    }
    if (closedPath) {
      path.closePath();
    }
    if (transform != null) {
      path.transform(transform);
    }
    return path;
  } else {
    let svgPathShape = points;
    let shape2D = ShapeTools.parsedShapes[svgPathShape];
    if (!shape2D) {
      shape2D = new java.awt.geom.Rectangle2D.Float(0, 0, 1, 1);
      try {
        let pathProducer = new org.apache.batik.parser.AWTPathProducer();
        let pathParser = new org.apache.batik.parser.PathParser();
        pathParser.setPathHandler(pathProducer);
        pathParser.parse(svgPathShape);
        shape2D = pathProducer.getShape();
      } catch (ex) {
        // Keep default value if Batik is not available or if the path is incorrect
      }
      ShapeTools.parsedShapes[svgPathShape] = shape2D;
    }
    return shape2D;
  }
}

export { ShapeTools };
