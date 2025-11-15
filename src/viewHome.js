/*
 * viewHome.js
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
  HomeController3D,
  HomeFurnitureGroup,
  ObserverCamera,
} from './SweetHome3D';

import { HomeComponent3D } from './HomeComponent3D';
import { HomeRecorder } from './HomeRecorder';
import { ModelLoader } from './ModelLoader';
import { TextureManager } from './TextureManager';
import { DefaultUserPreferences, UserPreferences } from './UserPreferences';
import { OperatingSystem } from './URLContent';
import { ZIPTools } from './URLContent';

/**
 * Loads the home from the given URL and displays it in the 3D canvas with <code>canvasId</code>.
 * <code>params.navigationPanel</code> may be equal to <code>"none"</code>, <code>"default"</code> 
 * or an HTML string which content will replace the default navigation panel. 
 * @param {string} canvasId  the value of the id attribute of the 3D canvas 
 * @param {string} homeUrl the URL of the home to load and display
 * @param onerror  callback called in case of error with an exception as parameter 
 * @param onprogression callback with (part, info, percentage) parameters called during the download of the home 
 *                      and the 3D models it displays.
 * @param {{roundsPerMinute: number, 
 *          navigationPanel: string,
 *          aerialViewButtonId: string, 
 *          virtualVisitButtonId: string, 
 *          levelsAndCamerasListId: string,
 *          level: string,
 *          selectableLevels: string[],
 *          camera: string,
 *          selectableCameras: string[],
 *          activateCameraSwitchKey: boolean}} [params] the ids of the buttons and other information displayed in the user interface. 
 *                      If not provided, controls won't be managed if any, no animation and navigation arrows won't be displayed. 
 * @return {HomePreviewComponent} the returned object gives access to the loaded {@link Home} instance, 
 *                the {@link HomeComponent3D} instance that displays it, the {@link HomeController3D} instance that manages 
 *                camera changes and the {@link UserPreferences} in use.             
 */
function viewHome(canvasId, homeUrl, onerror, onprogression, params) {
  return new HomePreviewComponent(canvasId, homeUrl, onerror, onprogression, params);
}

/**
 * Loads the home from the given URL and displays it in an overlay. 
 * Canvas size ratio is 4 / 3 by default. 
 * <code>params.navigationPanel</code> may be equal to <code>"none"</code>, <code>"default"</code> 
 * or an HTML string which content will replace the default navigation panel. 
 * If needed, the id of the created canvas is <code>viewerCanvas</code> and its <code>homePreviewComponent</code> 
 * property returns the instance of {@link HomePreviewComponent} associated to it.
 * @param {string} homeUrl the URL of the home to display
 * @param {{roundsPerMinute: number, 
 *          widthByHeightRatio: number,
 *          navigationPanel: string,
 *          aerialViewButtonText: string, 
 *          virtualVisitButtonText: string, 
 *          level: string,
 *          selectableLevels: string[],
 *          camera: string,
 *          selectableCameras: string[],
 *          activateCameraSwitchKey: boolean, 
 *          viewerControlsAdditionalHTML: string,
 *          readingHomeText: string, 
 *          readingModelText: string,
 *          noWebGLSupportError: string,
 *          missingHomeXmlEntryError: string}} [params] the texts and other information displayed in the user interface. 
 *                      If not provided, there will be no controls, no animation and canvas size ratio will be 4/3 
 *                      with no navigation panel. 
 */
