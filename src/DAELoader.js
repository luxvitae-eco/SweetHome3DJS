/*
 * DAELoader.js 2017
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
import { SAXParser } from '@flyskypie/xml-sax-parser';
import { DefaultHandler } from '@flyskypie/xml-sax-parser/DefaultHandlers.js';
import { SAXException } from '@flyskypie/xml-sax-parser/exceptions/index.js';

import { ModelLoader } from './ModelLoader';
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

// Requires core.js
//          gl-matrix-min.js
//          jszip.min.js
//          scene3d.js
//          Triangulator.js
//          URLContent.js
//          ModelLoader.js
//          jsXmlSaxParser.min.js

/**
 * Creates a loader for DAE Collada 1.4.1 format as specified by
 * <a href="http://www.khronos.org/files/collada_spec_1_4.pdf">http://www.khronos.org/files/collada_spec_1_4.pdf</a>.
 * All texture coordinates are considered to belong to the same set (for example UVSET0).<br>
 * @constructor
 * @extends ModelLoader
 * @author Emmanuel Puybaret
 */
export class DAELoader extends ModelLoader {
  constructor() {
    super("dae");
  }

  /**
   * Parses the given DAE content and calls onmodelloaded asynchronously or 
   * returns the scene it describes if onmodelloaded is null.
   * @protected
   */
  parseEntryScene(daeContent, daeEntryName, zip, modelContext, onmodelloaded, onprogression) {
    let sceneRoot = new Group3D();
    let handler = new DAEHandler(sceneRoot, daeEntryName);
    let saxParser = new SAXParser(handler, handler, handler, handler, handler);
    onprogression(ModelLoader.PARSING_MODEL, daeEntryName, 0);
    try {
      saxParser.parseString(daeContent);
    } catch (ex) {
      sceneRoot.removeAllChildren();
    }
    if (onmodelloaded === null) {
      onprogression(ModelLoader.PARSING_MODEL, daeEntryName, 1);
      return sceneRoot;
    } else {
      setTimeout(
        () => {
          onprogression(ModelLoader.PARSING_MODEL, daeEntryName, 1);
          onmodelloaded(sceneRoot);
        }, 0);
    }
  }
}

/**
 * SAX handler for DAE Collada stream.
 * @constructor
 * @private
 */
class DAEHandler extends DefaultHandler {
  constructor(sceneRoot, daeEntryName) {
    super();
    this.sceneRoot = sceneRoot;
    this.daeEntryName = daeEntryName;

    this.parentGroups = []; // Group3D
    this.parentElements = []; // string
    this.buffer = "";
    this.postProcessingBinders = []; // function

    this.textures = {}; // string
    this.effectAppearances = {}; // Appearance3D
    this.materialEffects = {}; // string
    this.materialNames = {};  // string
    this.surface2DIds = {}; // string
    this.sampler2DIds = {}; // string
    this.geometries = {}; // IndexedGeometryArray3D []
    this.sources = {}; // number []
    this.positions = {}; // number []
    this.normals = {}; // number []
    this.textureCoordinates = {}; // number []
    this.floatArrays = {}; // number []
    this.sourceAccessorStrides = [];
    this.appearanceGeometries = {}; // IndexedGeometryArray3D
    this.facesAndLinesPrimitives = []; // number [][]
    this.polygonsPrimitives = []; // number [][]
    this.polygonsHoles = []; // number [][][]
    this.nodes = {}; // TransformGroup3D
    this.controllersSkinMeshes = {}; // string
    this.instantiatedNodes = {}; // SharedGroup3D
    this.visualScenes = {}; // TransformGroup3D
    this.visualScene = null;
    this.floats = null; // number []
    this.geometryVertices = []; // number []
    this.geometryNormals = []; // number []
    this.geometryTextureCoordinates = []; // number []
    this.vcount = []; // number []
    this.transparentColor = []; // number []
    this.transparency = null;

    this.inRootAsset = false;
    this.reverseTransparency = false;
    this.imageId = null;
    this.materialId = null;
    this.effectId = null;
    this.newParamSid = null;
    this.inSurface2D = false;
    this.inPhongBlinnOrLambert = false;
    this.techniqueProfile = null;
    this.inConstant = false;
    this.geometryId = null;
    this.meshSourceId = null;
    this.verticesId = null;
    this.floatArrayId = null;
    this.controllerId = null;
    this.geometryAppearance = null;
    this.geometryVertexOffset = 0;
    this.geometryNormalOffset = 0;
    this.geometryTextureCoordinatesOffset = 0;
    this.axis = null;
    this.meterScale = 1.;
    this.floatValue = 0.;
    this.opaque = null;
    this.inputCount = 0;
  }

