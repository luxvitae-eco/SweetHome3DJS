/*
 * HomePane.js
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
  CollectionEvent, DimensionLine,
  Home,
  HomePieceOfFurniture, HomeShelfUnit,
  Label,
  PlanController,
  Room, Wall,
  HomeView,
} from './SweetHome3D';

import { HomeComponent3D } from './HomeComponent3D';
import { ResourceAction } from './ResourceAction';
import { JSPopupMenu, JSDialog, JSComponent } from './toolkit';
import { KeyStroke } from './core';
import { AbstractAction } from './graphics2d';
import { OperatingSystem } from './URLContent';
import { ZIPTools } from './URLContent';

/**
 * Creates home view associated with its controller.
 * @param {Home} home
 * @param {UserPreferences} preferences
 * @param {HomeController} controller
 * @constructor
 * @author Emmanuel Puybaret
 * @author Renaud Pawlak
 * @author Louis Grignon 
 */
export class HomePane {
  constructor(containerId, home, preferences, controller) {
    if (containerId != null) {
      this.container = document.getElementById(containerId);
    }
    if (!this.container) {
      this.container = document.body;
    }
    this.home = home;
    this.preferences = preferences;
    this.controller = controller;
    this.clipboardEmpty = true;
    this.actionMap = {};
    this.inputMap = {};
    this.transferHandlerEnabled = false;

    this.createActions(home, preferences, controller);
    this.initActions(preferences);
    this.addHomeListener(home);
    this.addLevelVisibilityListener(home);
    this.addUserPreferencesListener(preferences);
    this.addPlanControllerListener(controller.getPlanController());
    this.addFocusListener();
    this.createToolBar(home, preferences, controller);
    this.createPopupMenus(home, preferences);
    this.initSplitters();
    this.addOrientationChangeListener();

    // Additional implementation for Sweet Home 3D JS

    // Keyboard accelerators management
    let homePane = this;
    this.keydownListener = ev => {
      if (JSDialog.getTopMostDialog() !== null) {
        // ignore keystrokes when dialog is displayed
        return;
      }

      let keyStroke = KeyStroke.getKeyStrokeForEvent(ev);
      if (keyStroke !== undefined) {
        // Search action matching shortcut and call its actionPerformed method
        for (let actionType in homePane.actionMap) {
          var action = homePane.actionMap[actionType];

          if (action instanceof AbstractAction
            && action.isEnabled()

            && action.getValue(AbstractAction.ACCELERATOR_KEY) == keyStroke) {
            action.actionPerformed();
            ev.stopPropagation();
            return;
          }
        }
        // Search other actions in input map
        let actionKey = homePane.inputMap[keyStroke];
        if (actionKey !== undefined) {
          var action = homePane.actionMap[actionKey];
          if (action !== undefined) {
            action.actionPerformed(ev);
          }
          ev.stopPropagation();
        }
      }
    };
    document.addEventListener("keydown", this.keydownListener, false);

    let planComponent = controller.getPlanController().getView();
    if (planComponent != null) {
      // Restore viewport position if it exists
      let viewportX = home.getNumericProperty(HomePane.PLAN_VIEWPORT_X_VISUAL_PROPERTY);
      let viewportY = home.getNumericProperty(HomePane.PLAN_VIEWPORT_Y_VISUAL_PROPERTY);
      if (viewportX != null && viewportY != null) {
        planComponent.scrollPane.scrollLeft = viewportX | 0;
        planComponent.scrollPane.scrollTop = viewportY | 0;
      }

      planComponent.scrollPane.addEventListener("scroll", (ev) => {
        controller.setHomeProperty(HomePane.PLAN_VIEWPORT_X_VISUAL_PROPERTY, planComponent.scrollPane.scrollLeft.toString());
        controller.setHomeProperty(HomePane.PLAN_VIEWPORT_Y_VISUAL_PROPERTY, planComponent.scrollPane.scrollTop.toString());
      });
    }

    // Create level selector
    this.levelSelector = document.getElementById("level-selector");
    let levelsChangeListener = () => {
      if (homePane.levelSelector) {
        homePane.levelSelector.innerHTML = "";
        if (home.getLevels().length < 2) {
          homePane.levelSelector.style.display = "none";
        } else {
          for (let i = 0; i < home.getLevels().length; i++) {
            let option = document.createElement("option");
            option.value = i;
            option.innerHTML = home.getLevels()[i].getName();
            if (home.getLevels()[i] === home.getSelectedLevel()) {
              option.selected = "selected";
            }
            homePane.levelSelector.appendChild(option);
          }
          homePane.levelSelector.style.display = "inline";
        }
      }
    };
    levelsChangeListener();
    if (this.levelSelector) {
      this.levelSelectorChangeListener = ev => {
        controller.getPlanController().setSelectedLevel(home.getLevels()[parseInt(ev.target.value)]);
        levelsChangeListener();
      };
      this.levelSelector.addEventListener("change", this.levelSelectorChangeListener);
    }
    home.addPropertyChangeListener("SELECTED_LEVEL", levelsChangeListener);
    let levelChangeListener = ev => {
      if ("NAME" == ev.getPropertyName()
        || "ELEVATION" == ev.getPropertyName()
        || "ELEVATION_INDEX" == ev.getPropertyName()) {
        levelsChangeListener();
      }
    };
    let levels = home.getLevels();
    for (let i = 0; i < levels.length; i++) {
      levels[i].addPropertyChangeListener(levelChangeListener);
    }
    home.addLevelsListener((ev) => {
      if (ev.getType() === CollectionEvent.Type.ADD) {
        ev.getItem().addPropertyChangeListener(levelChangeListener);
      } else if (ev.getType() === CollectionEvent.Type.DELETE) {
        ev.getItem().removePropertyChangeListener(levelChangeListener);
      }
      levelsChangeListener();
    });

    setTimeout(() => {
      // Give default focus to the plan or the 3D view
      if (planComponent != null) {
        planComponent.getHTMLElement().focus();
      } else if (controller.getHomeController3D().getView() != null) {
        controller.getHomeController3D().getView().getHTMLElement().focus();
      }
    });
  }

  /**
   * Returns the HTML element used to view this component at screen.
   */
  getHTMLElement() {
    return this.container;
  }

  /**
   * Returns the actions map registered with this component.
   */
  getActionMap() {
    return this.actionMap;
  }

  /**
   * Convenient shortcut method to access an action.
   * @param {string|HomeView.ActionType} actionType
   * @private
   */
  getAction(actionType) {
    if (typeof actionType === "string") {
      return this.actionMap[actionType];
    } else {
      return this.actionMap[HomeView.ActionType[actionType]];
    }
  }