function viewHomeInOverlay(homeUrl, params) {
  let widthByHeightRatio = 4 / 3;
  if (params && params.widthByHeightRatio) {
    widthByHeightRatio = params.widthByHeightRatio;
  }

  // Ensure no two overlays are displayed
  hideHomeOverlay();

  const overlayDiv = document.createElement("div");
  overlayDiv.setAttribute("id", "viewerOverlay");
  overlayDiv.style.position = "absolute";
  overlayDiv.style.left = "0";
  overlayDiv.style.top = "0";
  overlayDiv.style.zIndex = "100";
  overlayDiv.style.background = "rgba(127, 127, 127, .5)";

  const bodyElement = document.getElementsByTagName("body").item(0);
  bodyElement.insertBefore(overlayDiv, bodyElement.firstChild);

  const homeViewDiv = document.createElement("div");
  let divHTML =
    '<canvas id="viewerCanvas" class="viewerComponent"  style="background-color: #CCCCCC; border: 1px solid gray; position: absolute; outline: none; touch-action: none" tabIndex="1"></canvas>'
    + '<div id="viewerProgressDiv" style="position:absolute; width: 300px; background-color: rgba(128, 128, 128, 0.7); padding: 20px; border-radius: 25px">'
    + '  <progress id="viewerProgress"  class="viewerComponent" value="0" max="200" style="width: 300px;"></progress>'
    + '  <label id="viewerProgressLabel" class="viewerComponent" style="margin-top: 2px; margin-left: 10px; margin-right: 0px; display: block;"></label>'
    + '</div>';
  if (params
    && (params.aerialViewButtonText && params.virtualVisitButtonText
      || params.viewerControlsAdditionalHTML)) {
    divHTML += '<div id="viewerControls" style="position: absolute; padding: 10px; padding-top: 5px">';
    if (params.aerialViewButtonText && params.virtualVisitButtonText) {
      divHTML +=
        '   <input  id="aerialView" class="viewerComponent" name="cameraType" type="radio" style="visibility: hidden;"/>'
        + '      <label class="viewerComponent" for="aerialView" style="visibility: hidden;">' + params.aerialViewButtonText + '</label>'
        + '   <input  id="virtualVisit" class="viewerComponent" name="cameraType" type="radio" style="visibility: hidden;">'
        + '      <label class="viewerComponent" for="virtualVisit" style="visibility: hidden;">' + params.virtualVisitButtonText + '</label>'
        + '   <select id="levelsAndCameras" class="viewerComponent" style="visibility: hidden;"></select>';
    }
    if (params.viewerControlsAdditionalHTML) {
      divHTML += params.viewerControlsAdditionalHTML;
    }
    divHTML += '</div>';
  }
  homeViewDiv.innerHTML = divHTML;
  overlayDiv.appendChild(homeViewDiv);

  // Create close button image
  const closeButtonImage = new Image();
  closeButtonImage.src = ZIPTools.getScriptFolder() + "close.png";
  closeButtonImage.style.position = "absolute";
  overlayDiv.appendChild(closeButtonImage);

  overlayDiv.escKeyListener = ev => {
    if (ev.keyCode === 27) {
      hideHomeOverlay();
    }
  };
  document.addEventListener("keydown", overlayDiv.escKeyListener);
  closeButtonImage.addEventListener("click", hideHomeOverlay);
  const mouseActionsListener = {
    mousePressed: function (ev) {
      mouseActionsListener.mousePressedInOverlay = true;
    },
    mouseClicked: function (ev) {
      if (mouseActionsListener.mousePressedInOverlay) {
        delete mouseActionsListener.mousePressedInOverlay;
        hideHomeOverlay();
      }
    }
  };
  overlayDiv.addEventListener("mousedown", mouseActionsListener.mousePressed);
  overlayDiv.addEventListener("click", mouseActionsListener.mouseClicked);
  overlayDiv.addEventListener("touchmove",
    (ev) => {
      ev.preventDefault();
    });

  // Place canvas in the middle of the window
  const windowWidth = self.innerWidth;
  const windowHeight = self.innerHeight;
  let pageWidth = document.documentElement.clientWidth;
  let pageHeight = document.documentElement.clientHeight;
  if (bodyElement && bodyElement.scrollWidth) {
    if (bodyElement.scrollWidth > pageWidth) {
      pageWidth = bodyElement.scrollWidth;
    }
    if (bodyElement.scrollHeight > pageHeight) {
      pageHeight = bodyElement.scrollHeight;
    }
  }
  const pageXOffset = self.pageXOffset ? self.pageXOffset : 0;
  const pageYOffset = self.pageYOffset ? self.pageYOffset : 0;

  overlayDiv.style.height = Math.max(pageHeight, windowHeight) + "px";
  overlayDiv.style.width = pageWidth <= windowWidth
    ? "100%"
    : pageWidth + "px";
  overlayDiv.style.display = "block";

  const canvas = document.getElementById("viewerCanvas");
  if (windowWidth < windowHeight * widthByHeightRatio) {
    canvas.width = 0.9 * windowWidth;
    canvas.height = 0.9 * windowWidth / widthByHeightRatio;
  } else {
    canvas.height = 0.9 * windowHeight;
    canvas.width = 0.9 * windowHeight * widthByHeightRatio;
  }
  canvas.style.width = canvas.width + "px";
  canvas.style.height = canvas.height + "px";
  const canvasLeft = pageXOffset + (windowWidth - canvas.width - 10) / 2;
  canvas.style.left = canvasLeft + "px";
  const canvasTop = pageYOffset + (windowHeight - canvas.height - 10) / 2;
  canvas.style.top = canvasTop + "px";

  // Place close button at top right of the canvas
  closeButtonImage.style.left = (canvasLeft + canvas.width - 5) + "px";
  closeButtonImage.style.top = (canvasTop - 10) + "px";

  // Place controls below the canvas
  const controlsDiv = document.getElementById("viewerControls");
  if (controlsDiv) {
    controlsDiv.style.left = (canvasLeft - 10) + "px";
    controlsDiv.style.top = (canvasTop + canvas.height) + "px";
    controlsDiv.addEventListener("mousedown",
      (ev) => {
        // Ignore in overlay mouse clicks on controls
        ev.stopPropagation();
      });
  }

  // Place progress in the middle of the canvas
  const progressDiv = document.getElementById("viewerProgressDiv");
  progressDiv.style.left = (canvasLeft + (canvas.width - 300) / 2) + "px";
  progressDiv.style.top = (canvasTop + (canvas.height - 50) / 2) + "px";
  progressDiv.style.visibility = "visible";

  const onerror = err => {
    hideHomeOverlay();
    if (err == "No WebGL") {
      let errorMessage = "Sorry, your browser doesn't support WebGL.";
      if (params.noWebGLSupportError) {
        errorMessage = params.noWebGLSupportError;
      }
      alert(errorMessage);
    } else if (typeof err === "string" && err.indexOf("No Home.xml entry") == 0) {
      let errorMessage = "Ensure your home file was saved with Sweet Home 3D 5.3 or a newer version.";
      if (params.missingHomeXmlEntryError) {
        errorMessage = params.missingHomeXmlEntryError;
      }
      alert(errorMessage);
    } else {
      console.log(err.stack);
      alert("Error: " + (err.message ? err.constructor.name + " " + err.message : err));
    }
  };
  const onprogression = (part, info, percentage) => {
    const progress = document.getElementById("viewerProgress");
    if (progress) {
      let text = null;
      if (part === HomeRecorder.READING_HOME) {
        progress.value = percentage * 100;
        info = info.substring(info.lastIndexOf('/') + 1);
        text = params && params.readingHomeText
          ? params.readingHomeText : part;
      } else if (part === ModelLoader.READING_MODEL) {
        progress.value = 100 + percentage * 100;
        if (percentage === 1) {
          document.getElementById("viewerProgressDiv").style.visibility = "hidden";
        }
        text = params && params.readingModelText
          ? params.readingModelText : part;
      }

      if (text !== null) {
        document.getElementById("viewerProgressLabel").innerHTML =
          (percentage ? Math.floor(percentage * 100) + "% " : "") + text + " " + info;
      }
    }
  };

  // Display home in canvas 3D
  let homePreviewComponentContructor = HomePreviewComponent;
  if (params) {
    if (params.homePreviewComponentContructor) {
      homePreviewComponentContructor = params.homePreviewComponentContructor;
    }
    if (params.aerialViewButtonText && params.virtualVisitButtonText) {
      canvas.homePreviewComponent = new homePreviewComponentContructor(
        "viewerCanvas", homeUrl, onerror, onprogression,
        {
          roundsPerMinute: params.roundsPerMinute,
          navigationPanel: params.navigationPanel,
          aerialViewButtonId: "aerialView",
          virtualVisitButtonId: "virtualVisit",
          levelsAndCamerasListId: "levelsAndCameras",
          level: params.level,
          selectableLevels: params.selectableLevels,
          camera: params.camera,
          selectableCameras: params.selectableCameras,
          activateCameraSwitchKey: params.activateCameraSwitchKey
        });
    } else {
      canvas.homePreviewComponent = new homePreviewComponentContructor(
        "viewerCanvas", homeUrl, onerror, onprogression,
        {
          roundsPerMinute: params.roundsPerMinute,
          navigationPanel: params.navigationPanel
        });
    }
  } else {
    canvas.homePreviewComponent = new homePreviewComponentContructor("viewerCanvas", homeUrl, onerror, onprogression);
  }
}

