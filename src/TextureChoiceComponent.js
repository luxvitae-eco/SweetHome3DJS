/*
 * TextureChoiceComponent.js
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
  CollectionEvent,
  CatalogTexture,
  HomeTexture,
} from './SweetHome3D';

import { JSComponent, JSDialog, JSSpinner } from './toolkit';
import { TextureManager } from './TextureManager';
import { IntegerFormat } from './core';
import { ResourceAction } from './ResourceAction';
import { CoreTools } from './CoreTools';
import { OperatingSystem } from './URLContent';

/**
 * Button displaying a texture as an icon. When the user clicks
 * on this button a dialog appears to let him choose an other texture.
 * @param {UserPreferences} preferences user preferences
 * @param {TextureChoiceController} controller texture choice controller
 * @constructor
 * @author Louis Grignon
 * @author Emmanuel Puybaret
 */
export class TextureChoiceComponent extends JSComponent {
  constructor(preferences, controller) {
    super(preferences, document.createElement("span"), true);

    this.controller = controller;
    this.getHTMLElement().innerHTML = '<button class="texture-button"><div class="texture-preview" /></button>';
    this.button = this.findElement(".texture-button");

    let component = this;
    this.registerEventListener(this.button, "click", (ev) => {
      component.openTextureDialog();
    });

    this.preview = this.findElement(".texture-preview");
    let textureChangeListener = () => {
      component.updateTexture(controller.getTexture());
    };
    this.registerPropertyChangeListener(controller, "TEXTURE", textureChangeListener);
    this.updateTexture(controller.getTexture());
  }