  /**
   * Create the actions map of this component.
   * @param {Home} home
   * @param {UserPreferences} preferences
   * @param {HomeController} controller
   * @private
   */
  createActions(home, preferences, controller) {
    let ActionType = HomeView.ActionType;
    this.createAction(ActionType.NEW_HOME, preferences, controller, "newHome");
    this.createAction(ActionType.NEW_HOME_FROM_EXAMPLE, preferences, controller, "newHomeFromExample");
    this.createAction(ActionType.OPEN, preferences, controller, "open");
    this.createAction(ActionType.DELETE_RECENT_HOMES, preferences, controller, "deleteRecentHomes");
    this.createAction(ActionType.CLOSE, preferences, controller, "close");
    this.createAction(ActionType.SAVE, preferences, controller, "save");
    this.createAction(ActionType.SAVE_AS, preferences, controller, "saveAs");
    this.createAction(ActionType.SAVE_AND_COMPRESS, preferences, controller, "saveAndCompress");
    this.createAction(ActionType.PAGE_SETUP, preferences, controller, "setupPage");
    this.createAction(ActionType.PRINT_PREVIEW, preferences, controller, "previewPrint");
    this.createAction(ActionType.PRINT, preferences, controller, "print");
    this.createAction(ActionType.PRINT_TO_PDF, preferences, controller, "printToPDF");
    this.createAction(ActionType.PREFERENCES, preferences, controller, "editPreferences");
    this.createAction(ActionType.EXIT, preferences, controller, "exit");

    this.createAction(ActionType.UNDO, preferences, controller, "undo");
    this.createAction(ActionType.REDO, preferences, controller, "redo");
    this.createClipboardAction(ActionType.CUT, preferences, null, true);
    this.createClipboardAction(ActionType.COPY, preferences, null, true);
    this.createClipboardAction(ActionType.PASTE, preferences, null, false);
    this.createAction(ActionType.PASTE_TO_GROUP, preferences, controller, "pasteToGroup");
    this.createAction(ActionType.PASTE_STYLE, preferences, controller, "pasteStyle");
    this.createAction(ActionType.DELETE, preferences, controller, "delete");
    this.createAction(ActionType.SELECT_ALL, preferences, controller, "selectAll");

    this.createAction(ActionType.ADD_HOME_FURNITURE, preferences, controller, "addHomeFurniture");
    this.createAction(ActionType.ADD_FURNITURE_TO_GROUP, preferences, controller, "addFurnitureToGroup");
    let furnitureController = controller.getFurnitureController();
    this.createAction(ActionType.DELETE_HOME_FURNITURE, preferences, furnitureController, "deleteSelection");
    this.createAction(ActionType.MODIFY_FURNITURE, preferences, controller, "modifySelectedFurniture");
    this.createAction(ActionType.GROUP_FURNITURE, preferences, furnitureController, "groupSelectedFurniture");
    this.createAction(ActionType.UNGROUP_FURNITURE, preferences, furnitureController, "ungroupSelectedFurniture");
    this.createAction(ActionType.ALIGN_FURNITURE_ON_TOP, preferences, furnitureController, "alignSelectedFurnitureOnTop");
    this.createAction(ActionType.ALIGN_FURNITURE_ON_BOTTOM, preferences, furnitureController, "alignSelectedFurnitureOnBottom");
    this.createAction(ActionType.ALIGN_FURNITURE_ON_LEFT, preferences, furnitureController, "alignSelectedFurnitureOnLeft");
    this.createAction(ActionType.ALIGN_FURNITURE_ON_RIGHT, preferences, furnitureController, "alignSelectedFurnitureOnRight");
    this.createAction(ActionType.ALIGN_FURNITURE_ON_FRONT_SIDE, preferences, furnitureController, "alignSelectedFurnitureOnFrontSide");
    this.createAction(ActionType.ALIGN_FURNITURE_ON_BACK_SIDE, preferences, furnitureController, "alignSelectedFurnitureOnBackSide");
    this.createAction(ActionType.ALIGN_FURNITURE_ON_LEFT_SIDE, preferences, furnitureController, "alignSelectedFurnitureOnLeftSide");
    this.createAction(ActionType.ALIGN_FURNITURE_ON_RIGHT_SIDE, preferences, furnitureController, "alignSelectedFurnitureOnRightSide");
    this.createAction(ActionType.ALIGN_FURNITURE_SIDE_BY_SIDE, preferences, furnitureController, "alignSelectedFurnitureSideBySide");
    this.createAction(ActionType.DISTRIBUTE_FURNITURE_HORIZONTALLY, preferences, furnitureController, "distributeSelectedFurnitureHorizontally");
    this.createAction(ActionType.DISTRIBUTE_FURNITURE_VERTICALLY, preferences, furnitureController, "distributeSelectedFurnitureVertically");
    this.createAction(ActionType.RESET_FURNITURE_ELEVATION, preferences, furnitureController, "resetFurnitureElevation");
    let homeController3D = controller.getHomeController3D();
    if (homeController3D.getView() != null) {
      this.createAction(ActionType.IMPORT_FURNITURE, preferences, controller, "importFurniture");
    }
    this.createAction(ActionType.IMPORT_FURNITURE_LIBRARY, preferences, controller, "importFurnitureLibrary");
    this.createAction(ActionType.IMPORT_TEXTURE, preferences, controller, "importTexture");
    this.createAction(ActionType.IMPORT_TEXTURES_LIBRARY, preferences, controller, "importTexturesLibrary");
    this.createAction(ActionType.SORT_HOME_FURNITURE_BY_CATALOG_ID, preferences,
      furnitureController, "toggleFurnitureSort", "CATALOG_ID");
    this.createAction(ActionType.SORT_HOME_FURNITURE_BY_NAME, preferences,
      furnitureController, "toggleFurnitureSort", "NAME");
    this.createAction(ActionType.SORT_HOME_FURNITURE_BY_DESCRIPTION, preferences,
      furnitureController, "toggleFurnitureSort", "DESCRIPTION");
    this.createAction(ActionType.SORT_HOME_FURNITURE_BY_CREATOR, preferences,
      furnitureController, "toggleFurnitureSort", "CREATOR");
    this.createAction(ActionType.SORT_HOME_FURNITURE_BY_LICENSE, preferences,
      furnitureController, "toggleFurnitureSort", "LICENSE");
    this.createAction(ActionType.SORT_HOME_FURNITURE_BY_WIDTH, preferences,
      furnitureController, "toggleFurnitureSort", "WIDTH");
    this.createAction(ActionType.SORT_HOME_FURNITURE_BY_DEPTH, preferences,
      furnitureController, "toggleFurnitureSort", "DEPTH");
    this.createAction(ActionType.SORT_HOME_FURNITURE_BY_HEIGHT, preferences,
      furnitureController, "toggleFurnitureSort", "HEIGHT");
    this.createAction(ActionType.SORT_HOME_FURNITURE_BY_X, preferences,
      furnitureController, "toggleFurnitureSort", "X");
    this.createAction(ActionType.SORT_HOME_FURNITURE_BY_Y, preferences,
      furnitureController, "toggleFurnitureSort", "Y");
    this.createAction(ActionType.SORT_HOME_FURNITURE_BY_ELEVATION, preferences,
      furnitureController, "toggleFurnitureSort", "ELEVATION");
    this.createAction(ActionType.SORT_HOME_FURNITURE_BY_ANGLE, preferences,
      furnitureController, "toggleFurnitureSort", "ANGLE");
    this.createAction(ActionType.SORT_HOME_FURNITURE_BY_LEVEL, preferences,
      furnitureController, "toggleFurnitureSort", "LEVEL");
    this.createAction(ActionType.SORT_HOME_FURNITURE_BY_MODEL_SIZE, preferences,
      furnitureController, "toggleFurnitureSort", "MODEL_SIZE");
    this.createAction(ActionType.SORT_HOME_FURNITURE_BY_COLOR, preferences,
      furnitureController, "toggleFurnitureSort", "COLOR");
    this.createAction(ActionType.SORT_HOME_FURNITURE_BY_TEXTURE, preferences,
      furnitureController, "toggleFurnitureSort", "TEXTURE");
    this.createAction(ActionType.SORT_HOME_FURNITURE_BY_MOVABILITY, preferences,
      furnitureController, "toggleFurnitureSort", "MOVABLE");
    this.createAction(ActionType.SORT_HOME_FURNITURE_BY_TYPE, preferences,
      furnitureController, "toggleFurnitureSort", "DOOR_OR_WINDOW");
    this.createAction(ActionType.SORT_HOME_FURNITURE_BY_VISIBILITY, preferences,
      furnitureController, "toggleFurnitureSort", "VISIBLE");
    this.createAction(ActionType.SORT_HOME_FURNITURE_BY_PRICE, preferences,
      furnitureController, "toggleFurnitureSort", "PRICE");
    this.createAction(ActionType.SORT_HOME_FURNITURE_BY_VALUE_ADDED_TAX_PERCENTAGE, preferences,
      furnitureController, "toggleFurnitureSort", "VALUE_ADDED_TAX_PERCENTAGE");
    this.createAction(ActionType.SORT_HOME_FURNITURE_BY_VALUE_ADDED_TAX, preferences,
      furnitureController, "toggleFurnitureSort", "VALUE_ADDED_TAX");
    this.createAction(ActionType.SORT_HOME_FURNITURE_BY_PRICE_VALUE_ADDED_TAX_INCLUDED, preferences,
      furnitureController, "toggleFurnitureSort", "PRICE_VALUE_ADDED_TAX_INCLUDED");
    this.createAction(ActionType.SORT_HOME_FURNITURE_BY_DESCENDING_ORDER, preferences,
      furnitureController, "toggleFurnitureSortOrder");
    this.createAction(ActionType.DISPLAY_HOME_FURNITURE_CATALOG_ID, preferences,
      furnitureController, "toggleFurnitureVisibleProperty", "CATALOG_ID");
    this.createAction(ActionType.DISPLAY_HOME_FURNITURE_NAME, preferences,
      furnitureController, "toggleFurnitureVisibleProperty", "NAME");
    this.createAction(ActionType.DISPLAY_HOME_FURNITURE_DESCRIPTION, preferences,
      furnitureController, "toggleFurnitureVisibleProperty", "DESCRIPTION");
    this.createAction(ActionType.DISPLAY_HOME_FURNITURE_CREATOR, preferences,
      furnitureController, "toggleFurnitureVisibleProperty", "CREATOR");
    this.createAction(ActionType.DISPLAY_HOME_FURNITURE_LICENSE, preferences,
      furnitureController, "toggleFurnitureVisibleProperty", "LICENSE");
    this.createAction(ActionType.DISPLAY_HOME_FURNITURE_WIDTH, preferences,
      furnitureController, "toggleFurnitureVisibleProperty", "WIDTH");
    this.createAction(ActionType.DISPLAY_HOME_FURNITURE_DEPTH, preferences,
      furnitureController, "toggleFurnitureVisibleProperty", "DEPTH");
    this.createAction(ActionType.DISPLAY_HOME_FURNITURE_HEIGHT, preferences,
      furnitureController, "toggleFurnitureVisibleProperty", "HEIGHT");
    this.createAction(ActionType.DISPLAY_HOME_FURNITURE_X, preferences,
      furnitureController, "toggleFurnitureVisibleProperty", "X");
    this.createAction(ActionType.DISPLAY_HOME_FURNITURE_Y, preferences,
      furnitureController, "toggleFurnitureVisibleProperty", "Y");
    this.createAction(ActionType.DISPLAY_HOME_FURNITURE_ELEVATION, preferences,
      furnitureController, "toggleFurnitureVisibleProperty", "ELEVATION");
    this.createAction(ActionType.DISPLAY_HOME_FURNITURE_ANGLE, preferences,
      furnitureController, "toggleFurnitureVisibleProperty", "ANGLE");
    this.createAction(ActionType.DISPLAY_HOME_FURNITURE_LEVEL, preferences,
      furnitureController, "toggleFurnitureVisibleProperty", "LEVEL");
    this.createAction(ActionType.DISPLAY_HOME_FURNITURE_MODEL_SIZE, preferences,
      furnitureController, "toggleFurnitureVisibleProperty", "MODEL_SIZE");
    this.createAction(ActionType.DISPLAY_HOME_FURNITURE_COLOR, preferences,
      furnitureController, "toggleFurnitureVisibleProperty", "COLOR");
    this.createAction(ActionType.DISPLAY_HOME_FURNITURE_TEXTURE, preferences,
      furnitureController, "toggleFurnitureVisibleProperty", "TEXTURE");
    this.createAction(ActionType.DISPLAY_HOME_FURNITURE_MOVABLE, preferences,
      furnitureController, "toggleFurnitureVisibleProperty", "MOVABLE");
    this.createAction(ActionType.DISPLAY_HOME_FURNITURE_DOOR_OR_WINDOW, preferences,
      furnitureController, "toggleFurnitureVisibleProperty", "DOOR_OR_WINDOW");
    this.createAction(ActionType.DISPLAY_HOME_FURNITURE_VISIBLE, preferences,
      furnitureController, "toggleFurnitureVisibleProperty", "VISIBLE");
    this.createAction(ActionType.DISPLAY_HOME_FURNITURE_PRICE, preferences,
      furnitureController, "toggleFurnitureVisibleProperty", "PRICE");
    this.createAction(ActionType.DISPLAY_HOME_FURNITURE_VALUE_ADDED_TAX_PERCENTAGE, preferences,
      furnitureController, "toggleFurnitureVisibleProperty", "VALUE_ADDED_TAX_PERCENTAGE");
    this.createAction(ActionType.DISPLAY_HOME_FURNITURE_VALUE_ADDED_TAX, preferences,
      furnitureController, "toggleFurnitureVisibleProperty", "VALUE_ADDED_TAX");
    this.createAction(ActionType.DISPLAY_HOME_FURNITURE_PRICE_VALUE_ADDED_TAX_INCLUDED, preferences,
      furnitureController, "toggleFurnitureVisibleProperty", "PRICE_VALUE_ADDED_TAX_INCLUDED");
    this.createAction(ActionType.EXPORT_TO_CSV, preferences, controller, "exportToCSV");

    let planController = controller.getPlanController();
    if (planController.getView() != null) {
      this.createAction(ActionType.SELECT_ALL_AT_ALL_LEVELS, preferences, planController, "selectAllAtAllLevels");
      let modeGroup = [];
      this.createToggleAction(ActionType.SELECT, planController.getMode() == PlanController.Mode.SELECTION, modeGroup,
        preferences, controller, "setMode", PlanController.Mode.SELECTION);
      this.createToggleAction(ActionType.PAN, planController.getMode() == PlanController.Mode.PANNING, modeGroup,
        preferences, controller, "setMode", PlanController.Mode.PANNING);
      this.createToggleAction(ActionType.CREATE_WALLS, planController.getMode() == PlanController.Mode.WALL_CREATION, modeGroup,
        preferences, controller, "setMode", PlanController.Mode.WALL_CREATION);
      this.createToggleAction(ActionType.CREATE_ROOMS, planController.getMode() == PlanController.Mode.ROOM_CREATION, modeGroup,
        preferences, controller, "setMode", PlanController.Mode.ROOM_CREATION);
      this.createToggleAction(ActionType.CREATE_POLYLINES, planController.getMode() == PlanController.Mode.POLYLINE_CREATION, modeGroup,
        preferences, controller, "setMode", PlanController.Mode.POLYLINE_CREATION);
      this.createToggleAction(ActionType.CREATE_DIMENSION_LINES, planController.getMode() == PlanController.Mode.DIMENSION_LINE_CREATION, modeGroup,
        preferences, controller, "setMode", PlanController.Mode.DIMENSION_LINE_CREATION);
      this.createToggleAction(ActionType.CREATE_LABELS, planController.getMode() == PlanController.Mode.LABEL_CREATION, modeGroup,
        preferences, controller, "setMode", PlanController.Mode.LABEL_CREATION);
      this.createAction(ActionType.DELETE_SELECTION, preferences, planController, "deleteSelection");
      this.createAction(ActionType.LOCK_BASE_PLAN, preferences, planController, "lockBasePlan");
      this.createAction(ActionType.UNLOCK_BASE_PLAN, preferences, planController, "unlockBasePlan");
      this.createAction(ActionType.ENABLE_MAGNETISM, preferences, controller, "enableMagnetism");
      this.createAction(ActionType.DISABLE_MAGNETISM, preferences, controller, "disableMagnetism");
      this.createAction(ActionType.FLIP_HORIZONTALLY, preferences, planController, "flipHorizontally");
      this.createAction(ActionType.FLIP_VERTICALLY, preferences, planController, "flipVertically");
      this.createAction(ActionType.MODIFY_COMPASS, preferences, planController, "modifyCompass");
      this.createAction(ActionType.MODIFY_WALL, preferences, planController, "modifySelectedWalls");
      this.createAction(ActionType.MODIFY_ROOM, preferences, planController, "modifySelectedRooms");
      this.createAction(ActionType.JOIN_WALLS, preferences, planController, "joinSelectedWalls");
      this.createAction(ActionType.REVERSE_WALL_DIRECTION, preferences, planController, "reverseSelectedWallsDirection");
      this.createAction(ActionType.SPLIT_WALL, preferences, planController, "splitSelectedWall");
      // ADD_ROOM_POINT and DELETE_ROOM_POINT actions are actually defined later in updateRoomActions
      this.createAction(ActionType.ADD_ROOM_POINT, preferences);
      this.createAction(ActionType.DELETE_ROOM_POINT, preferences);
      this.createAction(ActionType.MODIFY_POLYLINE, preferences, planController, "modifySelectedPolylines");
      this.createAction(ActionType.MODIFY_DIMENSION_LINE, preferences, planController, "modifySelectedDimensionLines");
      this.createAction(ActionType.MODIFY_LABEL, preferences, planController, "modifySelectedLabels");
      this.createAction(ActionType.INCREASE_TEXT_SIZE, preferences, planController, "increaseTextSize");
      this.createAction(ActionType.DECREASE_TEXT_SIZE, preferences, planController, "decreaseTextSize");
      // Use special toggle models for bold and italic check box menu items and tool bar buttons
      // that are selected texts in home selected items are all bold or italic
      let toggleBoldAction = this.createBoldStyleAction(ActionType.TOGGLE_BOLD_STYLE, home, preferences, planController, "toggleBoldStyle");
      let toggleItalicAction = this.createItalicStyleToggleModel(ActionType.TOGGLE_ITALIC_STYLE, home, preferences, planController, "toggleItalicStyle");
      this.createAction(ActionType.IMPORT_BACKGROUND_IMAGE, preferences, controller, "importBackgroundImage");
      this.createAction(ActionType.MODIFY_BACKGROUND_IMAGE, preferences, controller, "modifyBackgroundImage");
      this.createAction(ActionType.HIDE_BACKGROUND_IMAGE, preferences, controller, "hideBackgroundImage");
      this.createAction(ActionType.SHOW_BACKGROUND_IMAGE, preferences, controller, "showBackgroundImage");
      this.createAction(ActionType.DELETE_BACKGROUND_IMAGE, preferences, controller, "deleteBackgroundImage");
      this.createAction(ActionType.ADD_LEVEL, preferences, planController, "addLevel");
      this.createAction(ActionType.ADD_LEVEL_AT_SAME_ELEVATION, preferences, planController, "addLevelAtSameElevation");
      this.createAction(ActionType.MAKE_LEVEL_VIEWABLE, preferences, planController, "toggleSelectedLevelViewability");
      this.createAction(ActionType.MAKE_LEVEL_UNVIEWABLE, preferences, planController, "toggleSelectedLevelViewability");
      this.createAction(ActionType.MAKE_LEVEL_ONLY_VIEWABLE_ONE, preferences, planController, "setSelectedLevelOnlyViewable");
      this.createAction(ActionType.MAKE_ALL_LEVELS_VIEWABLE, preferences, planController, "setAllLevelsViewable");
      this.createAction(ActionType.MODIFY_LEVEL, preferences, planController, "modifySelectedLevel");
      this.createAction(ActionType.DELETE_LEVEL, preferences, planController, "deleteSelectedLevel");
      this.createAction(ActionType.ZOOM_IN, preferences, controller, "zoomIn");
      this.createAction(ActionType.ZOOM_OUT, preferences, controller, "zoomOut");
      this.createAction(ActionType.EXPORT_TO_SVG, preferences, controller, "exportToSVG");
    }

    if (homeController3D.getView() != null) {
      // SELECT_OBJECT and TOGGLE_SELECTION actions are actually defined later in updatePickingActions
      this.createAction(ActionType.SELECT_OBJECT, preferences);
      this.createAction(ActionType.TOGGLE_SELECTION, preferences);
      let viewGroup = [];
      this.createToggleAction(ActionType.VIEW_FROM_TOP, home.getCamera() == home.getTopCamera(), viewGroup,
        preferences, homeController3D, "viewFromTop");
      this.createToggleAction(ActionType.VIEW_FROM_OBSERVER, home.getCamera() == home.getObserverCamera(), viewGroup,
        preferences, homeController3D, "viewFromObserver");
      this.createAction(ActionType.MODIFY_OBSERVER, preferences, planController, "modifyObserverCamera");
      this.createAction(ActionType.STORE_POINT_OF_VIEW, preferences, controller, "storeCamera");
      this.createAction(ActionType.DELETE_POINTS_OF_VIEW, preferences, controller, "deleteCameras");
      this.createAction(ActionType.DETACH_3D_VIEW, preferences, controller, "detachView", controller.getHomeController3D().getView());
      this.createAction(ActionType.ATTACH_3D_VIEW, preferences, controller, "attachView", controller.getHomeController3D().getView());

      let allLevelsVisible = home.getEnvironment().isAllLevelsVisible();
      let displayLevelGroup = [];
      this.createToggleAction(ActionType.DISPLAY_ALL_LEVELS, allLevelsVisible, displayLevelGroup, preferences,
        homeController3D, "displayAllLevels");
      this.createToggleAction(ActionType.DISPLAY_SELECTED_LEVEL, !allLevelsVisible, displayLevelGroup, preferences,
        homeController3D, "displaySelectedLevel");
      this.createAction(ActionType.MODIFY_3D_ATTRIBUTES, preferences, homeController3D, "modifyAttributes");
      this.createAction(ActionType.CREATE_PHOTO, preferences, controller, "createPhoto");
      this.createAction(ActionType.CREATE_PHOTOS_AT_POINTS_OF_VIEW, preferences, controller, "createPhotos");
      this.createAction(ActionType.CREATE_VIDEO, preferences, controller, "createVideo");
      this.createAction(ActionType.EXPORT_TO_OBJ, preferences, controller, "exportToOBJ");
    }

    this.createAction(ActionType.HELP, preferences, controller, "help");
    this.createAction(ActionType.ABOUT, preferences, controller, "about");

    // Additional action for application popup menu 
    let showApplicationMenuAction = new ResourceAction(preferences, "HomePane", "SHOW_APPLICATION_MENU", true);
    if (showApplicationMenuAction.getValue(AbstractAction.SMALL_ICON) == null) {
      showApplicationMenuAction.putValue(AbstractAction.NAME, "SHOW_APPLICATION_MENU");
      showApplicationMenuAction.putValue(AbstractAction.SMALL_ICON, "menu.png");
    }
    let homePane = this;
    showApplicationMenuAction.actionPerformed = ev => {
      ev.stopPropagation();
      ev.preventDefault();
      let planElement = controller.getPlanController().getView().getHTMLElement();
      let contextMenuEvent = document.createEvent("Event");
      contextMenuEvent.initEvent("contextmenu", true, true);
      contextMenuEvent.clientX = homePane.showApplicationMenuButton.clientX + homePane.showApplicationMenuButton.clientWidth / 2;
      contextMenuEvent.clientY = homePane.showApplicationMenuButton.clientY + homePane.showApplicationMenuButton.clientHeight / 2;
      homePane.showApplicationMenuButton.dispatchEvent(contextMenuEvent);
    };
    this.getActionMap()["SHOW_APPLICATION_MENU"] = showApplicationMenuAction;
  }

  /**
   * Returns a new <code>ControllerAction</code> object that calls on <code>controller</code> a given
   * <code>method</code> with its <code>parameters</code>. This action is added to the action map of this component.
   * @param {HomeView.ActionType} actionType
   * @param {UserPreferences} preferences
   * @param {Object} controller
   * @param {string} method
   * @param {...Object} parameters
   * @return {Object}
   * @private
   */
  createAction(actionType, preferences, controller, method) {
    let parameters = [];
    for (let i = 4; i < arguments.length; i++) {
      parameters[i - 4] = arguments[i];
    }
    try {
      let action = new ResourceAction(preferences, HomePane, HomeView.ActionType[actionType], false, controller, method, parameters);
      this.getActionMap()[HomeView.ActionType[actionType]] = action;
      return action;
    } catch (ex) {
      console.log(ex);
    }
  }

  /**
   * Returns a new <code>ControllerAction</code> object associated with other actions if the same <code>group</code>.
   * @param {HomeView.ActionType} actionType
   * @param {boolean} selected
   * @param {string} group
   * @param {UserPreferences} preferences
   * @param {Object} controller
   * @param {string} method
   * @param {...Object} parameters
   * @return {Object}
   * @private
   */
  createToggleAction(actionType, selected, group, preferences, controller, method) {
    let parameters = [];
    for (let i = 6; i < arguments.length; i++) {
      parameters[i - 6] = arguments[i];
    }
    let action = this.createAction.apply(this, [actionType, preferences, controller, method].concat(parameters));
    if (group != null) {
      group.push(action);
      action.putValue(ResourceAction.TOGGLE_BUTTON_GROUP, group);
      action.putValue(AbstractAction.SELECTED_KEY, selected);
      action.addPropertyChangeListener((ev) => {
        if (ev.getPropertyName() == AbstractAction.SELECTED_KEY) {
          if (ev.getNewValue()) {
            let group = ev.getSource().getValue(ResourceAction.TOGGLE_BUTTON_GROUP);
            for (let i = 0; i < group.length; i++) {
              if (action !== group[i]
                && group[i].getValue(AbstractAction.SELECTED_KEY)) {
                group[i].putValue(AbstractAction.SELECTED_KEY, false);
              }
            }
          } else {
            ev.getSource().putValue(AbstractAction.SELECTED_KEY, false);
          }
        }
      })
    }
    return action;
  }

  /**
   * Creates a <code>ReourceAction</code> object that calls
   * <code>actionPerfomed</code> method on a given
   * existing <code>clipboardAction</code> with a source equal to focused component.
   * @param {HomeView.ActionType} actionType
   * @param {UserPreferences} preferences
   * @param {Object} clipboardAction
   * @param {boolean} copyAction
   * @private
   */
  createClipboardAction(actionType, preferences, clipboardAction, copyAction) {
    let action = this.createAction(actionType, preferences);
    let homePane = this;
    action.actionPerformed = ev => {
      if (copyAction) {
        homePane.clipboard = Home.duplicate(homePane.home.getSelectedItems());
        homePane.clipboardEmpty = false;
        homePane.controller.enablePasteAction();
      }
      switch (actionType) {
        case HomeView.ActionType.CUT:
          homePane.controller.cut(homePane.home.getSelectedItems());
          break;
        case HomeView.ActionType.COPY:
          break;
        case HomeView.ActionType.PASTE:
          homePane.controller.paste(Home.duplicate(homePane.clipboard));
          break;
      }
      return action;
    }
  }

  /**
   * Creates a <code>ResourceAction</code> for the given menu action type.
   * @private
   */
  getMenuAction(actionType) {
    return new ResourceAction(this.preferences, HomePane, HomePane.MenuActionType[actionType], true);
  }

  /**
   * Adds a property change listener to <code>home</code> to update
   * View from top and View from observer toggle models according to used camera.
   * @param {Home} home
   * @private
   */
  addHomeListener(home) {
    let homePane = this;
    home.addPropertyChangeListener("CAMERA", (ev) => {
      homePane.setToggleButtonModelSelected(HomeView.ActionType.VIEW_FROM_TOP, home.getCamera() == home.getTopCamera());
      homePane.setToggleButtonModelSelected(HomeView.ActionType.VIEW_FROM_OBSERVER, home.getCamera() == home.getObserverCamera());
    });
  }

