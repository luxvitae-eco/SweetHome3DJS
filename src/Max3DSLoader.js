/*
 * Max3DSLoader.js
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

import { vec2, vec3, vec4, mat3, mat4, quat, } from 'gl-matrix';

import { ModelLoader } from './ModelLoader';
import {
  Appearance3D, Group3D,
  Shape3D,
  TransformGroup3D,
  Link3D,
  SharedGroup3D,
  GeometryInfo3D,
  IncorrectFormat3DException,
} from './scene3d';

/**
 * Creates an instance of an 3DS loader.
 * @constructor
 * @extends ModelLoader
 * @author Emmanuel Puybaret
 */
export class Max3DSLoader extends ModelLoader {
  constructor() {
    super("3ds");

    if (Max3DSLoader.DEFAULT_APPEARANCE === null) {
      Max3DSLoader.DEFAULT_APPEARANCE = new Appearance3D("Default");
      Max3DSLoader.DEFAULT_APPEARANCE.setAmbientColor(vec3.fromValues(0.4, 0.4, 0.4));
      Max3DSLoader.DEFAULT_APPEARANCE.setDiffuseColor(vec3.fromValues(0.7102, 0.702, 0.6531));
      Max3DSLoader.DEFAULT_APPEARANCE.setSpecularColor(vec3.fromValues(0.3, 0.3, 0.3));
      Max3DSLoader.DEFAULT_APPEARANCE.setShininess(128.);
    }
  }

  /**
   * Creates a new scene from the parsed data and calls onmodelcreated asynchronously or 
   * returns the created scene if onmodelcreated is null.
   * @private
   */
  createScene(
    meshes,
    meshesGroups,
    materials,
    root,
    masterScale,
    onmodelcreated,
    onprogression
  ) {
    let sceneRoot = new Group3D();
    let transform = mat4.create();
    mat4.fromXRotation(transform, -Math.PI / 2);
    mat4.scale(transform, transform, vec3.fromValues(masterScale, masterScale, masterScale));
    let mainGroup = new TransformGroup3D(transform);
    sceneRoot.addChild(mainGroup);
    // If key framer data contained a hierarchy, add it to main group
    if (root.getChildren().length > 0) {
      mainGroup.addChild(root);
      mainGroup = root;
    }

    // Create appearances from 3DS materials
    let appearances = {};
    for (let name in materials) {
      let material = materials[name];
      let appearance = new Appearance3D(name);
      if (material.ambientColor !== null) {
        appearance.setAmbientColor(material.ambientColor);
      }
      if (material.diffuseColor !== null) {
        appearance.setDiffuseColor(material.diffuseColor);
      }
      if (material.shininess !== null) {
        appearance.setShininess(material.shininess * 128 * 0.6);
      }
      if (material.specularColor !== null) {
        if (material.shininess !== null) {
          // Reduce specular color shininess effect
          let modifiedSpecularColor = vec3.clone(material.specularColor);
          vec3.scale(modifiedSpecularColor, modifiedSpecularColor, material.shininess);
          appearance.setSpecularColor(modifiedSpecularColor);
        } else {
          appearance.setSpecularColor(material.specularColor);
        }
      }

      if (material.transparency !== null && material.transparency > 0) {
        appearance.setTransparency(Math.min(1, material.transparency));
      }

      if (material.texture) {
        appearance.imageEntryName = material.texture;
      }
      appearances[name] = appearance;
    }

    if (onmodelcreated === null) {
      onprogression(ModelLoader.BUILDING_MODEL, "", 0);
      for (let i = 0; i < meshes.length; i++) {
        this.createShapes(meshes[i], meshesGroups, appearances, sceneRoot, mainGroup);
      }
      onprogression(ModelLoader.BUILDING_MODEL, "", 1);
      return sceneRoot;
    } else {
      let meshesCount = meshes.length;
      let builtGeometryCount = 0;
      let loader = this;
      let sceneBuilder = () => {
        onprogression(ModelLoader.BUILDING_MODEL, "", meshesCount !== 0 ? builtGeometryCount / meshesCount : 0);
        let start = Date.now();
        while (meshes.length > 0) {
          loader.createShapes(meshes[0], meshesGroups, appearances, sceneRoot, mainGroup);
          builtGeometryCount++;
          meshes.splice(0, 1);
          if (builtGeometryCount < meshesCount
            && Date.now() - start > 10) {
            // Continue shapes creation later
            setTimeout(sceneBuilder, 0);
            return;
          }
        }
        // All shapes are created
        setTimeout(
          () => {
            onprogression(ModelLoader.BUILDING_MODEL, "", 1);
            onmodelcreated(sceneRoot);
          }, 0);
      };
      sceneBuilder();
    }
  }

