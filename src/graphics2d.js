/*
 * graphics2d.js
 *
 * Sweet Home 3D, Copyright (c) 2024 Space Mushrooms <info@sweethome3d.com>
 *
 * Copyright (c) 1997, 2013, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * This code is free software; you can redistribute it and/or modify it
 * under the terms of the GNU General Public License version 2 only, as
 * published by the Free Software Foundation.  Oracle designates this
 * particular file as subject to the "Classpath" exception as provided
 * by Oracle in the LICENSE file that accompanied OpenJDK 8 source code.
 *
 * This code is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
 * FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public License
 * version 2 for more details (a copy is included in the LICENSE file that
 * accompanied this code).
 *
 * You should have received a copy of the GNU General Public License
 * along with this program; if not, write to the Free Software
 * Foundation, Inc., 59 Temple Place, Suite 330, Boston, MA  02111-1307  USA
 */

import { UnsupportedOperationException } from './core';
import { PropertyChangeSupport } from './core';

// Graphics classes of OpenJDK 8 translated to Javascript

/**
 * This class is a wrapper that implements 2D drawing functions on a canvas.
 * Creates a new instance wrapping the given HTML canvas.
 * @constructor
 * @author Renaud Pawlak
 * @author Emmanuel Puybaret
 */
export class Graphics2D {
  constructor(canvas) {
    this.context = canvas.getContext("2d");
    this.context.imageSmoothingEnabled = true;
    this.context.setTransform(1, 0, 0, 1, 0, 0);
    // Need to store also the current transform in Graphics2D 
    // because context.currentTransform isn't supported under all browsers
    this.currentTransform = new java.awt.geom.AffineTransform(1., 0., 0., 1., 0., 0.);

    let computedStyle = window.getComputedStyle(canvas);
    this.context.font = computedStyle.font;
    this.color = computedStyle.color;
    this.background = computedStyle.background;
  }

  /**
   * Clears the canvas.
   */
  clear() {
    this.context.clearRect(0, 0, this.context.canvas.width, this.context.canvas.height);
  }

  /**
   * Gets the wrapped canvas context.
   */
  getContext() {
    return this.context;
  }

  /**
   * Draws a shape on the canvas using the current stroke.
   * @param {java.awt.Shape} shape the shape to be drawn
   */
  draw(shape) {
    this.createPathFromShape(shape);
    this.context.stroke();
  }

  /**
   * @param {java.awt.Shape} shape the shape to create a path from
   * @private
   */
  createPathFromShape(s) {
    this.context.beginPath();
    let it = s.getPathIterator(java.awt.geom.AffineTransform.getTranslateInstance(0, 0));
    let coords = new Array(6);
    while (!it.isDone()) {
      switch (it.currentSegment(coords)) {
        case java.awt.geom.PathIterator.SEG_MOVETO:
          this.context.moveTo(coords[0], coords[1]);
          break;
        case java.awt.geom.PathIterator.SEG_LINETO:
          this.context.lineTo(coords[0], coords[1]);
          break;
        case java.awt.geom.PathIterator.SEG_QUADTO:
          this.context.lineTo(coords[0], coords[1]);
          break;
        case java.awt.geom.PathIterator.SEG_CUBICTO:
          this.context.bezierCurveTo(coords[0], coords[1], coords[2], coords[3], coords[4], coords[5]);
          break;
        case java.awt.geom.PathIterator.SEG_CLOSE:
          this.context.closePath();
          break;
        default:
          break;
      }
      it.next();
    }
  }

  /**
   * Fills a shape on the canvas using the current paint.
   * @param {java.awt.Shape} shape the shape to be filled
   */
  fill(s) {
    this.createPathFromShape(s);
    this.context.fill();
  }

  /**
   * Draws an image on the canvas.
   * @param {HTMLImageElement} img the image to be drawn
   * @param {number} x
   * @param {number} y
   * @param {string} [bgcolor]
   */
  drawImage(img, x, y, bgcolor) {
    this.context.drawImage(img, x, y);
  }

  /**
   * Draws an image on the canvas.
   * @param {HTMLImageElement} img the image to be drawn
   * @param {number} x
   * @param {number} y
   * @param {number} width
   * @param {number} height
   * @param {string} [bgcolor]
   */
  drawImageWithSize(img, x, y, width, height, bgcolor) {
    this.context.drawImage(img, x, y, width, height);
  }