  /**
   * Updates the texture image displayed by this button.
   * @param {Texture} texture
   * @private 
   */
  updateTexture(texture) {
    if (texture == null) {
      this.preview.style.backgroundImage = "none";
    } else {
      let component = this;
      TextureManager.getInstance().loadTexture(texture.getImage(),
        {
          textureUpdated: function (image) {
            component.preview.style.backgroundImage = "url('" + image.src + "')";
          },
          textureError: function (error) {
            console.log("Image cannot be loaded", error);
          }
        });
    }
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
  openTextureDialog() {
    let dialog = new JSTextureDialog(this.getUserPreferences(), this.controller);
    if (this.controller.getTexture() != null) {
      dialog.setSelectedTexture(this.controller.getTexture());
    }
    dialog.displayView();
  }

  /**
   * @return {boolean}
   */
  confirmDeleteSelectedCatalogTexture() {
    // Remove html tags from message because confirm does not support it
    let messageText = this.getLocalizedLabelText("TextureChoiceComponent", "confirmDeleteSelectedCatalogTexture.message").
      replace(/\<[^\>]*\>/g, " ").replace(/[ ]+/g, " ").replace(/^\s*/, "");
    return confirm(messageText);
  }
}

/**
 * The texture selector dialog class.
 * @param {UserPreferences} preferences the current user preferences
 * @param {TextureChoiceController} controller texture choice controller
 * @extends JSDialog
 * @constructor
 * @private
 */
class JSTextureDialog extends JSDialog {
  constructor(preferences, controller) {
    this.controller = controller;
    this.selectedTextureModel = {
      texture: null,
      xOffset: 0,
      yOffset: 0,
      angleInRadians: 0,
      scale: 1
    };

    /**
     * @param {CatalogTexture} catalogTexture 
     * @return {HTMLElement}
     */
    let createTextureListItem = catalogTexture => {
      let textureCategory = catalogTexture.getCategory();
      let catalogTextureItem = document.createElement("div");
      catalogTextureItem.classList.add("item");
      catalogTexture.getImage().getStreamURL({
        urlReady: function (streamUrl) {
          catalogTextureItem.innerHTML = '<img src="' + streamUrl + '" />'
            + textureCategory.getName() + " - " + catalogTexture.getName();
        },
        urlError: function (url) {
          catalogTextureItem.innerHTML = '<img/>'
            + textureCategory.getName() + " - " + catalogTexture.getName();
        }
      });
      catalogTextureItem._catalogTexture = catalogTexture;
      return catalogTextureItem;
    };

    let html =
      '<div class="columns-2">' +
      '  <div class="column1">' +
      '    <div class="texture-search"><input type="text" /></div>' +
      '    <div class="texture-catalog-list"></div>' +
      '    <div class="recent-textures"></div>' +
      '  </div>' +
      '  <div class="column2">' +
      '    <div class="selected-texture-preview">' +
      '      <div></div>' +
      '    </div>' +
      '    <div class="selected-texture-config label-input-grid">' +
      '      <div>@{TextureChoiceComponent.xOffsetLabel.text}</div>' +
      '      <div><span data-name="selected-texture-offset-x" /></div>' +
      '      <div>@{TextureChoiceComponent.yOffsetLabel.text}</div>' +
      '      <div><span data-name="selected-texture-offset-y" /></div>' +
      '      <div>@{TextureChoiceComponent.angleLabel.text}</div>' +
      '      <div><span data-name="selected-texture-angle" /></div>' +
      '      <div>@{TextureChoiceComponent.scaleLabel.text}</div>' +
      '      <div><span data-name="selected-texture-scale" /></div>' +
      '    </div>' +
      '    <hr />' +
      '    <div class="imported-textures-panel">' +
      '      <div><button import>@{TextureChoiceComponent.importTextureButton.text}</button></div>' +
      '      <div><button disabled modify>@{TextureChoiceComponent.modifyTextureButton.text}</button></div>' +
      '      <div><button disabled delete>@{TextureChoiceComponent.deleteTextureButton.text}</button></div>' +
      '    </div>' +
      '  </div>' +
      '</div>';

    super(preferences, controller.getDialogTitle(), html, {
      applier: function (dialog) {
        // Force refresh model from inputs, even if "change" event was not raised 
        this.updateTextureTransform();
        let selectedTexture = dialog.getSelectedTexture();
        controller.setTexture(selectedTexture);
        if (selectedTexture != null) {
          controller.addRecentTexture(selectedTexture);
        }
      },
      disposer: function (dialog) {
        preferences.getTexturesCatalog().removeTexturesListener(dialog.texturesCatalogListener);
      }
    });

    this.getHTMLElement().classList.add("texture-chooser-dialog");

    this.recentTexturesPanel = this.findElement(".recent-textures");

    this.catalogList = this.findElement(".texture-catalog-list");
    this.selectedTexturePreview = this.findElement(".selected-texture-preview > div");

    this.xOffsetInput = new JSSpinner(preferences, this.getElement("selected-texture-offset-x"),
      {
        value: 0,
        minimum: 0,
        maximum: 100,
        stepSize: 5
      });
    this.yOffsetInput = new JSSpinner(preferences, this.getElement("selected-texture-offset-y"),
      {
        value: 0,
        minimum: 0,
        maximum: 100,
        stepSize: 5
      });
    this.angleInput = new JSSpinner(preferences, this.getElement("selected-texture-angle"),
      {
        format: new IntegerFormat(),
        value: 0,
        minimum: 0,
        maximum: 360,
        stepSize: 15
      });
    this.scaleInput = new JSSpinner(preferences, this.getElement("selected-texture-scale"),
      {
        value: 100,
        minimum: 1,
        maximum: 10000,
        stepSize: 5
      });
    let dialog = this;
    this.registerEventListener([this.xOffsetInput, this.yOffsetInput, this.angleInput, this.scaleInput], "input",
      (ev) => {
        dialog.updateTextureTransform();
      });

    let textureCategories = preferences.getTexturesCatalog().getCategories();
    for (let i = 0; i < textureCategories.length; i++) {
      let textureCategory = textureCategories[i];
      for (let j = 0; j < textureCategory.getTextures().length; j++) {
        let catalogTexture = textureCategory.getTextures()[j];
        dialog.catalogList.appendChild(createTextureListItem(catalogTexture));
      }
    }
    this.texturesCatalogItems = this.catalogList.childNodes;

    let mouseClicked = function (ev) {
      dialog.selectTexture(dialog.getCatalogTextureFromItem(this));
    };
    this.registerEventListener(this.texturesCatalogItems, "click", mouseClicked);
    this.initCatalogTextureSearch(preferences);
    this.initRecentTextures();
    this.registerPropertyChangeListener(preferences, "RECENT_TEXTURES", (ev) => {
      dialog.initRecentTextures();
    });
    this.registerEventListener(this.findElements(".item"), "dblclick", (ev) => {
      dialog.validate();
    });
    if (!OperatingSystem.isInternetExplorerOrLegacyEdge()
      || !window.PointerEvent) {
      // Simulate double touch on the same element
      let lastTouchTime = -1;
      let textureElement = null;
      this.registerEventListener(this.findElements(".item"), "touchstart", (ev) => {
        let time = Date.now();
        if (time - lastTouchTime < 500
          && textureElement === ev.target) {
          ev.preventDefault();
          dialog.validate();
        } else {
          lastTouchTime = time;
          textureElement = ev.target;
        }
      });
    }

    this.initImportTexturesPanel();

    this.texturesCatalogListener = ev => {
      let catalogTexture = ev.getItem && ev.getItem();
      switch (ev.getType()) {
        case CollectionEvent.Type.ADD:
          dialog.searchInput.value = "";
          const listItem = createTextureListItem(catalogTexture);
          dialog.catalogList.appendChild(listItem);
          dialog.registerEventListener(listItem, "click", mouseClicked);
          dialog.selectTexture(catalogTexture);
          break;
        case CollectionEvent.Type.DELETE:
          const catalogTextureItem = dialog.getCatalogTextureItem(catalogTexture);
          dialog.catalogList.removeChild(catalogTextureItem);
          const firstItem = dialog.catalogList.querySelector(".item");
          if (firstItem) {
            dialog.selectTexture(dialog.getCatalogTextureFromItem(firstItem));
          }
          break;
      }
    };
    preferences.getTexturesCatalog().addTexturesListener(this.texturesCatalogListener);
  }