  /**
   * Creates the 3D shapes matching the parsed mesh data, and adds them to <code>sceneRoot</code>.
   * @private
   */
  createShapes(mesh, meshesGroups, appearances, sceneRoot, mainGroup) {
    let identity = mat4.create();
    let faces = mesh.faces;
    if (faces !== null && faces.length > 0) {
      let vertices = mesh.vertices;
      // Compute default normals
      let sharedVertices = new Array(vertices.length);
      for (var i = 0; i < sharedVertices.length; i++) {
        sharedVertices[i] = null;
      }
      let defaultNormals = new Array(3 * faces.length);
      let vector1 = vec3.create();
      let vector2 = vec3.create();
      for (var i = 0, k = 0; i < faces.length; i++) {
        var face = faces[i];
        var vertexIndices = face.vertexIndices;
        for (var j = 0; j < 3; j++, k++) {
          var vertexIndex = vertexIndices[j];
          vec3.subtract(vector1, vertices[vertexIndices[j < 2 ? j + 1 : 0]], vertices[vertexIndex]);
          vec3.subtract(vector2, vertices[vertexIndices[j > 0 ? j - 1 : 2]], vertices[vertexIndex]);
          var normal = vec3.create();
          vec3.cross(normal, vector1, vector2);
          let length = vec3.length(normal);
          if (length > 0) {
            let weight = Math.atan2(length, vec3.dot(vector1, vector2));
            vec3.scale(normal, normal, weight / length);
          }

          // Add vertex index to the list of shared vertices 
          var sharedVertex = new Max3DSLoader.Mesh3DSSharedVertex(i, normal);
          sharedVertex.nextVertex = sharedVertices[vertexIndex];
          sharedVertices[vertexIndex] = sharedVertex;
          defaultNormals[k] = normal;
        }
      }

      // Adjust the normals of shared vertices belonging to no smoothing group 
      // or to the same smoothing group
      let normals = new Array(3 * faces.length);
      for (var i = 0, k = 0; i < faces.length; i++) {
        var face = faces[i];
        var vertexIndices = face.vertexIndices;
        var normalIndices = new Array(3);
        for (var j = 0; j < 3; j++, k++) {
          var vertexIndex = vertexIndices[j];
          var normal = vec3.create();
          if (face.smoothingGroup === null) {
            for (var sharedVertex = sharedVertices[vertexIndex];
              sharedVertex !== null;
              sharedVertex = sharedVertex.nextVertex) {
              // Take into account only normals of shared vertex with a crease angle  
              // smaller than PI / 2 (i.e. dot product > 0) 
              if (faces[sharedVertex.faceIndex].smoothingGroup === null
                && (sharedVertex.normal === defaultNormals[k]
                  || vec3.dot(sharedVertex.normal, defaultNormals[k]) > 0)) {
                vec3.add(normal, normal, sharedVertex.normal);
              }
            }
          } else {
            let smoothingGroup = face.smoothingGroup;
            for (var sharedVertex = sharedVertices[vertexIndex];
              sharedVertex !== null;
              sharedVertex = sharedVertex.nextVertex) {
              var sharedIndexFace = faces[sharedVertex.faceIndex];
              if (sharedIndexFace.smoothingGroup !== null
                && (face.smoothingGroup & sharedIndexFace.smoothingGroup) !== 0) {
                smoothingGroup |= sharedIndexFace.smoothingGroup;
              }
            }
            for (var sharedVertex = sharedVertices[vertexIndex];
              sharedVertex !== null;
              sharedVertex = sharedVertex.nextVertex) {
              var sharedIndexFace = faces[sharedVertex.faceIndex];
              if (sharedIndexFace.smoothingGroup !== null
                && (smoothingGroup & sharedIndexFace.smoothingGroup) !== 0) {
                vec3.add(normal, normal, sharedVertex.normal);
              }
            }
          }

          if (vec3.squaredLength(normal) !== 0) {
            vec3.normalize(normal, normal);
          } else {
            // If smoothing leads to a null normal, use default normal
            vec3.copy(normal, defaultNormals[k]);
            if (vec3.squaredLength(normal) !== 0) {
              vec3.normalize(normal, normal);
            }
          }
          normals[k] = normal;
          normalIndices[j] = k;
        }

        face.normalIndices = normalIndices;
      }

      // Sort faces to ensure they are cited material group by material group
      faces.sort((face1, face2) => {
        let material1 = face1.material;
        let material2 = face2.material;
        if (material1 === null) {
          if (material2 === null) {
            return face1.index - face2.index;
          } else {
            return -1;
          }
        } else if (material2 === null) {
          return 1;
        } else {
          return 0;
        }
      });

      // Seek the parent of this mesh
      let parentGroup;
      let meshGroups = meshesGroups[mesh.name];
      if (meshGroups === undefined) {
        parentGroup = mainGroup;
      } else if (meshGroups.length === 1) {
        parentGroup = meshGroups[0];
      } else {
        let sharedGroup = new SharedGroup3D();
        for (var i = 0; i < meshGroups.length; i++) {
          meshGroups[i].addChild(new Link3D(sharedGroup));
        }
        parentGroup = sharedGroup;
      }

      // Apply mesh transform
      let transform = mesh.transform;
      if (transform !== null) {
        if (!mat4.exactEquals(transform, identity)) {
          let transformGroup = new TransformGroup3D(transform);
          parentGroup.addChild(transformGroup);
          parentGroup = transformGroup;
        }
      }

      let textureCoordinates = mesh.textureCoordinates;
      var i = 0;
      let shape = null;
      let material = null;
      while (i < faces.length) {
        let firstFace = faces[i];
        let firstMaterial = firstFace.material;

        // Search how many faces share the same characteristics
        let max = i;
        while (++max < faces.length) {
          if (firstMaterial !== faces[max].material) {
            break;
          }
        }

        // Create indices arrays for the faces with an index between i and max
        let faceCount = max - i;
        let coordinateIndices = new Array(faceCount * 3);
        var normalIndices = new Array(faceCount * 3);
        for (var j = 0, k = 0; j < faceCount; j++) {
          var face = faces[i + j];
          var vertexIndices = face.vertexIndices;
          let faceNormalIndices = face.normalIndices;
          for (let l = 0; l < 3; l++, k++) {
            coordinateIndices[k] = vertexIndices[l];
            normalIndices[k] = faceNormalIndices[l];
          }
        }

        // Generate geometry 
        let geometryInfo = new GeometryInfo3D(GeometryInfo3D.TRIANGLE_ARRAY);
        geometryInfo.setCoordinates(vertices);
        geometryInfo.setCoordinateIndices(coordinateIndices);
        geometryInfo.setNormals(normals);
        geometryInfo.setNormalIndices(normalIndices);
        if (textureCoordinates !== null) {
          geometryInfo.setTextureCoordinates(textureCoordinates);
          geometryInfo.setTextureCoordinateIndices(coordinateIndices);
        }
        let geometryArray = geometryInfo.getIndexedGeometryArray();

        if (shape === null || material !== firstMaterial) {
          material = firstMaterial;
          let appearance = Max3DSLoader.DEFAULT_APPEARANCE;
          if (firstMaterial !== null
            && appearances[firstMaterial.name] !== undefined) {
            appearance = appearances[firstMaterial.name];
          }
          appearance = appearance.clone();
          if (firstMaterial !== null && firstMaterial.twoSided) {
            appearance.setCullFace(Appearance3D.CULL_NONE);
          }
          shape = new Shape3D(geometryArray, appearance);
          parentGroup.addChild(shape);
          shape.setName(mesh.name + (i === 0 ? "" : "_" + i));
        } else {
          shape.addGeometry(geometryArray);
        }
        i = max;
      }
    }
  }