  /**
   * Changes the selection of the toggle model matching the given action.
   * @param {HomeView.ActionType} actionType
   * @param {boolean} selected
   * @private
   */
  setToggleButtonModelSelected(actionType, selected) {
    this.getAction(actionType).putValue(AbstractAction.SELECTED_KEY, selected);
  }

  /**
   * Adds listener to <code>home</code> to update
   * Display all levels and Display selected level toggle models
   * according their visibility.
   * @param {Home} home
   * @private
   */
  addLevelVisibilityListener(home) {
    let homePane = this;
    home.getEnvironment().addPropertyChangeListener("ALL_LEVELS_VISIBLE", (ev) => {
      let allLevelsVisible = home.getEnvironment().isAllLevelsVisible();
      homePane.setToggleButtonModelSelected(HomeView.ActionType.DISPLAY_ALL_LEVELS, allLevelsVisible);
      homePane.setToggleButtonModelSelected(HomeView.ActionType.DISPLAY_SELECTED_LEVEL, !allLevelsVisible);
    });
  }

  /**
   * Adds a property change listener to <code>preferences</code> to update
   * actions when some preferences change.
   * @param {UserPreferences} preferences
   * @private
   */
  addUserPreferencesListener(preferences) {
    this.preferencesChangeListener = new HomePane.UserPreferencesChangeListener(this);
    preferences.addPropertyChangeListener("CURRENCY", this.preferencesChangeListener);
    preferences.addPropertyChangeListener("VALUE_ADDED_TAX_ENABLED", this.preferencesChangeListener);
  }

  /**
   * Preferences property listener bound to this component with a weak reference to avoid
   * strong link between preferences and this component.
   * @param {HomePane} homePane
   * @constructor
   * @ignore
   */
  static UserPreferencesChangeListener(homePane) {
    // TODO Manage weak reference ?
    this.homePane = homePane;
  }

  /**
   * Sets whether some actions should be visible or not.
   * @param {UserPreferences} preferences
   * @private
   */
  initActions(preferences) {
    this.getAction(HomeView.ActionType.DISPLAY_HOME_FURNITURE_CATALOG_ID).putValue(ResourceAction.VISIBLE, false);
    this.getAction(HomeView.ActionType.SORT_HOME_FURNITURE_BY_CATALOG_ID).putValue(ResourceAction.VISIBLE, false);
    this.getAction(HomeView.ActionType.DISPLAY_HOME_FURNITURE_PRICE).putValue(ResourceAction.VISIBLE, preferences.getCurrency() != null);
    this.getAction(HomeView.ActionType.SORT_HOME_FURNITURE_BY_PRICE).putValue(ResourceAction.VISIBLE, preferences.getCurrency() != null);
    this.getAction(HomeView.ActionType.DISPLAY_HOME_FURNITURE_VALUE_ADDED_TAX_PERCENTAGE).putValue(ResourceAction.VISIBLE, preferences.isValueAddedTaxEnabled());
    this.getAction(HomeView.ActionType.DISPLAY_HOME_FURNITURE_VALUE_ADDED_TAX).putValue(ResourceAction.VISIBLE, preferences.isValueAddedTaxEnabled());
    this.getAction(HomeView.ActionType.DISPLAY_HOME_FURNITURE_PRICE_VALUE_ADDED_TAX_INCLUDED).putValue(ResourceAction.VISIBLE, preferences.isValueAddedTaxEnabled());
    this.getAction(HomeView.ActionType.SORT_HOME_FURNITURE_BY_VALUE_ADDED_TAX_PERCENTAGE).putValue(ResourceAction.VISIBLE, preferences.isValueAddedTaxEnabled());
    this.getAction(HomeView.ActionType.SORT_HOME_FURNITURE_BY_VALUE_ADDED_TAX).putValue(ResourceAction.VISIBLE, preferences.isValueAddedTaxEnabled());
    this.getAction(HomeView.ActionType.SORT_HOME_FURNITURE_BY_PRICE_VALUE_ADDED_TAX_INCLUDED).putValue(ResourceAction.VISIBLE, preferences.isValueAddedTaxEnabled());
  }

  /**
   * Adds a property change listener to <code>planController</code> to update
   * Select and Create walls toggle models according to current mode.
   * @param {PlanController} planController
   * @private
   */
  addPlanControllerListener(planController) {
    let homePane = this;
    planController.addPropertyChangeListener("MODE", (ev) => {
      let mode = planController.getMode();
      homePane.setToggleButtonModelSelected(HomeView.ActionType.SELECT, mode == PlanController.Mode.SELECTION);
      homePane.setToggleButtonModelSelected(HomeView.ActionType.PAN, mode == PlanController.Mode.PANNING);
      homePane.setToggleButtonModelSelected(HomeView.ActionType.CREATE_WALLS, mode == PlanController.Mode.WALL_CREATION);
      homePane.setToggleButtonModelSelected(HomeView.ActionType.CREATE_ROOMS, mode == PlanController.Mode.ROOM_CREATION);
      homePane.setToggleButtonModelSelected(HomeView.ActionType.CREATE_POLYLINES, mode == PlanController.Mode.POLYLINE_CREATION);
      homePane.setToggleButtonModelSelected(HomeView.ActionType.CREATE_DIMENSION_LINES, mode == PlanController.Mode.DIMENSION_LINE_CREATION);
      homePane.setToggleButtonModelSelected(HomeView.ActionType.CREATE_LABELS, mode == PlanController.Mode.LABEL_CREATION);
    });
  }

  /**
   * Adds a focus change listener to report to controller focus changes.
   * @private
   */
  addFocusListener() {
    let homePane = this;
    this.focusListener = ev => {
      // Manage focus only for plan and component 3D to simplify actions choice proposed to the user
      let focusableViews = [// homePane.controller.getFurnitureCatalogController().getView(),
        // homePane.controller.getFurnitureController().getView(),
        homePane.controller.getPlanController().getView(),
        homePane.controller.getHomeController3D().getView()];
      for (let i = 0; i < focusableViews.length; i++) {
        for (let element = ev.target; element !== null; element = element.parentElement) {
          if (element === focusableViews[i].getHTMLElement()) {
            homePane.controller.focusedViewChanged(focusableViews[i]);
            return;
          }
        }
      }
    };
    this.getHTMLElement().addEventListener("focusin", this.focusListener);
  }

  /**
   * Adds the given action to <code>menu</code>.
   * @param {string|HomeView.ActionType} actionType
   * @param {Object} menuBuilder
   * @private
   */
  addActionToMenu(actionType, menuBuilder) {
    let action = this.getAction(actionType);
    if (action != null && action.getValue(AbstractAction.NAME) != null) {
      menuBuilder.addMenuItem(action);
    }
  }

  /**
   * Builds align or distribute menu.
   */
  createAlignOrDistributeMenu(builder) {
    let ActionType = HomeView.ActionType;
    let homePane = this;
    builder.addSubMenu(homePane.getMenuAction(HomePane.MenuActionType.ALIGN_OR_DISTRIBUTE_MENU),
      (builder) => {
        homePane.addActionToMenu(ActionType.ALIGN_FURNITURE_ON_TOP, builder);
        homePane.addActionToMenu(ActionType.ALIGN_FURNITURE_ON_BOTTOM, builder);
        homePane.addActionToMenu(ActionType.ALIGN_FURNITURE_ON_LEFT, builder);
        homePane.addActionToMenu(ActionType.ALIGN_FURNITURE_ON_RIGHT, builder);
        homePane.addActionToMenu(ActionType.ALIGN_FURNITURE_ON_FRONT_SIDE, builder);
        homePane.addActionToMenu(ActionType.ALIGN_FURNITURE_ON_BACK_SIDE, builder);
        homePane.addActionToMenu(ActionType.ALIGN_FURNITURE_ON_LEFT_SIDE, builder);
        homePane.addActionToMenu(ActionType.ALIGN_FURNITURE_ON_RIGHT_SIDE, builder);
        homePane.addActionToMenu(ActionType.ALIGN_FURNITURE_SIDE_BY_SIDE, builder);
        homePane.addActionToMenu(ActionType.DISTRIBUTE_FURNITURE_HORIZONTALLY, builder);
        homePane.addActionToMenu(ActionType.DISTRIBUTE_FURNITURE_VERTICALLY, builder);
      });
  }

  /**
   * Builds furniture sort menu.
   */
  createFurnitureSortMenu(home, builder) {
    let ActionType = HomeView.ActionType;
    let homePane = this;
    builder.addSubMenu(homePane.getMenuAction(HomePane.MenuActionType.SORT_HOME_FURNITURE_MENU),
      (builder) => {
        /**
         * @param {HomeView.ActionType} type
         * @param {string} sortableProperty
         */
        let addItem = (type, sortableProperty) => {
          let action = homePane.getAction(type);
          if (action && action.getValue(AbstractAction.NAME) && action.getValue(ResourceAction.VISIBLE)) {
            builder.addRadioButtonItem(action.getValue(AbstractAction.NAME), () => {
              action.actionPerformed();
            }, sortableProperty == home.getFurnitureSortedProperty());
          }
        };

        addItem(ActionType.SORT_HOME_FURNITURE_BY_CATALOG_ID, "CATALOG_ID");
        addItem(ActionType.SORT_HOME_FURNITURE_BY_NAME, "NAME");
        addItem(ActionType.SORT_HOME_FURNITURE_BY_DESCRIPTION, "DESCRIPTION");
        addItem(ActionType.SORT_HOME_FURNITURE_BY_CREATOR, "CREATOR");
        addItem(ActionType.SORT_HOME_FURNITURE_BY_LICENSE, "LICENSE");
        addItem(ActionType.SORT_HOME_FURNITURE_BY_WIDTH, "WIDTH");
        addItem(ActionType.SORT_HOME_FURNITURE_BY_DEPTH, "DEPTH");
        addItem(ActionType.SORT_HOME_FURNITURE_BY_HEIGHT, "HEIGHT");
        addItem(ActionType.SORT_HOME_FURNITURE_BY_X, "X");
        addItem(ActionType.SORT_HOME_FURNITURE_BY_Y, "Y");
        addItem(ActionType.SORT_HOME_FURNITURE_BY_ELEVATION, "ELEVATION");
        addItem(ActionType.SORT_HOME_FURNITURE_BY_ANGLE, "ANGLE");
        addItem(ActionType.SORT_HOME_FURNITURE_BY_LEVEL, "LEVEL");
        addItem(ActionType.SORT_HOME_FURNITURE_BY_MODEL_SIZE, "MODEL_SIZE");
        addItem(ActionType.SORT_HOME_FURNITURE_BY_COLOR, "COLOR");
        addItem(ActionType.SORT_HOME_FURNITURE_BY_TEXTURE, "TEXTURE");
        addItem(ActionType.SORT_HOME_FURNITURE_BY_MOVABILITY, "MOVABLE");
        addItem(ActionType.SORT_HOME_FURNITURE_BY_TYPE, "DOOR_OR_WINDOW");
        addItem(ActionType.SORT_HOME_FURNITURE_BY_VISIBILITY, "VISIBLE");
        addItem(ActionType.SORT_HOME_FURNITURE_BY_PRICE, "PRICE");
        addItem(ActionType.SORT_HOME_FURNITURE_BY_VALUE_ADDED_TAX_PERCENTAGE, "VALUE_ADDED_TAX_PERCENTAGE");
        addItem(ActionType.SORT_HOME_FURNITURE_BY_VALUE_ADDED_TAX, "VALUE_ADDED_TAX");
        addItem(ActionType.SORT_HOME_FURNITURE_BY_PRICE_VALUE_ADDED_TAX_INCLUDED, "PRICE_VALUE_ADDED_TAX_INCLUDED");
        builder.addSeparator();
        let descSortAction = homePane.getAction(ActionType.SORT_HOME_FURNITURE_BY_DESCENDING_ORDER);
        if (descSortAction && descSortAction.getValue(AbstractAction.NAME) && descSortAction.getValue(ResourceAction.VISIBLE)) {
          builder.addCheckBoxItem(descSortAction.getValue(AbstractAction.NAME), () => {
            descSortAction.actionPerformed();
          },
            home.isFurnitureDescendingSorted());
        }
      });
  }

  /**
   * Builds furniture display property menu.
   */
  createFurnitureDisplayPropertyMenu(home, builder) {
    let ActionType = HomeView.ActionType;
    let homePane = this;
    builder.addSubMenu(homePane.getMenuAction(HomePane.MenuActionType.DISPLAY_HOME_FURNITURE_PROPERTY_MENU),
      (builder) => {
        /**
         * @param {HomeView.ActionType} type
         * @param {string} sortableProperty
         */
        let addItem = (type, sortableProperty) => {
          let action = homePane.getAction(type);
          if (action && action.getValue(AbstractAction.NAME) && action.getValue(ResourceAction.VISIBLE)) {
            builder.addCheckBoxItem(action.getValue(AbstractAction.NAME), () => {
              action.actionPerformed();
            }, home.getFurnitureVisibleProperties().indexOf(sortableProperty) > -1);
          }
        };

        addItem(ActionType.DISPLAY_HOME_FURNITURE_CATALOG_ID, "CATALOG_ID");
        addItem(ActionType.DISPLAY_HOME_FURNITURE_NAME, "NAME");
        addItem(ActionType.DISPLAY_HOME_FURNITURE_DESCRIPTION, "DESCRIPTION");
        addItem(ActionType.DISPLAY_HOME_FURNITURE_CREATOR, "CREATOR");
        addItem(ActionType.DISPLAY_HOME_FURNITURE_LICENSE, "LICENSE");
        addItem(ActionType.DISPLAY_HOME_FURNITURE_WIDTH, "WIDTH");
        addItem(ActionType.DISPLAY_HOME_FURNITURE_DEPTH, "DEPTH");
        addItem(ActionType.DISPLAY_HOME_FURNITURE_HEIGHT, "HEIGHT");
        addItem(ActionType.DISPLAY_HOME_FURNITURE_X, "X");
        addItem(ActionType.DISPLAY_HOME_FURNITURE_Y, "Y");
        addItem(ActionType.DISPLAY_HOME_FURNITURE_ELEVATION, "ELEVATION");
        addItem(ActionType.DISPLAY_HOME_FURNITURE_ANGLE, "ANGLE");
        addItem(ActionType.DISPLAY_HOME_FURNITURE_LEVEL, "LEVEL");
        addItem(ActionType.DISPLAY_HOME_FURNITURE_MODEL_SIZE, "MODEL_SIZE");
        addItem(ActionType.DISPLAY_HOME_FURNITURE_COLOR, "COLOR");
        addItem(ActionType.DISPLAY_HOME_FURNITURE_TEXTURE, "TEXTURE");
        addItem(ActionType.DISPLAY_HOME_FURNITURE_MOVABLE, "MOVABLE");
        addItem(ActionType.DISPLAY_HOME_FURNITURE_DOOR_OR_WINDOW, "DOOR_OR_WINDOW");
        addItem(ActionType.DISPLAY_HOME_FURNITURE_VISIBLE, "VISIBLE");
        addItem(ActionType.DISPLAY_HOME_FURNITURE_PRICE, "PRICE");
        addItem(ActionType.DISPLAY_HOME_FURNITURE_VALUE_ADDED_TAX_PERCENTAGE, "VALUE_ADDED_TAX_PERCENTAGE");
        addItem(ActionType.DISPLAY_HOME_FURNITURE_VALUE_ADDED_TAX, "VALUE_ADDED_TAX");
        addItem(ActionType.DISPLAY_HOME_FURNITURE_PRICE_VALUE_ADDED_TAX_INCLUDED, "PRICE_VALUE_ADDED_TAX_INCLUDED");
      });
  }

  /**
   * Returns Lock / Unlock base plan button.
   * @param {Home} home
   * @param {string} additionalClass additional CSS class
   * @return {HTMLButton}
   * @private
   */
  createLockUnlockBasePlanButton(home, additionalClass) {
    let unlockBasePlanAction = this.getAction(HomeView.ActionType.UNLOCK_BASE_PLAN);
    let lockBasePlanAction = this.getAction(HomeView.ActionType.LOCK_BASE_PLAN);
    if (unlockBasePlanAction != null
      && unlockBasePlanAction.getValue(AbstractAction.NAME) != null
      && lockBasePlanAction.getValue(AbstractAction.NAME) != null) {
      let lockUnlockBasePlanButton = this.createToolBarButton(
        home.isBasePlanLocked() ? unlockBasePlanAction : lockBasePlanAction, additionalClass);
      home.addPropertyChangeListener("BASE_PLAN_LOCKED", () => {
        lockUnlockBasePlanButton.setAction(home.isBasePlanLocked()
          ? unlockBasePlanAction
          : lockBasePlanAction);
      });
      return lockUnlockBasePlanButton;
    }
    else {
      return null;
    }
  }

  /**
   * Returns Enable / Disable magnetism button.
   * @param {UserPreferences} preferences
   * @param {string} additionalClass additional CSS class
   * @return {HTMLButton}
   * @private
   */
  createEnableDisableMagnetismButton(preferences, additionalClass) {
    let disableMagnetismAction = this.getAction(HomeView.ActionType.DISABLE_MAGNETISM);
    let enableMagnetismAction = this.getAction(HomeView.ActionType.ENABLE_MAGNETISM);
    if (disableMagnetismAction !== null
      && disableMagnetismAction.getValue(AbstractAction.NAME) !== null
      && enableMagnetismAction.getValue(AbstractAction.NAME) !== null) {
      let enableDisableMagnetismButton = this.createToolBarButton(
        preferences.isMagnetismEnabled() ? disableMagnetismAction : enableMagnetismAction, additionalClass);
      preferences.addPropertyChangeListener("MAGNETISM_ENABLED",
        new HomePane.MagnetismChangeListener(this, enableDisableMagnetismButton));
      return enableDisableMagnetismButton;
    } else {
      return null;
    }
  }