  /**
   * Gets the current clip.
   * @return {java.awt.Shape} the clip as a shape
   */
  getClip() {
    return this.clipZone !== undefined ? this.clipZone : null;
  }

  /**
   * Sets the current clip.
   * @param {java.awt.Shape} clip the clip as a shape
   */
  setClip(clip) {
    if (this.clipZone !== undefined) {
      this.context.restore();
      delete this.clipZone;
    }
    if (clip != null) {
      this.clip(clip);
    }
  }

  /**
   * Adds the given clip to the current clip.
   * @param {java.awt.Shape} clip the added clip as a shape
   */
  clip(clip) {
    if (this.clipZone === undefined) {
      // Save current clipping zone
      this.context.save();
    }
    this.clipZone = clip;
    if (clip != null) {
      this.createPathFromShape(clip);
      this.context.clip();
    }
  }

  /**
   * Sets the current clip as a rectangle region.
   * @param {number} x
   * @param {number} y
   * @param {number} width
   * @param {number} height
   */
  clipRect(x, y, width, height) {
    this.setClip(new java.awt.geom.Rectangle2D.Double(x, y, width, height));
  }

  /**
   * Translates the canvas transform matrix.
   * @param {number} x
   * @param {number} y
   */
  translate(x, y) {
    this.currentTransform.translate(x, y);
    this.context.translate(x, y);
  }

  /**
   * Draws a string outline with the current stroke.
   * @param {string} str
   * @param {number} x
   * @param {number} y
   */
  drawStringOutline(str, x, y) {
    this.context.strokeText(str, x, y);
  }

  /**
   * Draws a string with the current paint.
   * @param {string} str
   * @param {number} x
   * @param {number} y
   */
  drawString(str, x, y) {
    this.context.fillText(str, x, y);
  }

  /**
   * Fills the given rectangular region with the current paint.
   * @param {number} x
   * @param {number} y
   * @param {number} width
   * @param {number} height
   */
  fillRect(x, y, width, height) {
    this.context.fillRect(x, y, width, height);
  }

  /**
   * Sets the current stroke and fill style as a CSS style.
   * @param {string} color a CSS style
   */
  setColor(color) {
    this.color = color;
    this.context.strokeStyle = color;
    this.context.fillStyle = color;
  }

  /**
   * Gets the current color.
   */
  getColor() {
    return this.color;
  }

  setComposite(c) {
    this.setColor(c);
  }

  /**
   * Sets the alpha component for all subsequent drawing and fill operations.
   * @param {number} alpha
   */
  setAlpha(alpha) {
    this.context.globalAlpha = alpha;
  }

  /**
   * Gets the alpha component of the canvas.
   * @return {number}
   */
  getAlpha() {
    return this.context.globalAlpha;
  }

  /**
   * Rotates the canvas current transform matrix.
   * @param {number} theta the rotation angle
   * @param {number} [x] the rotation origin (x)
   * @param {number} [y] the rotation origin (y)
   */
  rotate(theta, x, y) {
    if (typeof x === 'number' && typeof y === 'number') {
      this.currentTransform.rotate(theta, x, y);
      this.context.translate(-x, -y);
      this.context.rotate(theta);
      this.context.translate(x, y);
    } else {
      this.currentTransform.rotate(theta);
      this.context.rotate(theta);
    }
  }

  /**
   * Scales the canvas current transform matrix.
   * @param {number} sx the x scale factor
   * @param {number} sy the y scale factor
   */
  scale(sx, sy) {
    this.currentTransform.scale(sx, sy);
    this.context.scale(sx, sy);
  }

  /**
   * Shears the canvas current transform matrix.
   * @param {number} shx the x shear factor
   * @param {number} shy the y shear factor
   */
  shear(shx, shy) {
    this.currentTransform.shear(shx, shy);
    this.context.transform(0, shx, shy, 0, 0, 0);
  }

  /**
   * @ignore
   */
  dispose() {
  }

  /**
   * Sets the current font.
   * @param {string} font a CSS font descriptor
   */
  setFont(font) {
    this.context.font = font;
  }