/**
 * Hides the overlay and disposes resources.
 * @private
 */
function hideHomeOverlay() {
  const overlayDiv = document.getElementById("viewerOverlay");
  if (overlayDiv) {
    // Free caches and remove listeners bound to global objects 
    const canvas = document.getElementById("viewerCanvas");
    if (canvas.homePreviewComponent) {
      canvas.homePreviewComponent.dispose();
    }
    ModelManager.getInstance().clear();
    TextureManager.getInstance().clear();
    ZIPTools.clear();
    window.removeEventListener("keydown", overlayDiv.escKeyListener);
    document.getElementsByTagName("body").item(0).removeChild(overlayDiv);
  }
}


/**
 * Creates a component that loads and displays a home in a 3D canvas.
 * @param {string} canvasId  the value of the id attribute of the 3D canvas 
 * @param {string} homeUrl   the URL of the home to load and display
 * @param onerror  callback called in case of error with an exception as parameter 
 * @param onprogression callback with (part, info, percentage) parameters called during the download of the home 
 *                      and the 3D models it displays.
 * @param {{roundsPerMinute: number, 
 *          navigationPanel: string,
 *          aerialViewButtonId: string, 
 *          virtualVisitButtonId: string, 
 *          levelsAndCamerasListId: string,
 *          level: string,
 *          selectableLevels: string[],
 *          camera: string,
 *          selectableCameras: string[],
 *          activateCameraSwitchKey: boolean}} [params] the ids of the buttons and other information displayed in the user interface. 
 *                      If not provided, controls won't be managed if any, no animation and navigation arrows won't be displayed. 
 * @constructor
 * @author Emmanuel Puybaret
 */