  /**
   * Preferences property listener bound to this component with a weak reference to avoid
   * strong link between preferences and this component.
   * @constructor
   * @private
   */
  static MagnetismChangeListener(homePane, enableDisableMagnetismButton) {
    this.enableDisableMagnetismButton = enableDisableMagnetismButton;
    this.homePane = homePane;
  }

  /**
   * Creates an action that is selected when all the text of the
   * selected items in <code>home</code> use bold style.
   * @param {HomeView.ActionType} actionType
   * @param {Home} home
   * @param {UserPreferences} preferences
   * @param {Object} controller
   * @param {string} method
   * @return {ResourceAction}
   * @private
   */
  createBoldStyleAction(actionType, home, preferences, controller, method) {
    let action = this.createAction(actionType, preferences, controller, method);
    home.addSelectionListener({
      selectionChanged: function (ev) {
        // Find if selected items are all bold or not
        let selectionBoldStyle = null;
        let selectedItems = home.getSelectedItems();
        for (let i = 0; i < selectedItems.length; i++) {
          let item = selectedItems[i];
          let bold;
          if (item instanceof Label) {
            bold = this.isItemTextBold("Label", item.getStyle());
          } else if (item instanceof HomePieceOfFurniture
            && item.isVisible()) {
            bold = this.isItemTextBold("HomePieceOfFurniture", item.getNameStyle());
          } else if (item instanceof Room) {
            bold = this.isItemTextBold("Room", item.getNameStyle());
            if (bold != this.isItemTextBold("Room", item.getAreaStyle())) {
              bold = null;
            }
          } else if (item instanceof DimensionLine) {
            bold = this.isItemTextBold("DimensionLine", item.getLengthStyle());
          } else {
            continue;
          }
          if (selectionBoldStyle == null) {
            selectionBoldStyle = bold;
          } else if (bold == null || selectionBoldStyle != bold) {
            selectionBoldStyle = null;
            break;
          }
        }
        action.putValue(AbstractAction.SELECTED_KEY, selectionBoldStyle != null && selectionBoldStyle);
      },
      isItemTextBold: function (itemClass, textStyle) {
        if (textStyle == null) {
          textStyle = preferences.getDefaultTextStyle(itemClass);
        }
        return textStyle.isBold();
      }
    });
    return action;
  }

  /**
   * Creates an action which is selected when all the text of the
   * selected items in <code>home</code> use italic style.
   * @param {HomeView.ActionType} actionType
   * @param {Home} home
   * @param {UserPreferences} preferences
   * @param {Object} controller
   * @param {string} method
   * @return {ResourceAction}
   * @private
   */
  createItalicStyleToggleModel(actionType, home, preferences, controller, method) {
    let action = this.createAction(actionType, preferences, controller, method);
    home.addSelectionListener({
      selectionChanged: function (ev) {
        // Find if selected items are all italic or not
        let selectionItalicStyle = null;
        let selectedItems = home.getSelectedItems();
        for (let i = 0; i < selectedItems.length; i++) {
          let item = selectedItems[i];
          let italic;
          if (item instanceof Label) {
            italic = this.isItemTextItalic("Label", item.getStyle());
          } else if (item instanceof HomePieceOfFurniture
            && item.isVisible()) {
            italic = this.isItemTextItalic("HomePieceOfFurniture", item.getNameStyle());
          } else if (item instanceof Room) {
            italic = this.isItemTextItalic("Room", item.getNameStyle());
            if (italic != this.isItemTextItalic("Room", item.getAreaStyle())) {
              italic = null;
            }
          } else if (item instanceof DimensionLine) {
            italic = this.isItemTextItalic("DimensionLine", item.getLengthStyle());
          } else {
            continue;
          }
          if (selectionItalicStyle == null) {
            selectionItalicStyle = italic;
          } else if (italic == null || selectionItalicStyle != italic) {
            selectionItalicStyle = null;
            break;
          }
        }
        action.putValue(AbstractAction.SELECTED_KEY, selectionItalicStyle != null && selectionItalicStyle);
      },
      isItemTextItalic: function (itemClass, textStyle) {
        if (textStyle == null) {
          textStyle = preferences.getDefaultTextStyle(itemClass);
        }
        return textStyle.isItalic();
      }
    });
    return action;
  }

  /**
   * Returns the tool bar displayed in this pane.
   * @param {Home} home
   * @param {UserPreferences} preferences
   * @param {HomeController} controller
   * @return {Object}
   * @private
   */
  createToolBar(home, preferences, controller) {
    let applicationMenuToolBar = document.getElementById("application-menu-toolbar");

    if (applicationMenuToolBar != null) {
      this.startToolBarButtonGroup(applicationMenuToolBar);
      this.addActionToToolBar("SHOW_APPLICATION_MENU", applicationMenuToolBar);
      this.showApplicationMenuButton = applicationMenuToolBar.children[applicationMenuToolBar.children.length - 1].lastChild;
    }

    let toolBar = document.getElementById("home-pane-toolbar");
    this.toolBarDefaultChildren = Array.prototype.slice.call(toolBar.children);
    this.startToolBarButtonGroup(toolBar);
    let fileButton = false;
    if (toolBar.classList.contains("new-home")) {
      this.addActionToToolBar(HomeView.ActionType.NEW_HOME, toolBar);
      fileButton = true;
    }
    if (toolBar.classList.contains("open")) {
      this.addActionToToolBar(HomeView.ActionType.OPEN, toolBar);
      fileButton = true;
    }
    if (toolBar.classList.contains("save")) {
      this.addActionToToolBar(HomeView.ActionType.SAVE, toolBar);
      fileButton = true;
    }
    if (toolBar.classList.contains("save-as")) {
      this.addActionToToolBar(HomeView.ActionType.SAVE_AS, toolBar);
      fileButton = true;
    }
    if (fileButton) {
      this.addSeparator(toolBar);
    }

    this.addToggleActionToToolBar(HomeView.ActionType.VIEW_FROM_TOP, toolBar);
    this.addToggleActionToToolBar(HomeView.ActionType.VIEW_FROM_OBSERVER, toolBar);
    this.addSeparator(toolBar);

    this.addActionToToolBar(HomeView.ActionType.UNDO, toolBar);
    this.addActionToToolBar(HomeView.ActionType.REDO, toolBar);
    this.addSeparator(toolBar);

    this.addActionToToolBar(HomeView.ActionType.DELETE_SELECTION, toolBar);
    this.addActionToToolBar(HomeView.ActionType.CUT, toolBar, "toolbar-optional");
    this.addActionToToolBar(HomeView.ActionType.COPY, toolBar);
    this.addActionToToolBar(HomeView.ActionType.PASTE, toolBar);
    this.addSeparator(toolBar);

    this.addActionToToolBar(HomeView.ActionType.ADD_HOME_FURNITURE, toolBar, "toolbar-optional");
    this.addSeparator(toolBar);

    this.addToggleActionToToolBar(HomeView.ActionType.SELECT, toolBar);
    this.addToggleActionToToolBar(HomeView.ActionType.PAN, toolBar, "toolbar-optional");
    this.addToggleActionToToolBar(HomeView.ActionType.CREATE_WALLS, toolBar);
    this.addToggleActionToToolBar(HomeView.ActionType.CREATE_ROOMS, toolBar);
    this.addToggleActionToToolBar(HomeView.ActionType.CREATE_POLYLINES, toolBar);
    this.addToggleActionToToolBar(HomeView.ActionType.CREATE_DIMENSION_LINES, toolBar);
    this.addToggleActionToToolBar(HomeView.ActionType.CREATE_LABELS, toolBar);
    this.addSeparator(toolBar);

    let enableDisableMagnetismButton = this.createEnableDisableMagnetismButton(preferences);
    if (enableDisableMagnetismButton !== null) {
      this.addButtonToToolBar(toolBar, enableDisableMagnetismButton);
    }
    let lockUnlockBasePlanButton = this.createLockUnlockBasePlanButton(home)
    if (lockUnlockBasePlanButton !== null) {
      this.addButtonToToolBar(toolBar, lockUnlockBasePlanButton);
    }
    this.addActionToToolBar(HomeView.ActionType.FLIP_HORIZONTALLY, toolBar);
    this.addActionToToolBar(HomeView.ActionType.FLIP_VERTICALLY, toolBar);
    this.addSeparator(toolBar);

    this.addActionToToolBar(HomeView.ActionType.INCREASE_TEXT_SIZE, toolBar);
    this.addActionToToolBar(HomeView.ActionType.DECREASE_TEXT_SIZE, toolBar);
    this.addToggleActionToToolBar(HomeView.ActionType.TOGGLE_BOLD_STYLE, toolBar);
    this.addToggleActionToToolBar(HomeView.ActionType.TOGGLE_ITALIC_STYLE, toolBar);
    this.addSeparator(toolBar);

    this.addActionToToolBar(HomeView.ActionType.ZOOM_IN, toolBar, "toolbar-optional");
    this.addActionToToolBar(HomeView.ActionType.ZOOM_OUT, toolBar, "toolbar-optional");
    this.addSeparator(toolBar);
    if (this.showApplicationMenuButton == null
      || !window.matchMedia("(hover: none), (pointer: coarse)").matches) {
      this.addActionToToolBar(HomeView.ActionType.ABOUT, toolBar);
      this.addSeparator(toolBar);
    }

    this.addActionToToolBar(HomeView.ActionType.PREFERENCES, toolBar);

    return toolBar;
  }

  /**
   * Creates contextual menus for components within this home pane.
   * @param {Home} home
   * @param {UserPreferences} preferences
   * @private
   */
  createPopupMenus(home, preferences) {
    let ActionType = HomeView.ActionType;
    let homePane = this;
    let controller = this.controller;

    if (this.showApplicationMenuButton == null
      || !window.matchMedia("(hover: none), (pointer: coarse)").matches) {
      // Catalog view popup menu
      let furnitureCatalogView = this.controller.getFurnitureCatalogController().getView();
      if (furnitureCatalogView != null) {
        this.furnitureCatalogPopupMenu = new JSPopupMenu(preferences, furnitureCatalogView.getHTMLElement(),
          ((builder) => {
            homePane.addActionToMenu(ActionType.ADD_HOME_FURNITURE, builder);
            homePane.addActionToMenu(ActionType.ADD_FURNITURE_TO_GROUP, builder);
          }));
      }

      let furnitureView = this.controller.getFurnitureController().getView();
      // Furniture view popup menu
      if (furnitureView != null) {
        this.furniturePopupMenu = new JSPopupMenu(preferences, furnitureView.getHTMLElement(),
          ((builder) => {
            homePane.addActionToMenu(ActionType.CUT, builder);
            homePane.addActionToMenu(ActionType.COPY, builder);
            homePane.addActionToMenu(ActionType.PASTE, builder);
            homePane.addActionToMenu(ActionType.PASTE_TO_GROUP, builder);
            homePane.addActionToMenu(ActionType.PASTE_STYLE, builder);
            builder.addSeparator();
            homePane.addActionToMenu(ActionType.MODIFY_FURNITURE, builder);
            homePane.addActionToMenu(ActionType.GROUP_FURNITURE, builder);
            homePane.addActionToMenu(ActionType.UNGROUP_FURNITURE, builder);
            homePane.createAlignOrDistributeMenu(builder);
            homePane.addActionToMenu(ActionType.RESET_FURNITURE_ELEVATION, builder);
            builder.addSeparator();
            homePane.createFurnitureSortMenu(home, builder);
            homePane.createFurnitureDisplayPropertyMenu(home, builder);
          }));
      }

      // Plan view popup menu
      let planView = this.controller.getPlanController().getView();
      if (planView != null) {
        this.planPopupMenu = new JSPopupMenu(preferences, planView.getHTMLElement(),
          ((builder) => {
            homePane.addActionToMenu(ActionType.UNDO, builder);
            homePane.addActionToMenu(ActionType.REDO, builder);
            builder.addSeparator();
            homePane.addActionToMenu(ActionType.DELETE_SELECTION, builder);
            homePane.addActionToMenu(ActionType.CUT, builder);
            homePane.addActionToMenu(ActionType.COPY, builder);
            homePane.addActionToMenu(ActionType.PASTE, builder);
            homePane.addActionToMenu(ActionType.PASTE_STYLE, builder);
            builder.addSeparator();
            homePane.addActionToMenu(ActionType.SELECT_ALL, builder);
            homePane.addActionToMenu(ActionType.SELECT_ALL_AT_ALL_LEVELS, builder);
            builder.addSeparator();
            homePane.addActionToMenu(ActionType.MODIFY_FURNITURE, builder);
            homePane.addActionToMenu(ActionType.GROUP_FURNITURE, builder);
            homePane.addActionToMenu(ActionType.UNGROUP_FURNITURE, builder);
            homePane.addActionToMenu(ActionType.RESET_FURNITURE_ELEVATION, builder);
            builder.addSeparator();
            homePane.addActionToMenu(ActionType.MODIFY_COMPASS, builder);
            homePane.addActionToMenu(ActionType.MODIFY_WALL, builder);
            homePane.addActionToMenu(ActionType.JOIN_WALLS, builder);
            homePane.addActionToMenu(ActionType.REVERSE_WALL_DIRECTION, builder);
            homePane.addActionToMenu(ActionType.SPLIT_WALL, builder);
            homePane.addActionToMenu(ActionType.MODIFY_ROOM, builder);
            homePane.addActionToMenu(ActionType.MODIFY_POLYLINE, builder);
            homePane.addActionToMenu(ActionType.MODIFY_DIMENSION_LINE, builder);
            homePane.addActionToMenu(ActionType.MODIFY_LABEL, builder);
            builder.addSeparator();
            builder.addSubMenu(homePane.getMenuAction(HomePane.MenuActionType.MODIFY_TEXT_STYLE), (builder) => {
              homePane.addActionToMenu(ActionType.INCREASE_TEXT_SIZE, builder);
              homePane.addActionToMenu(ActionType.DECREASE_TEXT_SIZE, builder);
              homePane.addActionToMenu(ActionType.TOGGLE_BOLD_STYLE, builder);
              homePane.addActionToMenu(ActionType.TOGGLE_ITALIC_STYLE, builder);
            });
            builder.addSeparator();
            homePane.addActionToMenu(ActionType.IMPORT_BACKGROUND_IMAGE, builder);
            homePane.addActionToMenu(ActionType.MODIFY_BACKGROUND_IMAGE, builder);
            homePane.addActionToMenu(ActionType.HIDE_BACKGROUND_IMAGE, builder);
            homePane.addActionToMenu(ActionType.SHOW_BACKGROUND_IMAGE, builder);
            homePane.addActionToMenu(ActionType.DELETE_BACKGROUND_IMAGE, builder);
            builder.addSeparator();
            homePane.addActionToMenu(ActionType.ADD_LEVEL, builder);
            homePane.addActionToMenu(ActionType.ADD_LEVEL_AT_SAME_ELEVATION, builder);
            homePane.addActionToMenu(ActionType.MODIFY_LEVEL, builder);
            homePane.addActionToMenu(ActionType.DELETE_LEVEL, builder);
          }));
      }

      // 3D view popup menu
      let view3D = this.controller.getHomeController3D().getView();
      if (view3D != null) {
        this.view3DPopupMenu = new JSPopupMenu(preferences, view3D.getHTMLElement(),
          ((builder) => {
            homePane.addActionToMenu(ActionType.VIEW_FROM_TOP, builder);
            homePane.addActionToMenu(ActionType.VIEW_FROM_OBSERVER, builder);
            homePane.addActionToMenu(ActionType.MODIFY_OBSERVER, builder);
            homePane.addActionToMenu(ActionType.STORE_POINT_OF_VIEW, builder);
            let storedCameras = home.getStoredCameras();
            if (storedCameras.length > 0) {
              let goToPointOfViewAction = homePane.getMenuAction(HomePane.MenuActionType.GO_TO_POINT_OF_VIEW);
              if (goToPointOfViewAction.getValue(AbstractAction.NAME) != null) {
                builder.addSubMenu(goToPointOfViewAction, (builder) => {
                  let cameraMenuItemBuilder = camera => {
                    builder.addMenuItem(camera.getName(),
                      () => {
                        controller.getHomeController3D().goToCamera(camera);
                      });
                  };
                  let storedCameras = home.getStoredCameras();
                  for (let i = 0; i < storedCameras.length; i++) {
                    cameraMenuItemBuilder(storedCameras[i]);
                  }
                });
              }
              homePane.addActionToMenu(ActionType.DELETE_POINTS_OF_VIEW, builder);
            }

            builder.addSeparator();
            homePane.addActionToMenu(ActionType.DISPLAY_ALL_LEVELS, builder);
            homePane.addActionToMenu(ActionType.DISPLAY_SELECTED_LEVEL, builder);
            homePane.addActionToMenu(ActionType.MODIFY_3D_ATTRIBUTES, builder);
          }));
      }
    } else {
      // Menu button popup menu
      new JSPopupMenu(preferences, this.showApplicationMenuButton,
        function (builder) {
          let toolBar = document.getElementById("home-pane-toolbar");
          this.toolBarDefaultChildren = Array.prototype.slice.call(toolBar.children);
          let fileButton = false;
          if (toolBar.classList.contains("new-home")) {
            homePane.addActionToMenu(HomeView.ActionType.NEW_HOME, builder);
            fileButton = true;
          }
          if (toolBar.classList.contains("open")) {
            homePane.addActionToMenu(HomeView.ActionType.OPEN, builder);
            fileButton = true;
          }
          if (toolBar.classList.contains("save")) {
            homePane.addActionToMenu(HomeView.ActionType.SAVE, builder);
            fileButton = true;
          }
          if (toolBar.classList.contains("save-as")) {
            homePane.addActionToMenu(HomeView.ActionType.SAVE_AS, builder);
            fileButton = true;
          }
          if (fileButton) {
            builder.addSeparator();
          }
          homePane.addActionToMenu(ActionType.DELETE_SELECTION, builder);
          homePane.addActionToMenu(ActionType.CUT, builder);
          homePane.addActionToMenu(ActionType.COPY, builder);
          homePane.addActionToMenu(ActionType.PASTE, builder);
          homePane.addActionToMenu(ActionType.PASTE_TO_GROUP, builder);
          homePane.addActionToMenu(ActionType.PASTE_STYLE, builder);
          builder.addSeparator();
          homePane.addActionToMenu(ActionType.SELECT_ALL, builder);
          homePane.addActionToMenu(ActionType.SELECT_ALL_AT_ALL_LEVELS, builder);
          builder.addSeparator();
          homePane.addActionToMenu(ActionType.ADD_HOME_FURNITURE, builder);
          homePane.addActionToMenu(ActionType.ADD_FURNITURE_TO_GROUP, builder);
          builder.addSeparator();
          homePane.addActionToMenu(ActionType.MODIFY_FURNITURE, builder);
          homePane.addActionToMenu(ActionType.GROUP_FURNITURE, builder);
          homePane.addActionToMenu(ActionType.UNGROUP_FURNITURE, builder);
          homePane.createAlignOrDistributeMenu(builder);
          homePane.addActionToMenu(ActionType.RESET_FURNITURE_ELEVATION, builder);
          let furnitureView = controller.getFurnitureController().getView();
          if (furnitureView != null
            && window.getComputedStyle(furnitureView.getHTMLElement())["display"] != "none") {
            homePane.createFurnitureSortMenu(home, builder);
            homePane.createFurnitureDisplayPropertyMenu(home, builder);
          }
          builder.addSeparator();
          homePane.addActionToMenu(ActionType.SELECT, builder);
          homePane.addActionToMenu(ActionType.CREATE_WALLS, builder);
          homePane.addActionToMenu(ActionType.CREATE_ROOMS, builder);
          homePane.addActionToMenu(ActionType.CREATE_POLYLINES, builder);
          homePane.addActionToMenu(ActionType.CREATE_DIMENSION_LINES, builder);
          homePane.addActionToMenu(ActionType.CREATE_LABELS, builder);
          builder.addSeparator();
          homePane.addActionToMenu(ActionType.MODIFY_COMPASS, builder);
          homePane.addActionToMenu(ActionType.MODIFY_WALL, builder);
          homePane.addActionToMenu(ActionType.JOIN_WALLS, builder);
          homePane.addActionToMenu(ActionType.REVERSE_WALL_DIRECTION, builder);
          homePane.addActionToMenu(ActionType.SPLIT_WALL, builder);
          homePane.addActionToMenu(ActionType.MODIFY_ROOM, builder);
          homePane.addActionToMenu(ActionType.MODIFY_POLYLINE, builder);
          homePane.addActionToMenu(ActionType.MODIFY_DIMENSION_LINE, builder);
          homePane.addActionToMenu(ActionType.MODIFY_LABEL, builder);
          builder.addSeparator();
          homePane.addActionToMenu(ActionType.IMPORT_BACKGROUND_IMAGE, builder);
          homePane.addActionToMenu(ActionType.MODIFY_BACKGROUND_IMAGE, builder);
          homePane.addActionToMenu(ActionType.HIDE_BACKGROUND_IMAGE, builder);
          homePane.addActionToMenu(ActionType.SHOW_BACKGROUND_IMAGE, builder);
          homePane.addActionToMenu(ActionType.DELETE_BACKGROUND_IMAGE, builder);
          builder.addSeparator();
          homePane.addActionToMenu(ActionType.ADD_LEVEL, builder);
          homePane.addActionToMenu(ActionType.ADD_LEVEL_AT_SAME_ELEVATION, builder);
          homePane.addActionToMenu(ActionType.MODIFY_LEVEL, builder);
          homePane.addActionToMenu(ActionType.DELETE_LEVEL, builder);
          builder.addSeparator();
          homePane.addActionToMenu(ActionType.MODIFY_OBSERVER, builder);
          homePane.addActionToMenu(ActionType.STORE_POINT_OF_VIEW, builder);
          let storedCameras = home.getStoredCameras();
          if (storedCameras.length > 0) {
            let goToPointOfViewAction = homePane.getMenuAction(HomePane.MenuActionType.GO_TO_POINT_OF_VIEW);
            if (goToPointOfViewAction.getValue(AbstractAction.NAME) != null) {
              builder.addSubMenu(goToPointOfViewAction,
                (builder) => {
                  let cameraMenuItemBuilder = camera => {
                    builder.addMenuItem(camera.getName(),
                      () => {
                        controller.getHomeController3D().goToCamera(camera);
                      });
                  };
                  let storedCameras = home.getStoredCameras();
                  for (let i = 0; i < storedCameras.length; i++) {
                    cameraMenuItemBuilder(storedCameras[i]);
                  }
                });
            }
            homePane.addActionToMenu(ActionType.DELETE_POINTS_OF_VIEW, builder);
          }

          builder.addSeparator();
          homePane.addActionToMenu(ActionType.DISPLAY_ALL_LEVELS, builder);
          homePane.addActionToMenu(ActionType.DISPLAY_SELECTED_LEVEL, builder);
          homePane.addActionToMenu(ActionType.MODIFY_3D_ATTRIBUTES, builder);
          builder.addSeparator();
          homePane.addActionToMenu(ActionType.ABOUT, builder);
        });
    }
  }

