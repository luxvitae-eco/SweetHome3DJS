/*
 * HTMLCanvas3D.js
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
import { vec2, vec3, vec4, mat3, mat4 } from 'gl-matrix';

import {
  Appearance3D, Group3D, Link3D, Shape3D,
  TransformGroup3D, Background3D, IndexedTriangleArray3D,
  Light3D, DirectionalLight3D,
} from './scene3d';
import { ModelLoader } from './ModelLoader';

/**
 * Creates a canvas 3D bound to HTML canvas with the given id.
 * @param {string|HTMLCanvasElement}  canvasId  the value of the id attribute of the canvas bound 
 *                     to this component or the canvas itself
 * @param {boolean} [offscreen]  
 * @constructor
 * @author Emmanuel Puybaret
 */
export class HTMLCanvas3D {
  constructor(canvasId, offscreen) {
    this.scene = null;
    this.textures = [];
    this.sharedGeometries = [];
    this.sceneGeometries = [];
    this.backgroundGeometries = [];
    this.lights = [];
    this.fieldOfView = Math.PI * 45 / 180;
    this.frontClipDistance = 0.1;
    this.backClipDistance = 100;
    this.projectionPolicy = HTMLCanvas3D.PERSPECTIVE_PROJECTION;
    this.offscreen = offscreen === true;

    // Initialize WebGL
    this.canvas = typeof canvasId === 'string'
      ? document.getElementById(canvasId)
      : canvasId;
    this.gl = this.canvas.getContext("webgl");
    if (!this.gl) {
      this.gl = this.canvas.getContext("experimental-webgl");
      if (!this.gl) {
        throw "No WebGL";
      }
    }
    this.updateViewportSize();

    // Initialize shader
    this.shaderProgram = this.gl.createProgram();
    const vertexShader = this.createShader(this.gl.VERTEX_SHADER,
      "attribute vec3 vertexPosition;"
      + "attribute vec3 vertexNormal;"
      + "attribute vec2 vertexTextureCoord;"
      + "uniform mat4 modelViewTransform;"
      + "uniform mat4 projectionTransform;"
      + "uniform bool textureCoordinatesGenerated;"
      + "uniform vec4 planeS;"
      + "uniform vec4 planeT;"
      + "uniform mat3 textureCoordTransform;"
      + "uniform mat3 normalTransform;"
      + "uniform bool ignoreNormal;"
      + "uniform bool backFaceNormalFlip;"
      + "uniform bool lightingEnabled;"
      + "uniform bool useTextures;"
      + "varying vec2 varTextureCoord;"
      + "varying vec4 varVertexPosition;"
      + "varying vec3 varTransformedNormal;"
      + "void main(void) {"
      + "  varVertexPosition = modelViewTransform * vec4(vertexPosition, 1.0);"
      + "  gl_Position = projectionTransform * varVertexPosition;"
      + "  if (useTextures) {"
      + "    if (textureCoordinatesGenerated) {"
      + "      varTextureCoord = vec2(vertexPosition.x * planeS.x + vertexPosition.y * planeS.y"
      + "          + vertexPosition.z * planeS.z + planeS.w,"
      + "            vertexPosition.x * planeT.x + vertexPosition.y * planeT.y"
      + "          + vertexPosition.z * planeT.z + planeT.w);"
      + "    } else {"
      + "      varTextureCoord = vec2(vertexTextureCoord);"
      + "    }"
      + "    varTextureCoord = vec2(textureCoordTransform * vec3(varTextureCoord, 1));"
      + "  }"
      + "  if (lightingEnabled) {"
      + "    vec3 normal;"
      + "    if (ignoreNormal) {"
      + "      normal = vec3(1., 1., 1.);"
      + "    } else {"
      + "      normal = vertexNormal;"
      + "      if (backFaceNormalFlip) {"
      + "        normal = -normal;"
      + "      }"
      + "    }"
      + "    varTransformedNormal = normalize(normalTransform * normal);"
      + "  }"
      + "}");
    this.gl.attachShader(this.shaderProgram, vertexShader);
    const fragmentShader = this.createShader(this.gl.FRAGMENT_SHADER,
      "precision mediump float;"
      + "uniform vec3  vertexDiffuseColor;"
      + "uniform vec3  vertexSpecularColor;"
      + "uniform float shininess;"
      + "uniform sampler2D sampler;"
      + "uniform float alpha;"
      + "uniform bool  useTextures;"
      + "uniform bool  lightingEnabled;"
      + "uniform vec3  ambientColor;"
      + "uniform int   directionalLightCount;"
      + "uniform vec3  lightDirections[" + HTMLCanvas3D.MAX_DIRECTIONAL_LIGHT + "];"
      + "uniform vec3  directionalLightColors[" + HTMLCanvas3D.MAX_DIRECTIONAL_LIGHT + "];"
      + "varying vec2  varTextureCoord;"
      + "varying vec4  varVertexPosition;"
      + "varying vec3  varTransformedNormal;"
      + "void main(void) {"
      + "  vec3 lightWeight;"
      + "  if (lightingEnabled) {"
      + "    lightWeight = ambientColor;"
      + ""
      + "    if (directionalLightCount > 0) {"
      + "      vec3 diffuseLightWeight = vec3(0., 0., 0.);"
      + "      vec3 specularLightWeight = vec3(0., 0., 0.);"
      + "      vec3 eyeDirection = vec3(0., 0., 0.);"
      + "      bool computeSpecularLightWeight = false;"
      + "      if (vertexSpecularColor.r > 0."
      + "          && vertexSpecularColor.g > 0."
      + "          && vertexSpecularColor.b > 0.) {"
      + "        eyeDirection = normalize(-varVertexPosition.xyz);"
      + "        computeSpecularLightWeight = length(eyeDirection) <= 1.0001;"  // May happen under iOS even after a normalization
      + "      }"
      + ""
      + "      for (int i = 0; i < " + HTMLCanvas3D.MAX_DIRECTIONAL_LIGHT + "; i++) {"
      + "        if (i >= directionalLightCount) {"
      + "          break;"
      + "        }"
      + "        float directionalLightWeight = max(dot(varTransformedNormal, lightDirections[i]), 0.);"
      + "        diffuseLightWeight += directionalLightColors[i] * directionalLightWeight;"
      + "        if (computeSpecularLightWeight) {"
      + "          vec3 reflectionDirection = reflect(-lightDirections[i], varTransformedNormal);"
      + "          specularLightWeight += directionalLightColors[i] * pow(max(dot(reflectionDirection, eyeDirection), 0.), shininess);"
      + "        }"
      + "      }"
      + ""
      + "      lightWeight += vertexDiffuseColor * diffuseLightWeight;"
      + "      if (computeSpecularLightWeight) {"
      + "        lightWeight += vertexSpecularColor * specularLightWeight;"
      + "      }"
      + "    }"
      + "  } else {"
      + "    lightWeight = vertexDiffuseColor;"
      + "  }"
      + ""
      + "  vec4 fragmentColor;"
      + "  if (useTextures) {"
      + "    fragmentColor = texture2D(sampler, vec2(varTextureCoord.s, varTextureCoord.t));"
      + "  } else {"
      + "    fragmentColor = vec4(1., 1., 1., 1.);"
      + "  }"
      + "  gl_FragColor = vec4(fragmentColor.rgb * lightWeight * alpha, fragmentColor.a * alpha);"
      + "}");
    this.gl.attachShader(this.shaderProgram, fragmentShader);
    this.gl.linkProgram(this.shaderProgram);
    this.shaderProgram.vertexPositionAttribute = this.gl.getAttribLocation(this.shaderProgram, "vertexPosition");
    this.shaderProgram.normalAttribute = this.gl.getAttribLocation(this.shaderProgram, "vertexNormal");
    this.shaderProgram.textureCoordAttribute = this.gl.getAttribLocation(this.shaderProgram, "vertexTextureCoord");
    this.shaderProgram.projectionTransform = this.gl.getUniformLocation(this.shaderProgram, "projectionTransform");
    this.shaderProgram.modelViewTransform = this.gl.getUniformLocation(this.shaderProgram, "modelViewTransform");
    this.shaderProgram.textureCoordinatesGenerated = this.gl.getUniformLocation(this.shaderProgram, "textureCoordinatesGenerated");
    this.shaderProgram.planeS = this.gl.getUniformLocation(this.shaderProgram, "planeS");
    this.shaderProgram.planeT = this.gl.getUniformLocation(this.shaderProgram, "planeT");
    this.shaderProgram.textureCoordTransform = this.gl.getUniformLocation(this.shaderProgram, "textureCoordTransform");
    this.shaderProgram.normalTransform = this.gl.getUniformLocation(this.shaderProgram, "normalTransform");
    this.shaderProgram.ignoreNormal = this.gl.getUniformLocation(this.shaderProgram, "ignoreNormal");
    this.shaderProgram.backFaceNormalFlip = this.gl.getUniformLocation(this.shaderProgram, "backFaceNormalFlip");
    this.shaderProgram.ambientColor = this.gl.getUniformLocation(this.shaderProgram, "ambientColor");
    this.shaderProgram.lightingEnabled = this.gl.getUniformLocation(this.shaderProgram, "lightingEnabled");
    this.shaderProgram.directionalLightCount = this.gl.getUniformLocation(this.shaderProgram, "directionalLightCount");
    this.shaderProgram.lightDirections = this.gl.getUniformLocation(this.shaderProgram, "lightDirections");
    this.shaderProgram.directionalLightColors = this.gl.getUniformLocation(this.shaderProgram, "directionalLightColors");
    this.shaderProgram.vertexDiffuseColor = this.gl.getUniformLocation(this.shaderProgram, "vertexDiffuseColor");
    this.shaderProgram.vertexSpecularColor = this.gl.getUniformLocation(this.shaderProgram, "vertexSpecularColor");
    this.shaderProgram.shininess = this.gl.getUniformLocation(this.shaderProgram, "shininess");
    this.shaderProgram.alpha = this.gl.getUniformLocation(this.shaderProgram, "alpha");
    this.shaderProgram.useTextures = this.gl.getUniformLocation(this.shaderProgram, "useTextures");
    this.gl.useProgram(this.shaderProgram);

    // Set default transformation
    this.viewPlatformTransform = mat4.create();
    mat4.translate(this.viewPlatformTransform, this.viewPlatformTransform, [0.0, 0.0, -2.4]);

    // Instantiate objects used in drawGeometry to avoid to GC them
    this.geometryAmbientColor = vec3.create();
    this.geometrySpecularColor = vec3.create();
    this.geometryModelViewTransform = mat4.create();
    this.geometryNormalTransform = mat3.create();

    // Set default shader colors, matrices and other values
    this.shaderAmbientColor = vec3.create();
    this.gl.uniform3fv(this.shaderProgram.ambientColor, this.shaderAmbientColor);
    this.shaderSpecularColor = vec3.create();
    this.gl.uniform3fv(this.shaderProgram.vertexSpecularColor, this.shaderSpecularColor);
    this.geometryDiffuseColor = vec3.create();
    this.shaderDiffuseColor = vec3.fromValues(1, 1, 1);
    this.gl.uniform3fv(this.shaderProgram.vertexDiffuseColor, this.shaderDiffuseColor);
    this.shaderModelViewTransform = mat4.create();
    this.gl.uniformMatrix4fv(this.shaderProgram.modelViewTransform, false, this.shaderModelViewTransform);
    this.shaderNormalTransform = mat3.create();
    this.gl.uniformMatrix3fv(this.shaderProgram.normalTransform, false, this.shaderNormalTransform);
    this.shaderTextureTransform = mat3.create();
    this.gl.uniformMatrix3fv(this.shaderProgram.textureCoordTransform, false, this.shaderTextureTransform);
    this.shaderLightingEnabled = true;
    this.gl.uniform1i(this.shaderProgram.lightingEnabled, this.shaderLightingEnabled);
    this.shaderShininess = 1.;
    this.gl.uniform1f(this.shaderProgram.shininess, this.shaderShininess);
    this.shaderIgnoreNormal = false;
    this.gl.uniform1i(this.shaderProgram.ignoreNormal, this.shaderIgnoreNormal);
    this.shaderBackFaceNormalFlip = false;
    this.gl.uniform1i(this.shaderProgram.backFaceNormalFlip, this.shaderBackFaceNormalFlip);
    this.shaderTextureCoordinatesGenerated = false;
    this.gl.uniform1i(this.shaderProgram.textureCoordinatesGenerated, false);
    this.shaderUseTextures = false;
    this.gl.uniform1i(this.shaderProgram.useTextures, false);
    this.shaderAlpha = 1;
    this.gl.uniform1f(this.shaderProgram.alpha, this.shaderAlpha);
    this.gl.enable(this.gl.CULL_FACE);
    this.gl.cullFace(this.gl.BACK);

    this.canvasNeededRepaint = false;
    this.pickingFrameBufferNeededRepaint = true;

    this.errorTexture = this.gl.createTexture();
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.errorTexture);
    const redPixel = new Uint8Array([255, 0, 0, 255]);
    this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, 1, 1, 0, this.gl.RGBA, this.gl.UNSIGNED_BYTE, redPixel);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
    this.gl.bindTexture(this.gl.TEXTURE_2D, null);
  }

  /**
   * Returns a shader from the given source code.
   * @private
   */
  createShader(type, source) {
    const shader = this.gl.createShader(type);
    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);
    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      throw "Invalid shader: " + source;
    }
    return shader;
  }

  /**
   * Returns the HTML canvas associated to this component.
   */
  getCanvas() {
    return this.canvas;
  }

  /**
   * Returns the HTML element used to view this component at screen.
   * @see #getCanvas
   */
  getHTMLElement() {
    return this.getCanvas();
  }

  /**
   * Returns the depth bits count in WebGL.
   */
  getDepthBits() {
    return this.gl.getParameter(this.gl.DEPTH_BITS);
  }

  /**
   * Sets the field of view of this component.
   * @param {number} fieldOfView
   */
  setFieldOfView(fieldOfView) {
    if (this.fieldOfView != fieldOfView) {
      this.fieldOfView = fieldOfView;
      this.repaint();
    }
  }

  /**
   * Sets the front clip distance of the frustrum.
   * @param {number} frontClipDistance
   */
  setFrontClipDistance(frontClipDistance) {
    if (this.frontClipDistance != frontClipDistance) {
      this.frontClipDistance = frontClipDistance;
      this.repaint();
    }
  }

  /**
   * Sets the back clip distance of the frustrum.
   * @param {number} frontClipDistance
   */
  setBackClipDistance(backClipDistance) {
    if (this.backClipDistance != backClipDistance) {
      this.backClipDistance = backClipDistance;
      this.repaint();
    }
  }

  /**
   * Returns the given transformation filled with one used to view the scene.
   */
  getViewPlatformTransform(transform) {
    return mat4.copy(transform, this.viewPlatformTransform);
  }

  /**
   * Updates the transformation used to view the scene and redraws it.
   */
  setViewPlatformTransform(viewPlatformTransform) {
    if (this.viewPlatformTransform != viewPlatformTransform) {
      this.viewPlatformTransform = viewPlatformTransform;
      this.repaint();
    }
  }

  /**
   * Updates the viewport size from HTML canvas size.
   * @package
   * @ignore
   */
  updateViewportSize() {
    let canvasBounds;
    try {
      canvasBounds = this.canvas.getBoundingClientRect();
    } catch (ex) {
      // May happen with IE for a canvas not in DOM
      canvasBounds = { width: this.canvas.width, height: this.canvas.height };
    }
    const visible = canvasBounds.width !== 0
      && canvasBounds.height !== 0;
    if (!visible) {
      // May happen for offscreen or invisible canvas
      canvasBounds = { width: this.canvas.width, height: this.canvas.height };
    }
    if (this.viewportWidth != canvasBounds.width
      || this.viewportHeight != canvasBounds.height) {
      this.viewportWidth = canvasBounds.width;
      this.viewportHeight = canvasBounds.height;
      this.canvas.width = this.viewportWidth;
      this.canvas.height = this.viewportHeight;

      if (this.pickingFrameBuffer !== undefined) {
        this.gl.deleteFramebuffer(this.pickingFrameBuffer);
        delete this.pickingFrameBuffer;
      }
      if (visible) {
        this.repaint();
      }
    }
  }

  /**
   * Displays the given scene in the canvas.
   * @param {Node3D} scene  the scene to view in this component
   * @param onprogression   progression call back
   */
  setScene(scene, onprogression) {
    const sharedGeometries = [];
    const sceneGeometries = [];
    const backgroundGeometries = [];
    const lights = [];
    const sceneGeometryCount = this.countDisplayedGeometries(scene);
    this.prepareScene(scene, sharedGeometries, sceneGeometries, backgroundGeometries, false, [], lights, mat4.create(), onprogression, sceneGeometryCount);

    this.scene = scene;
    this.sharedGeometries = sharedGeometries;
    this.sceneGeometries = sceneGeometries;
    this.backgroundGeometries = backgroundGeometries;
    this.lights = lights;

    if (this.offscreen) {
      this.canvasNeededRepaint = true;
      if (onprogression !== undefined) {
        onprogression(ModelLoader.BINDING_MODEL, "", 1);
      }
    } else {
      const canvas3D = this;
      setTimeout(() => {
        if (onprogression !== undefined) {
          onprogression(ModelLoader.BINDING_MODEL, "", 1);
        }
        canvas3D.drawScene();
      }, 0);
    }
  }

  /**
   * Returns the scene viewed in this component.
   * @return {Node3D} 
   * @package
   * @ignore
   */
  getScene() {
    return this.scene;
  }

  /**
   * Returns the count of geometries in all the shapes children of the given node.
   * @param {Node3D} node
   * @private
   */
  countDisplayedGeometries(node) {
    if (node instanceof Group3D) {
      let sceneGeometryCount = 0;
      const children = node.getChildren();
      for (let i = 0; i < children.length; i++) {
        sceneGeometryCount += this.countDisplayedGeometries(children[i]);
      }
      return sceneGeometryCount;
    } else if (node instanceof Link3D) {
      return this.countDisplayedGeometries(node.getSharedGroup());
    } else if (node instanceof Shape3D) {
      return node.getGeometries().length;
    } else {
      return 0;
    }
  }

  /**
   * Prepares the scene to be rendered, creating the required buffers and textures in WebGL.  
   * @param {Node3D}  node
   * @param {Array}   sharedGeometries
   * @param {Array}   sceneGeometries
   * @param {Array}   backgroundGeometries
   * @param {boolean} background
   * @param [Link3D]  parentLinks
   * @param [Array]   lights
   * @param {mat4}    parentTransforms
   * @param onprogression
   * @param {number}  sceneGeometryCount
   * @private
   */
  prepareScene(
    node,
    sharedGeometries,
    sceneGeometries,
    backgroundGeometries,
    background,
    parentLinks,
    lights,
    parentTransforms,
    onprogression,
    sceneGeometryCount
  ) {
    const canvas3D = this;
    if (node instanceof Group3D) {
      if (node instanceof TransformGroup3D) {
        const nodeTransform = mat4.create();
        node.getTransform(nodeTransform);
        parentTransforms = mat4.mul(mat4.create(), parentTransforms, nodeTransform);
        if (node.getCapability(TransformGroup3D.ALLOW_TRANSFORM_WRITE)) {
          // Add listener to update the scene when transformation changes
          node.addPropertyChangeListener("TRANSFORM",
            {
              propertyChange: function (ev) {
                const children = node.getChildren();
                for (let i = 0; i < children.length; i++) {
                  canvas3D.updateChildrenTransformation(children[i], background ? backgroundGeometries : sceneGeometries,
                    parentLinks, lights, canvas3D.getTransformFromRoot(node));
                }
                canvas3D.repaint();
              }
            });
        }
      }

      const children = node.getChildren();
      for (var i = 0; i < children.length; i++) {
        this.prepareScene(children[i], sharedGeometries, sceneGeometries, backgroundGeometries, background, parentLinks, lights, parentTransforms, onprogression, sceneGeometryCount);
      }
      if (node.getCapability(Group3D.ALLOW_CHILDREN_EXTEND)) {
        // Add listener to group to update the scene when children change
        node.addChildrenListener(
          {
            childAdded: function (ev) {
              canvas3D.prepareScene(ev.child, sharedGeometries, sceneGeometries, backgroundGeometries, background, parentLinks, lights, canvas3D.getTransformFromRoot(node));
              canvas3D.repaint();
            },
            childRemoved: function (ev) {
              canvas3D.removeDisplayedItems(ev.child, sharedGeometries, background ? backgroundGeometries : sceneGeometries, lights);
              canvas3D.removeNodeListeners(ev.child);
              canvas3D.repaint();
            }
          });
      }
    } else if (node instanceof Link3D) {
      parentLinks = parentLinks.slice(0);
      parentLinks.push(node);
      this.prepareScene(node.getSharedGroup(), sharedGeometries, sceneGeometries, backgroundGeometries, background, parentLinks, lights, parentTransforms, onprogression, sceneGeometryCount);
    } else if (node instanceof Shape3D) {
      // Log each time 10% more shape geometries are bound
      if (onprogression !== undefined
        && !background
        && Math.floor((sceneGeometries.length - 1) / sceneGeometryCount * 10) < Math.floor(sceneGeometries.length / sceneGeometryCount * 10)) {
        onprogression(ModelLoader.BINDING_MODEL, "", sceneGeometries.length / sceneGeometryCount);
      }
      let nodeAppearance = node.getAppearance();
      if (!nodeAppearance) {
        nodeAppearance = HTMLCanvas3D.DEFAULT_APPEARANCE;
      }
      let texture = null;
      if (nodeAppearance.getTextureImage()) {
        texture = this.prepareTexture(nodeAppearance.getTextureImage());
      }

      const nodeGeometries = node.getGeometries();
      for (var i = 0; i < nodeGeometries.length; i++) {
        this.prepareGeometry(nodeGeometries[i], nodeAppearance, texture,
          node, sharedGeometries, sceneGeometries, backgroundGeometries, background, parentLinks, parentTransforms);
      }
      if (node.getCapability(Shape3D.ALLOW_GEOMETRY_WRITE)) {
        node.addPropertyChangeListener("GEOMETRY",
          {
            propertyChange: function (ev) {
              if (ev.getOldValue()) {
                let removedGeometry = ev.getOldValue();
                for (let i = 0; i < sceneGeometries.length; i++) {
                  const geometry = sceneGeometries[i];
                  if (geometry.nodeGeometry === removedGeometry) {
                    canvas3D.clearGeometryBuffers(geometry);
                    sceneGeometries.splice(i, 1);
                    break;
                  }
                }
              }
              if (ev.getNewValue()) {
                let addedGeometry = ev.getNewValue();
                // Retrieve possibly updated appearance and texture
                let nodeAppearance = node.getAppearance();
                if (!nodeAppearance) {
                  nodeAppearance = HTMLCanvas3D.DEFAULT_APPEARANCE;
                }
                let texture = null;
                if (nodeAppearance.getTextureImage()) {
                  texture = canvas3D.prepareTexture(nodeAppearance.getTextureImage());
                }
                canvas3D.prepareGeometry(addedGeometry, nodeAppearance, texture, node,
                  sharedGeometries, sceneGeometries, backgroundGeometries, background, parentLinks, canvas3D.getTransformFromRoot(node));
              }
            }
          });
      }

      if (nodeAppearance !== HTMLCanvas3D.DEFAULT_APPEARANCE) {
        nodeAppearance.addPropertyChangeListener(
          {
            propertyChange: function (ev) {
              const geometries = background ? backgroundGeometries : sceneGeometries;
              for (let i = 0; i < geometries.length; i++) {
                const geometry = geometries[i];
                if (geometry.node === node) {
                  const newValue = ev.getNewValue();
                  switch (ev.getPropertyName()) {
                    case "AMBIENT_COLOR":
                      geometry.ambientColor = newValue;
                      break;
                    case "DIFFUSE_COLOR":
                      geometry.diffuseColor = newValue;
                      break;
                    case "SPECULAR_COLOR":
                      geometry.specularColor = newValue;
                      break;
                    case "SHININESS":
                      geometry.shininess = newValue;
                      break;
                    case "TRANSPARENCY":
                      geometry.transparency = newValue != null
                        ? 1 - newValue
                        : 1;
                      break;
                    case "ILLUMINATION":
                      geometry.lightingEnabled = (newValue == null || newValue >= 1)
                        && geometry.mode === canvas3D.gl.TRIANGLES;
                      break;
                    case "TEXTURE_IMAGE":
                      geometry.texture = newValue != null
                        ? canvas3D.prepareTexture(newValue)
                        : undefined;
                      break;
                    case "TEXTURE_COORDINATES_GENERATION":
                      const textureCoordinatesGeneration = newValue;
                      geometry.textureCoordinatesGeneration = textureCoordinatesGeneration;
                      break;
                    case "TEXTURE_TRANSFORM":
                      geometry.textureTransform = newValue;
                      break;
                    case "VISIBLE":
                      geometry.visible = newValue !== false;
                      break;
                    case "CULL_FACE":
                      geometry.cullFace = newValue;
                      break;
                    case "BACK_FACE_NORMAL_FLIP":
                      geometry.backFaceNormalFlip = newValue === true;
                      break;
                  }
                }
              }
              canvas3D.repaint();
            }
          });
      }
    } else if (node instanceof Background3D) {
      this.prepareScene(node.getGeometry(), sharedGeometries, sceneGeometries, backgroundGeometries, true, parentLinks, lights, parentTransforms);
    } else if (node instanceof Light3D) {
      const light = {
        node: node,
        color: node.getColor()
      };
      if (node instanceof DirectionalLight3D) {
        light.direction = node.getDirection();
        light.transform = parentTransforms;
      }
      lights.push(light);

      node.addPropertyChangeListener("COLOR",
        {
          canvas3D: canvas3D,
          propertyChange: function (ev) {
            for (let i = 0; i < lights.length; i++) {
              const light = lights[i];
              if (lights[i].node === node) {
                light.color = ev.getNewValue();
                break;
              }
            }
            canvas3D.repaint();
          }
        });
    }
  }

  /**
   * Returns the transformation matrix from root to the given <code>node</code>.
   * @param {Node3D} node
   * @returns {mat4}
   * @private
   */
  getTransformFromRoot(node) {
    const transform = mat4.create();
    if (node instanceof TransformGroup3D) {
      node.getTransform(transform);
    }
    if (node !== null) {
      const nodeParent = node.getParent();
      if (nodeParent instanceof Group3D) {
        mat4.mul(transform, this.getTransformFromRoot(nodeParent), transform);
      }
    }
    return transform;
  }

  /**
   * Prepares the geometry to be rendered.  
   * @param {IndexedGeometryArray3D} nodeGeometry
   * @param {Appearance3D} nodeAppearance
   * @param {WebGLTexture} texture
   * @param {Shape3D} node
   * @param {Array}   sharedGeometries
   * @param {Array}   sceneGeometries
   * @param {Array}   backgroundGeometries
   * @param {boolean} background
   * @param [Link3D]  parentLinks
   * @param {mat4}    transform
   * @private
   */
  prepareGeometry(
    nodeGeometry,
    nodeAppearance,
    texture,
    node,
    sharedGeometries,
    sceneGeometries,
    backgroundGeometries,
    background,
    parentLinks,
    transform
  ) {
    let geometry = null;
    if (!node.getCapability(Shape3D.ALLOW_GEOMETRY_WRITE)) {
      // Search if node geometry is already used
      for (let i = 0; i < sharedGeometries.length; i++) {
        if (sharedGeometries[i].nodeGeometry === nodeGeometry) {
          geometry = {
            node: node,
            center: sharedGeometries[i].center,
            nodeGeometry: nodeGeometry,
            vertexCount: sharedGeometries[i].vertexCount,
            vertexBuffer: sharedGeometries[i].vertexBuffer,
            textureCoordinatesBuffer: sharedGeometries[i].textureCoordinatesBuffer,
            normalBuffer: sharedGeometries[i].normalBuffer,
            mode: sharedGeometries[i].mode
          };
          sharedGeometries[i].referenceCount++;
          break;
        }
      }
    }

    if (geometry === null) {
      const bounds = node.getBounds();
      const lower = vec3.create();
      bounds.getLower(lower);
      const upper = vec3.create();
      bounds.getUpper(upper);
      const center = vec3.fromValues((lower[0] + upper[0]) / 2, (lower[1] + upper[1]) / 2, (lower[2] + upper[2]) / 2);

      geometry = {
        node: node,
        center: center,
        nodeGeometry: nodeGeometry,
        vertexCount: nodeGeometry.vertexIndices.length
      };
      geometry.vertexBuffer = this.prepareBuffer(nodeGeometry.vertices, nodeGeometry.vertexIndices);
      if (nodeGeometry.hasTextureCoordinates()) {
        geometry.textureCoordinatesBuffer = this.prepareBuffer(nodeGeometry.textureCoordinates, nodeGeometry.textureCoordinateIndices);
      } else {
        geometry.textureCoordinatesBuffer = null;
      }
      if (nodeGeometry instanceof IndexedTriangleArray3D) {
        geometry.mode = this.gl.TRIANGLES;
        geometry.normalBuffer = this.prepareBuffer(nodeGeometry.normals, nodeGeometry.normalIndices);
      } else {
        geometry.mode = this.gl.LINES;
      }

      if (!node.getCapability(Shape3D.ALLOW_GEOMETRY_WRITE)) {
        sharedGeometries.push(
          {
            nodeGeometry: nodeGeometry,
            center: center,
            vertexCount: geometry.vertexCount,
            vertexBuffer: geometry.vertexBuffer,
            textureCoordinatesBuffer: geometry.textureCoordinatesBuffer,
            normalBuffer: geometry.normalBuffer,
            mode: geometry.mode,
            referenceCount: 1
          });
      }
    }
    // Set parameters not shared
    geometry.transform = transform;
    if (parentLinks.length > 0) {
      geometry.parentLinks = parentLinks;
    }
    const ambientColor = nodeAppearance.getAmbientColor();
    if (ambientColor !== undefined) {
      geometry.ambientColor = ambientColor;
    }
    const diffuseColor = nodeAppearance.getDiffuseColor();
    if (diffuseColor !== undefined) {
      geometry.diffuseColor = diffuseColor;
    }
    const specularColor = nodeAppearance.getSpecularColor();
    if (specularColor !== undefined) {
      geometry.specularColor = specularColor;
    }
    const shininess = nodeAppearance.getShininess();
    if (shininess !== undefined) {
      geometry.shininess = shininess;
    }
    const textureCoordinatesGeneration = nodeAppearance.getTextureCoordinatesGeneration();
    if (textureCoordinatesGeneration !== undefined) {
      geometry.textureCoordinatesGeneration = textureCoordinatesGeneration;
    }
    const textureTransform = nodeAppearance.getTextureTransform();
    if (textureTransform !== undefined) {
      geometry.textureTransform = textureTransform;
    }
    if (texture !== null) {
      geometry.texture = texture;
    }
    geometry.backFaceNormalFlip = nodeAppearance.isBackFaceNormalFlip();
    if (nodeAppearance.getCullFace() !== undefined) {
      geometry.cullFace = nodeAppearance.getCullFace();
    }
    const illumination = nodeAppearance.getIllumination();
    geometry.lightingEnabled =
      (illumination == null || illumination >= 1)
      && geometry.normalBuffer !== null;
    geometry.transparency = nodeAppearance.getTransparency() != null
      ? 1 - nodeAppearance.getTransparency()
      : 1;
    geometry.visible = nodeAppearance.isVisible();

    const geometries = background ? backgroundGeometries : sceneGeometries;
    geometries.push(geometry);
  }

  /**
   * Updates the transformation applied to the children of the given node.
   * @param {Node3D}  node
   * @param [Array]   geometries
   * @param [Link3D]  parentLinks
   * @param {Array}   lights
   * @param {mat4}    parentTransforms
   * @private  
   */
  updateChildrenTransformation(node, geometries, parentLinks, lights, parentTransforms) {
    const canvas3D = this;
    if (node instanceof Group3D) {
      if (node instanceof TransformGroup3D) {
        const nodeTransform = mat4.create();
        node.getTransform(nodeTransform);
        parentTransforms = mat4.mul(mat4.create(), parentTransforms, nodeTransform);
      }
      const children = node.getChildren();
      for (var i = 0; i < children.length; i++) {
        this.updateChildrenTransformation(children[i], geometries, parentLinks, lights, parentTransforms);
      }
    } else if (node instanceof Link3D) {
      parentLinks = parentLinks.slice(0);
      parentLinks.push(node);
      this.updateChildrenTransformation(node.getSharedGroup(), geometries, parentLinks, lights, parentTransforms);
    } else if (node instanceof Shape3D) {
      for (var i = 0; i < geometries.length; i++) {
        if (geometries[i].node === node) {
          let updateNode = geometries[i].parentLinks === undefined;
          if (!updateNode) {
            // Check if the node of the geometry references the same parent links
            if (geometries[i].parentLinks.length === parentLinks.length) {
              let j;
              for (j = 0; j < parentLinks.length; j++) {
                if (geometries[i].parentLinks[j] !== parentLinks[j]) {
                  break;
                }
              }
              updateNode = j === parentLinks.length;
            }
          }
          if (updateNode) {
            geometries[i].transform = parentTransforms;
            break;
          }
        }
      }
    } else if (node instanceof Light3D) {
      for (var i = 0; i < lights.length; i++) {
        if (lights[i].node === node) {
          lights[i].transform = parentTransforms;
          break;
        }
      }
    }
  }

  /**
   * Removes the tree with the given root node.  
   * @param {Node3D}  node
   * @param {Array}   sharedGeometries
   * @param {Array}   geometries
   * @param {Array}   lights
   * @private  
   */
  removeDisplayedItems(node, sharedGeometries, geometries, lights) {
    if (node instanceof Group3D) {
      const children = node.getChildren();
      for (var i = 0; i < children.length; i++) {
        this.removeDisplayedItems(children[i], sharedGeometries, geometries, lights);
      }
    } else if (node instanceof Link3D) {
      this.removeDisplayedItems(node.getSharedGroup(), sharedGeometries, geometries, lights);
    } else if (node instanceof Shape3D) {
      let count = node.getGeometries().length;
      for (var i = geometries.length - 1; count > 0 && i >= 0; i--) {
        const geometry = geometries[i];
        if (geometry.node === node) {
          if (node.getCapability(Shape3D.ALLOW_GEOMETRY_WRITE)) {
            this.clearGeometryBuffers(geometry);
          } else {
            // Remove shared geometry if reference count is 0
            for (let j = 0; j < sharedGeometries.length; j++) {
              const sharedGeometry = sharedGeometries[j];
              if (sharedGeometry.nodeGeometry === geometry.nodeGeometry) {
                if (--sharedGeometry.referenceCount === 0) {
                  this.clearGeometryBuffers(geometry);
                  sharedGeometries.splice(j, 1);
                }
                break;
              }
            }
          }
          geometries.splice(i, 1);
          count--;
        }
      }
    } else if (node instanceof Light3D) {
      for (var i = 0; i < lights.length; i++) {
        if (lights[i].node === node) {
          lights.splice(i, 1);
          break;
        }
      }
    }
  }

  /**
   * Removes the listeners set on the given <code>node<code> and its children by this component.  
   * @param {Node3D}  node
   * @private  
   */
  removeNodeListeners(node) {
    let listeners = node.getPropertyChangeListeners();
    for (var i = 0; i < listeners.length; i++) {
      if (listeners[i].canvas3D === this) {
        node.removePropertyChangeListener(listeners[i]);
      }
    }
    if (node instanceof Group3D) {
      listeners = node.getChildrenListeners();
      for (var i = 0; i < listeners.length; i++) {
        if (listeners[i].canvas3D === this) {
          node.removeChildrenListener(listeners[i]);
        }
      }
      const children = node.getChildren();
      for (var i = 0; i < children.length; i++) {
        this.removeNodeListeners(children[i]);
      }
    } else if (node instanceof Link3D) {
      this.removeNodeListeners(node.getSharedGroup());
    }
  }

  /**
   * Returns the WebGL texture that will be bound to the given image. 
   * @param textureImage  a HTML image element
   * @return {WebGLTexture} a texture object
   * @private
   */
  prepareTexture(textureImage) {
    if (textureImage.url !== undefined) {
      // Search whether texture already exists
      for (let i = 0; i < this.textures.length; i++) {
        if (this.textures[i].image.url == textureImage.url) {
          return this.textures[i];
        }
      }
    }
    // Create texture
    const texture = this.gl.createTexture();
    if (texture !== null) {
      texture.image = textureImage;
      if (textureImage.width !== 0) {
        this.bindTextureAndRepaint(texture, true);
      } else {
        const canvas3D = this;
        // If texture image isn't loaded yet, add a listener to follow its loading
        const loadListener = () => {
          textureImage.removeEventListener("load", loadListener);
          canvas3D.bindTextureAndRepaint(texture, false);
        };
        textureImage.addEventListener("load", loadListener);
      }
      this.textures.push(texture);
      return texture;
    } else {
      // Environment is probably missing resources
      console.log("Can't create texture");
      return this.errorTexture;
    }
  }

  /**
   * @private
   */
  bindTextureAndRepaint(texture, bindOnly) {
    if ((!Appearance3D.isPowerOfTwo(texture.image.naturalWidth) || !Appearance3D.isPowerOfTwo(texture.image.naturalHeight))
      && (!texture.image.transparent || HTMLCanvas3D.resizeTransparentTextures)) {
      // From https://www.khronos.org/webgl/wiki/WebGL_and_OpenGL_Differences#Non-Power_of_Two_Texture_Support
      // Scale up the texture image to the next highest power of two dimensions
      const canvas = document.createElement("canvas");
      canvas.width = Appearance3D.getNextHighestPowerOfTwo(texture.image.naturalWidth);
      canvas.height = Appearance3D.getNextHighestPowerOfTwo(texture.image.naturalHeight);
      const context = canvas.getContext("2d");
      context.drawImage(texture.image, 0, 0, texture.image.naturalWidth, texture.image.naturalHeight, 0, 0, canvas.width, canvas.height);

      const image = new Image();
      image.crossOrigin = "anonymous";
      image.url = texture.image.url;
      image.transparent = texture.image.transparent;
      const canvas3D = this;
      const loadListener = () => {
        image.removeEventListener("load", loadListener);
        canvas3D.bindTexture(texture);
        // Redraw scene
        canvas3D.repaint();
      };
      image.addEventListener("load", loadListener);
      image.src = canvas.toDataURL();
      texture.image = image;
    } else {
      this.bindTexture(texture);
      // Redraw scene
      if (!bindOnly) {
        this.repaint();
      }
    }
  }

  /**
   * @private
   */
  bindTexture(texture) {
    this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
    this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, true);
    this.gl.pixelStorei(this.gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, texture.image);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
    if (Appearance3D.isPowerOfTwo(texture.image.naturalWidth) && Appearance3D.isPowerOfTwo(texture.image.naturalHeight)) {
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR_MIPMAP_NEAREST);
      this.gl.generateMipmap(this.gl.TEXTURE_2D);
    } else {
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
    }
    this.gl.bindTexture(this.gl.TEXTURE_2D, null);
    // Free image data
    delete texture.image.src;
    texture.image.bound = true;
  }

  /**
   * @private
   */
  prepareBuffer(data, indices) {
    if (indices.length > 0 && data.length > 0) {
      // Create buffer from data without indices
      const buffer = this.gl.createBuffer();
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
      const itemSize = data[0].length;
      const dataArray = new Float32Array(indices.length * itemSize);
      for (let i = 0, index = 0; i < indices.length; i++, index += itemSize) {
        dataArray.set(data[indices[i]], index);
      }
      this.gl.bufferData(this.gl.ARRAY_BUFFER, dataArray, this.gl.STATIC_DRAW);
      return buffer;
    } else {
      return null;
    }
  }

  /**
   * Draws the prepared scene at screen.
   * @private
   */
  drawScene() {
    this.gl.viewport(0, 0, this.viewportWidth, this.viewportHeight);
    let backgroundColor = getComputedStyle(this.canvas).backgroundColor;
    if (backgroundColor == "") {
      backgroundColor = this.canvas.style.backgroundColor;
    }
    // Parse R G B [A] components
    backgroundColor = backgroundColor.substring(4, backgroundColor.length - 1).replace(/ /g, '').split(',');
    this.gl.clearColor(backgroundColor[0] / 256., backgroundColor[1] / 256., backgroundColor[2] / 256.,
      backgroundColor.length === 4 ? backgroundColor[3] : 1.);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);

    if (this.scene !== null) {
      // Set lights
      const ambientLightColor = vec3.create();
      let directionalLightCount = 0;
      const directionalLightColors = [];
      const lightDirections = [];
      const viewPlatformInvertedTransform = mat4.invert(mat4.create(), this.viewPlatformTransform);
      const transform = mat4.create();
      for (var i = 0; i < this.lights.length; i++) {
        const light = this.lights[i];
        if (light.direction !== undefined) {
          // Adjust direction (if lights should be a fixed place, use an identity transform instead of viewPlatformTransform)
          const lightDirection = vec3.transformMat3(vec3.create(), light.direction,
            mat3.fromMat4(mat3.create(), mat4.mul(transform, viewPlatformInvertedTransform, light.transform)));
          vec3.normalize(lightDirection, lightDirection);
          vec3.negate(lightDirection, lightDirection);
          directionalLightColors.push.apply(directionalLightColors, light.color);
          lightDirections.push.apply(lightDirections, lightDirection);
          directionalLightCount++;
        } else {
          // Compute total ambient light
          vec3.add(ambientLightColor, ambientLightColor, light.color);
        }
      }
      this.gl.uniform1i(this.shaderProgram.directionalLightCount, directionalLightCount);
      if (directionalLightCount < HTMLCanvas3D.MAX_DIRECTIONAL_LIGHT) {
        // Complete arrays to HTMLCanvas3D.MAX_DIRECTIONAL_LIGHT
        const emptyArray = new Array((HTMLCanvas3D.MAX_DIRECTIONAL_LIGHT - directionalLightCount) * 3);
        // No fill method in IE
        for (let j = 0; j < emptyArray.length; j++) {
          emptyArray[j] = 0;
        }
        directionalLightColors.push.apply(directionalLightColors, emptyArray);
        lightDirections.push.apply(lightDirections, emptyArray);
      }
      this.gl.uniform3fv(this.shaderProgram.directionalLightColors, directionalLightColors);
      this.gl.uniform3fv(this.shaderProgram.lightDirections, lightDirections);

      // Convert horizontal field of view to vertical
      const verticalFieldOfView = 2 * Math.atan(this.viewportHeight / this.viewportWidth * Math.tan(this.fieldOfView / 2));
      // First draw background geometries (contained in a unit sphere)
      const projectionTransform = mat4.create();
      if (this.projectionPolicy === HTMLCanvas3D.PARALLEL_PROJECTION) {
        mat4.ortho(projectionTransform, -1., 1., -1., 1., 0.001, 1.);
      } else {
        mat4.perspective(projectionTransform, verticalFieldOfView, this.viewportWidth / this.viewportHeight,
          0.001, 1.0);
      }
      this.gl.uniformMatrix4fv(this.shaderProgram.projectionTransform, false, projectionTransform);
      // Translate to center
      const backgroundTransform = mat4.clone(this.viewPlatformTransform);
      backgroundTransform[12] = 0.
      backgroundTransform[13] = 0;
      backgroundTransform[14] = 0;
      const backgroundInvertedTransform = mat4.invert(mat4.create(), backgroundTransform);
      for (var i = 0; i < this.backgroundGeometries.length; i++) {
        const backgroundGeometry = this.backgroundGeometries[i];
        this.drawGeometry(backgroundGeometry, backgroundInvertedTransform, ambientLightColor, backgroundGeometry.lightingEnabled, true, true);
      }

      // Reset depth buffer to draw the scene above background
      this.gl.clear(this.gl.DEPTH_BUFFER_BIT);
      this.getVirtualWorldToImageTransform(projectionTransform);
      this.gl.uniformMatrix4fv(this.shaderProgram.projectionTransform, false, projectionTransform);

      // Second draw opaque geometries
      this.gl.enable(this.gl.DEPTH_TEST);
      const transparentGeometries = [];
      for (var i = 0; i < this.sceneGeometries.length; i++) {
        var geometry = this.sceneGeometries[i];
        if (geometry.visible) {
          if ((geometry.transparency === undefined
            || geometry.transparency === 1)
            && (geometry.texture === undefined
              || geometry.texture.image === undefined
              || !geometry.texture.image.transparent)) {
            this.drawGeometry(geometry, viewPlatformInvertedTransform, ambientLightColor, geometry.lightingEnabled, true, true);
          } else if (geometry.transparency > 0) {
            transparentGeometries.push(geometry);
          }
        }
      }

      // Then draw geometries which are transparent or use a transparent texture 
      this.gl.enable(this.gl.BLEND);
      this.gl.blendFunc(this.gl.ONE, this.gl.ONE_MINUS_SRC_ALPHA);
      // Sort transparent geometries from the farthest to the closest
      const center = vec3.create();
      for (var i = 0; i < transparentGeometries.length; i++) {
        var geometry = transparentGeometries[i];
        vec3.transformMat4(center, geometry.center, geometry.transform);
        vec3.transformMat4(center, center, viewPlatformInvertedTransform);
        geometry.zOrder = center[2];
      }
      transparentGeometries.sort((geometry1, geometry2) => {
        return geometry1.zOrder - geometry2.zOrder;
      });
      for (var i = 0; i < transparentGeometries.length; i++) {
        var geometry = transparentGeometries[i];
        this.drawGeometry(geometry, viewPlatformInvertedTransform, ambientLightColor, geometry.lightingEnabled, true, true);
      }
    }

    // Keep track of the number of frames drawn per second
    const now = Date.now();
    if (Math.floor(now / 1000) > Math.floor(this.lastDrawSceneTime / 1000)) {
      this.framesPerSecond = Math.round(this.drawnFrameCount / (now - this.previousFramesPerSecondTime) * 10000) / 10;
      this.previousFramesPerSecondTime = now;
      this.drawnFrameCount = 0;
    }
    if (this.drawnFrameCount === undefined) {
      this.previousFramesPerSecondTime = now;
      this.drawnFrameCount = 0;
    }
    this.drawnFrameCount++;
    this.lastDrawSceneTime = now;
  }

  /**
   * Draws the given shape geometry.
   * @private
   */
  drawGeometry(
    geometry,
    viewPlatformInvertedTransform,
    ambientLightColor,
    lightingEnabled,
    textureEnabled,
    transparencyEnabled
  ) {
    // Call face management methods only if cullFace changed from previous geometry  
    if (geometry.cullFace !== this.shaderCullFace) {
      this.shaderCullFace = geometry.cullFace;
      if (this.shaderCullFace !== undefined) {
        if (this.shaderCullFace === Appearance3D.CULL_NONE) {
          this.gl.disable(this.gl.CULL_FACE);
        } else {
          this.gl.enable(this.gl.CULL_FACE);
          this.gl.cullFace(this.shaderCullFace === Appearance3D.CULL_BACK
            ? this.gl.BACK : this.gl.FRONT);
        }
      } else {
        this.gl.enable(this.gl.CULL_FACE);
        this.gl.cullFace(this.gl.BACK);
      }
    }

    mat4.copy(this.geometryModelViewTransform, viewPlatformInvertedTransform);
    mat4.mul(this.geometryModelViewTransform, this.geometryModelViewTransform, geometry.transform);
    // Call uniformMatrix4fv only if geometryModelViewTransform changed from previous geometry
    if (!mat4.exactEquals(this.shaderModelViewTransform, this.geometryModelViewTransform)) {
      mat4.copy(this.shaderModelViewTransform, this.geometryModelViewTransform);
      this.gl.uniformMatrix4fv(this.shaderProgram.modelViewTransform, false, this.shaderModelViewTransform);
    }

    // Call uniform1i only if lightingEnabled changed from previous geometry
    if (this.shaderLightingEnabled !== lightingEnabled) {
      this.shaderLightingEnabled = lightingEnabled;
      this.gl.uniform1i(this.shaderProgram.lightingEnabled, this.shaderLightingEnabled);
    }
    if (lightingEnabled) {
      if (geometry.ambientColor !== undefined
        && geometry.texture === undefined) {
        vec3.mul(this.geometryAmbientColor, geometry.ambientColor, ambientLightColor);
      } else {
        vec3.set(this.geometryAmbientColor, 0, 0, 0);
      }
      // Call uniform3fv only if geometryAmbientColor changed from previous geometry
      if (!vec3.exactEquals(this.shaderAmbientColor, this.geometryAmbientColor)) {
        vec3.copy(this.shaderAmbientColor, this.geometryAmbientColor);
        this.gl.uniform3fv(this.shaderProgram.ambientColor, this.shaderAmbientColor);
      }

      if (!this.ignoreShininess
        && geometry.specularColor !== undefined
        && geometry.shininess !== undefined) {
        // Call uniform1f only if shininess changed from previous geometry
        if (this.shaderShininess !== geometry.shininess) {
          this.shaderShininess = geometry.shininess;
          this.gl.uniform1f(this.shaderProgram.shininess, this.shaderShininess);
        }
        vec3.copy(this.geometrySpecularColor, geometry.specularColor);
      } else {
        vec3.set(this.geometrySpecularColor, 0, 0, 0);
      }
      // Call uniform3fv only if geometrySpecularColor changed from previous geometry
      if (!vec3.exactEquals(this.shaderSpecularColor, this.geometrySpecularColor)) {
        vec3.copy(this.shaderSpecularColor, this.geometrySpecularColor);
        this.gl.uniform3fv(this.shaderProgram.vertexSpecularColor, this.shaderSpecularColor);
      }

      mat3.fromMat4(this.geometryNormalTransform, this.geometryModelViewTransform);
      // Call uniformMatrix3fv only if geometryNormalTransform changed from previous geometry
      if (!mat3.exactEquals(this.shaderNormalTransform, this.geometryNormalTransform)) {
        mat3.copy(this.shaderNormalTransform, this.geometryNormalTransform);
        this.gl.uniformMatrix3fv(this.shaderProgram.normalTransform, false, this.shaderNormalTransform);
      }
      // Call uniform1i only if type of geometry changed from previous geometry
      if (this.shaderIgnoreNormal !== (geometry.mode === this.gl.LINES)) {
        this.shaderIgnoreNormal = geometry.mode === this.gl.LINES;
        this.gl.uniform1i(this.shaderProgram.ignoreNormal, this.shaderIgnoreNormal);
      }
      // Call uniform1i only if backFaceNormalFlip changed from previous geometry
      if (this.shaderBackFaceNormalFlip !== geometry.backFaceNormalFlip) {
        this.shaderBackFaceNormalFlip = geometry.backFaceNormalFlip;
        this.gl.uniform1i(this.shaderProgram.backFaceNormalFlip, this.shaderBackFaceNormalFlip);
      }
    }

    vec3.set(this.geometryDiffuseColor, 1, 1, 1);
    if (textureEnabled
      && geometry.texture !== undefined
      && (geometry.texture.image === undefined
        || geometry.texture.image.bound)) {
      this.gl.activeTexture(this.gl.TEXTURE0);
      if (geometry.textureCoordinatesGeneration) {
        this.gl.uniform4fv(this.shaderProgram.planeS, geometry.textureCoordinatesGeneration.planeS);
        this.gl.uniform4fv(this.shaderProgram.planeT, geometry.textureCoordinatesGeneration.planeT);
        // Call uniform1i only if textureCoordinatesGenerated changed from previous geometry
        if (!this.shaderTextureCoordinatesGenerated) {
          this.shaderTextureCoordinatesGenerated = true;
          this.gl.uniform1i(this.shaderProgram.textureCoordinatesGenerated, true);
        }
      } else if (geometry.textureCoordinatesBuffer === null) {
        // Default way to generate missing texture coordinates
        this.gl.uniform4fv(this.shaderProgram.planeS, HTMLCanvas3D.VEC4_DEFAULT_PLANE_S);
        this.gl.uniform4fv(this.shaderProgram.planeT, HTMLCanvas3D.VEC4_DEFAULT_PLANE_T);
        // Call uniform1i only if textureCoordinatesGenerated changed from previous geometry
        if (!this.shaderTextureCoordinatesGenerated) {
          this.shaderTextureCoordinatesGenerated = true;
          this.gl.uniform1i(this.shaderProgram.textureCoordinatesGenerated, true);
        }
      } else {
        // Call uniform1i only if textureCoordinatesGenerated changed from previous geometry
        if (this.shaderTextureCoordinatesGenerated) {
          this.shaderTextureCoordinatesGenerated = false;
          this.gl.uniform1i(this.shaderProgram.textureCoordinatesGenerated, false);
        }
      }
      const geometryTextureTransform = geometry.textureTransform !== undefined
        ? geometry.textureTransform
        : HTMLCanvas3D.MAT3_IDENTITY;
      // Call uniformMatrix3fv only if geometryTextureTransform changed from previous geometry
      if (!mat3.exactEquals(this.shaderTextureTransform, geometryTextureTransform)) {
        mat3.copy(this.shaderTextureTransform, geometryTextureTransform);
        this.gl.uniformMatrix3fv(this.shaderProgram.textureCoordTransform, false, this.shaderTextureTransform);
      }
      this.gl.bindTexture(this.gl.TEXTURE_2D, geometry.texture);
      // Call uniform1i only if useTextures changed from previous geometry
      if (!this.shaderUseTextures) {
        this.shaderUseTextures = true;
        this.gl.uniform1i(this.shaderProgram.useTextures, true);
      }
    } else {
      // Call uniform1i only if textureCoordinatesGenerated changed from previous geometry
      if (this.shaderTextureCoordinatesGenerated) {
        this.shaderTextureCoordinatesGenerated = false;
        this.gl.uniform1i(this.shaderProgram.textureCoordinatesGenerated, false);
      }
      // Call uniform1i only if useTextures changed from previous geometry
      if (this.shaderUseTextures) {
        this.shaderUseTextures = false;
        this.gl.uniform1i(this.shaderProgram.useTextures, false);
      }
      if (geometry.diffuseColor !== undefined) {
        vec3.copy(this.geometryDiffuseColor, geometry.diffuseColor);
      }
    }
    // Call uniform3fv only if geometryDiffuseColor changed from previous geometry
    if (!vec3.exactEquals(this.shaderDiffuseColor, this.geometryDiffuseColor)) {
      vec3.copy(this.shaderDiffuseColor, this.geometryDiffuseColor);
      this.gl.uniform3fv(this.shaderProgram.vertexDiffuseColor, this.shaderDiffuseColor);
    }

    this.gl.enableVertexAttribArray(this.shaderProgram.vertexPositionAttribute);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, geometry.vertexBuffer);
    this.gl.vertexAttribPointer(this.shaderProgram.vertexPositionAttribute, 3, this.gl.FLOAT, false, 0, 0);
    if (lightingEnabled
      && geometry.mode === this.gl.TRIANGLES) {
      this.gl.enableVertexAttribArray(this.shaderProgram.normalAttribute);
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, geometry.normalBuffer);
      this.gl.vertexAttribPointer(this.shaderProgram.normalAttribute, 3, this.gl.FLOAT, false, 0, 0);
    } else {
      this.gl.disableVertexAttribArray(this.shaderProgram.normalAttribute);
    }
    if (textureEnabled
      && geometry.textureCoordinatesBuffer !== null
      && geometry.texture !== undefined) {
      this.gl.enableVertexAttribArray(this.shaderProgram.textureCoordAttribute);
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, geometry.textureCoordinatesBuffer);
      this.gl.vertexAttribPointer(this.shaderProgram.textureCoordAttribute, 2, this.gl.FLOAT, false, 0, 0);
    } else {
      this.gl.disableVertexAttribArray(this.shaderProgram.textureCoordAttribute);
    }

    // Manage transparency
    const alpha = geometry.transparency && transparencyEnabled ? geometry.transparency : 1;
    // Call uniform1f only if alpha changed from previous geometry
    if (this.shaderAlpha !== alpha) {
      this.shaderAlpha = alpha;
      this.gl.uniform1f(this.shaderProgram.alpha, this.shaderAlpha);
    }

    this.gl.drawArrays(geometry.mode, 0, geometry.vertexCount);
  }

  /**
   * Returns the last measured number of frames drawn by second by this component.
   * @return {number}
   */
  getFramesPerSecond() {
    return this.framesPerSecond;
  }

  /**
   * Repaints as soon as possible the scene of this component.
   */
  repaint() {
    if (!this.canvasNeededRepaint) {
      this.canvasNeededRepaint = true;
      if (!this.offscreen) {
        const canvas3D = this;
        requestAnimationFrame(
          () => {
            if (canvas3D.canvasNeededRepaint) {
              canvas3D.drawScene();
              canvas3D.canvasNeededRepaint = false;
              canvas3D.pickingFrameBufferNeededRepaint = true;
            }
          });
      }
    }
  }

  /**
   * Returns <code>mat4</code> filled with the transformation used to obtain 
   * pixel point from virtual world coordinates. 
   * @param {mat4} transform
   * @param {number} [aspect] image aspect ratio (width / height)
   */
  getVirtualWorldToImageTransform(transform, aspect) {
    if (aspect === undefined) {
      aspect = this.viewportWidth / this.viewportHeight;
    }
    const verticalFieldOfView = 2 * Math.atan(Math.tan(this.fieldOfView / 2) / aspect);
    if (this.projectionPolicy === HTMLCanvas3D.PARALLEL_PROJECTION) {
      mat4.ortho(transform, -1., 1., -1., 1., this.frontClipDistance, this.backClipDistance);
    } else {
      mat4.perspective(transform, verticalFieldOfView, aspect, this.frontClipDistance, this.backClipDistance);
    }
    return transform;
  }

  /**
   * Returns <code>true</code> if all data of the scene are ready to be displayed.
   */
  isLoadingCompleted() {
    return this.isTextureLoadingCompleted(this.backgroundGeometries)
      && this.isTextureLoadingCompleted(this.sceneGeometries);
  }

  /**
   * Returns <code>true</code> if all the textures used by the given geometries are loaded.
   * @private
   */
  isTextureLoadingCompleted(geometries) {
    for (let i = 0; i < geometries.length; i++) {
      const texture = geometries[i].texture;
      if (texture !== undefined
        && texture.image !== undefined
        && !texture.image.bound) {
        return false;
      }
    }
    return true;
  }

  /**
   * Creates an image of canvas content.
   * @param {function} [observer] a function that will receive the generated image as parameter.
   * @return {Image} the image of the canvas
   */
  getImage(observer) {
    // Return image with possible missing texture images
    if (this.canvasNeededRepaint) {
      this.drawScene();
      this.canvasNeededRepaint = false;
    }

    const image = new Image();
    image.crossOrigin = "anonymous";
    let imageLoadingListener;
    if (observer !== undefined) {
      imageLoadingListener = ev => {
        image.removeEventListener("load", imageLoadingListener);
        observer(image);
      };
      image.addEventListener("load", imageLoadingListener);
    }
    image.src = this.canvas.toDataURL();
    if (image.width !== 0
      && observer !== undefined) {
      imageLoadingListener();
    }
    return image;
  }

  /**
   * Frees buffers and other resources used by this component.
   */
  clear() {
    for (var i = 0; i < this.textures.length; i++) {
      delete this.textures[i].src;
      this.gl.deleteTexture(this.textures[i]);
    }
    this.textures = [];
    this.gl.deleteTexture(this.errorTexture);
    this.errorTexture = null;

    this.clearGeometries(this.sharedGeometries);
    this.clearGeometries(this.sceneGeometries);
    this.clearGeometries(this.backgroundGeometries);

    this.lights = [];
    if (this.pickingFrameBuffer !== undefined) {
      this.gl.deleteFramebuffer(this.pickingFrameBuffer);
      delete this.pickingFrameBuffer;
    }

    const shaders = this.gl.getAttachedShaders(this.shaderProgram);
    for (var i = 0; i < shaders.length; i++) {
      this.gl.detachShader(this.shaderProgram, shaders[i]);
    }

    this.scene = null;
    this.repaint();
  }

  /**
   * Frees buffers used by the given geometries.
   * @private
   */
  clearGeometries(geometries) {
    for (let i = 0; i < geometries.length; i++) {
      this.clearGeometryBuffers(geometries[i]);
    }
    geometries.length = 0;
  }

  /**
   * Frees buffers used by the given geometry.
   * @private
   */
  clearGeometryBuffers(geometry) {
    this.gl.deleteBuffer(geometry.vertexBuffer);
    if (geometry.textureCoordinatesBuffer !== null
      && geometry.texture !== undefined) {
      this.gl.deleteBuffer(geometry.textureCoordinatesBuffer);
    }
    if (geometry.normalBuffer !== undefined) {
      this.gl.deleteBuffer(geometry.normalBuffer);
    }
  }

  /**
   * Sets the projection policy of this component.
   * @param {number} projectionPolicy PARALLEL_PROJECTION or PERSPECTIVE_PROJECTION 
   */
  setProjectionPolicy(projectionPolicy) {
    this.projectionPolicy = projectionPolicy;
  }

  /**
   * Sets whether shininess should be taken into account by the shader or not.
   */
  setIgnoreShininess(ignoreShininess) {
    this.ignoreShininess = ignoreShininess;
    this.repaint();
  }

  /**
   * Returns the closest shape displayed at client coordinates (x, y) among the displayed objects. 
   * @param {number} x
   * @param {number} y
   * @return {Node3D}
   */
  getClosestShapeAt(x, y) {
    // Inspired from http://coffeesmudge.blogspot.fr/2013/08/implementing-picking-in-webgl.html
    if (this.pickingFrameBuffer === undefined) {
      this.pickingFrameBuffer = this.gl.createFramebuffer();
      this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.pickingFrameBuffer);
      this.pickingFrameBuffer.width = Appearance3D.isPowerOfTwo(this.canvas.width)
        ? this.canvas.width
        : Appearance3D.getNextHighestPowerOfTwo(this.canvas.width);
      this.pickingFrameBuffer.height = Appearance3D.isPowerOfTwo(this.canvas.height)
        ? this.canvas.height
        : Appearance3D.getNextHighestPowerOfTwo(this.canvas.height);
      this.pickingFrameBuffer.colorMap = new Uint8Array(this.pickingFrameBuffer.width * this.pickingFrameBuffer.height * 4);

      const renderedTexture = this.gl.createTexture();
      this.gl.bindTexture(this.gl.TEXTURE_2D, renderedTexture);
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.NEAREST);
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.NEAREST);
      this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.pickingFrameBuffer.width, this.pickingFrameBuffer.height,
        0, this.gl.RGBA, this.gl.UNSIGNED_BYTE, null);
      const renderBuffer = this.gl.createRenderbuffer();
      this.gl.bindRenderbuffer(this.gl.RENDERBUFFER, renderBuffer);
      this.gl.framebufferTexture2D(this.gl.FRAMEBUFFER, this.gl.COLOR_ATTACHMENT0, this.gl.TEXTURE_2D, renderedTexture, 0);
      this.gl.renderbufferStorage(this.gl.RENDERBUFFER, this.gl.DEPTH_COMPONENT16, this.pickingFrameBuffer.width, this.pickingFrameBuffer.height);
      this.gl.framebufferRenderbuffer(this.gl.FRAMEBUFFER, this.gl.DEPTH_ATTACHMENT, this.gl.RENDERBUFFER, renderBuffer);
      this.gl.bindTexture(this.gl.TEXTURE_2D, null);
    }

    if (this.pickingFrameBufferNeededRepaint) {
      this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.pickingFrameBuffer);
      this.gl.viewport(0, 0, this.pickingFrameBuffer.width, this.pickingFrameBuffer.height);
      this.gl.clearColor(1., 1., 1., 1.);
      this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);

      // Convert horizontal field of view to vertical
      const projectionTransform = mat4.create();
      this.getVirtualWorldToImageTransform(projectionTransform, this.canvas.width / this.canvas.height);
      this.gl.uniformMatrix4fv(this.shaderProgram.projectionTransform, false, projectionTransform);

      // Draw not background and opaque geometries without light and textures
      this.gl.enable(this.gl.DEPTH_TEST);
      const viewPlatformInvertedTransform = mat4.invert(mat4.create(), this.viewPlatformTransform);
      const geometryColor = vec3.create();
      for (let i = 0; i < this.sceneGeometries.length; i++) {
        const geometry = this.sceneGeometries[i];
        if (geometry.visible
          && geometry.node.isPickable()) {
          const defaultColor = geometry.diffuseColor;
          // Change diffuse color by geometry index
          vec3.set(geometryColor,
            ((i >>> 16) & 0xFF) / 255.,
            ((i >>> 8) & 0xFF) / 255.,
            (i & 0xFF) / 255.);
          geometry.diffuseColor = geometryColor;
          this.drawGeometry(geometry, viewPlatformInvertedTransform, null, false, false, false);
          if (defaultColor !== undefined) {
            geometry.diffuseColor = defaultColor;
          }
        }
      }

      this.gl.readPixels(0, 0, this.pickingFrameBuffer.width, this.pickingFrameBuffer.height, this.gl.RGBA, this.gl.UNSIGNED_BYTE,
        this.pickingFrameBuffer.colorMap);
      this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
      this.pickingFrameBufferNeededRepaint = false;
    }

    const canvasBounds = this.canvas.getBoundingClientRect();
    if (x >= canvasBounds.left && y >= canvasBounds.top && x < canvasBounds.right && y < canvasBounds.bottom) {
      x -= canvasBounds.left;
      y -= canvasBounds.top;
      // Find pixel index in the color map taking into the ratio between the size of the canvas at screen and the poser of two of the texture attached to the frame buffer
      let pixelIndex = (this.pickingFrameBuffer.height - 1 - Math.floor(y / canvasBounds.height * this.pickingFrameBuffer.height)) * this.pickingFrameBuffer.width
        + Math.floor(x / canvasBounds.width * this.pickingFrameBuffer.width);
      pixelIndex *= 4;
      const geometryIndex =
        this.pickingFrameBuffer.colorMap[pixelIndex] * 65536
        + this.pickingFrameBuffer.colorMap[pixelIndex + 1] * 256
        + this.pickingFrameBuffer.colorMap[pixelIndex + 2];
      if (geometryIndex != 0xFFFFFF) {
        return this.sceneGeometries[geometryIndex].node;
      }
    }

    return null;
  }
}

HTMLCanvas3D.MAX_DIRECTIONAL_LIGHT = 16;
HTMLCanvas3D.VEC4_DEFAULT_PLANE_S = vec4.fromValues(1, 0, 0, 0);
HTMLCanvas3D.VEC4_DEFAULT_PLANE_T = vec4.fromValues(0, 1, 0, 0);
HTMLCanvas3D.MAT3_IDENTITY = mat3.create();

HTMLCanvas3D.PARALLEL_PROJECTION = 0;
HTMLCanvas3D.PERSPECTIVE_PROJECTION = 1;

HTMLCanvas3D.DEFAULT_APPEARANCE = new Appearance3D();

HTMLCanvas3D.resizeTransparentTextures = true;