  /**
   * Gets the current font.
   * @return {string} a CSS font descriptor
   */
  getFont() {
    return this.context.font;
  }

  /**
   * Sets the fill style as a color.
   * @param {string} color a CSS color descriptor
   */
  setBackground(color) {
    this.background = color;
    this.context.fillStyle = color;
  }

  /**
   * Gets the fill style.
   * @return {string} a CSS color descriptor
   */
  getBackground() {
    return this.background;
  }

  /**
   * Sets (overrides) the current transform matrix.
   * @param {java.awt.geom.AffineTransform} transform the new transform matrix
   */
  setTransform(transform) {
    this.currentTransform.setTransform(transform);
    this.context.setTransform(transform.getScaleX(), transform.getShearY(), transform.getShearX(), transform.getScaleY(), transform.getTranslateX(), transform.getTranslateY());
  }

  /**
   * Gets the current transform matrix.
   * @return {java.awt.geom.AffineTransform} the current transform matrix
   */
  getTransform() {
    return new java.awt.geom.AffineTransform(this.currentTransform);
  }

  /**
   * Applies the given transform matrix to the current transform matrix.
   * @param {java.awt.geom.AffineTransform} transform the transform matrix to be applied
   */
  transform(transform) {
    this.currentTransform.concatenate(transform);
    this.context.transform(transform.getScaleX(), transform.getShearX(), transform.getShearY(), transform.getScaleY(), transform.getTranslateX(), transform.getTranslateY());
  }

  setPaintMode() {
  }

  /**
   * Gets the current paint.
   * @return {string|CanvasPattern}
   */
  getPaint() {
    return this.color;
  }

  /**
   * Sets the current paint.
   * @param {string|CanvasPattern} paint
   */
  setPaint(paint) {
    if (typeof paint === "string") {
      this.setColor(paint);
    } else {
      this.context.strokeStyle = paint;
      this.context.fillStyle = paint;
    }
  }

  /**
   * Sets the current stroke.
   */
  setStroke(s) {
    this.context.lineWidth = s.getLineWidth();
    if (s.getDashArray() != null) {
      this.context.setLineDash(s.getDashArray());
      this.context.lineDashOffset = s.getDashPhase();
    } else {
      this.context.setLineDash([]);
    }
    switch (s.getLineJoin()) {
      case java.awt.BasicStroke.JOIN_BEVEL:
        this.context.lineJoin = "bevel";
        break;
      case java.awt.BasicStroke.JOIN_MITER:
        this.context.lineJoin = "miter";
        break;
      case java.awt.BasicStroke.JOIN_ROUND:
        this.context.lineJoin = "round";
        break;
    }
    switch (s.getEndCap()) {
      case java.awt.BasicStroke.CAP_BUTT:
        this.context.lineCap = "butt";
        break;
      case java.awt.BasicStroke.CAP_ROUND:
        this.context.lineCap = "round";
        break;
      case java.awt.BasicStroke.CAP_SQUARE:
        this.context.lineCap = "square";
        break;
    }
    this.context.miterLimit = s.getMiterLimit();
  }

  /**
   * Creates a pattern from an image.
   * @param {HTMLImageElement} image
   * @return CanvasPattern
   */
  createPattern(image) {
    return this.context.createPattern(image, 'repeat');
  }
}

/**
 * This utility class allows to get the metrics of a given font. Note that this class will approximate
 * the metrics on older browsers where CanvasRenderingContext2D.measureText() is only partially implemented.
 * Builds a font metrics instance for the given font.
 * @param {string} font the given font, in a CSS canvas-compatible representation
 * @constructor
 * @author Renaud Pawlak
 * @author Emmanuel Puybaret
 */
export class FontMetrics {
  constructor(font) {
    this.approximated = false;
    this.font = font;
    this.cached = false;
  }

  /**
   * Gets the bounds of the given string for this font metrics.
   * @param {string} aString the string to get the bounds of
   * @return {java.awt.geom.Rectangle2D} the bounds as an instance of java.awt.geom.Rectangle2D
   */
  getStringBounds(aString) {
    this.compute(aString);
    this.cached = false;
    return new java.awt.geom.Rectangle2D.Double(0, -this.ascent, this.width, this.height);
  }