  /**
   * Returns the content of the model stored in the given entry.
   * @protected
   */
  getModelContent(modelEntry) {
    return modelEntry.asUint8Array();
  }

  /**
   * Parses the given 3DS content and calls onmodelloaded asynchronously or 
   * returns the scene it describes if onmodelloaded is null.
   * @protected
   */
  parseEntryScene(
    max3dsContent,
    max3dsEntryName,
    zip,
    modelContext,
    onmodelloaded,
    onprogression
  ) {
    let meshes = [];       // Mesh3DS 
    let meshesGroups = {}; // TransformGroup3D []
    let materials = {};    // Material3DS
    let masterScale;
    let root = new TransformGroup3D();

    if (onmodelloaded === null) {
      onprogression(ModelLoader.PARSING_MODEL, max3dsEntryName, 0);
      masterScale = this.parse3DSStream(new Max3DSLoader.ChunksInputStream(max3dsContent), max3dsEntryName, zip, meshes, meshesGroups, materials, root);
      onprogression(ModelLoader.PARSING_MODEL, max3dsEntryName, 1);
      return this.createScene(meshes, meshesGroups, materials, root, masterScale, null, onprogression);
    } else {
      let loader = this;
      masterScale = this.parse3DSStream(new Max3DSLoader.ChunksInputStream(max3dsContent), max3dsEntryName, zip, meshes, meshesGroups, materials, root);
      let max3dsEntryParser = () => {
        // Parsing is finished
        setTimeout(
          () => {
            onprogression(ModelLoader.PARSING_MODEL, max3dsEntryName, 1);
            loader.createScene(meshes, meshesGroups, materials, root, masterScale,
              (scene) => {
                onmodelloaded(scene);
              },
              onprogression);
          }, 0);
      };
      max3dsEntryParser();
    }
  }

  /**
   * Returns the scene with data read from the given 3DS stream.
   * @param {Max3DSLoader.ChunksInputStream} input
   * @param {string} max3dsEntryName
   * @param {JSZip}  zip 
   * @param {Array.<Max3DSLoader.Mesh3DS>} meshes 
   * @param {Object} meshesGroups
   * @param {Object} materials
   * @param {TransformGroup3D} root
   * @return {number} master scale
   * @private
   */
  parse3DSStream(input, max3dsEntryName, zip, meshes, meshesGroups, materials, root) {
    let masterScale = 1;
    try {
      let magicNumberRead = false;
      switch (input.readChunkHeader().id) {
        case Max3DSLoader.M3DMAGIC:
        case Max3DSLoader.MLIBMAGIC:
        case Max3DSLoader.CMAGIC:
          magicNumberRead = true;
          while (!input.isChunckEndReached()) {
            switch (input.readChunkHeader().id) {
              case Max3DSLoader.M3D_VERSION:
                input.readLittleEndianUnsignedInt();
                break;
              case Max3DSLoader.EDITOR_DATA:
                this.parseEditorData(input, max3dsEntryName, zip, meshes, materials);
                break;
              case Max3DSLoader.KEY_FRAMER_DATA:
                this.parseKeyFramerData(input, meshesGroups, root);
                break;
              default:
                input.readUntilChunkEnd();
                break;
            }
            input.releaseChunk();
          }
          break;
        case Max3DSLoader.EDITOR_DATA:
          masterScale = this.parseEditorData(input, max3dsEntryName, zip, meshes, materials);
          break;
        default:
          if (magicNumberRead) {
            input.readUntilChunkEnd();
          } else {
            throw new IncorrectFormat3DException("Bad magic number");
          }
      }
      input.releaseChunk();
    } catch (ex) {
      // In case of an error, clear already read data
      meshes.length = 0;
    }

    return masterScale;
  }

  /**
   * Parses 3DS data in the current chunk.
   * @param {Max3DSLoader.ChunksInputStream} input
   * @param {string} max3dsEntryName
   * @param {JSZip}  zip 
   * @param {Array.<Max3DSLoader.Mesh3DS>} meshes
   * @param {Object} materials
   * @return {number} master scale
   * @private
   */
  parseEditorData(input, max3dsEntryName, zip, meshes, materials) {
    let masterScale = 1;
    while (!input.isChunckEndReached()) {
      switch (input.readChunkHeader().id) {
        case Max3DSLoader.MESH_VERSION:
          input.readLittleEndianInt();
          break;
        case Max3DSLoader.MASTER_SCALE:
          masterScale = input.readLittleEndianFloat();
          break;
        case Max3DSLoader.NAMED_OBJECT:
          this.parseNamedObject(input, meshes, materials);
          break;
        case Max3DSLoader.MATERIAL_ENTRY:
          const material = this.parseMaterial(input, max3dsEntryName, zip);
          materials[material.name] = material;
          break;
        default:
          input.readUntilChunkEnd();
          break;
      }
      input.releaseChunk();
    }
    return masterScale;
  }