  /**
   * Returns the currently selected texture.
   * @return {HomeTexture} currently selected texture
   */
  getSelectedTexture() {
    if (this.selectedTextureModel.texture != null) {
      return new HomeTexture(
        this.selectedTextureModel.texture,
        this.selectedTextureModel.xOffset,
        this.selectedTextureModel.yOffset,
        this.selectedTextureModel.angleInRadians,
        this.selectedTextureModel.scale,
        this.controller.getTexture() instanceof HomeTexture
          ? this.controller.getTexture().isFittingArea()
          : false,
        true);
    } else {
      return null;
    }
  }

  /**
   * Applies given texture values to this dialog.
   * @param {HomeTexture} texture 
   */
  setSelectedTexture(texture) {
    if (texture != null) {
      this.selectedTextureModel.texture = texture;
      this.selectedTextureModel.xOffset = texture.getXOffset();
      this.selectedTextureModel.yOffset = texture.getYOffset();
      this.selectedTextureModel.angleInRadians = texture.getAngle();
      this.selectedTextureModel.scale = texture.getScale();

      this.xOffsetInput.setValue(this.selectedTextureModel.xOffset * 100);
      this.yOffsetInput.setValue(this.selectedTextureModel.yOffset * 100);
      this.angleInput.setValue(Math.toDegrees(this.selectedTextureModel.angleInRadians));
      this.scaleInput.setValue(this.selectedTextureModel.scale * 100);

      // Search texture in catalog
      let textureContent = texture.getImage();
      let textureCategories = this.getUserPreferences().getTexturesCatalog().getCategories();
      let catalogTexture = null;
      for (let i = 0; i < textureCategories.length && catalogTexture === null; i++) {
        let categoryTextures = textureCategories[i].getTextures();
        for (let j = 0; j < categoryTextures.length; j++) {
          if (textureContent.equals(categoryTextures[j].getImage())) {
            catalogTexture = categoryTextures[j];
            break;
          }
        }
      }
      if (catalogTexture !== null) {
        this.selectTexture(catalogTexture);
      } else {
        this.selectTexture(texture);
      }
    } else {
      this.selectedTexturePreview.style.backgroundImage = "none";
    }

    this.updateTextureTransform();
  }

  /**
   * @param {Texture} texture  the texture to be selected
   * @private
   */
  selectTexture(texture) {
    this.selectedTextureModel.texture = texture;
    let modifyTextureEnabled = false;
    if (texture != null) {
      for (let i = 0; i < this.texturesCatalogItems.length; i++) {
        this.texturesCatalogItems[i].classList.remove("selected");
      }
      if (texture instanceof CatalogTexture) {
        let catalogTextureItem = this.getCatalogTextureItem(texture);
        catalogTextureItem.classList.add("selected");
        let catalogList = this.catalogList;
        setTimeout(() => {
          let textureItemTop = catalogTextureItem.offsetTop - catalogList.offsetTop;
          let textureItemBottom = textureItemTop + catalogTextureItem.clientHeight;
          if (textureItemTop < catalogList.scrollTop || textureItemBottom > (catalogList.scrollTop + catalogList.clientHeight)) {
            catalogList.scrollTop = textureItemTop - catalogList.offsetTop;
          }
        }, 10);
        this.selectedTexturePreview.style.backgroundImage = "url('" + catalogTextureItem.querySelector("img").src + "')";
        modifyTextureEnabled = texture != null && texture.isModifiable();
      } else {
        var dialog = this;
        TextureManager.getInstance().loadTexture(texture.getImage(),
          {
            textureUpdated: function (image) {
              dialog.selectedTexturePreview.style.backgroundImage = "url('" + image.src + "')";
            },
            textureError: function (error) {
              dialog.selectedTexturePreview.style.backgroundImage = "none";
            }
          });
      }
    } else {
      dialog.selectedTexturePreview.style.backgroundImage = "none";
    }

    this.modifyTextureButton.disabled = !modifyTextureEnabled;
    this.deleteTextureButton.disabled = !modifyTextureEnabled;
  }

