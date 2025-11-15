/*
 * IncrementalHomeRecorder.js
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
import Big from 'big.js';

import {
  HomeObject,
  Home,
  PlanController,
} from './SweetHome3D';

import { HomeRecorder } from './HomeRecorder';
import { FurnitureTablePanel } from './FurnitureTablePanel';
import { HomePane } from './HomePane';
import { CoreTools } from './CoreTools';
import { UserPreferences } from './UserPreferences';
import { UUID } from './core';
import {
  LocalURLContent, URLContent,
  IndexedDBURLContent, LocalStorageURLContent,
} from './URLContent';

/**
 * A home recorder able to save the application homes incrementally by sending undoable edits 
 * to a server supporting home edits.
 * @param {HomeApplication} application
 * @param {{readHomeURL: string,
 *          writeHomeEditsURL: string,
 *          closeHomeURL: string,
 *          writeResourceURL: string,
 *          readResourceURL: string,
 *          pingURL: string,
 *          autoWriteDelay: number,
 *          trackedHomeProperties: string[],
 *          autoWriteTrackedStateChange: boolean,
 *          writingObserver: {writeStarted: Function, 
 *                            writeSucceeded: Function, 
 *                            writeFailed: Function, 
 *                            connectionFound: Function, 
 *                            connectionLost: Function}
 *         }} [configuration] the recorder configuration
 * @constructor
 * @author Renaud Pawlak
 * @author Emmanuel Puybaret
 * @author Louis Grignon
 */
export class IncrementalHomeRecorder extends HomeRecorder {
  constructor(application, configuration) {
    super(configuration);
    this.application = application;
    this.homeData = {};
    this.online = true;
    let pingDelay = 10000;
    if (this.configuration.pingURL !== undefined) {
      let recorder = this;
      setTimeout(() => {
        recorder.checkServer(pingDelay);
      }, pingDelay);
    }
  }

  /**
   * Gets the home properties that are tracked and potentially written by this recorder.
   */
  getTrackedHomeProperties() {
    if (this.configuration && this.configuration.trackedHomeProperties) {
      return this.configuration.trackedHomeProperties;
    } else {
      return IncrementalHomeRecorder.DEFAULT_TRACKED_HOME_PROPERTIES;
    }
  }

  /**
   * Configures this incremental recorder's behavior.
   * @param {Object} configuration an object containing configuration fields
   */
  configure(configuration) {
    this.configuration = configuration;
  }

  /**
   * Checks if the server is available by calling the <code>pingURL</code> service in 
   * recorder configuration every <code>pingDelay</code> milliseconds. 
   * @param {number} pingDelay
   * @private 
   */
  checkServer(pingDelay) {
    let recorder = this;
    let request = new XMLHttpRequest();
    let pingUrl = this.configuration["pingURL"];
    request.open("GET", pingUrl, true);
    request.addEventListener("load", (ev) => {
      if (request.readyState === XMLHttpRequest.DONE
        && request.status === 200) {
        if (!recorder.online) {
          if (recorder.configuration
            && recorder.configuration.writingObserver
            && recorder.configuration.writingObserver.connectionFound) {
            recorder.configuration.writingObserver.connectionFound(recorder);
          }
        }
        recorder.online = true;
        setTimeout(() => {
          recorder.checkServer(pingDelay);
        }, pingDelay);
      } else {
        if (recorder.online) {
          if (recorder.configuration
            && recorder.configuration.writingObserver
            && recorder.configuration.writingObserver.connectionLost) {
            recorder.configuration.writingObserver.connectionLost(request.status, request.statusText);
          }
        }
        recorder.online = false;
        setTimeout(() => {
          recorder.checkServer(pingDelay);
        }, pingDelay);
      }
    });
    request.addEventListener("error", (ev) => {
      if (recorder.online) {
        if (recorder.configuration
          && recorder.configuration.writingObserver
          && recorder.configuration.writingObserver.connectionLost) {
          recorder.configuration.writingObserver.connectionLost(0, "Can't post " + pingUrl);
        }
      }
      recorder.online = false;
      setTimeout(() => {
        recorder.checkServer(pingDelay);
      }, pingDelay);
    });
    request.send();
  }