  /**
   * Initializes pane splitters.
   * @private
   */
  initSplitters() {
    let controller = this.controller;

    let furnitureCatalogView = controller.getFurnitureCatalogController().getView();
    let furnitureView = controller.getFurnitureController().getView();
    let planView = controller.getPlanController().getView();
    let view3D = controller.getHomeController3D().getView();

    let furniturePlanSplitterElement = document.getElementById("furniture-plan-splitter");
    let plan3DViewSplitterElement = document.getElementById("plan-3D-view-splitter");
    let catalogFurnitureSplitterElement = document.getElementById("catalog-furniture-splitter");

    this.furniturePlanSplitter = {
      element: furniturePlanSplitterElement,
      homePropertyName: HomePane.MAIN_PANE_DIVIDER_LOCATION_VISUAL_PROPERTY,
      firstGroupElement: document.getElementById("catalog-furniture-pane"),
      secondGroupElement: document.getElementById("plan-3D-view-pane"),
      isDisplayed: function () {
        return furniturePlanSplitterElement && furniturePlanSplitterElement.clientWidth > 0;
      },
      resizeListener: function (splitterPosition) {
        // Refresh 2D/3D plan views on resize
        planView.revalidate();
        view3D.revalidate();
      }
    };

    this.plan3DViewSplitter = {
      element: plan3DViewSplitterElement,
      homePropertyName: HomePane.PLAN_PANE_DIVIDER_LOCATION_VISUAL_PROPERTY,
      firstGroupElement: planView.getHTMLElement(),
      secondGroupElement: view3D.getHTMLElement(),
      isDisplayed: function () {
        return plan3DViewSplitterElement && plan3DViewSplitterElement.clientWidth > 0 && planView != null && view3D != null;
      },
      resizeListener: function (splitterPosition) {
        // Refresh 2D/3D plan views on resize
        planView.revalidate();
        view3D.revalidate();
      }
    };

    this.catalogFurnitureSplitter = {
      element: catalogFurnitureSplitterElement,
      homePropertyName: HomePane.CATALOG_PANE_DIVIDER_LOCATION_VISUAL_PROPERTY,
      firstGroupElement: furnitureCatalogView.getHTMLElement(),
      secondGroupElement: furnitureView.getHTMLElement(),
      isDisplayed: function () {
        return catalogFurnitureSplitterElement && catalogFurnitureSplitterElement.clientWidth > 0 && furnitureCatalogView != null && furnitureView != null;
      }
    };

    this.updateSplitters();

    // Dispatch a resize window event to configure HTML elements in split panes and their children
    let resizeEvent = window.document.createEvent('UIEvents');
    resizeEvent.initEvent('resize', true, true);
    window.dispatchEvent(resizeEvent);
  }

  /**
   * @private
   */
  updateSplitters() {
    let planView = this.controller.getPlanController().getView();
    let view3D = this.controller.getHomeController3D().getView();
    let furnitureCatalogView = this.controller.getFurnitureCatalogController().getView();
    // Plan 3D view splitter inverts its group depending on orientation
    if (furnitureCatalogView !== null
      && furnitureCatalogView.getHTMLElement().getBoundingClientRect().top > view3D.getHTMLElement().getBoundingClientRect().top + 10) {
      this.plan3DViewSplitter.firstGroupElement = view3D.getHTMLElement();
      this.plan3DViewSplitter.secondGroupElement = planView.getHTMLElement();
    } else {
      this.plan3DViewSplitter.firstGroupElement = planView.getHTMLElement();
      this.plan3DViewSplitter.secondGroupElement = view3D.getHTMLElement();
    }
    this.updateSplitter(this.plan3DViewSplitter);
    this.updateSplitter(this.furniturePlanSplitter);
    this.updateSplitter(this.catalogFurnitureSplitter);
  }

  /**
   * Updates the given pane splitter.
   * @param {{
   *   element: HTMLElement,
   *   homePropertyName: string,
   *   firstGroupElement: HTMLElement,
   *   secondGroupElement: HTMLElement,
   *   isDisplayed: function(): boolean,
   *   resizeListener?: function(splitterPosition: number)
   * }} splitter
   * @private
   */
  updateSplitter(splitter) {
    // Reset
    splitter.element.style.display = '';
    splitter.element.style.top = '';
    splitter.element.style.left = '';
    splitter.firstGroupElement.style.left = '';
    splitter.firstGroupElement.style.top = '';
    splitter.firstGroupElement.style.width = '';
    splitter.firstGroupElement.style.height = '';
    splitter.secondGroupElement.style.left = '';
    splitter.secondGroupElement.style.top = '';
    splitter.secondGroupElement.style.width = '';
    splitter.secondGroupElement.style.height = '';

    let displayed = splitter.isDisplayed();
    if (displayed) {
      splitter.element.style.display = 'block';
    } else {
      splitter.element.style.display = 'none';
    }

    if (splitter.mouseListener !== undefined
      && splitter.mouseListener.mousePressed) {
      splitter.element.removeEventListener("mousedown", splitter.mouseListener.mousePressed, true);
      splitter.element.removeEventListener("touchstart", splitter.mouseListener.mousePressed, true);
      window.removeEventListener("resize", splitter.mouseListener.windowResized);
      delete splitter.mouseListener;
    }

    splitter.element.classList.remove("horizontal");
    splitter.element.classList.remove("vertical");
    let horizontal = splitter.element.clientWidth > splitter.element.clientHeight;
    if (horizontal) {
      splitter.element.classList.add("horizontal");
    } else {
      splitter.element.classList.add("vertical");
    }

    let initialSplitterPosition = this.home.getNumericProperty(splitter.homePropertyName);
    let positionStyleProperty = horizontal ? "top" : "left";
    let dimensionStyleProperty = horizontal ? "height" : "width";
    let dimensionProperty = horizontal ? "clientHeight" : "clientWidth";
    let pointerPositionProperty = horizontal ? "clientY" : "clientX";
    let offsetParent = splitter.firstGroupElement.offsetParent;
    let offsetProperty = horizontal ? "offsetTop" : "offsetLeft";
    let offsetTopFirst = offsetParent == document.body
      ? splitter.firstGroupElement[offsetProperty] - offsetParent[offsetProperty]
      : 0;
    let homePane = this;

    const mouseListener = {
      getSplitterPosition: function (ev) {
        let pointerCoordinatesObject = ev.touches && ev.touches.length > 0
          ? ev.touches[0] : ev;
        return pointerCoordinatesObject[pointerPositionProperty] - offsetParent[offsetProperty];
      },
      setSplitterPosition: function (relativePosition) {
        // Prevent from moving splitter beyond limit (before first elements) 
        if (relativePosition < offsetTopFirst) {
          relativePosition = offsetTopFirst;
        }
        // Prevent from moving splitter beyond limit (farther than parents width or height) 
        if (relativePosition > offsetParent[dimensionProperty] - splitter.element[dimensionProperty]) {
          relativePosition = offsetParent[dimensionProperty] - splitter.element[dimensionProperty];
        }
        // Elements in first groups grow or shrink
        splitter.firstGroupElement.style[dimensionStyleProperty] = (relativePosition - offsetTopFirst) + "px";
        // Splitter moves to new mouse position
        splitter.element.style[positionStyleProperty] = relativePosition + "px";
        // Elements in second groups move & grow / shrink
        splitter.secondGroupElement.style[positionStyleProperty] = (relativePosition + splitter.element[dimensionProperty]) + "px";
        splitter.secondGroupElement.style[dimensionStyleProperty] = "calc(100% - " + (relativePosition + splitter.element[dimensionProperty]) + "px)";
      },
      mouseDragged: function (ev) {
        ev.stopImmediatePropagation();
        mouseListener.currentPosition = mouseListener.getSplitterPosition(ev);
        mouseListener.setSplitterPosition(mouseListener.currentPosition);
        if (splitter.resizeListener !== undefined) {
          splitter.resizeListener(mouseListener.currentPosition);
        }
      },
      mousePressed: function (ev) {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        mouseListener.currentPosition = mouseListener.getSplitterPosition(ev);
        splitter.element.classList.add("moving");
        window.addEventListener("mousemove", mouseListener.mouseDragged, true);
        window.addEventListener("touchmove", mouseListener.mouseDragged, true);
        window.addEventListener("mouseup", mouseListener.windowMouseReleased, true);
        window.addEventListener("touchend", mouseListener.windowMouseReleased, true);
      },
      windowMouseReleased: function (ev) {
        ev.stopImmediatePropagation();
        splitter.element.classList.remove("moving");
        window.removeEventListener("mousemove", mouseListener.mouseDragged, true);
        window.removeEventListener("touchmove", mouseListener.mouseDragged, true);
        window.removeEventListener("mouseup", mouseListener.windowMouseReleased, true);
        window.removeEventListener("touchend", mouseListener.windowMouseReleased, true);
        homePane.controller.setHomeProperty(splitter.homePropertyName, mouseListener.currentPosition == null ? null : mouseListener.currentPosition.toString());
        if (splitter.resizeListener !== undefined) {
          splitter.resizeListener(mouseListener.currentPosition);
        }
      },
      windowResized: function (ev) {
        let splitterPosition = window.getComputedStyle(splitter.element)[positionStyleProperty];
        if (splitterPosition == null) {
          splitterPosition = "0px";
        }
        splitterPosition = splitterPosition.substring(0, splitterPosition.length - 2);
        if (splitterPosition > offsetParent[dimensionProperty] - splitter.element[dimensionProperty]) {
          mouseListener.setSplitterPosition(offsetParent[dimensionProperty] - splitter.element[dimensionProperty]);
        }
      }
    };

    if (initialSplitterPosition != null) {
      if (displayed) {
        mouseListener.setSplitterPosition(initialSplitterPosition);
      }
      if (splitter.resizeListener !== undefined) {
        splitter.resizeListener(initialSplitterPosition);
      }
    }
    splitter.element.addEventListener("mousedown", mouseListener.mousePressed, true);
    splitter.element.addEventListener("touchstart", mouseListener.mousePressed, true);
    // Ensure splitter doesn't disappear after a window resize 
    window.addEventListener("resize", mouseListener.windowResized);
    splitter.mouseListener = mouseListener;
  }

  /**
   * @private
   */
  addOrientationChangeListener() {
    let homePane = this;
    let orientationListener = ev => {
      let planView = homePane.controller.getPlanController().getView();
      let view3D = homePane.controller.getHomeController3D().getView();
      if (planView != null && view3D != null) {
        let splitter = document.getElementById("plan-3D-view-splitter");
        splitter.removeAttribute("style");
        planView.getHTMLElement().removeAttribute("style");
        view3D.getHTMLElement().removeAttribute("style");
        planView.revalidate();
        view3D.revalidate();
      }
      setTimeout(() => {
        homePane.updateSplitters();
      }, 100);
    };
    this.resizeListener = ev => {
      if (window.matchMedia("(hover: none), (pointer: coarse)").matches) {
        orientationListener(ev);
      }
    };
    window.addEventListener("resize", this.resizeListener);
  }

  /** 
   * @private 
   */
  startToolBarButtonGroup(toolBar) {
    let buttonGroup = document.createElement("span");
    toolBar.appendChild(buttonGroup);
    buttonGroup.classList.add("toolbar-button-group");
  }

  /** 
   * @private 
   */
  addButtonToToolBar(toolBar, button) {
    if (toolBar.children.length === 0) {
      this.startToolBarButtonGroup(toolBar);
    }
    toolBar.children[toolBar.children.length - 1].appendChild(button);
  }