  /**
   * Parses named objects like mesh in the current chunk.
   * @param {Max3DSLoader.ChunksInputStream} input
   * @param {Array.<Max3DSLoader.Mesh3DS>} meshes 
   * @param {Object} materials
   * @private
   */
  parseNamedObject(input, meshes, materials) {
    let name = input.readString();
    while (!input.isChunckEndReached()) {
      switch (input.readChunkHeader().id) {
        case Max3DSLoader.TRIANGLE_MESH_OBJECT:
          meshes.push(this.parseMeshData(input, name, materials));
          break;
        default:
          input.readUntilChunkEnd();
          break;
      }
      input.releaseChunk();
    }
  }

  /**
   * Returns the mesh read from the current chunk.  
   * @param {Max3DSLoader.ChunksInputStream} input
   * @param {string} name
   * @param {Object} materials
   * @private
   */
  parseMeshData(input, name, materials) {
    let vertices = null;
    let textureCoordinates = null;
    let transform = null;
    let color = null;
    let faces = null;
    while (!input.isChunckEndReached()) {
      switch (input.readChunkHeader().id) {
        case Max3DSLoader.MESH_MATRIX:
          transform = this.parseMatrix(input);
          // Returns null if not invertible 
          transform = mat4.invert(transform, transform);
          break;
        case Max3DSLoader.MESH_COLOR:
          color = input.readUnsignedByte();
          break;
        case Max3DSLoader.POINT_ARRAY:
          vertices = new Array(input.readLittleEndianUnsignedShort());
          for (var i = 0; i < vertices.length; i++) {
            vertices[i] = vec3.fromValues(input.readLittleEndianFloat(),
              input.readLittleEndianFloat(), input.readLittleEndianFloat());
          }
          break;
        case Max3DSLoader.FACE_ARRAY:
          faces = this.parseFacesData(input);
          while (!input.isChunckEndReached()) {
            switch (input.readChunkHeader().id) {
              case Max3DSLoader.MESH_MATERIAL_GROUP:
                const materialName = input.readString();
                let material = null;
                if (materials !== null) {
                  material = materials[materialName];
                }
                for (let i = 0, n = input.readLittleEndianUnsignedShort(); i < n; i++) {
                  let index = input.readLittleEndianUnsignedShort();
                  if (index < faces.length) {
                    faces[index].material = material;
                  }
                }
                break;
              case Max3DSLoader.SMOOTHING_GROUP:
                for (var i = 0; i < faces.length; i++) {
                  faces[i].smoothingGroup = input.readLittleEndianUnsignedInt();
                }
                break;
              case Max3DSLoader.MESH_BOXMAP:
              default:
                input.readUntilChunkEnd();
                break;
            }
            input.releaseChunk();
          }
          break;
        case Max3DSLoader.TEXTURE_COORDINATES:
          textureCoordinates = new Array(input.readLittleEndianUnsignedShort());
          for (var i = 0; i < textureCoordinates.length; i++) {
            textureCoordinates[i] =
              vec2.fromValues(input.readLittleEndianFloat(), input.readLittleEndianFloat());
          }
          break;
        default:
          input.readUntilChunkEnd();
          break;
      }
      input.releaseChunk();
    }
    return new Max3DSLoader.Mesh3DS(name, vertices, textureCoordinates, faces, color, transform);
  }

  /**
   * Parses key framer data.
   * @param {Max3DSLoader.ChunksInputStream} input
   * @param {Object} meshesGroups
   * @param {TransformGroup3D} root
   * @private
   */
  parseKeyFramerData(input, meshesGroups, root) {
    let transformGroups = [];
    let transformGroupNodeIds = [];
    let currentTransformGroup = null;
    while (!input.isChunckEndReached()) {
      switch (input.readChunkHeader().id) {
        case Max3DSLoader.OBJECT_NODE_TAG:
          let meshGroup = true;
          let pivot = null;
          let position = null;
          let rotationAngle = 0;
          let rotationAxis = null;
          let scale = null;
          let nodeId = -1;
          while (!input.isChunckEndReached()) {
            switch (input.readChunkHeader().id) {
              case Max3DSLoader.NODE_ID:
                nodeId = input.readLittleEndianShort();
                break;
              case Max3DSLoader.NODE_HIERARCHY:
                const meshName = input.readString();
                meshGroup = "$$$DUMMY" != meshName;
                input.readLittleEndianUnsignedShort();
                input.readLittleEndianUnsignedShort();
                const parentId = input.readLittleEndianShort();
                const transformGroup = new TransformGroup3D();
                if (parentId === -1) {
                  root.addChild(transformGroup);
                } else {
                  let found = false;
                  for (let i = 0; i < transformGroupNodeIds.length; i++) {
                    if (parentId === transformGroupNodeIds[i]) {
                      transformGroups[i].addChild(transformGroup);
                      found = true;
                      break;
                    }
                  }
                  if (!found) {
                    throw new IncorrectFormat3DException("Inconsistent nodes hierarchy");
                  }
                }
                transformGroupNodeIds.push(nodeId);
                transformGroups.push(transformGroup);
                if (meshGroup) {
                  // Store group parent of mesh 
                  let meshGroups = meshesGroups[meshName];
                  if (meshGroups === undefined) {
                    meshGroups = [];
                    meshesGroups[meshName] = meshGroups;
                  }
                  meshGroups.push(transformGroup);
                }
                currentTransformGroup = transformGroup;
                break;
              case Max3DSLoader.PIVOT:
                pivot = this.parseVector(input);
                break;
              case Max3DSLoader.POSITION_TRACK_TAG:
                this.parseKeyFramerTrackStart(input);
                position = this.parseVector(input);
                // Ignore next frames
                input.readUntilChunkEnd();
                break;
              case Max3DSLoader.ROTATION_TRACK_TAG:
                this.parseKeyFramerTrackStart(input);
                rotationAngle = input.readLittleEndianFloat();
                rotationAxis = this.parseVector(input);
                // Ignore next frames
                input.readUntilChunkEnd();
                break;
              case Max3DSLoader.SCALE_TRACK_TAG:
                this.parseKeyFramerTrackStart(input);
                scale = this.parseVector(input);
                // Ignore next frames
                input.readUntilChunkEnd();
                break;
              default:
                input.readUntilChunkEnd();
                break;
            }
            input.releaseChunk();
          }

          // Prepare transformations
          const transform = mat4.create();
          if (position !== null) {
            mat4.translate(transform, transform, position);
          }
          if (rotationAxis !== null
            && rotationAngle !== 0) {
            let length = vec3.length(rotationAxis);
            if (length > 0) {
              let halfAngle = -rotationAngle / 2.;
              let sin = Math.sin(halfAngle) / length;
              let cos = Math.cos(halfAngle);
              let rotationTransform = mat4.create();
              mat4.fromQuat(rotationTransform, quat.fromValues(rotationAxis[0] * sin, rotationAxis[1] * sin, rotationAxis[2] * sin, cos));
              mat4.mul(transform, transform, rotationTransform);
            }
          }
          if (scale !== null) {
            mat4.scale(transform, transform, scale);
          }
          if (pivot !== null
            && meshGroup) {
            vec3.negate(pivot, pivot);
            mat4.translate(transform, transform, pivot);
          }
          currentTransformGroup.setTransform(transform);
          break;
        default:
          input.readUntilChunkEnd();
          break;
      }
      input.releaseChunk();
    }
  }

