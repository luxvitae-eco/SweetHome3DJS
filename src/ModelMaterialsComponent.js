/*
 * ModelMaterialsComponent.js
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
  HomeMaterial,
  PieceOfFurniture
} from './SweetHome3D';

import { JSComponent, JSDialog } from './toolkit';
import { TextureManager } from './TextureManager';
import { ColorTools } from './CoreTools';
import { ModelPreviewComponent } from './ModelPreviewComponent';
import { ColorButton } from './ColorButton';
import { OperatingSystem } from './URLContent';

/**
 * Component giving access to materials editor. When the user clicks
 * on this button a dialog appears to let him choose materials.
 * @param {UserPreferences} preferences user preferences
 * @param {ModelMaterialsController} controller modelMaterials choice controller
 * @constructor
 * @author Louis Grignon
 * @author Emmanuel Puybaret
 */
export class ModelMaterialsComponent extends JSComponent {
  constructor(preferences, controller) {
    super(preferences, document.createElement("span"), true);

    this.controller = controller;

    this.getHTMLElement().innerHTML = '<button class="model-materials-button">' + this.getLocalizedLabelText('ModelMaterialsComponent', "modifyButton.text") + '</button>';
    this.button = this.findElement(".model-materials-button");
    this.button.disabled = true;

    let component = this;
    this.registerEventListener(this.button, "click", (ev) => {
      component.openModelMaterialsSelectorDialog();
    });
  }

  /**
   * Enables or disables this component.
   * @param {boolean} enabled  
   */
  setEnabled(enabled) {
    this.button.disabled = !enabled;
  }

  /**
   * @private
   */
  openModelMaterialsSelectorDialog() {
    let dialog = new JSModelMaterialsSelectorDialog(this.getUserPreferences(), this.controller);
    dialog.displayView();
  }

  dispose() {
    super.dispose();
  }
}

/**
 * The modelMaterials selector dialog class.
 * @param {UserPreferences} preferences the current user preferences
 * @param {ModelMaterialsController} controller modelMaterials choice controller
 * @extends JSDialog
 * @constructor
 * @private
 */