  /**
   * Reads a home with this recorder.
   * @param {string} homeName the home name on the server 
   *                          or the URL of the home if <code>readHomeURL</code> service is missing 
   * @param {{homeLoaded: function, homeError: function, progression: function}} observer  callbacks used to follow the reading of the home 
   */
  readHome(homeName, observer) {
    if (this.configuration.readHomeURL !== undefined) {
      // Replace % sequence by %% except %s before formating readHomeURL with home name 
      let readHomeUrl = CoreTools.format(this.configuration.readHomeURL.replace(/(%[^s])/g, "%$1"), encodeURIComponent(homeName));
      if (readHomeUrl.indexOf("?") > 0) {
        // Create an edition id stored in read home once loaded
        let editionId = HomeObject.createId("home");
        readHomeUrl += "&editionId=" + editionId;
        let originalObserver = observer;
        var observer = {
          homeLoaded: function (home) {
            home.editionId = editionId;
            originalObserver.homeLoaded(home);
          },
          homeError: function (error) {
            originalObserver.homeError(error);
          },
          progression: function (part, info, percentage) {
            originalObserver.progression(part, info, percentage);
          }
        };
      }
      homeName = readHomeUrl;
    }
    super.readHome(homeName, observer);
  }

  /**
   * Updates existing objects list.
   * @param {Home} home
   * @private
   */
  checkPoint(home) {
    let recorder = this;
    recorder.homeData[home.editionId].existingHomeObjects = {};
    home.getHomeObjects().forEach((homeObject) => {
      recorder.homeData[home.editionId].existingHomeObjects[homeObject.id] = homeObject.id;
    });
  }

  /**
   * Adds a home to be incrementally saved by this recorder.
   * @param {Home} home
   * @param {HomeController} homeController
   */
  addHome(home, homeController) {
    if (this.configuration.writeHomeEditsURL !== undefined) {
      if (homeController === undefined
        && this.application.getHomeController !== undefined) {
        // Keep backward compatibility
        homeController = this.application.getHomeController(home);
      }
      if (home.editionId === undefined) {
        // Add an edition id to home to manage additional data required for the recorder
        home.editionId = HomeObject.createId("home");
      }
      this.homeData[home.editionId] = {};

      this.checkPoint(home);

      this.homeData[home.editionId].undoableEditSupport = homeController.getUndoableEditSupport();

      let recorder = this;
      let listener = {
        undoableEditHappened: function (undoableEditEvent) {
          recorder.storeEdit(home, undoableEditEvent.getEdit());
          recorder.scheduleWrite(home);
        },
        source: recorder // Additional field to track the listener  
      };
      this.homeData[home.editionId].undoableEditSupport.addUndoableEditListener(listener);
      // Caution: direct access to undoManager field of HomeController
      let undoManager = homeController.undoManager;
      let coreUndo = undoManager.undo;
      let coreRedo = undoManager.redo;
      undoManager.undo = () => {
        let edit = undoManager.editToBeUndone();
        coreUndo.call(undoManager);
        recorder.storeEdit(home, edit, true);
        recorder.scheduleWrite(home);
      };
      undoManager.redo = () => {
        let edit = undoManager.editToBeRedone();
        coreRedo.call(undoManager);
        recorder.storeEdit(home, edit);
        recorder.scheduleWrite(home);
      };

      // Tracking objects / properties without regular undoable edits scope
      let stateChangeTracker = ev => {
        let fieldName = undefined;
        if (ev.source === home.getObserverCamera()) {
          fieldName = "observerCamera";
        }
        if (ev.source === home.getTopCamera()) {
          fieldName = "topCamera";
        }
        if (ev.source === home
          || ev.source === home.getEnvironment()) {
          if (recorder.getTrackedHomeProperties().indexOf(ev.getPropertyName()) !== -1) {
            fieldName = ev.getPropertyName();
          }
        }
        if (fieldName !== undefined) {
          if (recorder.homeData[home.editionId].trackedStateChanges === undefined) {
            recorder.homeData[home.editionId].trackedStateChanges = {};
          }
          recorder.homeData[home.editionId].trackedStateChanges[fieldName] = true;
        }
      };

      home.getObserverCamera().addPropertyChangeListener(stateChangeTracker);
      home.getTopCamera().addPropertyChangeListener(stateChangeTracker);
      let trackedHomeProperties = this.getTrackedHomeProperties();
      for (let i = 0; i < trackedHomeProperties.length; i++) {
        if (trackedHomeProperties[i] == "OBSERVER_CAMERA_ELEVATION_ADJUSTED"
          || trackedHomeProperties[i] == "ALL_LEVELS_VISIBLE") {
          home.getEnvironment().addPropertyChangeListener(trackedHomeProperties[i], stateChangeTracker);
        } else {
          home.addPropertyChangeListener(trackedHomeProperties[i], stateChangeTracker);
        }
      }

      // Schedule first write if needed
      if (recorder.getAutoWriteDelay() > 0) {
        recorder.scheduleWrite(home);
      }
    }
  }