  /**
   * Parses the start of a key framer track.
   * @param {Max3DSLoader.ChunksInputStream} input
   * @private
   */
  parseKeyFramerTrackStart(input) {
    input.readLittleEndianUnsignedShort(); // Flags
    input.readLittleEndianUnsignedInt();
    input.readLittleEndianUnsignedInt();
    input.readLittleEndianInt();           // Key frames count
    input.readLittleEndianInt();           // Key frame index
    let flags = input.readLittleEndianUnsignedShort();
    if ((flags & Max3DSLoader.TRACK_KEY_USE_TENS) !== 0) {
      input.readLittleEndianFloat();
    }
    if ((flags & Max3DSLoader.TRACK_KEY_USE_CONT) !== 0) {
      input.readLittleEndianFloat();
    }
    if ((flags & Max3DSLoader.TRACK_KEY_USE_BIAS) !== 0) {
      input.readLittleEndianFloat();
    }
    if ((flags & Max3DSLoader.TRACK_KEY_USE_EASE_TO) !== 0) {
      input.readLittleEndianFloat();
    }
    if ((flags & Max3DSLoader.TRACK_KEY_USE_EASE_FROM) !== 0) {
      input.readLittleEndianFloat();
    }
  }

  /**
   * Returns the mesh faces read from the current chunk. 
   * @return {Max3DSLoader.Face3DS} 
   * @private
   */
  parseFacesData(input) {
    let faces = new Array(input.readLittleEndianUnsignedShort());
    for (let i = 0; i < faces.length; i++) {
      faces[i] = new Max3DSLoader.Face3DS(
        i,
        input.readLittleEndianUnsignedShort(),
        input.readLittleEndianUnsignedShort(),
        input.readLittleEndianUnsignedShort(),
        input.readLittleEndianUnsignedShort());
    }
    return faces;
  }

  /**
   * Returns the 3DS material read from the current chunk.
   * @param {Max3DSLoader.ChunksInputStream} input
   * @param {string} max3dsEntryName
   * @param {JSZip}  zip 
   * @return {Max3DSLoader.Material3DS}  
   * @private
   */
  parseMaterial(input, max3dsEntryName, zip) {
    let name = null;
    let ambientColor = null;
    let diffuseColor = null;
    let specularColor = null;
    let shininess = null;
    let transparency = null;
    let twoSided = false;
    let texture = null;
    while (!input.isChunckEndReached()) {
      switch (input.readChunkHeader().id) {
        case Max3DSLoader.MATERIAL_NAME:
          name = input.readString();
          break;
        case Max3DSLoader.MATERIAL_AMBIENT:
          ambientColor = this.parseColor(input);
          break;
        case Max3DSLoader.MATERIAL_DIFFUSE:
          diffuseColor = this.parseColor(input);
          break;
        case Max3DSLoader.MATERIAL_SPECULAR:
          specularColor = this.parseColor(input);
          break;
        case Max3DSLoader.MATERIAL_SHININESS:
          shininess = this.parsePercentage(input);
          break;
        case Max3DSLoader.MATERIAL_TRANSPARENCY:
          // 0 = fully opaque to 1 = fully transparent
          transparency = this.parsePercentage(input);
          break;
        case Max3DSLoader.MATERIAL_TWO_SIDED:
          twoSided = true;
          break;
        case Max3DSLoader.MATERIAL_TEXMAP:
          texture = this.parseTextureMap(input, max3dsEntryName, zip);
          break;
        default:
          input.readUntilChunkEnd();
          break;
      }
      input.releaseChunk();
    }
    return new Max3DSLoader.Material3DS(name, ambientColor, diffuseColor, specularColor,
      shininess, transparency, texture, twoSided);
  }