export class JSModelMaterialsSelectorDialog extends JSDialog {
  constructor(preferences, controller) {
    this.controller = controller;

    let html =
      '<div data-name="preview-panel">' +
      '  <span>@{ModelMaterialsComponent.previewLabel.text}</span><br/>' +
      '  <canvas id="model-preview-canvas"></canvas>' +
      '</div>' +
      '<div data-name="edit-panel">' +
      '  <div>' +
      '    <span>@{ModelMaterialsComponent.materialsLabel.text}</span>' +
      '    <div data-name="materials-list">' +
      '    </div>' +
      '  </div>' +
      '  <div class="color-texture-shininess-panel">' +
      '    <span>@{ModelMaterialsComponent.colorAndTextureLabel.text}</span><br/>' +
      '    <div class="label-input-grid">' +
      '      <label class="whole-line"><input type="radio" name="color-and-texture-checkbox" value="DEFAULT">@{ModelMaterialsComponent.defaultColorAndTextureRadioButton.text}</label>' +
      '      <label class="whole-line"><input type="radio" name="color-and-texture-checkbox" value="INVISIBLE">@{ModelMaterialsComponent.invisibleRadioButton.text}</label>' +
      '      <label><input type="radio" name="color-and-texture-checkbox" value="COLOR">@{ModelMaterialsComponent.colorRadioButton.text}</label>' +
      '      <span data-name="color-button"></span>' +
      '      <label><input type="radio" name="color-and-texture-checkbox" value="TEXTURE">@{ModelMaterialsComponent.textureRadioButton.text}</label>' +
      '      <span data-name="texture-component"></span>' +
      '    </div>' +
      '    <br />' +
      '    <span>@{ModelMaterialsComponent.shininessLabel.text}</span><br/>' +
      '    <input type="range" name="shininess-slider" min="0" max="128" list="model-materials-shininess-list" /> ' +
      '    <datalist id="model-materials-shininess-list"></datalist> ' +
      '    <div class="slider-labels"><div>@{ModelMaterialsComponent.mattLabel.text}</div><div>@{ModelMaterialsComponent.shinyLabel.text}</div></div>' +
      '  </div>' +
      '</div>';

    super(preferences, "@{HomeFurnitureController.modelMaterialsTitle}", html, {
      size: "medium",
      applier: function (dialog) {
        controller.setMaterials(dialog.materialsList.getMaterials());
      },
      disposer: function (dialog) {
        dialog.selectedMaterialBlinker.stop();
        dialog.colorButton.dispose();
        dialog.textureComponent.dispose();
      }
    });

    this.getHTMLElement().classList.add("model-materials-chooser-dialog");

    this.initMaterialsList();
    this.initPreviewPanel();
    this.initColorAndTexturePanel();
    this.initShininessPanel();

    let dialog = this;
    if (this.materialsList.size() > 0) {
      this.materialsList.addSelectionInterval(0, 0);
    } else {
      // Add a listener that will select first row as soon as the list contains some data
      let selectFirstMaterialOnContentAvailable = () => {
        if (dialog.materialsList.size() > 0) {
          dialog.materialsList.addSelectionInterval(0, 0);
          dialog.materialsList.removeListDataListener(selectFirstMaterialOnContentAvailable);
        }
      };
      this.materialsList.addListDataListener(selectFirstMaterialOnContentAvailable);
    }

    this.enableComponents();

    const selectedMaterialBlinker = {
      delay: 500,
      animationTask: null,
      start: function () {
        let materialsList = dialog.materialsList;
        let toggleBlinkingState = () => {
          if (materialsList.size() > 1) {
            let materials = materialsList.getMaterials();
            if (selectedMaterialBlinker.delay !== 100) {
              selectedMaterialBlinker.delay = 100;
              if (materials == null) {
                materials = dialog.newArray(materialsList.size());
              } else {
                materials = materials.slice(0);
              }
              let selectedIndices = materialsList.getSelectedIndices();
              for (let i = 0; i < selectedIndices.length; i++) {
                let index = selectedIndices[i];
                let defaultMaterial = materialsList.getDefaultMaterialAt(index);
                let selectedMaterial = materials[index] != null
                  ? materials[index]
                  : defaultMaterial;
                let blinkColor = 0xFF2244FF;
                if (selectedMaterial.getTexture() == null) {
                  let selectedColor = selectedMaterial.getColor();
                  if (selectedColor == null) {
                    selectedColor = defaultMaterial.getColor();
                    if (selectedColor == null) {
                      selectedColor = 0xFF000000;
                    }
                  }
                  selectedColor &= 0x00FFFFFF;
                  let red = (selectedColor >> 16) & 0xFF;
                  let green = (selectedColor >> 8) & 0xFF;
                  let blue = selectedColor & 0xFF;
                  if (Math.max(red, Math.max(green, blue)) > 0x77) {
                    // Display a darker color for a bright color
                    blinkColor = 0xFF000000 | (red / 2 << 16) | (green / 2 << 8) | (blue / 2);
                  } else if ((red + green + blue) / 3 > 0x0F) {
                    // Display a brighter color for a dark color
                    blinkColor = 0xFF000000
                      | (Math.min(red * 2, 0xFF) << 16)
                      | (Math.min(green * 2, 0xFF) << 8)
                      | Math.min(blue * 2, 0xFF);
                  }
                }
                materials[index] = new HomeMaterial(
                  selectedMaterial.getName(), blinkColor, null, selectedMaterial.getShininess());
              }
            } else {
              selectedMaterialBlinker.delay = 1000;
            }
            dialog.previewComponent.setModelMaterials(materials);
          }

          selectedMaterialBlinker.animationTask = setTimeout(toggleBlinkingState,
            selectedMaterialBlinker.delay);
        };

        selectedMaterialBlinker.animationTask = setTimeout(toggleBlinkingState, selectedMaterialBlinker.delay);
      },
      stop: function () {
        clearTimeout(selectedMaterialBlinker.animationTask);
      },
      restart: function () {
        selectedMaterialBlinker.stop();
        selectedMaterialBlinker.delay = 101;
        selectedMaterialBlinker.start();
      }
    };

    selectedMaterialBlinker.start();
    this.materialsList.addListSelectionListener((ev) => {
      selectedMaterialBlinker.restart();
    });
    this.selectedMaterialBlinker = selectedMaterialBlinker;
  }