class HomePreviewComponent {
  constructor(canvasId, homeUrl, onerror, onprogression, params) {
    if (document.getElementById(canvasId)) {
      const previewComponent = this;
      this.createHomeRecorder().readHome(homeUrl,
        {
          homeLoaded: function (home) {
            try {
              const canvas = document.getElementById(canvasId);
              if (canvas) {
                if (params
                  && params.navigationPanel != "none"
                  && params.navigationPanel != "default") {
                  // Create class with a getLocalizedString() method that returns the navigationPanel in parameter
                  class UserPreferencesWithNavigationPanel extends DefaultUserPreferences {
                    constructor(navigationPanel) {
                      super();
                      this.navigationPanel = navigationPanel;
                    }

                    getLocalizedString(resourceClass, resourceKey, resourceParameters) {
                      // Return navigationPanel in parameter for the navigationPanel.innerHTML resource requested by HomeComponent3D
                      if (resourceClass === HomeComponent3D && resourceKey == "navigationPanel.innerHTML") {
                        return this.navigationPanel;
                      } else {
                        return UserPreferences.prototype.getLocalizedString.call(this, resourceClass, resourceKey, resourceParameters);
                      }
                    }
                  }

                  previewComponent.preferences = new UserPreferencesWithNavigationPanel(params.navigationPanel);
                } else {
                  previewComponent.preferences = new DefaultUserPreferences();
                }
                previewComponent.home = home;
                previewComponent.controller = new HomeController3D(home, previewComponent.preferences);
                // Create component 3D with loaded home
                previewComponent.component3D = previewComponent.createComponent3D(
                  canvasId, home, previewComponent.preferences, previewComponent.controller);
                previewComponent.prepareComponent(canvasId, onprogression,
                  params ? {
                    roundsPerMinute: params.roundsPerMinute,
                    navigationPanelVisible: params.navigationPanel && params.navigationPanel != "none",
                    aerialViewButtonId: params.aerialViewButtonId,
                    virtualVisitButtonId: params.virtualVisitButtonId,
                    levelsAndCamerasListId: params.levelsAndCamerasListId,
                    level: params.level,
                    selectableLevels: params.selectableLevels,
                    camera: params.camera,
                    selectableCameras: params.selectableCameras,
                    activateCameraSwitchKey: params.activateCameraSwitchKey
                  }
                    : undefined);
              }
            } catch (ex) {
              onerror(ex);
            }
          },
          homeError: function (err) {
            onerror(err);
          },
          progression: onprogression
        });
    } else {
      onerror("No canvas with id equal to " + canvasId);
    }
  }