  /**
   * Gets the font ascent.
   * @return {number} the font ascent
   */
  getAscent() {
    if (!this.cached) {
      this.compute("Llp");
    }
    return this.ascent;
  }

  /**
   * Gets the font descent.
   * @return {number} the font descent
   */
  getDescent() {
    if (!this.cached) {
      this.compute("Llp");
    }
    return this.descent;
  }

  /**
   * Gets the font height.
   * @return {number} the font height
   */
  getHeight() {
    if (!this.cached) {
      this.compute("Llp");
    }
    return this.height;
  }

  /**
   * Computes the various dimensions of the given string, for the current canvas and font.
   * This function caches the results so that it can be fast accessed in other functions.
   * @param {string} aString the string to compute the dimensions of
   * @private
   */
  compute(aString) {
    if (!FontMetrics.context) {
      FontMetrics.context = document.createElement("canvas").getContext("2d");
    }
    FontMetrics.context.font = this.font;
    let textMetrics = FontMetrics.context.measureText(aString);
    if (textMetrics.fontBoundingBoxAscent) {
      this.cached = true;
      this.ascent = textMetrics.fontBoundingBoxAscent;
      this.descent = textMetrics.fontBoundingBoxDescent;
      this.height = this.ascent + this.descent;
      this.width = textMetrics.width;
    } else {
      // height info is not available on old browsers, so we build an approx.
      if (!this.approximated) {
        this.approximated = true;
        let font = new Font(this.font);
        this.height = parseInt(font.size);
        if (["Times", "Serif", "Helvetica"].indexOf(font.family) === -1) {
          this.height *= 1.18;
        }
        this.descent = 0.23 * this.height;
        this.ascent = this.height - this.descent;
        this.cached = true;
      }
      this.width = textMetrics.width;
    }
  }
}

/**
 * A font utility class.
 * Creates a new font from a CSS font descriptor.
 * @param cssFontDecriptor {string|Object} the font descriptor as a CSS string or an object {style, size, family, weight}
 * @constructor
 * @author Renaud Pawlak
 */
export class Font {
  constructor(cssFontDecriptor) {
    // font desciptors are normalized by the browser using the getComputedStyle function
    if (!Font.element) {
      Font.element = document.createElement('span');
      Font.element.style.display = 'none';
      document.body.appendChild(Font.element);
    }
    if (typeof cssFontDecriptor === 'string') {
      Font.element.style.font = cssFontDecriptor;
    } else {
      if (cssFontDecriptor.style) {
        Font.element.style.fontStyle = cssFontDecriptor.style;
      }
      if (cssFontDecriptor.size) {
        Font.element.style.fontSize = cssFontDecriptor.size;
      }
      if (cssFontDecriptor.family) {
        Font.element.style.fontFamily = cssFontDecriptor.family;
      }
      if (cssFontDecriptor.weight) {
        Font.element.style.fontWeight = cssFontDecriptor.weight;
      }
    }
    this.computedStyle = window.getComputedStyle(Font.element);
    this.size = this.computedStyle.fontSize;
    this.family = this.computedStyle.fontFamily;
    this.style = this.computedStyle.fontStyle;
    this.weight = this.computedStyle.fontWeight;
  }

  /**
   * Returns the font as a browser-normalized CSS string.
   * @return {string}
   */
  toString() {
    let font = '';
    if (this.weight != 'normal') {
      font = this.weight + ' ';
    }
    if (this.style != 'normal') {
      font += this.style + ' ';
    }
    font += this.size + ' ' + this.family;
    return font;
  }
}

/**
 * Creates an empty action.
 * Adapted from javax.swing.AbstractAction
 * @constructor
 * @author Georges Saab
 * @ignore
 */
export class AbstractAction {
  constructor() {
    this.enabled = true;
  }

  /**
   * Unsupported operation. Subclasses should override this method if they want
   * to associate a real action to this class.
   * @param {java.awt.event.ActionEvent} ev
   */
  actionPerformed(ev) {
    throw new UnsupportedOperationException();
  }

  /**
   * Gets the <code>Object</code> associated with the specified key.
   * @param {string} key a string containing the specified <code>key</code>
   * @return {Object} the binding <code>Object</code> stored with this key; if there
   *          are no keys, it will return <code>null</code>
   */
  getValue(key) {
    if (key == "enabled") {
      return this.enabled;
    }
    if (this.arrayTable == null) {
      return null;
    }
    return this.arrayTable[key];
  }