  startElement(uri, localName, name, attributes) {
    this.buffer = "";
    let parent = this.parentElements.length === 0
      ? null
      : this.parentElements[this.parentElements.length - 1];

    if (parent === null && !("COLLADA" == name)) {
      throw new SAXException("Expected COLLADA element");
    } else if ("COLLADA" == name) {
      let version = attributes.getValue("version");
      if (version.indexOf("1.4") !== 0) {
        throw new SAXException("Version " + version + " not supported");
      }
    } else if ("COLLADA" == parent && "asset" == name) {
      this.inRootAsset = true;
    } else if ("asset" == parent && "unit" == name) {
      let value = attributes.getValue("meter");
      if (value !== null) {
        this.meterScale = parseFloat(value);
      }
    } else if ("image" == name) {
      this.imageId = attributes.getValue("id");
    } else if ("material" == name) {
      this.materialId = attributes.getValue("id");
      this.materialNames[this.materialId] = attributes.getValue("name");
    } else if ("material" == parent && "instance_effect" == name) {
      let effectInstanceUrl = attributes.getValue("url");
      if (effectInstanceUrl.indexOf("#") === 0) {
        let effectInstanceAnchor = effectInstanceUrl.substring(1);
        this.materialEffects[this.materialId] = effectInstanceAnchor;
      }
    } else if ("effect" == name) {
      this.effectId = attributes.getValue("id");
      this.effectAppearances[this.effectId] = new Appearance3D();
    } else if (this.effectId !== null) {
      if ("profile_COMMON" == parent && "newparam" == name) {
        this.newParamSid = attributes.getValue("sid");
      } else if ("newparam" == parent && "surface" == name
        && "2D" == attributes.getValue("type")) {
        this.inSurface2D = true;
      } else if ("extra" == parent && "technique" == name) {
        this.techniqueProfile = attributes.getValue("profile");
      } else if ("phong" == name || "blinn" == name) {
        this.inPhongBlinnOrLambert = true;
      } else if ("lambert" == name) {
        this.inPhongBlinnOrLambert = true;
        this.effectAppearances[this.effectId].setSpecularColor(vec3.fromValues(0, 0, 0));
        this.effectAppearances[this.effectId].setShininess(1);
      } else if ("constant" == name) {
        this.inConstant = true;
      } else if (this.inConstant || this.inPhongBlinnOrLambert
        && ("transparent" == name)) {
        this.opaque = attributes.getValue("opaque");
        if (this.opaque === null) {
          this.opaque = "A_ONE";
        }
      } else if ("texture" == name && "diffuse" == parent) {
        let textureId = this.surface2DIds[this.sampler2DIds[attributes.getValue("texture")]];
        let appearance = this.effectAppearances[this.effectId];
        var handler = this;
        this.postProcessingBinders.push(() => {
          // Resolve texture at the end of the document
          appearance.imageEntryName = handler.textures[textureId];
        });
      }
    } else if ("geometry" == name) {
      this.geometryId = attributes.getValue("id");
      this.geometries[this.geometryId] = [];
    } else if (this.geometryId !== null) {
      if ("mesh" == parent && "source" == name) {
        this.meshSourceId = attributes.getValue("id");
      } else if ("mesh" == parent && "vertices" == name) {
        this.verticesId = attributes.getValue("id");
      } else if (this.meshSourceId !== null) {
        if ("float_array" == name) {
          this.floatArrayId = attributes.getValue("id");
        } else if ("technique_common" == parent && "accessor" == name) {
          let floatArrayAnchor = attributes.getValue("source").substring(1);
          let stride = attributes.getValue("stride");
          stride = stride !== null ? parseInt(stride) : 1;
          this.sourceAccessorStrides.push(
            { floatArray: this.floatArrays[floatArrayAnchor], stride: stride });
        }
      } else if (this.verticesId !== null && "input" == name) {
        var sourceAnchor = attributes.getValue("source").substring(1);
        var source = this.sources[sourceAnchor];
        if (source !== undefined) {
          if ("POSITION" == attributes.getValue("semantic")) {
            this.positions[this.verticesId] = new Array(source.length / 3);
            for (var i = 0, k = 0; k < source.length; i++, k += 3) {
              this.positions[this.verticesId][i] = vec3.fromValues(source[k], source[k + 1], source[k + 2]);
            }
          } else if ("NORMAL" == attributes.getValue("semantic")) {
            this.normals[this.verticesId] = new Array(source.length / 3);
            for (var i = 0, k = 0; k < source.length; i++, k += 3) {
              this.normals[this.verticesId][i] = vec3.fromValues(source[k], source[k + 1], source[k + 2]);
            }
          } else if ("TEXCOORD" == attributes.getValue("semantic")) {
            this.textureCoordinates[this.verticesId] = new Array(source.length / 2);
            for (var i = 0, k = 0; k < source.length; i++, k += 2) {
              this.textureCoordinates[this.verticesId][i] = vec2.fromValues(source[k], source[k + 1]);
            }
          }
        }
      } else if (this.verticesId === null && "input" == name) {
        var sourceAnchor = attributes.getValue("source").substring(1);
        let offset = parseInt(attributes.getValue("offset"));
        if (this.inputCount < offset + 1) {
          this.inputCount = offset + 1;
        }
        if ("VERTEX" == attributes.getValue("semantic")) {
          this.geometryVertices = this.positions[sourceAnchor];
          if (this.geometryVertices === undefined) {
            this.geometryVertices = null;
          }
          this.geometryVertexOffset = offset;
          if (this.geometryNormals === null) {
            this.geometryNormals = this.normals[sourceAnchor];
            this.geometryNormalOffset = offset;
          }
          if (this.geometryTextureCoordinates === null) {
            this.geometryTextureCoordinates = this.textureCoordinates[sourceAnchor];
            this.geometryTextureCoordinatesOffset = offset;
          }
        } else if ("NORMAL" == attributes.getValue("semantic")) {
          var source = this.sources[sourceAnchor];
          if (source !== undefined) {
            this.geometryNormals = new Array(source.length / 3);
            for (var i = 0, k = 0; k < source.length; i++, k += 3) {
              this.geometryNormals[i] = vec3.fromValues(source[k], source[k + 1], source[k + 2]);
            }
            this.geometryNormalOffset = offset;
          }
        } else if ("TEXCOORD" == attributes.getValue("semantic")) {
          var source = this.sources[sourceAnchor];
          if (source !== undefined) {
            this.geometryTextureCoordinates = new Array(source.length / 2);
            for (var i = 0, k = 0; k < source.length; i++, k += 2) {
              this.geometryTextureCoordinates[i] = vec2.fromValues(source[k], source[k + 1]);
            }
            this.geometryTextureCoordinatesOffset = offset;
          }
        }
      } else if ("triangles" == name
        || "trifans" == name
        || "tristrips" == name
        || "polylist" == name
        || "polygons" == name
        || "lines" == name
        || "linestrips" == name) {
        this.geometryAppearance = attributes.getValue("material");
        this.inputCount = 0;
        this.facesAndLinesPrimitives = [];
        this.polygonsPrimitives = [];
        this.polygonsHoles = [];
        this.vcount = null;
      }
    } else if ("controller" == name) {
      this.controllerId = attributes.getValue("id");
    } else if ("skin" == name) {
      let skinSource = attributes.getValue("source");
      if (skinSource.indexOf("#") === 0) {
        let skinSourceAnchor = skinSource.substring(1);
        this.controllersSkinMeshes[this.controllerId] = skinSourceAnchor;
      }
    } else if ("visual_scene" == name) {
      let visualSceneGroup = new TransformGroup3D();
      this.parentGroups.push(visualSceneGroup);
      this.visualScenes[attributes.getValue("id")] = visualSceneGroup;
    } else if ("node" == name) {
      let nodeGroup = new TransformGroup3D();
      if (this.parentGroups.length > 0) {
        // Add node to parent node only for children nodes
        this.parentGroups[this.parentGroups.length - 1].addChild(nodeGroup);
      }
      this.parentGroups.push(nodeGroup);
      this.nodes[attributes.getValue("id")] = nodeGroup;
      var nodeName = attributes.getValue("name");
      if (nodeName !== null) {
        nodeGroup.setName(nodeName);
      }
    } else if ("node" == parent
      && ("instance_geometry" == name
        || "instance_controller" == name)) {
      let instanceUrl = attributes.getValue("url");
      if (instanceUrl.indexOf("#") === 0) {
        let inInstanceController = "instance_controller" == name;
        let instanceAnchor = instanceUrl.substring(1);
        var nodeName = attributes.getValue("name");
        let parentGroup = new Group3D();
        this.parentGroups[this.parentGroups.length - 1].addChild(parentGroup);
        this.parentGroups.push(parentGroup);
        var handler = this;
        this.postProcessingBinders.push(() => {
          let nameSuffix = 0;
          // Resolve URL at the end of the document
          let geometries = inInstanceController
            ? handler.geometries[handler.controllersSkinMeshes[instanceAnchor]]
            : handler.geometries[instanceAnchor];
          for (let i = 0; i < geometries.length; i++) {
            let shape = new Shape3D(geometries[i]);
            parentGroup.addChild(shape);
            // Give a name to shape 
            if (nodeName !== null) {
              if (nameSuffix === 0) {
                shape.setName(nodeName);
              } else {
                shape.setName(nodeName + "_" + nameSuffix);
              }
              nameSuffix++;
            }
          }
        });
      }
    } else if ("instance_node" == name) {
      let nodeInstanceUrl = attributes.getValue("url");
      if (nodeInstanceUrl.indexOf("#") === 0) {
        let nodeInstanceAnchor = nodeInstanceUrl.substring(1);
        let parentTransformGroup = this.parentGroups[this.parentGroups.length - 1];
        var handler = this;
        this.postProcessingBinders.push(() => {
          // Resolve URL at the end of the document
          let sharedGroup = handler.instantiatedNodes[nodeInstanceAnchor];
          if (sharedGroup === undefined) {
            sharedGroup = new SharedGroup3D();
            sharedGroup.addChild(handler.nodes[nodeInstanceAnchor]);
            handler.instantiatedNodes[nodeInstanceAnchor] = sharedGroup;
          }
          parentTransformGroup.addChild(new Link3D(sharedGroup));
        });
      }
    } else if ("instance_material" == name && this.parentGroups.length > 0) {
      let materialInstanceTarget = attributes.getValue("target");
      if (materialInstanceTarget.indexOf("#") == 0) {
        let materialInstanceAnchor = materialInstanceTarget.substring(1);
        let materialInstanceSymbol = attributes.getValue("symbol");
        let group = this.parentGroups[this.parentGroups.length - 1];
        var handler = this;
        this.postProcessingBinders.push(() => {
          let appearance = handler.effectAppearances[handler.materialEffects[materialInstanceAnchor]];
          let updateShapeAppearance = (node, appearance, forceUpdate) => {
            if (node instanceof Group3D) {
              let updated = false;
              let children = node.getChildren();
              for (var i = 0; i < children.length; i++) {
                updated |= updateShapeAppearance(children[i], appearance, forceUpdate);
              }
              return updated;
            } else if (node instanceof Link3D) {
              return updateShapeAppearance(node.getSharedGroup(), appearance, forceUpdate);
            } else if (node instanceof Shape3D) {
              let geometries = forceUpdate
                ? node.getGeometries()
                : handler.appearanceGeometries[materialInstanceSymbol];
              if (geometries !== undefined) {
                for (var i = 0; i < geometries.length; i++) {
                  if (geometries[i] === node.getGeometries()[0]) {
                    node.setAppearance(appearance);
                    return true;
                  }
                }
              }
            }
            return false;
          };

          if (!updateShapeAppearance(group, appearance, false)) {
            updateShapeAppearance(group, appearance, true);
          }
          appearance.setName(handler.materialNames[materialInstanceAnchor]);
        });
      }
    } else if ("instance_visual_scene" == name) {
      let visualSceneInstanceUrl = attributes.getValue("url");
      if (visualSceneInstanceUrl.indexOf("#") === 0) {
        let visualSceneInstanceAnchor = visualSceneInstanceUrl.substring(1);
        var handler = this;
        this.postProcessingBinders.push(() => {
          // Resolve URL at the end of the document
          handler.visualScene = handler.visualScenes[visualSceneInstanceAnchor];
        });
      }
    }
    this.parentElements.push(name);
  }