  /**
   * Returns the recorder that will load the home from the given URL.
   * @return {HomeRecorder}
   * @protected
   * @ignore
   */
  createHomeRecorder() {
    return new HomeRecorder();
  }

  /**
   * Returns the component 3D that will display the given home.
   * @param {string} canvasId  the value of the id attribute of the 3D canvas  
   * @return {HomeComponent3D}
   * @protected
   * @ignore
   */
  createComponent3D(canvasId) {
    return new HomeComponent3D(canvasId, this.getHome(), this.getUserPreferences(), null, this.getController());
  }

  /**
   * Prepares this component and its user interface.
   * @param {string} canvasId  the value of the id attribute of the 3D canvas 
   * @param onprogression callback with (part, info, percentage) parameters called during the download of the home 
   *                      and the 3D models it displays.
   * @param {{roundsPerMinute: number, 
   *          navigationPanelVisible: boolean,
   *          aerialViewButtonId: string, 
   *          virtualVisitButtonId: string, 
   *          levelsAndCamerasListId: string,
   *          level: string,
   *          selectableLevels: string[],
   *          camera: string,
   *          selectableCameras: string[],
   *          activateCameraSwitchKey: boolean}} [params] the ids of the buttons and other information displayed in the user interface. 
   *                      If not provided, controls won't be managed if any, no animation and navigation panel won't be displayed. 
   * @protected
   * @ignore
   */
  prepareComponent(canvasId, onprogression, params) {
    const roundsPerMinute = params && params.roundsPerMinute ? params.roundsPerMinute : 0;
    this.startRotationAnimationAfterLoading = roundsPerMinute != 0;
    if (params && typeof params.navigationPanelVisible) {
      this.getUserPreferences().setNavigationPanelVisible(params.navigationPanelVisible);
    }
    const home = this.getHome();
    if (home.structure) {
      // Make always all levels visible if walls and rooms structure can be modified
      home.getEnvironment().setAllLevelsVisible(true);
    } else {
      // Make all levels always visible when observer camera is used
      const setAllLevelsVisibleWhenObserverCamera = () => {
        home.getEnvironment().setAllLevelsVisible(home.getCamera() instanceof ObserverCamera);
      };
      setAllLevelsVisibleWhenObserverCamera();
      home.addPropertyChangeListener("CAMERA", setAllLevelsVisibleWhenObserverCamera);
    }
    home.getEnvironment().setObserverCameraElevationAdjusted(true);

    this.trackFurnitureModels(onprogression, roundsPerMinute);

    // Configure camera type buttons and shortcut
    const previewComponent = this;
    const cameraTypeButtonsUpdater = () => {
      previewComponent.stopRotationAnimation();
      if (params && params.aerialViewButtonId && params.virtualVisitButtonId) {
        if (home.getCamera() === home.getTopCamera()) {
          document.getElementById(params.aerialViewButtonId).checked = true;
        } else {
          document.getElementById(params.virtualVisitButtonId).checked = true;
        }
      }
    };
    const toggleCamera = () => {
      previewComponent.startRotationAnimationAfterLoading = false;
      home.setCamera(home.getCamera() === home.getTopCamera()
        ? home.getObserverCamera()
        : home.getTopCamera());
      cameraTypeButtonsUpdater();
    };
    const canvas = document.getElementById(canvasId);
    if (params === undefined
      || params.activateCameraSwitchKey === undefined
      || params.activateCameraSwitchKey) {
      canvas.addEventListener("keydown",
        (ev) => {
          if (ev.keyCode === 32) { // Space bar
            toggleCamera();
          }
        });
    }
    if (params && params.aerialViewButtonId && params.virtualVisitButtonId) {
      const aerialViewButton = document.getElementById(params.aerialViewButtonId);
      aerialViewButton.addEventListener("change",
        () => {
          previewComponent.startRotationAnimationAfterLoading = false;
          home.setCamera(aerialViewButton.checked
            ? home.getTopCamera()
            : home.getObserverCamera());
        });
      const virtualVisitButton = document.getElementById(params.virtualVisitButtonId);
      virtualVisitButton.addEventListener("change",
        () => {
          previewComponent.startRotationAnimationAfterLoading = false;
          home.setCamera(virtualVisitButton.checked
            ? home.getObserverCamera()
            : home.getTopCamera());
        });
      cameraTypeButtonsUpdater();
      // Make radio buttons and their label visible
      aerialViewButton.style.visibility = "visible";
      virtualVisitButton.style.visibility = "visible";
      const makeLabelVisible = buttonId => {
        const labels = document.getElementsByTagName("label");
        for (let i = 0; i < labels.length; i++) {
          if (labels[i].getAttribute("for") == buttonId) {
            labels[i].style.visibility = "visible";
          }
        }
      };
      makeLabelVisible(params.aerialViewButtonId);
      makeLabelVisible(params.virtualVisitButtonId);
      home.addPropertyChangeListener("CAMERA",
        () => {
          cameraTypeButtonsUpdater();
          if (home.structure && params && params.levelsAndCamerasListId) {
            document.getElementById(params.levelsAndCamerasListId).disabled = home.getCamera() === home.getTopCamera();
          }
        });
    }

    if (params && params.level) {
      var levels = home.getLevels();
      if (levels.length > 0) {
        for (var i = 0; i < levels.length; i++) {
          var level = levels[i];
          if (level.isViewable()
            && level.getName() == params.level) {
            home.setSelectedLevel(level);
            break;
          }
        }
      }
    }

    if (params && params.camera) {
      var cameras = home.getStoredCameras();
      if (cameras.length > 0) {
        for (var i = 0; i < cameras.length; i++) {
          var camera = cameras[i];
          if (camera.getName() == params.camera) {
            this.getController().goToCamera(camera);
            break;
          }
        }
      }
    }

    if (params && params.levelsAndCamerasListId) {
      const levelsAndCamerasList = document.getElementById(params.levelsAndCamerasListId);
      levelsAndCamerasList.disabled = home.structure !== undefined && home.getCamera() === home.getTopCamera();
      var levels = home.getLevels();
      if (levels.length > 0) {
        for (var i = 0; i < levels.length; i++) {
          var level = levels[i];
          if (level.isViewable()
            && (!params.selectableLevels
              || params.selectableLevels.indexOf(level.getName()) >= 0)) {
            var option = document.createElement("option");
            option.text = level.getName();
            option.level = level;
            levelsAndCamerasList.add(option);
            if (level === home.getSelectedLevel()) {
              levelsAndCamerasList.selectedIndex = levelsAndCamerasList.options.length - 1;
            }
          }
        }
      }

      if (params.selectableCameras !== undefined) {
        var cameras = home.getStoredCameras();
        if (cameras.length > 0) {
          let addSeparator = levelsAndCamerasList.options.length > 0;
          for (var i = 0; i < cameras.length; i++) {
            var camera = cameras[i];
            if (params.selectableCameras.indexOf(camera.getName()) >= 0) {
              if (addSeparator) {
                levelsAndCamerasList.add(document.createElement("option"));
                addSeparator = false;
              }
              var option = document.createElement("option");
              option.text = camera.getName();
              option.camera = camera;
              levelsAndCamerasList.add(option);
            }
          }
        }
      }

      if (levelsAndCamerasList.options.length > 1) {
        var controller = this.getController();
        levelsAndCamerasList.addEventListener("change",
          () => {
            previewComponent.startRotationAnimationAfterLoading = false;
            const selectedOption = levelsAndCamerasList.options[levelsAndCamerasList.selectedIndex];
            if (selectedOption.level !== undefined) {
              home.setSelectedLevel(selectedOption.level);
            } else if (selectedOption.camera !== undefined) {
              controller.goToCamera(selectedOption.camera);
            }
          });
        levelsAndCamerasList.style.visibility = "visible";
      }
    }

    if (roundsPerMinute) {
      var controller = this.getController();
      controller.goToCamera(home.getTopCamera());
      controller.rotateCameraPitch(Math.PI / 6 - home.getCamera().getPitch());
      controller.moveCamera(10000);
      controller.moveCamera(-50);
      this.clickListener = ev => {
        previewComponent.startRotationAnimationAfterLoading = false;
        previewComponent.stopRotationAnimation();
      };
      canvas.addEventListener("keydown", this.clickListener);
      if (OperatingSystem.isInternetExplorerOrLegacyEdge()
        && window.PointerEvent) {
        // Multi touch support for IE and Edge
        canvas.addEventListener("pointerdown", this.clickListener);
        canvas.addEventListener("pointermove", this.clickListener);
      } else {
        canvas.addEventListener("mousedown", this.clickListener);
        canvas.addEventListener("touchstart", this.clickListener);
        canvas.addEventListener("touchmove", this.clickListener);
      }
      const elements = this.component3D.getSimulatedKeyElements(document.getElementsByTagName("body").item(0));
      for (var i = 0; i < elements.length; i++) {
        if (OperatingSystem.isInternetExplorerOrLegacyEdge()
          && window.PointerEvent) {
          elements[i].addEventListener("pointerdown", this.clickListener);
        } else {
          elements[i].addEventListener("mousedown", this.clickListener);
        }
      }
      this.visibilityChanged = ev => {
        if (document.visibilityState == "hidden") {
          previewComponent.stopRotationAnimation();
        }
      }
      document.addEventListener("visibilitychange", this.visibilityChanged);
      const canvasBounds = canvas.getBoundingClientRect();
      // Request focus if canvas is fully visible
      if (canvasBounds.top >= 0 && canvasBounds.bottom <= self.innerHeight) {
        canvas.focus();
      }
    }
  }