  /**
   * Returns the color read from the current chunk.  
   * @param {Max3DSLoader.ChunksInputStream} input
   * @return {vec3}
   * @private
   */
  parseColor(input) {
    let linearColor = false;
    let color = null;
    let readColor;
    while (!input.isChunckEndReached()) {
      switch (input.readChunkHeader().id) {
        case Max3DSLoader.LINEAR_COLOR_24:
          linearColor = true;
          color = vec3.fromValues(input.readUnsignedByte() / 255.,
            input.readUnsignedByte() / 255., input.readUnsignedByte() / 255.);
          break;
        case Max3DSLoader.COLOR_24:
          readColor = vec3.fromValues(input.readUnsignedByte() / 255.,
            input.readUnsignedByte() / 255., input.readUnsignedByte() / 255.);
          if (!linearColor) {
            color = readColor;
          }
          break;
        case Max3DSLoader.LINEAR_COLOR_FLOAT:
          linearColor = true;
          color = vec3.fromValues(input.readLittleEndianFloat(),
            input.readLittleEndianFloat(), input.readLittleEndianFloat());
          break;
        case Max3DSLoader.COLOR_FLOAT:
          readColor = vec3.fromValues(input.readLittleEndianFloat(),
            input.readLittleEndianFloat(), input.readLittleEndianFloat());
          if (!linearColor) {
            color = readColor;
          }
          break;
        default:
          input.readUntilChunkEnd();
          break;
      }
      input.releaseChunk();
    }
    if (color !== null) {
      return color;
    } else {
      throw new IncorrectFormat3DException("Expected color value");
    }
  }

  /**
   * Returns the percentage read from the current chunk.  
   * @param {Max3DSLoader.ChunksInputStream} input
   * @return {number}
   * @private
   */
  parsePercentage(input) {
    let percentage = null;
    while (!input.isChunckEndReached()) {
      switch (input.readChunkHeader().id) {
        case Max3DSLoader.PERCENTAGE_INT:
          percentage = input.readLittleEndianShort() / 100.;
          break;
        case Max3DSLoader.PERCENTAGE_FLOAT:
          percentage = input.readLittleEndianFloat();
          break;
        default:
          input.readUntilChunkEnd();
          break;
      }
      input.releaseChunk();
    }
    if (percentage !== null) {
      return percentage;
    } else {
      throw new IncorrectFormat3DException("Expected percentage value");
    }
  }

  /**
   * Returns the texture entry name read from the current chunk.    
   * @param {Max3DSLoader.ChunksInputStream} input
   * @param {string} max3dsEntryName
   * @param {JSZip}  zip 
   * @return {string}
   * @private
   */
  parseTextureMap(input, max3dsEntryName, zip) {
    let mapName = null;
    while (!input.isChunckEndReached()) {
      switch (input.readChunkHeader().id) {
        case Max3DSLoader.MATERIAL_MAPNAME:
          mapName = input.readString();
          break;
        case Max3DSLoader.PERCENTAGE_INT:
        default:
          input.readUntilChunkEnd();
          break;
      }
      input.releaseChunk();
    }

    if (mapName !== null) {
      let lastSlash = max3dsEntryName.lastIndexOf("/");
      if (lastSlash >= 0) {
        mapName = max3dsEntryName.substring(0, lastSlash + 1) + mapName;
      }
      let imageEntry = zip.file(mapName);
      if (imageEntry !== null) {
        return mapName;
      } else {
        // Test also if the texture file doesn't exist ignoring case
        return this.getEntryNameIgnoreCase(zip, mapName);
      }
    }
    return null;
  }

  /**
   * Returns the entry in a zip file equal to the given name ignoring case.
   * @private
   */
  getEntryNameIgnoreCase(zip, searchedEntryName) {
    searchedEntryName = searchedEntryName.toUpperCase();
    let entries = zip.file(/.*/);
    for (let i = 0; i < entries.length; i++) {
      if (entries[i].name.toUpperCase() == searchedEntryName) {
        return entries[i].name;
      }
    }
    return null;
  }

  /**
   * Returns the matrix read from the current chunk.  
   * @param {Max3DSLoader.ChunksInputStream} input
   * @return {mat4}
   * @private
   */
  parseMatrix(input) {
    return mat4.fromValues(
      input.readLittleEndianFloat(), input.readLittleEndianFloat(), input.readLittleEndianFloat(), 0,
      input.readLittleEndianFloat(), input.readLittleEndianFloat(), input.readLittleEndianFloat(), 0,
      input.readLittleEndianFloat(), input.readLittleEndianFloat(), input.readLittleEndianFloat(), 0,
      input.readLittleEndianFloat(), input.readLittleEndianFloat(), input.readLittleEndianFloat(), 1);
  }

  /**
   * Returns the vector read from the current chunk.
   * @param {Max3DSLoader.ChunksInputStream} input
   * @return {vec3}
   * @private
   */
  parseVector(input) {
    return vec3.fromValues(input.readLittleEndianFloat(),
      input.readLittleEndianFloat(), input.readLittleEndianFloat());
  }

  /**
   * Creates a chunk with its ID and length.
   * @param {number} id
   * @param {number} length
   * @constructor
   * @private
   */
  static Chunk3DS(id, length) {
    if (length < 6) {
      throw new IncorrectFormat3DException("Invalid chunk " + id + " length " + length);
    }
    this.id = id;
    this.length = length;
    this.readLength = 6;
  }

  /**
   * Creates an input stream storing chunks hierarchy and other data required during parsing.
   * @param {Uint8Array} input
   * @constructor
   * @private
   */
  static ChunksInputStream(input) {
    this.input = input;
    this.index = 0;
    this.stack = []; // Chunk3DS [] 
  }