  /**
   * @private
   */
  updateTextureTransform() {
    this.selectedTextureModel.xOffset = this.xOffsetInput.getValue() / 100;
    this.selectedTextureModel.yOffset = this.yOffsetInput.getValue() / 100;
    this.selectedTextureModel.angleInRadians = Math.toRadians(this.angleInput.getValue());
    this.selectedTextureModel.scale = this.scaleInput.getValue() / 100;
    this.selectedTexturePreview.style.transform =
      /* "translate(" + this.xOffsetInput.getValue() + "%, " + this.yOffsetInput.getValue() + "%)" */
      " rotate(" + this.angleInput.getValue() + "deg)"
        /* + " scale(" + this.selectedTextureModel.scale + ", " + this.selectedTextureModel.scale + ")" */;
  }

  /**
   * @param {CatalogTexture} catalogTexture 
   * @return {HTMLElement | null} null if no item found for given texture
   * @private
   */
  getCatalogTextureItem(catalogTexture) {
    if (catalogTexture != null) {
      let catalogContent = catalogTexture.getImage();
      for (let i = 0; i < this.texturesCatalogItems.length; i++) {
        let item = this.texturesCatalogItems[i];
        let itemContent = this.getCatalogTextureFromItem(item).getImage();
        if (catalogContent.equals(itemContent)) {
          return item;
        }
      }
    }
    return null;
  }

  /**
   * @param {HTMLElement} item 
   * @return {CatalogTexture} matching texture
   * @private
   */
  getCatalogTextureFromItem(item) {
    return item._catalogTexture;
  }

  /**
   * @param {UserPreferences} preferences 
   * @private
   */
  initCatalogTextureSearch(preferences) {
    let dialog = this;
    this.searchInput = this.findElement(".texture-search input");
    this.searchInput.placeholder = ResourceAction.getLocalizedLabelText(preferences, "TextureChoiceComponent", "searchLabel.text").replace(":", "");
    this.registerEventListener(dialog.searchInput, "input", () => {
      let valueToSearch = CoreTools.removeAccents(dialog.searchInput.value.trim());
      for (let i = 0; i < dialog.texturesCatalogItems.length; i++) {
        let item = dialog.texturesCatalogItems[i];
        let textureDescriptor = item._catalogTexture.getName() + "|" + item._catalogTexture.getCategory().getName();
        if (item._catalogTexture.getCreator() !== null) {
          textureDescriptor += "|" + item._catalogTexture.getCreator();
        }
        if (RegExp(valueToSearch, "i").test(CoreTools.removeAccents(textureDescriptor))) {
          item.classList.remove("hidden");
        } else {
          item.classList.add("hidden");
        }
      }
    });
    this.searchInput.addEventListener("focusin", (ev) => {
      setTimeout(() => {
        if (dialog.searchInput.value != "") {
          dialog.searchInput.select();
        }
      }, 100);
    });
  }

  /**
   * @private
   */
  initRecentTextures() {
    var dialog = this;
    this.recentTexturesPanel.innerHTML = "";
    let recentTextures = this.getUserPreferences().getRecentTextures();
    for (let i = 0; i < recentTextures.length; i++) {
      let recentTexture = recentTextures[i];
      const recentTextureElement = document.createElement("div");
      recentTextureElement.classList.add("item");
      recentTextureElement._catalogTexture = recentTexture;
      this.recentTexturesPanel.appendChild(recentTextureElement);
      TextureManager.getInstance().loadTexture(recentTexture.getImage(),
        {
          textureUpdated: function (image) {
            recentTextureElement.style.backgroundImage = "url('" + image.src + "')";
          },
          textureError: function (error) {
            dialog.recentTexturesPanel.removeChild(recentTextureElement);
          }
        });
    }

    var dialog = this;
    this.registerEventListener(this.recentTexturesPanel.childNodes, "click", function (ev) {
      dialog.selectTexture(dialog.getCatalogTextureFromItem(this));
    });
  }

  /**
   * @private
   */
  initImportTexturesPanel() {
    this.importTextureButton = this.findElement(".imported-textures-panel [import]");
    this.modifyTextureButton = this.findElement(".imported-textures-panel [modify]");
    this.deleteTextureButton = this.findElement(".imported-textures-panel [delete]");

    let dialog = this;
    let controller = this.controller;
    this.registerEventListener(this.importTextureButton, "click", (ev) => {
      controller.importTexture();
    });
    this.registerEventListener(this.modifyTextureButton, "click", (ev) => {
      controller.modifyTexture(dialog.selectedTextureModel.texture);
    });
    this.registerEventListener(this.deleteTextureButton, "click", (ev) => {
      controller.deleteTexture(dialog.selectedTextureModel.texture);
    });
  }
}