  /**
   * Returns the home displayed by this component.
   * @return {Home}
   */
  getHome() {
    return this.home;
  }

  /**
   * Returns the component 3D that displays the home of this component.
   * @return {HomeComponent3D}
   */
  getComponent3D() {
    return this.component3D;
  }

  /**
   * Returns the controller that manages changes in the home bound to this component.
   * @return {HomeController3D}
   */
  getController() {
    return this.controller;
  }

  /**
   * Returns the user preferences used by this component.
   * @return {UserPreferences}
   */
  getUserPreferences() {
    return this.preferences;
  }

  /**
   * Tracks furniture models loading to dispose unneeded files and data once read.
   * @private
   */
  trackFurnitureModels(onprogression, roundsPerMinute) {
    let loadedFurniture = [];
    const loadedJars = {};
    const loadedModels = {};
    const home = this.getHome();
    const furniture = home.getFurniture();
    for (var i = 0; i < furniture.length; i++) {
      const piece = furniture[i];
      const pieces = [];
      if (piece instanceof HomeFurnitureGroup) {
        const groupFurniture = piece.getAllFurniture();
        for (var j = 0; j < groupFurniture.length; j++) {
          const childPiece = groupFurniture[j];
          if (!(childPiece instanceof HomeFurnitureGroup)) {
            pieces.push(childPiece);
          }
        }
      } else {
        pieces.push(piece);
      }
      loadedFurniture.push.apply(loadedFurniture, pieces);
      for (var j = 0; j < pieces.length; j++) {
        const model = pieces[j].getModel();
        if (model.isJAREntry()) {
          const jar = model.getJAREntryURL();
          if (jar in loadedJars) {
            loadedJars[jar]++;
          } else {
            loadedJars[jar] = 1;
          }
        }
        const modelUrl = model.getURL();
        if (modelUrl in loadedModels) {
          loadedModels[modelUrl]++;
        } else {
          loadedModels[modelUrl] = 1;
        }
      }
    }

    if (loadedFurniture.length === 0) {
      onprogression(ModelLoader.READING_MODEL, undefined, 1);
    } else {
      // Add an observer that will close ZIP files and free geometries once all models are loaded
      let modelsCount = 0;
      const previewComponent = this;
      for (var i = 0; i < loadedFurniture.length; i++) {
        const managerCall = piece => {
          ModelManager.getInstance().loadModel(piece.getModel(), false, {
            modelUpdated: function (modelRoot) {
              const model = piece.getModel();
              if (model.isJAREntry()) {
                const jar = model.getJAREntryURL();
                if (--loadedJars[jar] === 0) {
                  ZIPTools.disposeZIP(jar);
                  delete loadedJars[jar];
                }
              }
              const modelUrl = model.getURL();
              if (--loadedModels[modelUrl] === 0) {
                ModelManager.getInstance().unloadModel(model);
                delete loadedModels[modelUrl];
              }
              onprogression(ModelLoader.READING_MODEL, piece.getName(), ++modelsCount / loadedFurniture.length);
              if (modelsCount === loadedFurniture.length) {
                // Home and its models fully loaded
                // Free all other geometries (background, structure...)  
                previewComponent.component3D.disposeGeometries();
                loadedFurniture = [];
                if (previewComponent.startRotationAnimationAfterLoading) {
                  delete previewComponent.startRotationAnimationAfterLoading;
                  previewComponent.startRotationAnimation(roundsPerMinute);
                }
              }
            },
            modelError: function (ex) {
              this.modelUpdated();
            }
          });
        };
        managerCall(loadedFurniture[i]);
      }
    }
  }