  /**
   * Creates a 3DS mesh.
   * @param {string} name, 
   * @param {Point3f[]} vertices
   * @param {TexCoord2f[]} textureCoordinates
   * @param {Array.<Max3DSLoader.Face3DS>} faces
   * @param {number} color
   * @param {mat4} transform
   * @constructor
   * @private
   */
  static Mesh3DS(name, vertices, textureCoordinates, faces, color, transform) {
    this.name = name;
    this.vertices = vertices;
    this.textureCoordinates = textureCoordinates;
    this.faces = faces;
    this.color = color;
    this.transform = transform;
  }

  /**
   * Creates a 3DS face.
   * @param {number} index
   * @param {number} vertexAIndex
   * @param {number} vertexBIndex
   * @param {number} vertexCIndex
   * @param {number} flags
   * @constructor
   * @private
   */
  static Face3DS(index, vertexAIndex, vertexBIndex, vertexCIndex, flags) {
    this.index = index;
    this.vertexIndices = [vertexAIndex, vertexBIndex, vertexCIndex];
    this.normalIndices = null;  // number []
    this.material = null;       // Material3DS
    this.smoothingGroup = null; // number
  }

  /**
   * Creates a 3DS material.
   * @param {string}  name
   * @param {vec3}    ambientColor
   * @param {vec3}    diffuseColor
   * @param {vec3}    specularColor
   * @param {number}  shininess
   * @param {number}  transparency
   * @param {Image}   texture
   * @param {boolean} twoSided
   * @constructor
   * @private
   */
  static Material3DS(
    name,
    ambientColor,
    diffuseColor,
    specularColor,
    shininess,
    transparency,
    texture,
    twoSided
  ) {
    this.name = name;
    this.ambientColor = ambientColor;
    this.diffuseColor = diffuseColor;
    this.specularColor = specularColor;
    this.shininess = shininess;
    this.transparency = transparency;
    this.texture = texture;
    this.twoSided = twoSided;
  }

  /**
   * Creates a vertex shared between faces in a mesh.
   * @param {number} faceIndex
   * @param {vec3} normal
   * @constructor
   * @private
   */
  static Mesh3DSSharedVertex(faceIndex, normal) {
    this.faceIndex = faceIndex;
    this.normal = normal;
    this.nextVertex = null; // Mesh3DSSharedVertex 
  }
}

Max3DSLoader.NULL_CHUNK = 0x0000;
Max3DSLoader.M3DMAGIC = 0x4D4D;   // 3DS file
Max3DSLoader.MLIBMAGIC = 0x3DAA;  // MLI file
Max3DSLoader.CMAGIC = 0xC23D;     // PRJ file
Max3DSLoader.M3D_VERSION = 0x0002;

Max3DSLoader.COLOR_FLOAT = 0x0010;
Max3DSLoader.COLOR_24 = 0x0011;
Max3DSLoader.LINEAR_COLOR_24 = 0x0012;
Max3DSLoader.LINEAR_COLOR_FLOAT = 0x0013;
Max3DSLoader.PERCENTAGE_INT = 0x0030;
Max3DSLoader.PERCENTAGE_FLOAT = 0x0031;

Max3DSLoader.EDITOR_DATA = 0x3D3D;
Max3DSLoader.MESH_VERSION = 0x3D3E;
Max3DSLoader.MASTER_SCALE = 0x0100;

Max3DSLoader.MATERIAL_ENTRY = 0xAFFF;
Max3DSLoader.MATERIAL_NAME = 0xA000;
Max3DSLoader.MATERIAL_AMBIENT = 0xA010;
Max3DSLoader.MATERIAL_DIFFUSE = 0xA020;
Max3DSLoader.MATERIAL_SPECULAR = 0xA030;
Max3DSLoader.MATERIAL_SHININESS = 0xA040;
Max3DSLoader.MATERIAL_TRANSPARENCY = 0xA050;
Max3DSLoader.MATERIAL_TWO_SIDED = 0xA081;
Max3DSLoader.MATERIAL_TEXMAP = 0xA200;
Max3DSLoader.MATERIAL_MAPNAME = 0xA300;

Max3DSLoader.NAMED_OBJECT = 0x4000;
Max3DSLoader.TRIANGLE_MESH_OBJECT = 0x4100;
Max3DSLoader.POINT_ARRAY = 0x4110;
Max3DSLoader.FACE_ARRAY = 0x4120;
Max3DSLoader.MESH_MATERIAL_GROUP = 0x4130;
Max3DSLoader.SMOOTHING_GROUP = 0x4150;
Max3DSLoader.MESH_BOXMAP = 0x4190;
Max3DSLoader.TEXTURE_COORDINATES = 0x4140;
Max3DSLoader.MESH_MATRIX = 0x4160;
Max3DSLoader.MESH_COLOR = 0x4165;

Max3DSLoader.KEY_FRAMER_DATA = 0xB000;
Max3DSLoader.OBJECT_NODE_TAG = 0xB002;
Max3DSLoader.NODE_ID = 0xB030;
Max3DSLoader.NODE_HIERARCHY = 0xB010;
Max3DSLoader.PIVOT = 0xB013;
Max3DSLoader.POSITION_TRACK_TAG = 0xB020;
Max3DSLoader.ROTATION_TRACK_TAG = 0xB021;
Max3DSLoader.SCALE_TRACK_TAG = 0xB022;

Max3DSLoader.TRACK_KEY_USE_TENS = 0x01;
Max3DSLoader.TRACK_KEY_USE_CONT = 0x02;
Max3DSLoader.TRACK_KEY_USE_BIAS = 0x04;
Max3DSLoader.TRACK_KEY_USE_EASE_TO = 0x08;
Max3DSLoader.TRACK_KEY_USE_EASE_FROM = 0x10;

Max3DSLoader.DEFAULT_APPEARANCE = null;

class Chunk3DS {
  incrementReadLength(readBytes) {
    this.readLength += readBytes;
  }