  /**
   * Returns an array of the given size initialized with <code>null</code>.
   * @param {number} size
   * @return {Array}
   * @private
   */
  newArray(size) {
    let array = new Array(size);
    for (let i = 0; i < array.length; i++) {
      array[i] = null;
    }
    return array;
  }

  /**
   * @private
   */
  initMaterialsList() {
    let dialog = this;
    let controller = this.controller;
    let materialsListElement = this.getElement("materials-list");

    let defaultMaterials = [];
    let materials = controller.getMaterials();
    if (materials != null) {
      materials = materials.slice(0);
    }
    ModelManager.getInstance().loadModel(controller.getModel(), true,
      {
        modelUpdated: function (modelRoot) {
          defaultMaterials = ModelManager.getInstance().getMaterials(
            modelRoot, (controller.getModelFlags() & PieceOfFurniture.HIDE_EDGE_COLOR_MATERIAL) != 0, controller.getModelCreator());
          if (materials != null) {
            // Keep only materials that are defined in default materials set
            // (the list can be different if the model loader interprets differently a 3D model file
            // or if materials come from a paste style action)
            let updatedMaterials = dialog.newArray(defaultMaterials.length);
            let foundInDefaultMaterials = false;
            for (let i = 0; i < defaultMaterials.length; i++) {
              let materialName = defaultMaterials[i].getName();
              for (let j = 0; j < materials.length; j++) {
                if (materials[j] != null && materials[j].getName() == materialName) {
                  updatedMaterials[i] = materials[j];
                  foundInDefaultMaterials = true;
                  break;
                }
              }
            }
            if (foundInDefaultMaterials) {
              materials = updatedMaterials;
            } else {
              materials = null;
            }
          }
        }
      });

    const materialsList =
      this.materialsList = {
        element: materialsListElement,
        materials: materials,
        defaultMaterials: defaultMaterials,
        dataListeners: [],
        selectionListeners: [],
        /**
         * @return {number}
         */
        size: function () {
          if (materialsList.defaultMaterials != null) {
            return materialsList.defaultMaterials.length;
          } else {
            return 0;
          }
        },
        /**
         * @return {HomeMaterial[]}
         */
        getMaterials: function () {
          return materialsList.materials;
        },
        /**
         * @param {number} index
         * @return {HomeMaterial}
         */
        getDefaultMaterialAt: function (index) {
          return materialsList.defaultMaterials[index];
        },
        /**
         * @param {number} index
         * @return {HomeMaterial}
         */
        getElementAt: function (index) {
          let material;
          if (materialsList.materials != null
            && materialsList.materials[index] != null
            && materialsList.materials[index].getName() != null
            && materialsList.materials[index].getName() == materialsList.defaultMaterials[index].getName()) {
            material = materialsList.materials[index];
          } else {
            material = new HomeMaterial(materialsList.defaultMaterials[index].getName(), null, null, null);
          }
          return material;
        },
        /**
         * @param {HomeMaterial} material
         * @param {number} index
         */
        setMaterialAt: function (material, index) {
          if (material.getColor() == null
            && material.getTexture() == null
            && material.getShininess() == null) {
            if (materialsList.materials != null) {
              materialsList.materials[index] = null;
              let containsOnlyNull = true;
              for (let i = 0; i < materialsList.materials.length; i++) {
                if (materialsList.materials[i] != null) {
                  containsOnlyNull = false;
                  break;
                }
              }
              if (containsOnlyNull) {
                materialsList.materials = null;
              }
            }
          } else {
            if (materialsList.materials == null
              || materialsList.materials.length != materialsList.defaultMaterials.length) {
              materialsList.materials = dialog.newArray(materialsList.defaultMaterials.length);
            }
            materialsList.materials[index] = material;
          }

          materialsList.fireContentsChanged();
        },
        fireContentsChanged: function () {
          for (let i = 0; i < materialsList.dataListeners.length; i++) {
            materialsList.dataListeners[i]();
          }
          materialsList.repaint();
        },
        /**
         * @param {HomeMaterial} material
         * @param {HomeMaterial} defaultMaterial
         * @param {boolean} [selected] default false
         */
        createListItem: function (material, defaultMaterial, selected) {
          let materialTexture = material.getTexture();
          let materialColor = material.getColor();
          if (materialTexture == null && materialColor == null) {
            materialTexture = defaultMaterial.getTexture();
            if (materialTexture == null) {
              materialColor = defaultMaterial.getColor();
            }
          }

          let itemBackground = document.createElement("div");
          itemBackground.classList.add("icon");
          if (materialTexture != null && materialTexture.getImage() != null) {
            // Display material texture image with an icon
            TextureManager.getInstance().loadTexture(materialTexture.getImage(),
              {
                textureUpdated: function (image) {
                  itemBackground.style.backgroundImage = "url('" + image.src + "')";
                },
                textureError: function (error) {
                  itemBackground.style.backgroundImage = "none";
                }
              });
          } else if (materialColor != null
            && (materialColor & 0xFF000000) != 0) {
            itemBackground.style.backgroundColor = ColorTools.integerToHexadecimalString(materialColor);
          } else {
            // Empty icon
          }

          let item = document.createElement("div");
          item.textContent = material.getName();
          if (selected) {
            item.classList.add("selected");
          }

          item.appendChild(itemBackground);
          return item;
        },
        repaint: function () {
          let defaultMaterials = materialsList.defaultMaterials;
          let materials = materialsList.materials;
          let selectedIndices = materialsList.getSelectedIndices();

          materialsList.element.innerHTML = "";
          if (defaultMaterials != null) {
            // Generate content
            materialsList.element.innerHTML = "";
            for (let i = 0; i < defaultMaterials.length; i++) {
              let material = materialsList.getElementAt(i);
              let defaultMaterial = materialsList.getDefaultMaterialAt(i);
              let selected = selectedIndices.indexOf(i) > -1;
              materialsList.element.appendChild(materialsList.createListItem(material, defaultMaterial, selected));
            }

            // 1) Single click
            dialog.registerEventListener(materialsList.element.children, "click", function (ev) {
              let item = this;
              let multiSelection = OperatingSystem.isMacOSX() ? ev.metaKey : ev.ctrlKey;
              if (multiSelection) {
                if (item.classList.contains("selected")) {
                  item.classList.remove("selected");
                  materialsList.fireSelectionChanged();
                } else {
                  materialsList.selectItem(item);
                }
              } else {
                for (let i = 0; i < materialsList.element.children.length; i++) {
                  let otherItem = materialsList.element.children[i];
                  if (otherItem != item) {
                    otherItem.classList.remove("selected");
                  }
                }
                materialsList.selectItem(item);
              }
            });

            // 2) Double click
            dialog.registerEventListener(materialsList.element.children, "dblclick", function (ev) {
              materialsList.selectItem(this);
              if (dialog.colorButton.getColor() != null) {
                dialog.colorButton.findElement("button").click();
              } else if (controller.getTextureController().getTexture() != null
                && dialog.textureComponent != null) {
                dialog.textureComponent.findElement("button").click();
              }
            });
          }
        },
        /**
         * Triggered whenever this list's content changes (materials count or data). This is not about selection,
         * please also see addListSelectionListener
         * @param {function()} listener
         */
        addListDataListener: function (listener) {
          materialsList.dataListeners.push(listener);
        },
        /**
         * @param {function()} listener
         */
        removeListDataListener: function (listener) {
          materialsList.dataListeners.splice(materialsList.dataListeners.index(listener), 1);
        },
        /**
         * add listener on selection event (when one or more material are selected, or deselected)
         * @param {function()} listener
         */
        addListSelectionListener: function (listener) {
          materialsList.selectionListeners.push(listener);
        },
        /**
         * @param {number} index1
         * @param {number} index2
         */
        addSelectionInterval: function (index1, index2) {
          for (let i = index1; i <= index2; i++) {
            materialsList.element.children[i].classList.add("selected");
          }
          materialsList.fireSelectionChanged();
        },
        /**
         * @param {number} index1
         * @param {number} index2
         */
        removeSelectionInterval: function (index1, index2) {
          for (let i = index1; i <= index2; i++) {
            materialsList.element.children[i].classList.remove("selected");
          }
          materialsList.fireSelectionChanged();
        },
        clearSelection: function () {
          materialsList.removeSelectionInterval(0, materialsList.size() - 1);
        },
        selectItem: function (item) {
          item.classList.add("selected");
          materialsList.fireSelectionChanged();
        },
        fireSelectionChanged: function () {
          for (let i = 0; i < materialsList.selectionListeners.length; i++) {
            materialsList.selectionListeners[i]();
          }
        },
        /**
         * @return {boolean}
         */
        isSelectionEmpty: function () {
          return materialsList.element.querySelector(".selected") != null;
        },
        /**
         * @return {number[]}
         */
        getSelectedIndices: function () {
          let selectedIndices = [];
          let items = materialsList.element.children;
          for (let i = 0; i < items.length; i++) {
            if (items[i].classList.contains("selected")) {
              selectedIndices.push(i);
            }
          }
          return selectedIndices;
        },
      };

    this.materialsList.repaint();

    // List selection change handler
    this.materialsList.addListSelectionListener(() => {
      let selectedIndices = dialog.materialsList.getSelectedIndices();
      if (selectedIndices.length > 0) {
        let material = dialog.materialsList.getElementAt(selectedIndices[0]);
        let texture = material.getTexture();
        let color = material.getColor();
        let shininess = material.getShininess();
        let defaultMaterial = dialog.materialsList.getDefaultMaterialAt(selectedIndices[0]);
        if (color == null && texture == null) {
          dialog.defaultColorAndTextureRadioButton.checked = true;
          // Display default color or texture in buttons
          texture = defaultMaterial.getTexture();
          if (texture != null) {
            dialog.colorButton.setColor(null);
            controller.getTextureController().setTexture(texture);
          } else {
            color = defaultMaterial.getColor();
            if (color != null) {
              controller.getTextureController().setTexture(null);
              dialog.colorButton.setColor(color);
            }
          }
        } else if (texture != null) {
          dialog.textureRadioButton.checked = true;
          dialog.colorButton.setColor(null);
          controller.getTextureController().setTexture(texture);
        } else if ((color & 0xFF000000) == 0) {
          dialog.invisibleRadioButton.checked = true;
          // Display default color or texture in buttons
          texture = defaultMaterial.getTexture();
          if (texture != null) {
            dialog.colorButton.setColor(null);
            controller.getTextureController().setTexture(texture);
          } else {
            color = defaultMaterial.getColor();
            if (color != null) {
              controller.getTextureController().setTexture(null);
              dialog.colorButton.setColor(color);
            }
          }
        } else {
          dialog.colorRadioButton.checked = true;
          controller.getTextureController().setTexture(null);
          dialog.colorButton.setColor(color);
        }

        if (shininess != null) {
          dialog.shininessSlider.value = shininess * 128;
        } else {
          dialog.shininessSlider.value = defaultMaterial.getShininess() != null
            ? defaultMaterial.getShininess() * 128
            : 0;
        }
      }
      dialog.enableComponents();
    });
  }