  /** 
   * Returns -1 if not autosaving, 0 if autosaving after each edit, or the actual delay in ms.
   * @return {number}
   * @private
   */
  getAutoWriteDelay() {
    if (this.configuration === undefined || this.configuration.autoWriteDelay === undefined) {
      return -1;
    } else {
      return this.configuration.autoWriteDelay;
    }
  }

  /**
   * Removes a home previously added with <code>addHome</code>.
   * @param {Home} home
   */
  removeHome(home) {
    if (this.configuration["closeHomeURL"] !== undefined) {
      let closeHomeURL = CoreTools.format(this.configuration.closeHomeURL.replace(/(%[^s])/g, "%$1"), encodeURIComponent(home.name));
      if (navigator.sendBeacon) {
        navigator.sendBeacon(closeHomeURL);
      } else {
        try {
          let request = new XMLHttpRequest();
          request.open("GET", closeHomeURL, true); // Asynchronous call required during unload
          request.send();
        } catch (ex) {
          console.log(ex);
        }
      }
    }
    if (this.configuration["writeHomeEditsURL"] !== undefined) {
      let undoableEditListeners = this.homeData[home.editionId].undoableEditSupport.getUndoableEditListeners();
      for (let i = 0; i < undoableEditListeners.length; i++) {
        if (undoableEditListeners[i].source === this) {
          this.homeData[home.editionId].undoableEditSupport.removeUndoableEditListener(undoableEditListeners[i]);
          break;
        }
      }
      delete this.homeData[home.editionId];
    }
  }

  /**
   * Saves recursively blob in savedObject and its dependent objects. 
   * @param {string, string} savedObject current object in which blobs should be saved
   * @param {function} serverErrorHandler error handler
   * @private
   */
  saveBlobs(savedObject, serverErrorHandler) {
    if (savedObject) {
      if (savedObject.blob instanceof Blob
        && savedObject.resourceFileName) {
        let writeResourceURL = this.configuration.writeResourceURL;
        let uploadUrl = CoreTools.format(writeResourceURL.replace(/(%[^s])/g, "%$1"), encodeURIComponent(savedObject.resourceFileName));
        let request = new XMLHttpRequest();
        request.open("POST", uploadUrl, true);
        request.addEventListener("load", (ev) => {
          if (request.readyState === XMLHttpRequest.DONE) {
            if (request.status === 200) {
              delete savedObject.blob;
              delete savedObject.resourceFileName;
            } else {
              serverErrorHandler(request.status, request.statusText);
            }
          }
        });
        let errorListener = ev => {
          // There was an error connecting with the server: rollback and retry
          serverErrorHandler(0, "Can't post " + uploadUrl);
        };
        request.addEventListener("error", errorListener);
        request.addEventListener("timeout", errorListener);
        request.send(savedObject.blob);
      } else {
        // Save recursively other map objects depending on savedObject
        let propertyNames = Object.getOwnPropertyNames(savedObject);
        for (let j = 0; j < propertyNames.length; j++) {
          let propertyName = propertyNames[j];
          if (propertyName != "_type") {
            let propertyValue = savedObject[propertyName];
            if (typeof propertyValue == "object") {
              this.saveBlobs(propertyValue, serverErrorHandler);
            }
          }
        }
      }
    }
  }