  toString() {
    return this.id + " " + this.length;
  }
}

Max3DSLoader.Chunk3DS = Chunk3DS;

class ChunksInputStream {
  /**
   * Returns the next value in input stream or -1 if end is reached.
   * @private
   */
  read() {
    if (this.index >= this.input.length) {
      return -1;
    } else {
      return this.input[this.index++];
    }
  }

  /**
   * Reads the next chunk id and length, pushes it in the stack and returns it.
   * <code>null</code> will be returned if the end of the stream is reached.
   * @return {Max3DSLoader.Chunk3DS}
   * @private
   */
  readChunkHeader() {
    let chunkId = this.readLittleEndianUnsignedShort(false);
    let chunk = new Max3DSLoader.Chunk3DS(chunkId, this.readLittleEndianUnsignedInt(false));
    this.stack.push(chunk);
    return chunk;
  }

  /**
   * Pops the chunk at the top of stack and checks it was entirely read. 
   * @private
   */
  releaseChunk() {
    let chunk = this.stack.pop();
    if (chunk.length !== chunk.readLength) {
      throw new IncorrectFormat3DException("Chunk " + chunk.id + " invalid length. "
        + "Expected to read " + chunk.length + " bytes, but actually read " + chunk.readLength + " bytes");
    }
    if (this.stack.length !== 0) {
      this.stack[this.stack.length - 1].incrementReadLength(chunk.length);
    }
  }

  /**
   * Returns <code>true</code> if the current chunk end was reached.
   * @return {boolean}
   * @private
   */
  isChunckEndReached() {
    let chunk = this.stack[this.stack.length - 1];
    return chunk.length === chunk.readLength;
  }

  /**
   * Reads the stream until the end of the current chunk.
   * @private
   */
  readUntilChunkEnd() {
    let chunk = this.stack[this.stack.length - 1];
    let remainingLength = chunk.length - chunk.readLength;
    for (let length = remainingLength; length > 0; length--) {
      if (this.read() < 0) {
        throw new IncorrectFormat3DException("Chunk " + chunk.id + " too short");
      }
    }
    chunk.incrementReadLength(remainingLength);
  }

  /**
   * Returns the unsigned byte read from this stream.
   * @private
   */
  readUnsignedByte() {
    let b = this.read();
    if (b === -1) {
      throw new IncorrectFormat3DException("Unexpected EOF");
    } else {
      this.stack[this.stack.length - 1].incrementReadLength(1);
      return b;
    }
  }

  /**
   * Returns the unsigned short read from this stream.
   * @private
   */
  readLittleEndianUnsignedShort(incrementReadLength) {
    if (incrementReadLength === undefined) {
      incrementReadLength = true;
    }
    let b1 = this.read();
    if (b1 === -1) {
      throw new IncorrectFormat3DException("Unexpected EOF");
    }
    let b2 = this.read();
    if (b2 === -1) {
      throw new IncorrectFormat3DException("Can't read short");
    }
    if (incrementReadLength) {
      this.stack[this.stack.length - 1].incrementReadLength(2);
    }
    return (b2 << 8) | b1;
  }

  /**
   * Returns the short read from this stream.
   * @private
   */
  readLittleEndianShort(incrementReadLength) {
    let s = this.readLittleEndianUnsignedShort(incrementReadLength);
    if (s & 0x8000) {
      s = (-1 & ~0x7FFF) | s; // Extend sign bit
    }
    return s;
  }

  /**
   * Returns the float read from this stream.
   * @private
   */
  readLittleEndianFloat() {
    ChunksInputStream.int32Converter[0] = this.readLittleEndianUnsignedInt(true);
    return ChunksInputStream.float32Converter[0]; // Float.intBitsToFloat
  }

  /**
   * Returns the unsigned integer read from this stream.
   * @private
   */
  readLittleEndianUnsignedInt(incrementReadLength) {
    if (incrementReadLength === undefined) {
      incrementReadLength = true;
    }
    let b1 = this.read();
    if (b1 === -1) {
      throw new IncorrectFormat3DException("Unexpected EOF");
    }
    let b2 = this.read();
    let b3 = this.read();
    let b4 = this.read();
    if (b2 === -1 || b3 === -1 || b4 === -1) {
      throw new IncorrectFormat3DException("Can't read int");
    }
    if (incrementReadLength) {
      this.stack[this.stack.length - 1].incrementReadLength(4);
    }
    return (b4 << 24) | (b3 << 16) | (b2 << 8) | b1;
  }

  /**
   * Returns the integer read from this stream.
   * @private
   */
  readLittleEndianInt(incrementReadLength) {
    let i = this.readLittleEndianUnsignedInt(incrementReadLength);
    if (i & 0x80000000) {
      i = (-1 & ~0x7FFFFFFF) | i; // Extend sign bit
    }
    return i;
  }

  /**
   * Returns the string read from this stream.
   * @private
   */
  readString() {
    let string = "";
    let b;
    // Read characters until terminal 0
    while ((b = this.read()) !== -1 && b !== 0) {
      string += String.fromCharCode(b);
    }
    if (b === -1) {
      throw new IncorrectFormat3DException("Unexpected end of file");
    }
    this.stack[this.stack.length - 1].incrementReadLength(string.length + 1);
    return string; // Need to take "ISO-8859-1" encoding into account?
  }
}

// Create buffers to convert 4 bytes to a float
ChunksInputStream.converter = new Int8Array(4);
ChunksInputStream.int32Converter = new Int32Array(ChunksInputStream.converter.buffer, 0, 1);
ChunksInputStream.float32Converter = new Float32Array(ChunksInputStream.converter.buffer, 0, 1);

Max3DSLoader.ChunksInputStream = ChunksInputStream;