  /**
   * Stops animation, removes listeners bound to global objects and clears this component.
   * This method should be called to free resources in the browser when this component is not needed anymore.
   */
  dispose() {
    this.stopRotationAnimation();
    if (this.component3D) {
      if (this.clickListener) {
        // Remove listeners bound to global objects
        document.removeEventListener("visibilitychange", this.visibilityChanged);
        const elements = this.component3D.getSimulatedKeyElements(document.getElementsByTagName("body").item(0));
        for (let i = 0; i < elements.length; i++) {
          if (OperatingSystem.isInternetExplorerOrLegacyEdge()
            && window.PointerEvent) {
            elements[i].removeEventListener("pointerdown", this.clickListener);
          } else {
            elements[i].removeEventListener("mousedown", this.clickListener);
          }
        }
      }
      this.component3D.dispose();
    }
  }

  /**
   * Starts rotation animation.
   * @param {number} [roundsPerMinute]  the rotation speed in rounds per minute, 1rpm if missing
   */
  startRotationAnimation(roundsPerMinute) {
    this.roundsPerMinute = roundsPerMinute !== undefined ? roundsPerMinute : 1;
    if (!this.rotationAnimationStarted) {
      this.rotationAnimationStarted = true;
      this.animate();
    }
  }

  /**
   * @private
   */
  animate() {
    if (this.rotationAnimationStarted) {
      const now = Date.now();
      if (this.lastRotationAnimationTime !== undefined) {
        const angularSpeed = this.roundsPerMinute * 2 * Math.PI / 60000;
        let yawDelta = ((now - this.lastRotationAnimationTime) * angularSpeed) % (2 * Math.PI);
        yawDelta -= this.home.getCamera().getYaw() - this.lastRotationAnimationYaw;
        if (yawDelta > 0) {
          this.controller.rotateCameraYaw(yawDelta);
        }
      }
      this.lastRotationAnimationTime = now;
      this.lastRotationAnimationYaw = this.home.getCamera().getYaw();
      const previewComponent = this;
      requestAnimationFrame(
        () => {
          previewComponent.animate();
        });
    }
  }

  /**
   * Stops the running rotation animation.
   */
  stopRotationAnimation() {
    delete this.lastRotationAnimationTime;
    delete this.lastRotationAnimationYaw;
    delete this.rotationAnimationStarted;
  }
}