  /** 
   * Sends to the server all the currently waiting edits for the given home.  
   * @param {Home} home
   */
  sendUndoableEdits(home) {
    // Check if something to be sent to avoid useless updates
    if (!this.hasEdits(home)) {
      return;
    }
    this.addTrackedStateChange(home);
    let recorder = this;
    let update = this.beginUpdate(home);
    if (update !== null) {
      let serverErrorHandler = (status, error) => {
        recorder.rollbackUpdate(home, update, status, error);
        recorder.scheduleWrite(home, 10000);
      };

      // 1. Save blobs if any
      if (this.configuration.writeResourceURL
        && this.configuration.readResourceURL) {
        for (let i = 0; i < update.edits.length; i++) {
          this.saveBlobs(update.edits[i], serverErrorHandler);
        }
      }

      // 2. Send edit
      let request = new XMLHttpRequest();
      let writeHomeEditsUrl = this.configuration["writeHomeEditsURL"];
      request.open("POST", writeHomeEditsUrl, true);
      request.withCredentials = true;
      request.addEventListener("load", (ev) => {
        if (request.readyState === XMLHttpRequest.DONE) {
          if (request.status === 200) {
            let result = JSON.parse(request.responseText);
            if (result && result.result === update.edits.length) {
              recorder.commitUpdate(home, update);
            } else {
              // Should never happen
              console.log(request.responseText);
              serverErrorHandler(request.status, request.responseText);
            }
          } else {
            serverErrorHandler(request.status, request.statusText);
          }
        }
      });
      let errorListener = ev => {
        // There was an error connecting with the server: rollback and retry
        serverErrorHandler(0, "Can't post " + writeHomeEditsUrl);
      };
      request.addEventListener("error", errorListener);
      request.addEventListener("timeout", errorListener);
      request.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
      request.send("home=" + encodeURIComponent(home.name)
        + "&editionId=" + home.editionId
        + "&version=" + this.application.getVersion()
        + "&edits=" + encodeURIComponent(JSON.stringify(update.edits)));
    }
  }

  /**   
   * @param {Home} home
   * @private 
   */
  hasEdits(home) {
    return (this.queue !== undefined && this.queue.length > 0)
      || (this.configuration
        && this.configuration.autoWriteTrackedStateChange
        && this.homeData[home.editionId].trackedStateChanges !== undefined);
  }