  /**
   * Sets the <code>Value</code> associated with the specified key.
   * @param {string} key  the <code>String</code> that identifies the stored object
   * @param {Object} newValue the <code>Object</code> to store using this key
   */
  putValue(key, newValue) {
    let oldValue = null;
    if (key == "enabled") {
      if (newValue == null || !(newValue instanceof Boolean)) {
        newValue = false;
      }
      oldValue = this.enabled;
      this.enabled = newValue;
    } else {
      if (this.arrayTable == null) {
        this.arrayTable = {};
      }
      if (this.arrayTable[key] != null)
        oldValue = this.arrayTable[key];
      // Remove the entry for key if newValue is null
      // else put in the newValue for key.
      if (newValue == null) {
        delete this.arrayTable.key;
      } else {
        this.arrayTable[key] = newValue;
      }
    }
    if (this.changeSupport != null) {
      this.firePropertyChange(key, oldValue, newValue);
    }
  }

  /**
   * Returns true if the action is enabled.
   * @return {boolean} true if the action is enabled, false otherwise
   */
  isEnabled() {
    return this.enabled;
  }

  /**
   * Sets whether the Action is enabled.
   * @param {boolean} newValue true to enable the action, false to disable it
   */
  setEnabled(enabled) {
    if (this.enabled != enabled) {
      this.enabled = enabled;
      if (this.changeSupport != null) {
        this.firePropertyChange("enabled", !enabled, enabled);
      }
    }
  }

  /**
   * Returns an array of <code>Object</code> which are keys for
   * which values have been set for this <code>AbstractAction</code>,
   * or <code>null</code> if no keys have values set.
   * @return an array of key objects, or <code>null</code> if no keys have values set
   */
  getKeys() {
    if (this.arrayTable == null) {
      return null;
    }
    return this.arrayTable.getOwnPropertyNames();
  }

  /**
   * Supports reporting bound property changes.  This method can be called
   * when a bound property has changed and it will send the appropriate
   * <code>PropertyChangeEvent</code> to any registered listener.
   * @protected
   */
  firePropertyChange(propertyName, oldValue, newValue) {
    if (this.changeSupport == null
      || (oldValue != null && newValue != null && oldValue == newValue)) {
      return;
    }
    this.changeSupport.firePropertyChange(propertyName, oldValue, newValue);
  }

  /**
   * Adds a <code>PropertyChangeListener</code> to the listener list.
   * The listener is registered for all properties.
   * <p>A <code>PropertyChangeEvent</code> will get fired in response to setting
   * a bound property, e.g. <code>setFont</code>, <code>setBackground</code>,
   * or <code>setForeground</code>.
   * Note that if the current component is inheriting its foreground,
   * background, or font from its container, then no event will be
   * fired in response to a change in the inherited property.
   * @param {PropertyChangeListener} listener The <code>PropertyChangeListener</code> to be added
   */
  addPropertyChangeListener(listener) {
    if (this.changeSupport == null) {
      this.changeSupport = new PropertyChangeSupport(this);
    }
    this.changeSupport.addPropertyChangeListener(listener);
  }

  /**
   * Removes a <code>PropertyChangeListener</code> from the listener list.
   * This removes a <code>PropertyChangeListener</code> that was registered
   * for all properties.
   * @param {PropertyChangeListener} listener  the <code>PropertyChangeListener</code> to be removed
   */
  removePropertyChangeListener(listener) {
    if (this.changeSupport == null) {
      return;
    }
    this.changeSupport.removePropertyChangeListener(listener);
  }

  /**
   * Returns an array of all the <code>PropertyChangeListener</code>s added
   * to this AbstractAction with addPropertyChangeListener().
   * @return {PropertyChangeListener[]} all of the <code>PropertyChangeListener</code>s added or an empty
   *         array if no listeners have been added
   */
  getPropertyChangeListeners() {
    if (this.changeSupport == null) {
      return new PropertyChangeListener[0];
    }
    return this.changeSupport.getPropertyChangeListeners();
  }
}