  /**
   * Adds to tool bar the button matching the given <code>actionType</code>
   * and returns <code>true</code> if it was added.
   * @param {HomeView.ActionType} actionType
   * @param {javax.swing.JToolBar} toolBar
   * @private
   */
  addToggleActionToToolBar(actionType, toolBar, additionalClass) {
    let action = this.getAction(actionType);
    if (action.getValue(AbstractAction.NAME) != null) {
      let button = this.createToolBarButton(action, additionalClass);
      if (action.getValue(AbstractAction.SELECTED_KEY)) {
        button.classList.add("selected");
      }
      action.addPropertyChangeListener((ev) => {
        if (ev.getPropertyName() == AbstractAction.SELECTED_KEY) {
          if (ev.getNewValue()) {
            button.classList.add("selected");
          } else {
            button.classList.remove("selected");
          }
        }
      });
      button.addEventListener("click", () => {
        let group = action.getValue(ResourceAction.TOGGLE_BUTTON_GROUP);
        action.putValue(AbstractAction.SELECTED_KEY, group ? true : !action.getValue(AbstractAction.SELECTED_KEY));
      });
      this.addButtonToToolBar(toolBar, button);
    }
  }

  /**
   * Adds to tool bar the button matching the given <code>actionType</code>.
   * @param {HomeView.ActionType} actionType
   * @param {Object} toolBar
   * @param {string} otherClass additional CSS class
   * @private
   */
  addActionToToolBar(actionType, toolBar, additionalClass) {
    let action = this.getAction(actionType);
    if (action.getValue(AbstractAction.NAME) != null) {
      this.addButtonToToolBar(toolBar, this.createToolBarButton(action, additionalClass));
    }
  }

  /**
   * Returns a button configured from the given <code>action</code>.
   * @param {HomeView.ResourceAction} action
   * @param {string} [additionalClass] additional CSS class
   * @return {HTMLButton} 
   * @private
   */
  createToolBarButton(action, additionalClass) {
    let button = document.createElement("button");
    button.id = "toolbar-button-" + action.getValue(ResourceAction.RESOURCE_PREFIX);
    button.disabled = !action.isEnabled();
    button.tabIndex = -1;
    // Modify action with a setAction method which is also invoked elsewhere 
    button.setAction = newAction => {
      button.action = newAction;
      let iconUrl = newAction.getURL(ResourceAction.TOOL_BAR_ICON);
      if (!iconUrl) {
        iconUrl = newAction.getURL(AbstractAction.SMALL_ICON);
      }
      button.style.backgroundImage = "url('" + iconUrl + "')";
      button.style.backgroundPosition = "center";
      button.style.backgroundRepeat = "no-repeat";
      let shortDescription = newAction.getValue(AbstractAction.SHORT_DESCRIPTION);
      if (shortDescription) {
        button.title = shortDescription;
      }
    };
    button.setAction(action);
    button.classList.add("toolbar-button");
    if (action.getValue(ResourceAction.TOGGLE_BUTTON_GROUP)) {
      button.classList.add("toggle");
    }
    button.action = action;
    button.addEventListener("click", function (ev) {
      this.action.actionPerformed(ev);
    });
    let listener = {
      propertyChange: function (ev) {
        if (ev.getPropertyName() == "enabled") {
          button.disabled = !ev.getNewValue();
        } else if (ev.getPropertyName() == AbstractAction.SHORT_DESCRIPTION) {
          button.title = ev.getNewValue();
        }
      }
    };
    action.addPropertyChangeListener(listener);
    if (additionalClass) {
      button.classList.add(additionalClass);
    }
    return button;
  }

  /**
   * @private
   */
  addSeparator(toolBar) {
    this.startToolBarButtonGroup(toolBar);
  }

  /**
   * Enables or disables the action matching <code>actionType</code>.
   * @param {HomeView.ActionType} actionType
   * @param {boolean} enabled
   */
  setEnabled(actionType, enabled) {
    let action = this.getAction(actionType);
    if (action != null) {
      action.setEnabled(enabled);
    }
  }

  /**
   * Enables or disables the action matching <code>actionType</code>.
   * @param {String} actionType
   * @param {boolean} enabled
   */
  setActionEnabled(actionType, enabled) {
    let action = this.getAction(actionType);
    if (action != null) {
      action.setEnabled(enabled);
    }
  }

  /**
   * Sets the <code>NAME</code> and <code>SHORT_DESCRIPTION</code> properties value
   * of undo and redo actions. If a parameter is null,
   * the properties will be reset to their initial values.
   * @param {string} undoText
   * @param {string} redoText
   */
  setUndoRedoName(undoText, redoText) {
    // Localize undo / redo prefix
    this.setNameAndShortDescription(HomeView.ActionType.UNDO,
      undoText != null ? undoText.replace(/^Undo/, this.preferences.getLocalizedString("AbstractUndoableEdit", "undo.textAndMnemonic")) : null);
    this.setNameAndShortDescription(HomeView.ActionType.REDO,
      redoText != null ? redoText.replace(/^Redo/, this.preferences.getLocalizedString("AbstractUndoableEdit", "redo.textAndMnemonic")) : null);
  }

  /**
   * Sets the <code>NAME</code> and <code>SHORT_DESCRIPTION</code> properties value
   * matching <code>actionType</code>. If <code>name</code> is null,
   * the properties will be reset to their initial values.
   * @param {HomeView.ActionType} actionType
   * @param {string} name
   * @private
   */
  setNameAndShortDescription(actionType, name) {
    let action = this.getAction(actionType);
    if (action != null) {
      if (name == null) {
        name = action.getValue(AbstractAction.DEFAULT);
      }
      action.putValue(AbstractAction.NAME, name);
      action.putValue(AbstractAction.SHORT_DESCRIPTION, name);
    }
  }

  /**
   * Enables or disables transfer between components.
   * @param {boolean} enabled
   */
  setTransferEnabled(enabled) {
    let furnitureCatalogView = this.controller.getFurnitureCatalogController().getView();
    if (enabled
      && !this.transferHandlerEnabled) {
      if (furnitureCatalogView != null) {
        if (this.furnitureCatalogDragAndDropListener == null) {
          this.furnitureCatalogDragAndDropListener = this.createFurnitureCatalogMouseListener();
        }

        var pieceContainers = furnitureCatalogView.getHTMLElement().querySelectorAll(".furniture");
        if (OperatingSystem.isInternetExplorerOrLegacyEdge()
          && window.PointerEvent) {
          // Multi touch support for IE and Edge
          for (let i = 0; i < pieceContainers.length; i++) {
            pieceContainers[i].addEventListener("pointerdown", this.furnitureCatalogDragAndDropListener.pointerPressed);
          }
          furnitureCatalogView.getHTMLElement().addEventListener("mousedown", this.furnitureCatalogDragAndDropListener.mousePressed);
          // Add pointermove and pointerup event listeners to window to capture pointer events out of the canvas 
          window.addEventListener("pointermove", this.furnitureCatalogDragAndDropListener.windowPointerMoved);
          window.addEventListener("pointerup", this.furnitureCatalogDragAndDropListener.windowPointerReleased);
        } else {
          for (let i = 0; i < pieceContainers.length; i++) {
            pieceContainers[i].addEventListener("touchstart", this.furnitureCatalogDragAndDropListener.mousePressed);
          }
          window.addEventListener("touchmove", this.furnitureCatalogDragAndDropListener.mouseDragged);
          window.addEventListener("touchend", this.furnitureCatalogDragAndDropListener.windowMouseReleased);
          furnitureCatalogView.getHTMLElement().addEventListener("mousedown", this.furnitureCatalogDragAndDropListener.mousePressed);
          window.addEventListener("mousemove", this.furnitureCatalogDragAndDropListener.mouseDragged);
          window.addEventListener("mouseup", this.furnitureCatalogDragAndDropListener.windowMouseReleased);
        }
        furnitureCatalogView.getHTMLElement().addEventListener("contextmenu", this.furnitureCatalogDragAndDropListener.contextMenuDisplayed);
      }
      let homePane = this;
      this.furnitureCatalogListener = ev => {
        if (ev.getType() === CollectionEvent.Type.ADD
          && !homePane.furnitureCatalogListener.updater) {
          // Add listeners later in case more than one piece was added 
          homePane.furnitureCatalogListener.updater = () => {
            if (homePane.furnitureCatalogListener !== undefined) {
              let pieceContainers = furnitureCatalogView.getHTMLElement().querySelectorAll(".furniture");
              if (OperatingSystem.isInternetExplorerOrLegacyEdge()
                && window.PointerEvent) {
                for (let i = 0; i < pieceContainers.length; i++) {
                  pieceContainers[i].addEventListener("pointerdown", homePane.furnitureCatalogDragAndDropListener.pointerPressed);
                }
              } else {
                for (let i = 0; i < pieceContainers.length; i++) {
                  pieceContainers[i].addEventListener("touchstart", homePane.furnitureCatalogDragAndDropListener.mousePressed);
                }
              }
              delete homePane.furnitureCatalogListener.updater;
            }
          };
          setTimeout(homePane.furnitureCatalogListener.updater, 100);
        }
      };
      this.preferences.getFurnitureCatalog().addFurnitureListener(this.furnitureCatalogListener);
    } else if (!enabled
      && this.transferHandlerEnabled) {
      if (furnitureCatalogView != null) {
        var pieceContainers = furnitureCatalogView.getHTMLElement().querySelectorAll(".furniture");
        if (OperatingSystem.isInternetExplorerOrLegacyEdge()
          && window.PointerEvent) {
          for (let i = 0; i < pieceContainers.length; i++) {
            pieceContainers[i].removeEventListener("pointerdown", this.furnitureCatalogDragAndDropListener.pointerPressed);
          }
          furnitureCatalogView.getHTMLElement().removeEventListener("mousedown", this.furnitureCatalogDragAndDropListener.mousePressed);
          // Add pointermove and pointerup event listeners to window to capture pointer events out of the canvas 
          window.removeEventListener("pointermove", this.furnitureCatalogDragAndDropListener.windowPointerMoved);
          window.removeEventListener("pointerup", this.furnitureCatalogDragAndDropListener.windowPointerReleased);
        } else {
          for (let i = 0; i < pieceContainers.length; i++) {
            pieceContainers[i].removeEventListener("touchstart", this.furnitureCatalogDragAndDropListener.mousePressed);
          }
          window.removeEventListener("touchmove", this.furnitureCatalogDragAndDropListener.mouseDragged);
          window.removeEventListener("touchend", this.furnitureCatalogDragAndDropListener.windowMouseReleased);
          furnitureCatalogView.getHTMLElement().removeEventListener("mousedown", this.furnitureCatalogDragAndDropListener.mousePressed);
          window.removeEventListener("mousemove", this.furnitureCatalogDragAndDropListener.mouseDragged);
          window.removeEventListener("mouseup", this.furnitureCatalogDragAndDropListener.windowMouseReleased);
        }
        furnitureCatalogView.getHTMLElement().removeEventListener("contextmenu", this.furnitureCatalogDragAndDropListener.contextMenuDisplayed);
      }
      this.preferences.getFurnitureCatalog().removeFurnitureListener(this.furnitureCatalogListener);
      delete this.furnitureCatalogListener;
    }
    this.transferHandlerEnabled = enabled;
  }

  /**
   * Returns a mouse listener for catalog that acts as catalog view, furniture view and plan transfer handlers
   * for drag and drop operations.
   * @return {javax.swing.event.MouseInputAdapter}
   * @private
   */
  createFurnitureCatalogMouseListener() {
    let homePane = this;
    const mouseListener = {
      selectedPiece: null,
      previousCursor: null,
      previousView: null,
      escaped: false,
      draggedImage: null,
      pointerTouches: {},
      actionStartedInFurnitureCatalog: false,
      contextMenuEventType: false,
      mousePressed: function (ev) {
        if (!mouseListener.contextMenuEventType
          && (ev.button === 0 || ev.targetTouches)) {
          if (!ev.target.classList.contains("selected")) {
            return;
          }
          ev.preventDefault();
          ev.stopPropagation();
          let selectedFurniture = homePane.controller.getFurnitureCatalogController().getSelectedFurniture();
          if (selectedFurniture.length > 0) {
            mouseListener.selectedPiece = selectedFurniture[0];
            mouseListener.previousCursor = null;
            mouseListener.previousView = null;
            mouseListener.escaped = false;

            homePane.inputMap["ESCAPE"] = "EscapeDragFromFurnitureCatalog";
          }
          mouseListener.actionStartedInFurnitureCatalog = true;
        }
      },
      mouseDragged: function (ev) {
        if (!mouseListener.contextMenuEventType
          && mouseListener.actionStartedInFurnitureCatalog
          && ((ev.buttons & 1) == 1 || ev.targetTouches)
          && mouseListener.selectedPiece != null) {
          ev.preventDefault();
          ev.stopPropagation();

          if (!mouseListener.escaped) {
            if (mouseListener.draggedImage == null) {
              let img = document.createElement("img");
              let originalIcon = homePane.controller.getFurnitureCatalogController().getView().getHTMLElement().querySelector(".furniture.selected .furniture-icon");
              img.src = originalIcon.src;
              let style = window.getComputedStyle(originalIcon);
              img.style.width = style.width;
              img.style.height = style.height;
              img.style.position = "absolute";
              img.style.opacity = 0.6;
              img.style.zIndex = 105;
              mouseListener.draggedImage = img;
              document.body.appendChild(img);
            }
            mouseListener.draggedImage.style.left = mouseListener.getCoordinates(ev).clientX + "px";
            mouseListener.draggedImage.style.top = mouseListener.getCoordinates(ev).clientY + "px";
          }

          let selectedLevel = homePane.home.getSelectedLevel();
          if (selectedLevel == null || selectedLevel.isViewable()) {
            let transferredFurniture = [homePane.controller.getFurnitureController().createHomePieceOfFurniture(mouseListener.selectedPiece)];
            let view;
            let pointInView = mouseListener.getPointInPlanView(ev, transferredFurniture);
            if (pointInView != null) {
              view = homePane.controller.getPlanController().getView();
            } else {
              view = homePane.controller.getFurnitureController().getView();
              pointInView = mouseListener.getPointInFurnitureView(ev);
            }

            if (mouseListener.previousView !== view) {
              if (mouseListener.previousView != null) {
                if (mouseListener.previousView === homePane.controller.getPlanController().getView()
                  && !mouseListener.escaped) {
                  homePane.controller.getPlanController().stopDraggedItems();
                }
                var component = mouseListener.previousView;
                if (component && typeof component.setCursor === "function") {
                  component.setCursor(mouseListener.previousCursor);
                }
                mouseListener.previousCursor = null;
                mouseListener.previousView = null;
              }
              if (view != null) {
                var component = view;
                mouseListener.previousCursor = "default";
                mouseListener.previousView = view;
                if (!mouseListener.escaped) {
                  if (typeof component.setCursor === "function") {
                    component.setCursor("copy");
                  }
                  if (view === homePane.controller.getPlanController().getView()) {
                    homePane.controller.getPlanController().startDraggedItems(transferredFurniture, pointInView[0], pointInView[1]);
                  }
                }
              }
            } else if (pointInView != null) {
              homePane.controller.getPlanController().moveMouse(pointInView[0], pointInView[1]);
            }
          }
        }
      },
      getPointInPlanView: function (ev, transferredFurniture) {
        let planView = homePane.controller.getPlanController().getView();
        if (planView != null) {
          let rect = planView.getHTMLElement().getBoundingClientRect();
          let coords = mouseListener.getCoordinates(ev);
          if (coords.clientX >= rect.left
            && coords.clientX < rect.left + rect.width
            && coords.clientY >= rect.top
            && coords.clientY < rect.top + rect.height) {
            return [planView.convertXPixelToModel(coords.clientX - rect.left), planView.convertYPixelToModel(coords.clientY - rect.top)];
          }
        }
        return null;
      },
      getPointInView3D: function (ev) {
        let view3D = homePane.controller.getHomeController3D().getView();
        if (view3D != null) {
          let rect = view3D.getHTMLElement().getBoundingClientRect();
          let coords = mouseListener.getCoordinates(ev);
          if (coords.clientX >= rect.left
            && coords.clientX < rect.left + rect.width
            && coords.clientY >= rect.top
            && coords.clientY < rect.top + rect.height) {
            return [coords.clientX - rect.left, coords.clientY - rect.top];
          }
        }
        return null;
      },
      getCoordinates: function (ev) {
        if (ev.targetTouches) {
          if (ev.targetTouches.length === 1) {
            return { clientX: ev.targetTouches[0].clientX, clientY: ev.targetTouches[0].clientY };
          } else if (ev.targetTouches.length === 0 && ev.changedTouches.length === 1) {
            return { clientX: ev.changedTouches[0].clientX, clientY: ev.changedTouches[0].clientY };
          }
        }
        return ev;
      },
      getPointInFurnitureView: function (ev) {
        let furnitureView = homePane.controller.getFurnitureController().getView();
        if (furnitureView != null) {
          let rect = furnitureView.getHTMLElement().getBoundingClientRect();
          let coords = mouseListener.getCoordinates(ev);
          if (coords.clientX >= rect.left && coords.clientX < rect.left + rect.width
            && coords.clientY >= rect.top && coords.clientY < rect.top + rect.height) {
            return [0, 0];
          }
        }
        return null;
      },
      contextMenuDisplayed: function (ev) {
        mouseListener.contextMenuEventType = true;
      },
      windowMouseReleased: function (ev) {
        if (mouseListener.actionStartedInFurnitureCatalog) {
          if (mouseListener.draggedImage != null) {
            document.body.removeChild(mouseListener.draggedImage);
            mouseListener.draggedImage = null;
          }
          if (!mouseListener.contextMenuEventType) {
            if ((ev.button === 0 || ev.targetTouches) && mouseListener.selectedPiece != null) {
              ev.preventDefault();
              if (!mouseListener.escaped) {
                let selectedLevel = homePane.home.getSelectedLevel();
                if (selectedLevel == null || selectedLevel.isViewable()) {
                  let transferredFurniture = [homePane.controller.getFurnitureController().createHomePieceOfFurniture(mouseListener.selectedPiece)];
                  var view;
                  let pointInView = mouseListener.getPointInPlanView(ev, transferredFurniture);
                  if (pointInView != null) {
                    homePane.controller.getPlanController().stopDraggedItems();
                    view = homePane.controller.getPlanController().getView();
                    homePane.controller.drop(transferredFurniture, view, pointInView[0], pointInView[1]);
                    var view = mouseListener.previousView;
                    if (view && typeof view.setCursor === "function") {
                      view.setCursor(this.previousCursor);
                    }
                  } else if (homePane.preferences.isEditingIn3DViewEnabled()) {
                    let pointInView3D = mouseListener.getPointInView3D(ev);
                    if (pointInView3D !== null) {
                      view = homePane.controller.getHomeController3D().getView();
                      let dropLevel = homePane.getDropModelLevel(view, pointInView3D);
                      let dropLocation = homePane.getDropModelLocation(view, transferredFurniture, dropLevel, pointInView3D);
                      homePane.controller.drop(transferredFurniture, view, dropLevel,
                        dropLocation[0], dropLocation[1], dropLocation.length === 3 ? dropLocation[2] : null);
                    }
                  }
                }
              }
            }
          }
        }
        mouseListener.selectedPiece = null;
        mouseListener.actionStartedInFurnitureCatalog = false;
        mouseListener.contextMenuEventType = false;
        delete homePane.inputMap["ESCAPE"];
      },
      pointerPressed: function (ev) {
        if (ev.pointerType != "mouse") {
          // Multi touch support for IE and Edge
          mouseListener.copyPointerToTargetTouches(ev);
          return; // Don't support drag and drop from catalog on touch screens under IE/Edge
        }
        mouseListener.mousePressed(ev);
      },
      windowPointerMoved: function (ev) {
        if (ev.pointerType != "mouse") {
          // Multi touch support for IE and Edge
          mouseListener.copyPointerToTargetTouches(ev);
          return; // Don't support drag and drop from catalog on touch screens under IE/Edge
        }
        mouseListener.mouseDragged(ev);
      },
      windowPointerReleased: function (ev) {
        if (ev.pointerType != "mouse") {
          delete mouseListener.pointerTouches[ev.pointerId];
          return; // Don't support drag and drop from catalog on touch screens under IE/Edge
        }
        mouseListener.windowMouseReleased(ev);
      },
      copyPointerToTargetTouches: function (ev) {
        // Copy the IE and Edge pointer location to ev.targetTouches
        mouseListener.pointerTouches[ev.pointerId] = { clientX: ev.clientX, clientY: ev.clientY };
        ev.targetTouches = [];
        for (let attribute in mouseListener.pointerTouches) {
          if (mouseListener.pointerTouches.hasOwnProperty(attribute)) {
            ev.targetTouches.push(mouseListener.pointerTouches[attribute]);
          }
        }
      }
    };

    let escapeAction = {
      actionPerformed: function () {
        if (!mouseListener.escaped) {
          if (mouseListener.previousView != null) {
            if (mouseListener.previousView === homePane.controller.getPlanController().getView()) {
              homePane.controller.getPlanController().stopDraggedItems();
            }
            if (mouseListener.previousCursor != null && typeof mouseListener.previousView.setCursor === "function") {
              mouseListener.previousView.setCursor(mouseListener.previousCursor);
            }
          }
          mouseListener.escaped = true;
          if (mouseListener.draggedImage != null) {
            document.body.removeChild(mouseListener.draggedImage);
            mouseListener.draggedImage = null;
          }
        }
      }
    };
    this.getActionMap()["EscapeDragFromFurnitureCatalog"] = escapeAction;

    return mouseListener;
  }