  /** 
   * @param {Home} home
   * @param {boolean} [force]
   * @private 
   */
  addTrackedStateChange(home, force) {
    if (this.homeData[home.editionId].trackedStateChanges !== undefined
      && (force
        || (this.configuration
          && this.configuration.autoWriteTrackedStateChange))) {
      let trackedStateChangeUndoableEdit = { _type: 'com.eteks.sweethome3d.io.TrackedStateChangeUndoableEdit' };

      let trackedHomeProperties = this.getTrackedHomeProperties();
      for (let i = 0; i < trackedHomeProperties.length; i++) {
        let property = trackedHomeProperties[i];
        if (this.homeData[home.editionId].trackedStateChanges[property]) {
          switch (property) {
            case "CAMERA":
              trackedStateChangeUndoableEdit.camera = home.getCamera();
              break;
            case "STORED_CAMERAS":
              trackedStateChangeUndoableEdit.storedCameras = home.getStoredCameras();
              break;
            case "SELECTED_LEVEL":
              trackedStateChangeUndoableEdit.selectedLevel = home.getSelectedLevel();
              break;
            case "FURNITURE_SORTED_PROPERTY":
              trackedStateChangeUndoableEdit.furnitureSortedProperty = home.getFurnitureSortedProperty();
              break;
            case "FURNITURE_DESCENDING_SORTED":
              trackedStateChangeUndoableEdit.furnitureDescendingSorted = home.isFurnitureDescendingSorted();
              break;
            case "FURNITURE_VISIBLE_PROPERTIES":
              trackedStateChangeUndoableEdit.furnitureVisibleProperties = home.getFurnitureVisibleProperties();
              break;
            case "OBSERVER_CAMERA_ELEVATION_ADJUSTED":
              trackedStateChangeUndoableEdit.observerCameraElevationAdjusted = home.getEnvironment().isObserverCameraElevationAdjusted();
              break;
            case "ALL_LEVELS_VISIBLE":
              trackedStateChangeUndoableEdit.allLevelsVisible = home.getEnvironment().isAllLevelsVisible();
              break;
            default:
              // Non-builtin properties (may be user-defined)
              if (trackedStateChangeUndoableEdit.homeProperties === undefined) {
                trackedStateChangeUndoableEdit.homeProperties = {};
              }
              trackedStateChangeUndoableEdit.homeProperties[property] = home.getProperty(property);
          }
        }
      }

      // Duplication is required to send the state of the cameras and not only the UUIDs
      if (this.homeData[home.editionId].trackedStateChanges.topCamera) {
        trackedStateChangeUndoableEdit.topCamera = home.getTopCamera().duplicate();
      }
      if (this.homeData[home.editionId].trackedStateChanges.observerCamera) {
        trackedStateChangeUndoableEdit.observerCamera = home.getObserverCamera().duplicate();
      }
      // Reset tracked state change and store the edit
      this.homeData[home.editionId].trackedStateChanges = undefined;
      this.storeEdit(home, trackedStateChangeUndoableEdit);
    }
  }

  /** 
   * @param {Home} home
   * @param {number} [delay]
   * @private 
   */
  scheduleWrite(home, delay) {
    if (delay === undefined) {
      delay = this.getAutoWriteDelay();
    }
    if (delay >= 0) {
      if (this.homeData[home.editionId].scheduledWrite !== undefined) {
        clearTimeout(this.homeData[home.editionId].scheduledWrite);
        this.homeData[home.editionId].scheduledWrite = undefined;
      }

      let recorder = this;
      this.homeData[home.editionId].scheduledWrite = setTimeout(() => {
        recorder.homeData[home.editionId].scheduledWrite = undefined;
        if (recorder.online && recorder.hasEdits(home)) {
          recorder.sendUndoableEdits(home);
        }
        if (recorder.getAutoWriteDelay() > 0) {
          recorder.scheduleWrite(home);
        }
      }, delay);
    }
    // < 0 means manual write (nothing scheduled)
  }

  /** 
   * @param {Home} home
   * @param {UndoableEdit} edit
   * @param {boolean} [undoAction]
   * @private 
   */
  storeEdit(home, edit, undoAction) {
    let newObjects = {};
    let newObjectList = [];
    let processedEdit = this.substituteIdentifiableObjects(
      home,
      edit,
      null,
      newObjects,
      newObjectList,
      ["object3D", "hasBeenDone", "alive", "presentationNameKey", "__parent"],
      [UserPreferences, PlanController, Home],
      [Boolean, String, Number]);
    if (newObjectList.length > 0) {
      processedEdit._newObjects = newObjectList;
    }
    if (undoAction) {
      processedEdit._action = "undo";
    }
    processedEdit._undoableEditId = UUID.randomUUID();

    if (!this.queue) {
      this.queue = [];
    }
    this.queue.push(processedEdit);

    if (edit._type != 'com.eteks.sweethome3d.io.TrackedStateChangeUndoableEdit') {
      // Update objects state 
      this.checkPoint(home);
    }
  }