  characters(ch, start, length) {
    this.buffer += ch.substring(start, start + length);
  }

  endElement(uri, localName, name) {
    this.parentElements.pop();
    let parent = this.parentElements.length === 0
      ? null
      : this.parentElements[this.parentElements.length - 1];

    if ("color" == name
      || "float_array" == name
      || "matrix" == name
      || "rotate" == name
      || "scale" == name
      || "translate" == name) {
      let floatValues = this.getCharacters().split(/\s/);
      this.floats = new Array(floatValues.length);
      let floatCount = 0;
      for (let i = 0; i < floatValues.length; i++) {
        if (floatValues[i].length > 0) {
          let floatValue = parseFloat(floatValues[i]);
          if (isNaN(floatValue)) {
            // This may happen with some bad DAE files
            floatValue = 0.;
          }
          this.floats[floatCount++] = floatValue;
        }
      }
      if (floatCount !== floatValues.length) {
        this.floats.splice(floatCount, this.floats.length - floatCount);
      }
      if (this.floatArrayId !== null) {
        this.floatArrays[this.floatArrayId] = this.floats;
        this.floatArrayId = null;
      }
    } else if ("float" == name) {
      this.floatValue = parseFloat(this.getCharacters());
    }

    if (this.inRootAsset) {
      this.handleRootAssetElementsEnd(name);
    } else if ("image" == name) {
      this.imageId = null;
    } else if (this.imageId !== null) {
      this.handleImageElementsEnd(name);
    } else if ("material" == name) {
      this.materialId = null;
    } else if ("effect" == name) {
      this.effectId = null;
    } else if (this.effectId !== null) {
      this.handleEffectElementsEnd(name, parent);
    } else if ("geometry" == name) {
      this.geometryId = null;
    } else if (this.geometryId !== null) {
      this.handleGeometryElementsEnd(name, parent);
    } else if ("controller" == name) {
      this.controllerId = null;
    } else if ("visual_scene" == name
      || "node" == name
      || "node" == parent && "instance_geometry" == name) {
      this.parentGroups.pop();
    } else if ("matrix" == name) {
      let matrix = mat4.fromValues(
        this.floats[0], this.floats[4], this.floats[8], this.floats[12],
        this.floats[1], this.floats[5], this.floats[9], this.floats[13],
        this.floats[2], this.floats[6], this.floats[10], this.floats[14],
        this.floats[3], this.floats[7], this.floats[11], this.floats[15]);
      this.mulTransformGroup(matrix);
    } else if ("node" == parent && "rotate" == name) {
      let rotation = mat4.create();
      mat4.fromRotation(rotation, this.floats[3] * Math.PI / 180.,
        vec3.fromValues(this.floats[0], this.floats[1], this.floats[2]));
      this.mulTransformGroup(rotation);
    } else if ("scale" == name) {
      let scale = mat4.create();
      mat4.scale(scale, scale, vec3.fromValues(this.floats[0], this.floats[1], this.floats[2]));
      this.mulTransformGroup(scale);
    } else if ("node" == parent && "translate" == name) {
      let translation = mat4.create();
      mat4.translate(translation, translation, vec3.fromValues(this.floats[0], this.floats[1], this.floats[2]));
      this.mulTransformGroup(translation);
    }
  }