  /**
   * @private
   */
  initPreviewPanel() {
    let controller = this.controller;
    let dialog = this;

    let previewPanel = this.getElement("preview-panel");
    let previewCanvas = this.findElement("#model-preview-canvas");

    previewCanvas.width = 250;
    previewCanvas.height = 250;

    let previewComponent =
      dialog.previewComponent = new ModelPreviewComponent(previewCanvas, true);
    ModelManager.getInstance().loadModel(controller.getModel(), false,
      {
        modelUpdated: function (modelRoot) {
          let materialsList = dialog.materialsList;
          previewComponent.setModel(
            controller.getModel(), controller.getModelFlags(), controller.getModelRotation(),
            controller.getModelWidth(), controller.getModelDepth(), controller.getModelHeight());
          previewComponent.setModelMaterials(materialsList.getMaterials());
          previewComponent.setModelTransformations(controller.getModelTransformations());
          materialsList.addListDataListener(() => {
            previewComponent.setModelMaterials(materialsList.getMaterials());
          });
        },
        modelError: function () {
          previewPanel.style.visibility = "hidden";
        }
      });

    let mousePressed = ev => {
      let pickedMaterial = dialog.previewComponent.getPickedMaterial();
      if (pickedMaterial != null) {
        for (let i = 0, n = dialog.materialsList.size(); i < n; i++) {
          let material = dialog.materialsList.getDefaultMaterialAt(i);
          if (material.getName() !== null
            && material.getName() == pickedMaterial.getName()) {
            let multiSelection = OperatingSystem.isMacOSX() ? ev.metaKey : ev.ctrlKey;
            if (multiSelection) {
              let selectedIndices = dialog.materialsList.getSelectedIndices();
              if (selectedIndices.indexOf(i) >= 0) {
                dialog.materialsList.removeSelectionInterval(i, i);
              } else {
                dialog.materialsList.addSelectionInterval(i, i);
              }
            } else {
              dialog.materialsList.clearSelection();
              dialog.materialsList.addSelectionInterval(i, i);
            }
          }
        }
      }
    };
    if (OperatingSystem.isInternetExplorerOrLegacyEdge()
      && window.PointerEvent) {
      // Multi touch support for IE and Edge
      dialog.previewComponent.getHTMLElement().addEventListener("pointerdown", mousePressed);
      dialog.previewComponent.getHTMLElement().addEventListener("mousedown", mousePressed);
    } else {
      dialog.previewComponent.getHTMLElement().addEventListener("touchstart", mousePressed);
      dialog.previewComponent.getHTMLElement().addEventListener("mousedown", mousePressed);
    }
  }