  /** 
   * @param {Home} home
   * @return {{home: Home, id: UUID, edits: Object[]}}
   * @private 
   */
  beginUpdate(home) {
    if (this.homeData[home.editionId].ongoingUpdate !== undefined) {
      this.homeData[home.editionId].rejectedUpdate = true;
      return null;
    }

    this.homeData[home.editionId].ongoingUpdate = {
      "home": home,
      "edits": this.queue.slice(0)
    };
    if (this.configuration.writingObserver
      && this.configuration.writingObserver.writeStarted) {
      this.configuration.writingObserver.writeStarted(this.homeData[home.editionId].ongoingUpdate);
    }
    return this.homeData[home.editionId].ongoingUpdate;
  }

  /** 
   * @param {Home} home
   * @param {{home: Home, id: UUID, edits: Object[]}} update
   * @private 
   */
  commitUpdate(home, update) {
    for (let i = 0; i < update.edits.length; i++) {
      if (this.queue[0] === update.edits[i]) {
        this.queue.shift();
      } else {
        // This is really bad and should never happen
        throw new Error("Unexpected error while saving");
      }
    }
    if (this.configuration.writingObserver
      && this.configuration.writingObserver.writeSucceeded) {
      this.configuration.writingObserver.writeSucceeded(update);
    }
    this.homeData[home.editionId].ongoingUpdate = undefined;
    if (this.homeData[home.editionId].rejectedUpdate) {
      // There was a rejected update during this ongoing update, 
      // it means that there is something to be saved and we force the write
      this.homeData[home.editionId].rejectedUpdate = undefined;
      this.scheduleWrite(home, 0);
    }
  }

  /** 
   * @param {Home} home
   * @param {{home: Home, id: UUID, edits: Object[]}} update
   * @param {number} status
   * @param {string} error
   * @private 
   */
  rollbackUpdate(home, update, status, error) {
    if (this.configuration.writingObserver
      && this.configuration.writingObserver.writeFailed) {
      this.configuration.writingObserver.writeFailed(update, status, error);
    }
    this.homeData[home.editionId].ongoingUpdate = undefined;
    this.homeData[home.editionId].rejectedUpdate = undefined;
  }