  /**
   * Returns the trimmed string of last element value. 
   * @private
   */
  getCharacters() {
    return this.buffer.trim();
  }

  /**
   * Handles the end tag of elements children of root "asset".
   * @private
   */
  handleRootAssetElementsEnd(name) {
    if ("asset" == name) {
      this.inRootAsset = false;
    } else if ("up_axis" == name) {
      this.axis = this.getCharacters();
    } else if ("subject" == name) {
      this.scene.setName(this.getCharacters());
    } else if ("authoring_tool" == name) {
      let tool = this.getCharacters();
      // Try to detect if DAE file was created by Google SketchUp version < 7.1 
      if (tool.indexOf("Google SketchUp") === 0) {
        let sketchUpVersion = tool.substring("Google SketchUp".length).trim();
        if (sketchUpVersion.length > 0) {
          let dotIndex = sketchUpVersion.indexOf('.');
          let majorVersionString = dotIndex === -1
            ? sketchUpVersion : sketchUpVersion.substring(0, dotIndex);
          let majorVersion = parseInt(majorVersionString);
          if (majorVersion < 7
            || (majorVersion == 7
              && (dotIndex >= sketchUpVersion.length - 1 // No subversion
                || sketchUpVersion[dotIndex + 1] < '1'))) {
            // From http://www.collada.org/public_forum/viewtopic.php?f=12&t=1667
            // let's reverse transparency   
            this.reverseTransparency = true;
          }
        }
      }
    }
  }