  /**
   * @private
   */
  initColorAndTexturePanel() {
    let dialog = this;
    let controller = this.controller;

    this.defaultColorAndTextureRadioButton = this.findElement("[name='color-and-texture-checkbox'][value='DEFAULT']");
    this.invisibleRadioButton = this.findElement("[name='color-and-texture-checkbox'][value='INVISIBLE']");
    this.colorRadioButton = this.findElement("[name='color-and-texture-checkbox'][value='COLOR']");
    this.textureRadioButton = this.findElement("[name='color-and-texture-checkbox'][value='TEXTURE']");

    /**
     * @param {function(HomeMaterial, index): HomeMaterial} materialCreator
     */
    let modifySelectedMaterials = materialCreator => {
      let selectedIndices = dialog.materialsList.getSelectedIndices();
      for (let i = 0; i < selectedIndices.length; i++) {
        let index = selectedIndices[i];
        let material = dialog.materialsList.getElementAt(index);
        dialog.materialsList.setMaterialAt(
          materialCreator(material, index),
          index);
      }
    };

    // Listen to click events on radio buttons rather than change events 
    // to avoid firing events when checked state is set internaly 
    this.registerEventListener(this.defaultColorAndTextureRadioButton, "click", function (ev) {
      if (!this.disabled && this.checked) {
        modifySelectedMaterials((material) => {
          return new HomeMaterial(material.getName(), null, null, material.getShininess());
        });
      }
    });

    this.registerEventListener(this.invisibleRadioButton, "click", function (ev) {
      if (!this.disabled && this.checked) {
        modifySelectedMaterials((material) => {
          return new HomeMaterial(material.getName(), 0, null, material.getShininess());
        });
      }
    });

    let colorChoiceChangeListener = () => {
      if (!dialog.colorRadioButton.disabled && dialog.colorRadioButton.checked) {
        modifySelectedMaterials((material, index) => {
          let defaultMaterial = dialog.materialsList.getDefaultMaterialAt(index);
          let color = defaultMaterial.getColor() != dialog.colorButton.getColor() || defaultMaterial.getTexture() != null
            ? dialog.colorButton.getColor()
            : null;
          return new HomeMaterial(material.getName(), color, null, material.getShininess());
        });
      }
    };
    this.colorButton = new ColorButton(this.getUserPreferences(),
      {
        colorChanged: function (selectedColor) {
          if (selectedColor != null) {
            dialog.colorRadioButton.checked = true;
            colorChoiceChangeListener();
          }
        }
      });
    this.colorButton.setColorDialogTitle(this.getUserPreferences().getLocalizedString(
      "ModelMaterialsComponent", "colorDialog.title"));
    this.registerEventListener(this.colorRadioButton, "click", (ev) => {
      if (dialog.colorRadioButton.checked) {
        colorChoiceChangeListener();
      }
    });
    this.attachChildComponent("color-button", this.colorButton);

    let textureChoiceChangeListener = () => {
      if (!dialog.textureRadioButton.disabled && dialog.textureRadioButton.checked) {
        modifySelectedMaterials((material, index) => {
          let defaultTexture = dialog.materialsList.getDefaultMaterialAt(index).getTexture();
          let texture = defaultTexture != controller.getTextureController().getTexture()
            ? controller.getTextureController().getTexture()
            : null;
          return new HomeMaterial(material.getName(), null, texture, material.getShininess());
        });
      }
    };
    this.textureComponent = controller.getTextureController().getView();
    this.textureComponent.textureChanged = texture => {
      if (texture != null) {
        dialog.textureRadioButton.checked = true;
        textureChoiceChangeListener();
      }
    };
    this.registerEventListener(this.textureRadioButton, "click", (ev) => {
      if (dialog.textureRadioButton.checked) {
        textureChoiceChangeListener();
      }
    });
    this.registerPropertyChangeListener(controller.getTextureController(), "TEXTURE", (ev) => {
      if (ev.getNewValue() != null) {
        if (!dialog.textureRadioButton.checked) {
          dialog.textureRadioButton.checked = true;
        }
        textureChoiceChangeListener();
      }
    });
    this.attachChildComponent("texture-component", this.textureComponent);
  }