/**
 * Useful constants that can be used as the storage-retrieval key
 * when setting or getting one of this object's properties (text
 * or icon).
 */
/**
 * Not currently used.
 */
AbstractAction.DEFAULT = "Default";

/**
 * The key used for storing the <code>String</code> name
 * for the action, used for a menu or button.
 */
AbstractAction.NAME = "Name";

/**
 * The key used for storing a short <code>String</code>
 * description for the action, used for tooltip text.
 */
AbstractAction.SHORT_DESCRIPTION = "ShortDescription";

/**
 * The key used for storing a longer <code>String</code>
 * description for the action, could be used for context-sensitive help.
 */
AbstractAction.LONG_DESCRIPTION = "LongDescription";

/**
 * The key used for storing a small <code>Icon</code>, such
 * as <code>ImageIcon</code>.  This is typically used with
 * menus such as <code>JMenuItem</code>.
 * <p>If the same <code>Action</code> is used with menus and buttons you'll
 * typically specify both a <code>SMALL_ICON</code> and a
 * <code>LARGE_ICON_KEY</code>.  The menu will use the
 * <code>SMALL_ICON</code> and the button will use the
 * <code>LARGE_ICON_KEY</code>.
 */
AbstractAction.SMALL_ICON = "SmallIcon";

/**
 * The key used to determine the command <code>String</code> for the
 * <code>ActionEvent</code> that will be created when an
 * <code>Action</code> is going to be notified as the result of
 * residing in a <code>Keymap</code> associated with a
 * <code>JComponent</code>.
 */
AbstractAction.ACTION_COMMAND_KEY = "ActionCommandKey";

/**
 * The key used for storing a <code>KeyStroke</code> to be used as the
 * accelerator for the action.
 */
AbstractAction.ACCELERATOR_KEY = "AcceleratorKey";

/**
 * The key used for storing an <code>Integer</code> that corresponds to
 * one of the <code>KeyEvent</code> key codes.  The value is
 * commonly used to specify a mnemonic.  For example:
 * <code>myAction.putValue(Action.MNEMONIC_KEY, KeyEvent.VK_A)</code>
 * sets the mnemonic of <code>myAction</code> to 'a', while
 * <code>myAction.putValue(Action.MNEMONIC_KEY, KeyEvent.getExtendedKeyCodeForChar('\u0444'))</code>
 * sets the mnemonic of <code>myAction</code> to Cyrillic letter "Ef".
 */
AbstractAction.MNEMONIC_KEY = "MnemonicKey";

/**
 * The key used for storing a <code>Boolean</code> that corresponds
 * to the selected state.  This is typically used only for components
 * that have a meaningful selection state.  For example,
 * <code>JRadioButton</code> and <code>JCheckBox</code> make use of
 * this but instances of <code>JMenu</code> don't.
 * <p>This property differs from the others in that it is both read
 * by the component and set by the component.  For example,
 * if an <code>Action</code> is attached to a <code>JCheckBox</code>
 * the selected state of the <code>JCheckBox</code> will be set from
 * that of the <code>Action</code>.  If the user clicks on the
 * <code>JCheckBox</code> the selected state of the <code>JCheckBox</code>
 * <b>and</b> the <code>Action</code> will <b>both</b> be updated.
 */
AbstractAction.SELECTED_KEY = "SwingSelectedKey";

/**
 * The key used for storing an <code>Integer</code> that corresponds
 * to the index in the text (identified by the <code>NAME</code>
 * property) that the decoration for a mnemonic should be rendered at.  If
 * the value of this property is greater than or equal to the length of
 * the text, it will treated as -1.
 */
AbstractAction.DISPLAYED_MNEMONIC_INDEX_KEY = "SwingDisplayedMnemonicIndexKey";

/**
 * The key used for storing an <code>Icon</code>.  This is typically
 * used by buttons, such as <code>JButton</code> and
 * <code>JToggleButton</code>.
 * <p>If the same <code>Action</code> is used with menus and buttons you'll
 * typically specify both a <code>SMALL_ICON</code> and a
 * <code>LARGE_ICON_KEY</code>.  The menu will use the
 * <code>SMALL_ICON</code> and the button the <code>LARGE_ICON_KEY</code>.
 */
AbstractAction.LARGE_ICON_KEY = "SwingLargeIconKey";