  /**
   * Returns the level where drop location should occur.
   * @private
   */
  getDropModelLevel(destination, dropLocation) {
    if (destination instanceof HomeComponent3D) {
      let view3D = destination;
      let closestItem = view3D.getClosestSelectableItemAt(dropLocation[0], dropLocation[1]);
      let selectedLevel = this.home.getSelectedLevel();
      if (closestItem != null
        && typeof closestItem.isAtLevel === "function" // closestItem instanceof Elevatable
        && !closestItem.isAtLevel(selectedLevel)) {
        return closestItem.getLevel();
      }
    }
    return this.home.getSelectedLevel();
  }

  /**
   * Returns the drop location converted in model coordinates space.
   * @private
   */
  getDropModelLocation(destination, transferedItems, dropLevel, dropLocation) {
    let floorLocation = [0, 0, 0];
    if (destination instanceof HomeComponent3D) {
      let view3D = destination;
      let closestItem = view3D.getClosestSelectableItemAt(dropLocation[0], dropLocation[1]);
      let floorElevation = 0;
      if (dropLevel != null) {
        floorElevation = dropLevel.getElevation();
      }
      if (closestItem instanceof HomePieceOfFurniture) {
        floorLocation = [closestItem.getX(), closestItem.getY()];
        if (transferedItems.length === 1
          && transferedItems[0] instanceof HomePieceOfFurniture) {
          var pointOnFloor = view3D.getVirtualWorldPointAt(dropLocation[0], dropLocation[1], floorElevation);
          let intersectionWithPieceMiddle = this.computeIntersection(pointOnFloor[0], pointOnFloor[1], this.home.getCamera().getX(), this.home.getCamera().getY(),
            floorLocation[0], floorLocation[1], floorLocation[0] + Math.cos(closestItem.getAngle()), floorLocation[1] + Math.sin(closestItem.getAngle()));
          if (java.awt.geom.Point2D.distance(intersectionWithPieceMiddle[0], intersectionWithPieceMiddle[1], closestItem.getX(), closestItem.getY()) < closestItem.getWidth() / 2) {
            floorLocation = intersectionWithPieceMiddle;
          }
          var transferedPiece = transferedItems[0];
          floorLocation[0] -= transferedPiece.getWidth() / 2;
          floorLocation[1] -= transferedPiece.getDepth() / 2;
          var elevation;
          if (closestItem instanceof HomeShelfUnit) {
            let camera = this.home.getCamera();
            let distancePointOnFloorToCamera = java.awt.geom.Point2D.distance(pointOnFloor[0], pointOnFloor[1], camera.getX(), camera.getY());
            let distancePointOnFloorToLocation = java.awt.geom.Point2D.distance(pointOnFloor[0], pointOnFloor[1], floorLocation[0], floorLocation[1]);
            var elevation = (camera.getZ() - (this.home.getSelectedLevel() !== null ? this.home.getSelectedLevel().getElevation() : 0))
              / distancePointOnFloorToCamera * distancePointOnFloorToLocation;
          } else if (closestItem.isHorizontallyRotated()) {
            elevation = closestItem.getElevation() + closestItem.getHeightInPlan();
          } else if (closestItem.getDropOnTopElevation() >= 0) {
            elevation = closestItem.getElevation() + closestItem.getHeight() * closestItem.getDropOnTopElevation();
          } else {
            elevation = 0;
          }
          floorLocation = [floorLocation[0], floorLocation[1], elevation];
        }
      } else if (closestItem instanceof Wall
        && closestItem.getArcExtent() === null
        && transferedItems.length === 1) {
        var pointOnFloor = view3D.getVirtualWorldPointAt(dropLocation[0], dropLocation[1], floorElevation);
        // Compute intersection between camera - pointOnFloor line and left/right sides of the wall
        let wall = closestItem;
        let wallPoints = wall.getPoints();
        let leftSideIntersection = this.computeIntersection(pointOnFloor[0], pointOnFloor[1], this.home.getCamera().getX(), this.home.getCamera().getY(),
          wallPoints[0][0], wallPoints[0][1], wallPoints[1][0], wallPoints[1][1]);
        let rightSideIntersection = this.computeIntersection(pointOnFloor[0], pointOnFloor[1], this.home.getCamera().getX(), this.home.getCamera().getY(),
          wallPoints[3][0], wallPoints[3][1], wallPoints[2][0], wallPoints[2][1]);
        if (java.awt.geom.Point2D.distanceSq(this.home.getCamera().getX(), this.home.getCamera().getY(), leftSideIntersection[0], leftSideIntersection[1])
          < java.awt.geom.Point2D.distanceSq(this.home.getCamera().getX(), this.home.getCamera().getY(), rightSideIntersection[0], rightSideIntersection[1])) {
          floorLocation = leftSideIntersection;
        } else {
          floorLocation = rightSideIntersection;
        }
        if (transferedItems[0] instanceof HomePieceOfFurniture) {
          var transferedPiece = transferedItems[0];
          let wallYawAngle = Math.atan((wall.getYEnd() - wall.getYStart()) / (wall.getXEnd() - wall.getXStart()));
          floorLocation[0] -= transferedPiece.getWidth() / 2 * Math.cos(wallYawAngle);
          floorLocation[1] -= transferedPiece.getWidth() / 2 * Math.sin(wallYawAngle);
        }
      } else if (!this.home.isEmpty()) {
        floorLocation = view3D.getVirtualWorldPointAt(dropLocation[0], dropLocation[1], floorElevation);
        floorLocation = [floorLocation[0], floorLocation[1]];
        if (transferedItems.length === 1
          && transferedItems[0] instanceof HomePieceOfFurniture) {
          var transferedPiece = transferedItems[0];
          floorLocation[0] -= transferedPiece.getWidth() / 2;
          floorLocation[1] -= transferedPiece.getDepth() / 2;
        }
      }
    }
    return floorLocation;
  }

  /**
   * Returns the intersection point between the line joining the first two points and
   * the line joining the two last points.
   * @private
   */
  computeIntersection(xPoint1, yPoint1, xPoint2, yPoint2, xPoint3, yPoint3, xPoint4, yPoint4) {
    let x = xPoint2;
    let y = yPoint2;
    let alpha1 = (yPoint2 - yPoint1) / (xPoint2 - xPoint1);
    let alpha2 = (yPoint4 - yPoint3) / (xPoint4 - xPoint3);
    // If the two lines are not parallel
    if (alpha1 !== alpha2) {
      // If first line is vertical
      if (Math.abs(alpha1) > 4000) {
        if (Math.abs(alpha2) < 4000) {
          x = xPoint1;
          var beta2 = yPoint4 - alpha2 * xPoint4;
          y = alpha2 * x + beta2;
        }
        // If second line is vertical
      } else if (Math.abs(alpha2) > 4000) {
        if (Math.abs(alpha1) < 4000) {
          x = xPoint3;
          var beta1 = yPoint2 - alpha1 * xPoint2;
          y = alpha1 * x + beta1;
        }
      } else {
        let sameSignum = alpha1 > 0 && alpha2 > 0 || alpha1 < 0 && alpha2 < 0;
        if (Math.abs(alpha1 - alpha2) > 1E-5
          && (!sameSignum || (Math.abs(alpha1) > Math.abs(alpha2) ? alpha1 / alpha2 : alpha2 / alpha1) > 1.004)) {
          var beta1 = yPoint2 - alpha1 * xPoint2;
          var beta2 = yPoint4 - alpha2 * xPoint4;
          x = (beta2 - beta1) / (alpha1 - alpha2);
          y = alpha1 * x + beta1;
        }
      }
    }
    return [x, y];
  }

  /**
   * Detaches the given <code>view</code> from home view.
   * @param {Object} view
   * @ignore
   */
  detachView(view) {
  }

  /**
   * Attaches the given <code>view</code> to home view.
   * @param {Object} view
   * @ignore
   */
  attachView(view) {
  }

  /**
   * Displays a content chooser open dialog to choose the name of a home.
   * @return {string}
   * @ignore
   */
  showOpenDialog() {
  }

  /**
   * Displays a dialog to let the user choose a home example.
   * @return {string}
   * @ignore
   */
  showNewHomeFromExampleDialog() {
  }

  /**
   * Displays a dialog that lets user choose what he wants to do with a damaged home he tries to open it.
   * @return {HomeView.OpenDamagedHomeAnswer} {@link com.eteks.sweethome3d.viewcontroller.HomeView.OpenDamagedHomeAnswer#REMOVE_DAMAGED_ITEMS}
   * if the user chose to remove damaged items,
   * {@link com.eteks.sweethome3d.viewcontroller.HomeView.OpenDamagedHomeAnswer#REPLACE_DAMAGED_ITEMS}
   * if he doesn't want to replace damaged items by red images and red boxes,
   * or {@link com.eteks.sweethome3d.viewcontroller.HomeView.OpenDamagedHomeAnswer#DO_NOT_OPEN_HOME}
   * if he doesn't want to open damaged home.
   * @param {string} homeName
   * @param {Home} damagedHome
   * @param {Object[]} invalidContent
   * @ignore
   */
  confirmOpenDamagedHome(homeName, damagedHome, invalidContent) {
    return true;
  }

  /**
   * Displays a content chooser open dialog to choose a language library.
   * @return {string}
   * @ignore
   */
  showImportLanguageLibraryDialog() {
  }

  /**
   * Displays a dialog that lets user choose whether he wants to overwrite
   * an existing language library or not.
   * @param {string} languageLibraryName
   * @return {boolean}
   * @ignore
   */
  confirmReplaceLanguageLibrary(languageLibraryName) {
    return true;
  }

  /**
   * Displays a content chooser open dialog to choose a furniture library.
   * @return {string}
   * @ignore
   */
  showImportFurnitureLibraryDialog() {
  }

  /**
   * Displays a dialog that lets user choose whether he wants to overwrite
   * an existing furniture library or not.
   * @param {string} furnitureLibraryName
   * @return {boolean}
   * @ignore
   */
  confirmReplaceFurnitureLibrary(furnitureLibraryName) {
    return true;
  }

  /**
   * Displays a content chooser open dialog to choose a textures library.
   * @return {string}
   * @ignore
   */
  showImportTexturesLibraryDialog() {
  }

  /**
   * Displays a dialog that lets user choose whether he wants to overwrite
   * an existing textures library or not.
   * @param {string} texturesLibraryName
   * @return {boolean}
   * @ignore
   */
  confirmReplaceTexturesLibrary(texturesLibraryName) {
    return true;
  }

  /**
   * Displays a dialog that lets user choose whether he wants to overwrite
   * an existing plug-in or not.
   * @param {string} pluginName
   * @return {boolean}
   * @ignore
   */
  confirmReplacePlugin(pluginName) {
    return true;
  }

  /**
   * Displays a content chooser save dialog to choose the name of a home.
   * @param {string} homeName
   * @return {string}
   * @ignore
   */
  showSaveDialog(homeName) {
    return null;
  }