  /**
   * Handles the end tag of elements children of "image".
   * @private
   */
  handleImageElementsEnd(name) {
    if ("init_from" == name) {
      let imageName = this.getCharacters();
      if (imageName.indexOf("./") === 0) {
        // Remove leading dot
        imageName = imageName.substring(2);
      }
      let lastSlash = this.daeEntryName.lastIndexOf("/");
      if (lastSlash >= 0) {
        // Build imageName path simplifying .. relative paths if necessary
        let daeEntryNameParts = this.daeEntryName.split("/");
        let imageNameParts = imageName.split("/");
        daeEntryNameParts.splice(daeEntryNameParts.length - 1, 1);
        while (imageNameParts[0] == ".." || imageNameParts[0] == ".") {
          if (imageNameParts[0] == "..") {
            daeEntryNameParts.splice(daeEntryNameParts.length - 1, 1);
          }
          imageNameParts.splice(0, 1);
        }
        imageName = "";
        for (var i = 0; i < daeEntryNameParts.length; i++) {
          imageName += daeEntryNameParts[i] + "/";
        }
        for (var i = 0; i < imageNameParts.length; i++) {
          imageName += imageNameParts[i] + "/";
        }
        imageName = imageName.substring(0, imageName.length - 1);
      }
      this.textures[this.imageId] = imageName;
    } else if ("data" == name) {
      throw new SAXException("<data> not supported");
    }
  }

  /**
   * Handles the end tag of elements children of "effect".
   * @private
   */
  handleEffectElementsEnd(name, parent) {
    if ("profile_COMMON" == parent && "newparam" == name) {
      this.newParamSid = null;
    } else if ("newparam" == parent && "surface" == name) {
      this.inSurface2D = false;
    } else if (this.newParamSid !== null) {
      if (this.inSurface2D && "init_from" == name) {
        this.surface2DIds[this.newParamSid] = this.getCharacters();
      } else if ("sampler2D" == parent && "source" == name) {
        this.sampler2DIds[this.newParamSid] = this.getCharacters();
      }
    } else if ("extra" == parent && "technique" == name) {
      this.techniqueProfile = null;
    } else if ("phong" == name || "blinn" == name
      || "lambert" == name || "constant" == name) {
      let transparencyValue;
      if (this.transparentColor !== null) {
        if ("RGB_ZERO" == this.opaque) {
          transparencyValue = this.transparentColor[0] * 0.212671
            + this.transparentColor[1] * 0.715160
            + this.transparentColor[2] * 0.072169;
          if (this.transparency !== null) {
            transparencyValue *= this.transparency;
          }
        } else { // A_ONE
          if (this.transparency !== null) {
            transparencyValue = 1 - this.transparentColor[3] * this.transparency;
          } else {
            transparencyValue = 1 - this.transparentColor[3];
          }
          if (this.reverseTransparency) {
            transparencyValue = 1 - transparencyValue;
          }
        }
      } else {
        transparencyValue = 0;
      }
      let appearance = this.effectAppearances[this.effectId];
      if (transparencyValue > 0) {
        appearance.setTransparency(transparencyValue); // 0 means opaque 
      }
      // Set default color if it doesn't exist yet
      let defaultColor = this.transparentColor != null
        ? vec3.fromValues(this.transparentColor[0], this.transparentColor[1], this.transparentColor[2])
        : vec3.fromValues(0., 0., 0.);
      if (!appearance.getAmbientColor()
        && !appearance.getDiffuseColor()
        && !appearance.getSpecularColor()) {
        if (!appearance.getAmbientColor()) {
          appearance.setAmbientColor(defaultColor);
        }
        if (!appearance.getDiffuseColor()) {
          appearance.setDiffuseColor(defaultColor);
        }
        if (!appearance.getSpecularColor()) {
          appearance.setSpecularColor(defaultColor);
        }
        if (!appearance.getShininess()) {
          appearance.setShininess(1);
        }
        if ("constant" == name) {
          // Set illumination to 0 for coloring attributes effect
          this.effectAppearances[this.effectId].setIllumination(0);
        }
      }
      this.transparentColor = null;
      this.transparency = null;

      this.inPhongBlinnOrLambert = false;
      this.inConstant = false;
    } else if (this.inConstant || this.inPhongBlinnOrLambert) {
      // Set appearance attributes
      if ("color" == name) {
        if ("emission" == parent) {
          if (this.inPhongBlinnOrLambert) {
            this.effectAppearances[this.effectId].setEmissiveColor(vec3.fromValues(
              this.floats[0], this.floats[1], this.floats[2]));
          } else { // inConstant
            this.effectAppearances[this.effectId].setDiffuseColor(vec3.fromValues(
              this.floats[0], this.floats[1], this.floats[2]));
            // Set illumination to 0 for coloring attributes effect
            this.effectAppearances[this.effectId].setIllumination(0);
          }
        } else if ("ambient" == parent) {
          this.effectAppearances[this.effectId].setAmbientColor(vec3.fromValues(
            this.floats[0], this.floats[1], this.floats[2]));
        } else if ("diffuse" == parent) {
          this.effectAppearances[this.effectId].setDiffuseColor(vec3.fromValues(
            this.floats[0], this.floats[1], this.floats[2])); // this.floats [3]
        } else if ("specular" == parent) {
          this.effectAppearances[this.effectId].setSpecularColor(vec3.fromValues(
            this.floats[0], this.floats[1], this.floats[2]));
        } else if ("transparent" == parent) {
          this.transparentColor = this.floats;
        }
      } else if ("float" == name) {
        if ("shininess" == parent) {
          this.effectAppearances[this.effectId].setShininess(this.floatValue);
        } else if ("transparency" == parent) {
          this.transparency = this.floatValue;
        }
      }
    } else if ("double_sided" == name
      && "1" == this.getCharacters()
      && ("GOOGLEEARTH" == this.techniqueProfile
        || "MAX3D" == this.techniqueProfile
        || "MAYA" == this.techniqueProfile)) {
      this.effectAppearances[this.effectId].setCullFace(Appearance3D.CULL_NONE);
    }
  }