  /**
   * @private
   */
  initShininessPanel() {
    let dialog = this;
    this.shininessSlider = this.getElement("shininess-slider");

    let shininessList = this.findElement("#model-materials-shininess-list");
    for (let i = 0; i <= 128; i += 16) {
      let option = document.createElement("option");
      option.value = i;
      shininessList.appendChild(option);
    }

    this.registerEventListener(this.shininessSlider, "input", function (ev) {
      let shininess = this.value;
      let selectedIndices = dialog.materialsList.getSelectedIndices();
      for (let i = 0; i < selectedIndices.length; i++) {
        let index = selectedIndices[i];
        let material = dialog.materialsList.getElementAt(index);
        dialog.materialsList.setMaterialAt(
          new HomeMaterial(material.getName(), material.getColor(), material.getTexture(), shininess / 128),
          index);
      }
    });
  }

  /**
   * @private
   */
  enableComponents() {
    let selectionEmpty = !this.materialsList.isSelectionEmpty();
    this.defaultColorAndTextureRadioButton.disabled = selectionEmpty;
    this.invisibleRadioButton.disabled = selectionEmpty;
    this.textureRadioButton.disabled = selectionEmpty;
    this.textureComponent.setEnabled(!selectionEmpty);
    this.colorRadioButton.disabled = selectionEmpty;
    this.colorButton.setEnabled(!selectionEmpty);
    this.shininessSlider.disabled = selectionEmpty;
  }
}