  /**
   * Displays <code>message</code> in an error message box.
   * @param {string} message
   * @ignore
   */
  showError(message) {
    alert(message.indexOf("<html>") < 0 ? message : message.replace(/\<\/?\w+(\s+\w+\=[\"\'][^\"\']+[\"\'])*\>/g, " ").replace(/\s+/g, " "));
  }

  /**
   * Displays <code>message</code> in a message box.
   * @param {string} message
   * @ignore
   */
  showMessage(message) {
    alert(message.indexOf("<html>") < 0 ? message : message.replace(/\<\/?\w+(\s+\w+\=[\"\'][^\"\']+[\"\'])*\>/g, " ").replace(/\s+/g, " "));
  }

  /**
   * Displays the tip matching <code>actionTipKey</code> and
   * returns <code>true</code> if the user chose not to display again the tip.
   * @param {string} actionTipKey
   * @return {boolean}
   * @ignore
   */
  showActionTipMessage(actionTipKey) {
    return false;
  }

  /**
   * Displays a dialog that lets user choose whether he wants to save
   * the current home or not.
   * @return {@link com.eteks.sweethome3d.viewcontroller.HomeView.SaveAnswer#CANCEL}
   * @param {string} homeName
   * @param {function} saveHome callback with a boolean parameter equal to true if the user confirmed to save
   * @ignore 
   */
  confirmSave(homeName, saveHome) {
    let message;
    if (homeName != null) {
      message = this.preferences.getLocalizedString("HomePane", "confirmSave.message", '"' + homeName + '"');
    } else {
      message = this.preferences.getLocalizedString("HomePane", "confirmSave.message", " ");
    }

    let confirmSavingDialog = new JSDialog(this.preferences,
      this.preferences.getLocalizedString("HomePane", "confirmSave.title"),
      message.replace(/\<br\>/, " ") + "</font>",
      {
        size: "small",
        applier: function () {
          saveHome(true);
        }
      });
    confirmSavingDialog.findElement(".dialog-ok-button").innerHTML =
      this.preferences.getLocalizedString("HomePane", "confirmSave.save");
    let cancelButton = confirmSavingDialog.findElement(".dialog-cancel-button");
    cancelButton.innerHTML = this.preferences.getLocalizedString("HomePane", "confirmSave.cancel");
    let doNotSaveButton = document.createElement("button");
    doNotSaveButton.innerHTML = this.preferences.getLocalizedString("HomePane", "confirmSave.doNotSave");
    confirmSavingDialog.registerEventListener(doNotSaveButton, "click", () => {
      confirmSavingDialog.close();
      saveHome(false);
    });
    cancelButton.parentElement.insertBefore(doNotSaveButton, cancelButton);
    confirmSavingDialog.displayView();
    return HomeView.SaveAnswer.CANCEL;
  }

  /**
   * Displays a dialog that let user choose whether he wants to save
   * a home that was created with a newer version of Sweet Home 3D.
   * @return {boolean} <code>true</code> if user confirmed to save.
   * @param {string} homeName
   * @ignore
   */
  confirmSaveNewerHome(homeName) {
    return true;
  }

  /**
   * Displays a dialog that let user choose whether he wants to exit
   * application or not.
   * @return {boolean} <code>true</code> if user confirmed to exit.
   * @ignore
   */
  confirmExit() {
    return true;
  }

  /**
   * Displays an about dialog.
   */
  showAboutDialog() {
    let message = this.preferences.getLocalizedString("HomePane", "about.message", this.controller.getVersion());
    let template = "<table><tr><td><img src='" + ZIPTools.getScriptFolder() + this.preferences.getLocalizedString("HomePane", "about.icon") + "'></td>"
      + "<td>" + message + "</td></tr></table>";
    let aboutDialog = new JSDialog(this.preferences,
      this.preferences.getLocalizedString("HomePane", "about.title"),
      template, { size: "medium" });
    aboutDialog.getHTMLElement().classList.add("about-dialog");
    aboutDialog.displayView();
  }

  /**
   * Displays the given message and returns <code>false</code> if the user
   * doesn't want to be informed of the shown updates anymore.
   * @param {string} updatesMessage the message to display
   * @param {boolean} showOnlyMessage if <code>false</code> a check box proposing not to display
   * again shown updates will be shown.
   * @return {boolean}
   * @ignore
   */
  showUpdatesMessage(updatesMessage, showOnlyMessage) {
    return false;
  }

  /**
   * Shows a print dialog to print the home displayed by this pane.
   * @return {function(): Object} a print task to execute or <code>null</code> if the user canceled print.
   * The <code>call</code> method of the returned task may throw a
   * {@link RecorderException} exception if print failed
   * or an {@link InterruptedRecorderException}
   * exception if it was interrupted.
   * @ignore
   */
  showPrintDialog() {
    return null;
  }

  /**
   * Shows a content chooser save dialog to print a home in a PDF file.
   * @param {string} homeName
   * @return {string}
   * @ignore
   */
  showPrintToPDFDialog(homeName) {
    return null;
  }

  /**
   * Prints a home to a given PDF file. This method may be overridden
   * to write to another kind of output stream.
   * @param {string} pdfFile
   * @ignore
   */
  printToPDF(pdfFile) {
  }

  /**
   * Shows a content chooser save dialog to export furniture list in a CSV file.
   * @param {string} homeName
   * @return {string}
   * @ignore
   */
  showExportToCSVDialog(homeName) {
    return null;
  }

  /**
   * Exports furniture list to a given CSV file.
   * @param {string} csvFile
   * @ignore
   */
  exportToCSV(csvFile) {
  }

  /**
   * Shows a content chooser save dialog to export a home plan in a SVG file.
   * @param {string} homeName
   * @return {string}
   * @ignore
   */
  showExportToSVGDialog(homeName) {
    return null;
  }

  /**
   * Exports the plan objects to a given SVG file.
   * @param {string} svgFile
   * @ignore
   */
  exportToSVG(svgFile) {
  }

  /**
   * Shows a content chooser save dialog to export a 3D home in a OBJ file.
   * @param {string} homeName
   * @return {string}
   * @ignore
   */
  showExportToOBJDialog(homeName) {
    return null;
  }

  /**
   * Exports to an OBJ file the objects of the 3D view created with the given factory.
   * @param {string} objFile
   * @param {Object} object3dFactory
   * @ignore
   */
  exportToOBJ(objFile, object3dFactory) {
  }

  /**
   * Displays a dialog that let user choose whether he wants to delete
   * the selected furniture from catalog or not.
   * @return {boolean} <code>true</code> if user confirmed to delete.
   * @ignore
   */
  confirmDeleteCatalogSelection() {
    return true;
  }

  /**
   * Displays a dialog that lets the user choose a name for the current camera.
   * @return {null} the chosen name or <code>null</code> if the user canceled.
   * @param {string} cameraName default name
   * @ignore
   */
  showStoreCameraDialog(cameraName) {
    return prompt(this.preferences.getLocalizedString("HomePane", "showStoreCameraDialog.message"), cameraName);
  }

  /**
   * Displays a dialog showing the list of cameras stored in home
   * and returns <code>null</code> to delete selected cameras asynchronously.
   */
  showDeletedCamerasDialog() {
    let homePane = this;
    let storedCameras = this.home.getStoredCameras();

    class JSConfirmDeleteCamerasDialog extends JSDialog {
      constructor() {
        super(
          homePane.preferences,
          "@{HomePane.showDeletedCamerasDialog.title}",
          "<div>@{HomePane.confirmDeleteCameras.message}</div>",
          {
            applier: function (dialog) {
              homePane.controller.getHomeController3D().deleteCameras(dialog.selectedCameras);
            },
          }
        );

        let confirmDialog = this;
        let cancelButton = this.findElement(".dialog-cancel-button");
        this.registerEventListener(cancelButton, "click", (ev) => {
          confirmDialog.cancel();
        });
        let okButtons = this.findElements(".dialog-ok-button");
        this.registerEventListener(okButtons, "click", (ev) => {
          confirmDialog.validate();
        });
      }

      appendButtons(buttonsPanel) {
        buttonsPanel.innerHTML = JSComponent.substituteWithLocale(this.preferences,
          "<button class='dialog-cancel-button'>@{HomePane.confirmDeleteCameras.cancel}</button>" +
          "<button class='dialog-ok-button'>@{HomePane.confirmDeleteCameras.delete}</button>");
      }
    }

    let html = "<div>@{HomePane.showDeletedCamerasDialog.message}</div><br />";
    for (let i = 0; i < storedCameras.length; i++) {
      html += "<div><label><input type='checkbox' value='" + i + "' />" + storedCameras[i].getName() + "</label></div>";
    }

    class JSDeleteCamerasDialog extends JSDialog {
      constructor() {
        super(
          homePane.preferences,
          "@{HomePane.showDeletedCamerasDialog.title}",
          html,
          {
            applier: function (dialog) {
              let checkboxes = dialog.findElements("input[type='checkbox']:checked");
              let selectedCameras = [];
              for (let i = 0; i < checkboxes.length; i++) {
                let cameraIndex = parseInt(checkboxes[i].value);
                let camera = storedCameras[cameraIndex];
                selectedCameras.push(camera);
              }

              if (selectedCameras.length > 0) {
                let confirmDialog = new JSConfirmDeleteCamerasDialog();
                confirmDialog.selectedCameras = selectedCameras;
                confirmDialog.displayView();
              }
            },
          }
        );
      }
    }

    let dialog = new JSDeleteCamerasDialog();
    dialog.displayView();
    return null;
  }

  /**
   * Returns <code>true</code> if clipboard doesn't contain data that
   * components are able to handle.
   * @return {boolean}
   */
  isClipboardEmpty() {
    return this.clipboardEmpty;
  }

  /**
   * Returns the list of selectable items that are currently in clipboard
   * or <code>null</code> if clipboard doesn't contain any selectable item.
   * @return {Object[]}
   */
  getClipboardItems() {
    return this.clipboard;
  }

  /**
   * Execute <code>runnable</code> asynchronously in the thread
   * that manages toolkit events.
   * @param {function} runnable
   * @ignore
   */
  invokeLater(runnable) {
    setTimeout(runnable);
  }

  /**
   * Removes components added to this pane and their listeners.
   */
  dispose() {
    this.setTransferEnabled(false);

    let furnitureCatalogView = this.controller.getFurnitureCatalogController().getView();
    let furnitureView = this.controller.getFurnitureController().getView();
    let planView = this.controller.getPlanController().getView();
    let view3D = this.controller.getHomeController3D().getView();
    if (view3D != null) {
      view3D.dispose();
    }
    if (planView != null) {
      planView.dispose();
    }
    if (furnitureView != null) {
      furnitureView.dispose();
    }
    if (furnitureCatalogView != null) {
      furnitureCatalogView.dispose();
    }

    if (this.view3DPopupMenu != null) {
      document.body.removeChild(this.view3DPopupMenu.getHTMLElement());
    }
    if (this.planPopupMenu != null) {
      document.body.removeChild(this.planPopupMenu.getHTMLElement());
    }
    if (this.furniturePopupMenu != null) {
      document.body.removeChild(this.furniturePopupMenu.getHTMLElement());
    }
    if (this.furnitureCatalogPopupMenu != null) {
      document.body.removeChild(this.furnitureCatalogPopupMenu.getHTMLElement());
    }

    if (this.levelSelector) {
      while (this.levelSelector.children.length > 0) {
        this.levelSelector.removeChild(this.levelSelector.children[0]);
      }
      this.levelSelector.removeEventListener("change", this.levelSelectorChangeListener);
    }

    document.removeEventListener("keydown", this.keydownListener);

    window.removeEventListener("resize", this.resizeListener);
    let splitters = [this.catalogFurnitureSplitter, this.furniturePlanSplitter, this.plan3DViewSplitter];
    for (var i = 0; i < splitters.length; i++) {
      let splitter = splitters[i];
      splitter.element.removeEventListener("mousedown", splitter.mouseListener.mousePressed, true);
      splitter.element.removeEventListener("touchstart", splitter.mouseListener.mousePressed, true);
      window.removeEventListener("resize", splitter.mouseListener.windowResized);
    }
    let applicationMenuToolBar = document.getElementById("application-menu-toolbar");
    if (applicationMenuToolBar != null) {
      var toolBarChildren = applicationMenuToolBar.children;
      for (var i = toolBarChildren.length - 1; i >= 0; i--) {
        applicationMenuToolBar.removeChild(toolBarChildren[i]);
      }
    }
    let toolBar = document.getElementById("home-pane-toolbar");
    toolBarChildren = toolBar.children;
    for (var i = toolBarChildren.length - 1; i >= 0; i--) {
      if (this.toolBarDefaultChildren.indexOf(toolBarChildren[i]) < 0) {
        toolBar.removeChild(toolBarChildren[i]);
      }
    }
    this.getHTMLElement().removeEventListener("focusin", this.focusListener);
    this.preferences.removePropertyChangeListener("VALUE_ADDED_TAX_ENABLED", this.preferencesChangeListener);
    this.preferences.removePropertyChangeListener("CURRENCY", this.preferencesChangeListener);
    if (this.furnitureCatalogListener != null) {
      this.preferences.getFurnitureCatalog().removeFurnitureListener(this.furnitureCatalogListener);
    }
  }
}

HomePane["__class"] = "HomePane";
HomePane["__interfaces"] = ["com.eteks.sweethome3d.viewcontroller.HomeView", "com.eteks.sweethome3d.viewcontroller.View"];

HomePane.MAIN_PANE_DIVIDER_LOCATION_VISUAL_PROPERTY = "com.eteks.sweethome3d.SweetHome3D.MainPaneDividerLocation";
HomePane.CATALOG_PANE_DIVIDER_LOCATION_VISUAL_PROPERTY = "com.eteks.sweethome3d.SweetHome3D.CatalogPaneDividerLocation";
HomePane.PLAN_PANE_DIVIDER_LOCATION_VISUAL_PROPERTY = "com.eteks.sweethome3d.SweetHome3D.PlanPaneDividerLocation";
HomePane.PLAN_VIEWPORT_X_VISUAL_PROPERTY = "com.eteks.sweethome3d.SweetHome3D.PlanViewportX";
HomePane.PLAN_VIEWPORT_Y_VISUAL_PROPERTY = "com.eteks.sweethome3d.SweetHome3D.PlanViewportY";
HomePane.FURNITURE_VIEWPORT_Y_VISUAL_PROPERTY = "com.eteks.sweethome3d.SweetHome3D.FurnitureViewportY";
HomePane.DETACHED_VIEW_VISUAL_PROPERTY = ".detachedView";
HomePane.DETACHED_VIEW_DIVIDER_LOCATION_VISUAL_PROPERTY = ".detachedViewDividerLocation";
HomePane.DETACHED_VIEW_X_VISUAL_PROPERTY = ".detachedViewX";
HomePane.DETACHED_VIEW_Y_VISUAL_PROPERTY = ".detachedViewY";
HomePane.DETACHED_VIEW_WIDTH_VISUAL_PROPERTY = ".detachedViewWidth";
HomePane.DETACHED_VIEW_HEIGHT_VISUAL_PROPERTY = ".detachedViewHeight";

/**
 * @private
 */
HomePane.MenuActionType = {};
HomePane.MenuActionType[HomePane.MenuActionType["FILE_MENU"] = 0] = "FILE_MENU";
HomePane.MenuActionType[HomePane.MenuActionType["EDIT_MENU"] = 1] = "EDIT_MENU";
HomePane.MenuActionType[HomePane.MenuActionType["FURNITURE_MENU"] = 2] = "FURNITURE_MENU";
HomePane.MenuActionType[HomePane.MenuActionType["PLAN_MENU"] = 3] = "PLAN_MENU";
HomePane.MenuActionType[HomePane.MenuActionType["VIEW_3D_MENU"] = 4] = "VIEW_3D_MENU";
HomePane.MenuActionType[HomePane.MenuActionType["HELP_MENU"] = 5] = "HELP_MENU";
HomePane.MenuActionType[HomePane.MenuActionType["OPEN_RECENT_HOME_MENU"] = 6] = "OPEN_RECENT_HOME_MENU";
HomePane.MenuActionType[HomePane.MenuActionType["ALIGN_OR_DISTRIBUTE_MENU"] = 7] = "ALIGN_OR_DISTRIBUTE_MENU";
HomePane.MenuActionType[HomePane.MenuActionType["SORT_HOME_FURNITURE_MENU"] = 8] = "SORT_HOME_FURNITURE_MENU";
HomePane.MenuActionType[HomePane.MenuActionType["DISPLAY_HOME_FURNITURE_PROPERTY_MENU"] = 9] = "DISPLAY_HOME_FURNITURE_PROPERTY_MENU";
HomePane.MenuActionType[HomePane.MenuActionType["MODIFY_TEXT_STYLE"] = 10] = "MODIFY_TEXT_STYLE";
HomePane.MenuActionType[HomePane.MenuActionType["GO_TO_POINT_OF_VIEW"] = 11] = "GO_TO_POINT_OF_VIEW";
HomePane.MenuActionType[HomePane.MenuActionType["SELECT_OBJECT_MENU"] = 12] = "SELECT_OBJECT_MENU";
HomePane.MenuActionType[HomePane.MenuActionType["TOGGLE_SELECTION_MENU"] = 13] = "TOGGLE_SELECTION_MENU";


class UserPreferencesChangeListener {
  propertyChange(ev) {
    let ActionType = HomeView.ActionType;
    let homePane = this.homePane;
    let preferences = ev.getSource();
    let property = ev.getPropertyName();
    if (homePane == null) {
      preferences.removePropertyChangeListener(property, this);
    } else {
      switch (property) {
        case "CURRENCY":
          homePane.getAction(ActionType.DISPLAY_HOME_FURNITURE_PRICE).putValue(ResourceAction.VISIBLE, ev.getNewValue() != null);
          homePane.getAction(ActionType.SORT_HOME_FURNITURE_BY_PRICE).putValue(ResourceAction.VISIBLE, ev.getNewValue() != null);
          break;
        case "VALUE_ADDED_TAX_ENABLED":
          homePane.getAction(ActionType.DISPLAY_HOME_FURNITURE_VALUE_ADDED_TAX_PERCENTAGE).putValue(ResourceAction.VISIBLE, ev.getNewValue() == true);
          homePane.getAction(ActionType.DISPLAY_HOME_FURNITURE_VALUE_ADDED_TAX).putValue(ResourceAction.VISIBLE, ev.getNewValue() == true);
          homePane.getAction(ActionType.DISPLAY_HOME_FURNITURE_PRICE_VALUE_ADDED_TAX_INCLUDED).putValue(ResourceAction.VISIBLE, ev.getNewValue() == true);
          homePane.getAction(ActionType.SORT_HOME_FURNITURE_BY_VALUE_ADDED_TAX_PERCENTAGE).putValue(ResourceAction.VISIBLE, ev.getNewValue() == true);
          homePane.getAction(ActionType.SORT_HOME_FURNITURE_BY_VALUE_ADDED_TAX).putValue(ResourceAction.VISIBLE, ev.getNewValue() == true);
          homePane.getAction(ActionType.SORT_HOME_FURNITURE_BY_PRICE_VALUE_ADDED_TAX_INCLUDED).putValue(ResourceAction.VISIBLE, ev.getNewValue() == true);
          break;
      }
    }
  }
}

HomePane.UserPreferencesChangeListener = UserPreferencesChangeListener;

class MagnetismChangeListener {
  /**
   * @ignore
   */
  propertyChange(ev) {
    let homePane = this.homePane;
    let preferences = ev.getSource();
    let property = ev.getPropertyName();
    if (homePane == null) {
      preferences.removePropertyChangeListener(property, this);
    } else {
      this.enableDisableMagnetismButton.setAction(
        preferences.isMagnetismEnabled()
          ? homePane.getAction(HomeView.ActionType.DISABLE_MAGNETISM)
          : homePane.getAction(HomeView.ActionType.ENABLE_MAGNETISM));
    }
  }
}

HomePane.MagnetismChangeListener = MagnetismChangeListener;