  /**
   * Handles the end tag of elements children of "geometry".
   * @private
   */
  handleGeometryElementsEnd(name, parent) {
    if ("mesh" == parent && "source" == name) {
      if (this.floats !== null) {
        this.sources[this.meshSourceId] = this.floats;
        this.floats = null;
      }
      this.meshSourceId = null;
    } else if ("mesh" == parent && "vertices" == name) {
      this.verticesId = null;
    } else if ("p" == name
      || "h" == name
      || "vcount" == name) {
      // Get integers
      let intValues = this.getCharacters().split(/\s/);
      let integers = new Array(intValues.length);
      let intCount = 0;
      for (let i = 0; i < intValues.length; i++) {
        if (intValues[i].length > 0) {
          integers[intCount++] = parseInt(intValues[i]);
        }
      }
      if (intCount !== intValues.length) {
        integers.splice(intCount, integers.length - intCount);
      }

      if ("ph" != parent && "p" == name) {
        this.facesAndLinesPrimitives.push(integers);
      } else if ("vcount" == name) {
        this.vcount = integers;
      } else if ("ph" == parent) {
        if ("p" == name) {
          this.polygonsPrimitives.push(integers);
        } else if ("h" == name) {
          if (this.polygonsPrimitives.length > this.polygonsHoles.length) {
            this.polygonsHoles.push([]);
          }
          this.polygonsHoles[this.polygonsPrimitives.length - 1].push(integers);
        }
      }
    } else if (("triangles" == name
      || "trifans" == name
      || "tristrips" == name
      || "polylist" == name
      || "polygons" == name
      || "lines" == name
      || "linestrips" == name)
      // Ignore geometries with missing vertices
      && this.geometryVertices !== null) {
      let geometry;
      if ("lines" == name
        || "linestrips" == name) {
        geometry = this.getLinesGeometry(name);
      } else {
        geometry = this.getFacesGeometry(name);
      }
      if (geometry !== null) {
        this.geometries[this.geometryId].push(geometry);
        if (this.geometryAppearance !== null) {
          let geometries = this.appearanceGeometries[this.geometryAppearance];
          if (geometries === undefined) {
            geometries = [];
            this.appearanceGeometries[this.geometryAppearance] = geometries;
          }
          geometries.push(geometry);
        }
      }
      this.geometryAppearance = null;
      this.geometryVertices = null;
      this.geometryNormals = null;
      this.geometryTextureCoordinates = null;
      this.facesAndLinesPrimitives = [];
      this.polygonsPrimitives = [];
      this.polygonsHoles = [];
      this.vcount = null;
    }
  }