  /** 
   * @private 
   */
  substituteIdentifiableObjects(
    home,
    origin,
    parent,
    newObjects,
    newObjectList,
    skippedPropertyNames,
    skippedTypes,
    preservedTypes
  ) {
    if (Array.isArray(origin)) {
      var destination = origin.slice(0);
      for (let i = 0; i < origin.length; i++) {
        destination[i] = this.substituteIdentifiableObjects(home, origin[i], origin, newObjects, newObjectList, skippedPropertyNames, skippedTypes, preservedTypes);
      }
      return destination;
    } else if (origin instanceof Big) {
      return {
        value: origin.toString(),
        _type: "java.math.BigDecimal"
      };
    } else if (origin instanceof LocalURLContent
      || origin instanceof URLContent && origin.isJAREntry() && URLContent.fromURL(origin.getJAREntryURL()) instanceof LocalURLContent) {
      let localContent = origin.isJAREntry()
        ? URLContent.fromURL(origin.getJAREntryURL())
        : origin;
      if (localContent.getSavedContent() != null
        && localContent.getSavedContent().getURL().indexOf(LocalStorageURLContent.LOCAL_STORAGE_PREFIX) < 0
        && localContent.getSavedContent().getURL().indexOf(IndexedDBURLContent.INDEXED_DB_PREFIX) < 0) {
        return this.substituteIdentifiableObjects(home,
          origin.isJAREntry()
            ? URLContent.fromURL("jar:" + localContent.getSavedContent().getURL() + "!/" + origin.getJAREntryName())
            : localContent.getSavedContent(),
          parent, newObjects, newObjectList, skippedPropertyNames, skippedTypes, preservedTypes);
      } else {
        // Prepare blob and resource file name used in saveBlobs 
        let blob = localContent.getBlob();
        let extension = "dat";
        if (blob.type == "image/png") {
          extension = "png";
        } else if (blob.type == "image/jpeg") {
          extension = "jpg";
        }
        let resourceFileName = UUID.randomUUID() + '.' + extension;
        let serverContent = URLContent.fromURL(
          CoreTools.format(this.configuration.readResourceURL.replace(/(%[^s])/g, "%$1"), encodeURIComponent(resourceFileName)));
        localContent.setSavedContent(serverContent);

        var destination = this.substituteIdentifiableObjects(home,
          origin.isJAREntry()
            ? URLContent.fromURL("jar:" + localContent.getSavedContent().getURL() + "!/" + origin.getJAREntryName())
            : localContent.getSavedContent(),
          parent, newObjects, newObjectList, skippedPropertyNames, skippedTypes, preservedTypes);
        destination.resourceFileName = resourceFileName;
        destination.blob = blob;
        return destination;
      }
    } else if (origin == null || origin !== Object(origin)
      || preservedTypes.some((preservedType) => { return origin instanceof preservedType; })) {
      return origin;
    } else if (origin.id !== undefined && (this.homeData[home.editionId].existingHomeObjects[origin.id] !== undefined // Already in home
      || newObjects[origin.id] !== undefined  // Already in new objects
      || origin instanceof Home)) { // Home always exists
      return origin.id;
    } else {
      var destination = {};
      if (origin.id !== undefined) {
        // New object case
        newObjects[origin.id] = destination;
        newObjectList.push(destination);
      }
      if (origin.constructor
        && origin.constructor.__class
        && (origin.constructor.__class != "com.eteks.sweethome3d.tools.URLContent"
          || parent === undefined
          || parent.constructor === Object)) { // Don't write default class of content except if origin's parent is a map
        destination._type = origin.constructor.__class;
      }

      let propertyNames = Object.getOwnPropertyNames(origin);
      for (let j = 0; j < propertyNames.length; j++) {
        let propertyName = propertyNames[j];
        if (origin.constructor && origin.constructor.__transients && origin.constructor.__transients.indexOf(propertyName) != -1) {
          continue;
        }
        if (skippedPropertyNames.indexOf(propertyName) === -1) {
          const propertyValue = origin[propertyName];
          if (typeof propertyValue !== 'function'
            && !skippedTypes.some((skippedType) => { return propertyValue instanceof skippedType; })) {
            destination[propertyName] = this.substituteIdentifiableObjects(home, propertyValue, origin, newObjects, newObjectList, skippedPropertyNames, skippedTypes, preservedTypes);
          }
        }
      }

      if (origin.id !== undefined) {
        return origin.id;
      } else {
        return destination;
      }
    }
  }
}

/**
 * The home properties that are tracked by default by incremental recorders.
 * @private
 */
IncrementalHomeRecorder.DEFAULT_TRACKED_HOME_PROPERTIES = [
  FurnitureTablePanel.EXPANDED_ROWS_VISUAL_PROPERTY,
  HomePane.PLAN_VIEWPORT_X_VISUAL_PROPERTY,
  HomePane.PLAN_VIEWPORT_Y_VISUAL_PROPERTY,
  HomePane.MAIN_PANE_DIVIDER_LOCATION_VISUAL_PROPERTY,
  HomePane.PLAN_PANE_DIVIDER_LOCATION_VISUAL_PROPERTY,
  HomePane.CATALOG_PANE_DIVIDER_LOCATION_VISUAL_PROPERTY,
  PlanController.SCALE_VISUAL_PROPERTY,
  // Supported built-in properties
  "CAMERA", "STORED_CAMERAS", "SELECTED_LEVEL",
  "FURNITURE_SORTED_PROPERTY", "FURNITURE_DESCENDING_SORTED", "FURNITURE_VISIBLE_PROPERTIES",
  // HomeEnvironment properties
  "OBSERVER_CAMERA_ELEVATION_ADJUSTED", "ALL_LEVELS_VISIBLE"
];