  /**
   * Returns the triangles or polygons geometry matching the read values.
   * @private
   */
  getFacesGeometry(name) {
    let primitiveType;
    if ("triangles" == name) {
      primitiveType = GeometryInfo3D.TRIANGLE_ARRAY;
    } else if ("trifans" == name) {
      primitiveType = GeometryInfo3D.TRIANGLE_FAN_ARRAY;
    } else if ("tristrips" == name) {
      primitiveType = GeometryInfo3D.TRIANGLE_STRIP_ARRAY;
    } else {
      primitiveType = GeometryInfo3D.POLYGON_ARRAY;
    }

    let geometryInfo = new GeometryInfo3D(primitiveType);
    geometryInfo.setCoordinates(this.geometryVertices);
    geometryInfo.setCoordinateIndices(this.getIndices(this.geometryVertexOffset));
    if (this.geometryNormals) {
      geometryInfo.setNormals(this.geometryNormals);
      geometryInfo.setNormalIndices(this.getIndices(this.geometryNormalOffset));
    }
    if (this.geometryTextureCoordinates) {
      let stride;
      for (var i = 0; i < this.sourceAccessorStrides.length; i++) {
        let sourceAccessorStride = this.sourceAccessorStrides[i];
        if (sourceAccessorStride.floatArray === this.geometryTextureCoordinates) {
          stride = sourceAccessorStride.stride;
          break;
        }
      }
      // Support only UV texture coordinates
      let textureCoordinates;
      if (stride > 2) {
        textureCoordinates = new Array(this.geometryTextureCoordinates.length / stride * 2);
        for (var i = 0, j = 0; j < this.geometryTextureCoordinates.length; j += stride) {
          textureCoordinates[i++] = this.geometryTextureCoordinates[j];
          textureCoordinates[i++] = this.geometryTextureCoordinates[j + 1];
        }
      } else {
        textureCoordinates = this.geometryTextureCoordinates;
      }
      geometryInfo.setTextureCoordinates(textureCoordinates);
      geometryInfo.setTextureCoordinateIndices(this.getIndices(this.geometryTextureCoordinatesOffset));
    }


    if ("tristrips" == name
      || "trifans" == name) {
      var stripCounts = new Array(this.facesAndLinesPrimitives.length);
      for (var i = 0; i < stripCounts.length; i++) {
        stripCounts[i] = this.facesAndLinesPrimitives[i].length / this.inputCount;
      }
      geometryInfo.setStripCounts(stripCounts);
    } else if ("polylist" == name) {
      geometryInfo.setStripCounts(this.vcount);
    } else if ("polygons" == name) {
      let polygonHolesCount = 0;
      for (var i = 0; i < this.polygonsHoles.length; i++) {
        polygonHolesCount += this.polygonsHoles[i].length;
      }
      var stripCounts = new Array(this.facesAndLinesPrimitives.length + this.polygonsPrimitives.length
        + polygonHolesCount);
      let contourCounts = new Array(this.facesAndLinesPrimitives.length + this.polygonsPrimitives.length);
      let stripIndex = 0;
      let countourIndex = 0;
      for (var i = 0; i < this.facesAndLinesPrimitives.length; i++) {
        stripCounts[stripIndex++] = this.facesAndLinesPrimitives[i].length / this.inputCount;
        contourCounts[countourIndex++] = 1; // One polygon 
      }
      for (var i = 0; i < this.polygonsPrimitives.length; i++) {
        stripCounts[stripIndex++] = this.polygonsPrimitives[i].length / this.inputCount;
        let polygonHoles = this.polygonsHoles[i];
        for (var j = 0; j < polygonHoles.length; j++) {
          stripCounts[stripIndex++] = polygonHoles[j].length / this.inputCount;
        }
        contourCounts[countourIndex++] = 1 + polygonHoles.length; // One polygon + its holes count
      }
      geometryInfo.setStripCounts(stripCounts);
      geometryInfo.setContourCounts(contourCounts);
    }

    if (!this.geometryNormals) {
      geometryInfo.setCreaseAngle(Math.PI / 2);
      geometryInfo.setGeneratedNormals(true);
    }
    return geometryInfo.getIndexedGeometryArray();
  }

  /**
   * Returns the lines geometry matching the read values.
   * @private
   */
  getLinesGeometry(name) {
    let coordinatesIndices = this.getIndices(this.geometryVertexOffset);
    if (coordinatesIndices.length !== 0) {
      let textureCoordinatesIndices = this.geometryTextureCoordinates
        ? this.getIndices(this.geometryTextureCoordinatesOffset)
        : [];
      if ("linestrips" == name) {
        let noStripCoordinatesIndices = [];
        let noStripTextureCoordinatesIndices = [];
        for (let i = 0, index = 0; i < this.facesAndLinesPrimitives.length; i++) {
          let stripCount = this.facesAndLinesPrimitives[i].length / this.inputCount;
          for (let k = 0; k < stripCount - 1; k++) {
            noStripCoordinatesIndices.push(coordinatesIndices[index + k]);
            noStripCoordinatesIndices.push(coordinatesIndices[index + k + 1]);
            if (textureCoordinateIndices.length > 0) {
              noStripTextureCoordinatesIndices.push(textureCoordinateIndices[index + k]);
              noStripTextureCoordinatesIndices.push(textureCoordinateIndices[index + k + 1]);
            }
          }
          index += stripCount;
        }
        coordinatesIndices = noStripCoordinatesIndices;
        textureCoordinatesIndices = noStripTextureCoordinatesIndices;
      }
      return new IndexedLineArray3D(this.geometryVertices, coordinatesIndices,
        this.geometryTextureCoordinates, textureCoordinatesIndices);
    } else {
      // Ignore lines with an empty index set
      return null;
    }
  }

  /**
   * Returns the indices at the given <code>indexOffset</code>.
   * @private
   */
  getIndices(indexOffset) {
    if (this.facesAndLinesPrimitives.length === 1 && this.polygonsPrimitives.length === 1 && this.inputCount === 1) {
      return this.facesAndLinesPrimitives[0];
    } else {
      let indexCount = this.getIndexCount(this.facesAndLinesPrimitives);
      indexCount += this.getIndexCount(this.polygonsPrimitives);
      for (var i = 0; i < this.polygonsHoles.length; i++) {
        indexCount += this.getIndexCount(this.polygonsHoles[i]);
      }

      let indices = new Array(indexCount / this.inputCount);
      var i = 0;
      for (var j = 0; j < this.facesAndLinesPrimitives.length; j++) {
        let primitives = this.facesAndLinesPrimitives[j];
        for (var k = indexOffset; k < primitives.length; k += this.inputCount) {
          indices[i++] = primitives[k];
        }
      }
      for (var j = 0; j < this.polygonsPrimitives.length; j++) {
        let polygonPrimitives = this.polygonsPrimitives[j];
        for (var k = indexOffset; k < polygonPrimitives.length; k += this.inputCount) {
          indices[i++] = polygonPrimitives[k];
        }
        let polygonHoles = this.polygonsHoles[j];
        for (var k = 0; k < polygonHoles.length; k++) {
          let polygonHole = polygonHoles[k];
          for (let l = indexOffset; l < polygonHole.length; l += this.inputCount) {
            indices[i++] = polygonHole[l];
          }
        }
      }
      return indices;
    }
  }

  /**
   * Returns the total count of indices among the given <code>faceIndices</code>. 
   * @private
   */
  getIndexCount(faceIndices) {
    let indexCount = 0;
    for (let i = 0; i < faceIndices.length; i++) {
      indexCount += faceIndices[i].length;
    }
    return indexCount;
  }

  /**
   * Multiplies the transform at top of the transform groups stack by the 
   * given <code>transformMultiplier</code>.
   * @private
   */
  mulTransformGroup(transformMultiplier) {
    let transformGroup = this.parentGroups[this.parentGroups.length - 1];
    let transform = mat4.create();
    transformGroup.getTransform(transform);
    mat4.mul(transform, transform, transformMultiplier);
    transformGroup.setTransform(transform);
  }

  endDocument() {
    for (let i = 0; i < this.postProcessingBinders.length; i++) {
      this.postProcessingBinders[i]();
    }

    if (this.visualScene !== null) {
      let rootTransform = mat4.create();
      this.visualScene.getTransform(rootTransform);

      let bounds = new BoundingBox3D(
        vec3.fromValues(Infinity, Infinity, Infinity),
        vec3.fromValues(-Infinity, -Infinity, -Infinity));
      this.computeBounds(this.visualScene, bounds, mat4.create());

      // Translate model to its center
      let lower = vec3.create();
      bounds.getLower(lower);
      if (lower[0] !== Infinity) {
        let upper = vec3.create();
        bounds.getUpper(upper);
        let translation = mat4.create();
        mat4.translate(translation, translation,
          vec3.fromValues(-lower[0] - (upper[0] - lower[0]) / 2,
            -lower[1] - (upper[1] - lower[1]) / 2,
            -lower[2] - (upper[2] - lower[2]) / 2));
        mat4.mul(translation, translation, rootTransform);
        rootTransform = translation;
      }

      // Scale model to cm
      let scaleTransform = mat4.create();
      mat4.scale(scaleTransform, scaleTransform,
        vec3.fromValues(this.meterScale * 100, this.meterScale * 100, this.meterScale * 100));
      mat4.mul(scaleTransform, scaleTransform, rootTransform);

      // Set orientation to Y_UP
      let axisTransform = mat4.create();
      if ("Z_UP" == this.axis) {
        mat4.fromXRotation(axisTransform, -Math.PI / 2);
      } else if ("X_UP" == this.axis) {
        mat4.fromZRotation(axisTransform, Math.PI / 2);
      }
      mat4.mul(axisTransform, axisTransform, scaleTransform);

      this.visualScene.setTransform(axisTransform);

      this.sceneRoot.addChild(this.visualScene);
    }
  }

  /**
   * Combines the given <code>bounds</code> with the bounds of the given <code>node</code>
   * and its children.
   */
  computeBounds(node, bounds, parentTransformations) {
    if (node instanceof Group3D) {
      if (node instanceof TransformGroup3D) {
        parentTransformations = mat4.clone(parentTransformations);
        let transform = mat4.create();
        node.getTransform(transform);
        mat4.mul(parentTransformations, parentTransformations, transform);
      }
      // Compute the bounds of all the node children
      let children = node.getChildren();
      for (let i = 0; i < children.length; i++) {
        this.computeBounds(children[i], bounds, parentTransformations);
      }
    } else if (node instanceof Link3D) {
      this.computeBounds(node.getSharedGroup(), bounds, parentTransformations);
    } else if (node instanceof Shape3D) {
      let shapeBounds = node.getBounds();
      shapeBounds.transform(parentTransformations);
      bounds.combine(shapeBounds);
    }
  }
}

