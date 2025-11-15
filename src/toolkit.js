/*
 * toolkit.js
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

import { CoreTools } from './CoreTools';
import { ResourceAction } from './ResourceAction';
import { ParsePosition, Format, DecimalFormat, KeyStroke } from './core';
import { AbstractAction } from './graphics2d';
import { OperatingSystem } from './URLContent';
import { ZIPTools } from './URLContent';

/**
 * The root class for additional UI components.
 * @param {UserPreferences} preferences the current user preferences
 * @param {string|HTMLElement} template template element (view HTML will be this element's innerHTML) 
 *     or HTML string (if null or undefined, then the component creates an empty div for the root node)
 * @param {boolean} [useElementAsRootHTMLElement]
 * @constructor
 * @author Renaud Pawlak
 * @author Emmanuel Puybaret
 */
export class JSComponent {
  constructor(preferences, template, useElementAsRootHTMLElement) {
    this.preferences = preferences;

    if (template instanceof HTMLElement && useElementAsRootHTMLElement === true) {
      this.container = template;
    } else {
      let html = "";
      if (template != null) {
        html = typeof template == "string" ? template : template.innerHTML;
      }
      this.container = document.createElement("div");
      this.container.innerHTML = this.buildHtmlFromTemplate(html);
    }
  }

  /**
   * Returns the HTML element used to view this component.
   * @return {HTMLElement}
   */
  getHTMLElement() {
    return this.container;
  }

  /**
   * Returns the user preferences used to localize this component.
   * @return {UserPreferences}
   */
  getUserPreferences() {
    return this.preferences;
  }

  /**
   * Returns true if element is or is child of candidateParent, false otherwise.
   * @param {HTMLElement} element
   * @param {HTMLElement} candidateParent
   * @return {boolean}
   */
  static isElementContained(element, candidateParent) {
    if (element == null || candidateParent == null) {
      return false;
    }

    let currentParent = element;
    do {
      if (currentParent == candidateParent) {
        return true;
      }
    } while (currentParent = currentParent.parentElement);

    return false;
  }

  /**
   * Substitutes all the place holders in the html with localized labels.
   * @param {UserPreferences} preferences the current user preferences
   * @param {string} html 
   */
  static substituteWithLocale(preferences, html) {
    return html.replace(/\@\{([a-zA-Z0-9_.]+)\}/g, (fullMatch, str) => {
      return ResourceAction.getLocalizedLabelText(preferences,
        str.substring(0, str.indexOf('.')), str.substring(str.indexOf('.') + 1));
    });
  }

  /**
   * Substitutes all the place holders in the given html with localized labels.
   * @param {string} templateHtml 
   */
  buildHtmlFromTemplate(templateHtml) {
    return JSComponent.substituteWithLocale(this.preferences, templateHtml);
  }

  /**
   * Returns the localized text defined for the given <code>>resourceClass</code> + <code>propertyKey</code>.
   * @param {Object} resourceClass
   * @param {string} propertyKey
   * @param {Array} resourceParameters
   * @return {string}
   * @protected
   */
  getLocalizedLabelText(resourceClass, propertyKey, resourceParameters) {
    return ResourceAction.getLocalizedLabelText(this.preferences, resourceClass, propertyKey, resourceParameters);
  }

  /**
   * Attaches the given component to a child DOM element, becoming a child component.
   * @param {string} name the component's name, which matches child DOM element name (as defined in {@link JSComponent#getElement})
   * @param {JSComponent} component child component instance
   */
  attachChildComponent(name, component) {
    this.getElement(name).appendChild(component.getHTMLElement());
  }

  /**
   * Registers the given listener on given elements(s) and removes them when this component is disposed.
   * @param {(HTMLElement[]|HTMLElement)} elements
   * @param {string} eventName
   * @param {function} listener
   */
  registerEventListener(elements, eventName, listener) {
    if (elements == null) {
      return;
    }
    if (elements instanceof NodeList || elements instanceof HTMLCollection) {
      const array = new Array(elements.length);
      for (var i = 0; i < elements.length; i++) {
        array[i] = elements[i];
      }
      elements = array;
    }
    if (!Array.isArray(elements)) {
      elements = [elements];
    }
    if (this.listeners == null) {
      this.listeners = [];
    }
    for (var i = 0; i < elements.length; i++) {
      const element = elements[i];
      element.addEventListener(eventName, listener, false);
    }
    this.listeners.push(
      {
        listener: listener,
        eventName: eventName,
        elements: elements
      });
  }

  /**
   * Registers the given property change listener on object and removes it when this component is disposed.
   * @param {Object} object
   * @param {string} propertyName
   * @param {function} listener
   */
  registerPropertyChangeListener(object, propertyName, listener) {
    object.addPropertyChangeListener(propertyName, listener);
    this.listeners.push(
      {
        listener: listener,
        propertyName: propertyName,
        object: object
      });
  }

  /**
   * Releases all listeners registered with {@link JSComponent#registerEventListener}
   * @private
   */
  unregisterEventListeners() {
    if (Array.isArray(this.listeners)) {
      for (let i = 0; i < this.listeners.length; i++) {
        const registeredEntry = this.listeners[i];
        if (registeredEntry.eventName !== undefined) {
          for (let j = 0; j < registeredEntry.elements.length; j++) {
            const element = registeredEntry.elements[j];
            element.removeEventListener(registeredEntry.eventName, registeredEntry.listener);
          }
        } else {
          registeredEntry.object.removePropertyChangeListener(registeredEntry.propertyName, registeredEntry.listener);
        }
      }
    }
  }

  /**
   * Returns the named element that corresponds to the given name within this component.
   * A named element shall define the "name" attribute (for instance an input), or
   * a "data-name" attribute if the name attribute is not supported.
   */
  getElement(name) {
    let element = this.container.querySelector("[name='" + name + "']");
    if (element == null) {
      element = this.container.querySelector("[data-name='" + name + "']");
    }
    return element;
  }

  /**
   * Returns the element that matches the given query selector within this component.
   * @param {string} query css selector to be applied on children elements
   */
  findElement(query) {
    return this.container.querySelector(query);
  }

  /**
   * Returns the elements that match the given query selector within this component.
   * @param {string} query css selector to be applied on children elements
   */
  findElements(query) {
    return this.container.querySelectorAll(query);
  }

  /**
   * Releases any resource or listener associated with this component, when it's disposed. 
   * Override to perform custom clean.
   * Don't forget to call super method: JSComponent.prototype.dispose()
   */
  dispose() {
    this.unregisterEventListeners();
  }

  /**
   * @param {string} value option's value
   * @param {string} text option's display text
   * @param {boolean} [selected] true if selected, default false
   * @return {HTMLOptionElement}
   * @ignore
   */
  static createOptionElement(value, text, selected) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = text;
    if (selected !== undefined) {
      option.selected = selected;
    }
    return option;
  }
}

/**
 * A class to create dialogs.
 * @param preferences      the current user preferences
 * @param {string} title the dialog's title (may contain HTML)
 * @param {string|HTMLElement} template template element (view HTML will be this element's innerHTML) or HTML string (if null or undefined, then the component creates an empty div
 * for the root node)
 * @param {{applier: function(JSDialog), disposer: function(JSDialog), size?: "small"|"medium"|"default"}} [behavior]
 * - applier: an optional dialog application function
 * - disposer: an optional dialog function to release associated resources, listeners, ...
 * - size: override style with "small" or "medium"
 * @constructor
 * @author Renaud Pawlak
 */
export class JSDialog extends JSComponent {
  constructor(preferences, title, template, behavior) {
    super(preferences, template, behavior);

    const dialog = this;
    if (behavior != null) {
      this.applier = behavior.applier;
      this.disposer = behavior.disposer;
    }

    this.getHTMLElement().classList.add("dialog-container");
    if (behavior.size) {
      this.getHTMLElement().classList.add(behavior.size);
    }
    this.getHTMLElement()._dialogBoxInstance = this;

    document.body.appendChild(this.getHTMLElement());

    if (title != null) {
      this.setTitle(title);
    }

    this.registerEventListener(this.getCloseButton(), "click", () => {
      dialog.cancel();
    });
    this.registerEventListener(this.getHTMLElement(), "mousedown", (ev) => {
      ev.stopPropagation();
    });

    this.buttonsPanel = this.findElement(".dialog-buttons");
    if (OperatingSystem.isMacOSX()) {
      this.buttonsPanel.classList.add("mac");
    }
    this.appendButtons(this.buttonsPanel);
    this.getHTMLElement().classList.add('buttons-' + this.buttonsPanel.querySelectorAll('button').length);
  }

  /**
   * Appends dialog buttons to given panel.
   * Caution : this method is called from constructor.
   * @param {HTMLElement} buttonsPanel Dialog buttons panel
   * @protected
   */
  appendButtons(buttonsPanel) {
    let html;
    if (this.applier) {
      html = "<button class='dialog-ok-button default-capable'>@{OptionPane.okButton.textAndMnemonic}</button>"
        + "<button class='dialog-cancel-button'>@{OptionPane.cancelButton.textAndMnemonic}</button>";
    } else {
      html = "<button class='dialog-cancel-button default-capable'>@{InternalFrameTitlePane.closeButtonAccessibleName}</button>";
    }
    buttonsPanel.innerHTML = JSComponent.substituteWithLocale(this.getUserPreferences(), html);

    const dialog = this;
    const cancelButton = this.findElement(".dialog-cancel-button");
    if (cancelButton) {
      this.registerEventListener(cancelButton, "click", (ev) => {
        dialog.cancel();
      });
    }
    const okButton = this.findElement(".dialog-ok-button");
    if (okButton) {
      this.registerEventListener(okButton, "click", (ev) => {
        dialog.validate();
      });
    }
  }

  /**
   * Closes currently displayed topmost dialog if any.
   * @private
   */
  static closeTopMostDialog() {
    const topMostDialog = JSDialog.getTopMostDialog();
    if (topMostDialog != null) {
      topMostDialog.close();
    }
  }

  /**
   * Returns the currently displayed topmost dialog if any.
   * @return {JSDialog} currently displayed topmost dialog if any, otherwise null
   * @ignore
   */
  static getTopMostDialog() {
    const visibleDialogElements = document.querySelectorAll(".dialog-container.visible");
    let topMostDialog = null;
    if (visibleDialogElements.length > 0) {
      for (let i = 0; i < visibleDialogElements.length; i++) {
        const visibleDialog = visibleDialogElements[i]._dialogBoxInstance;
        if (topMostDialog == null || topMostDialog.displayIndex <= visibleDialog.displayIndex) {
          topMostDialog = visibleDialog;
        }
      }
    }
    return topMostDialog;
  }

  /**
   * @param {string} templateHtml
   */
  buildHtmlFromTemplate(templateHtml) {
    return JSComponent.substituteWithLocale(this.getUserPreferences(),
      '<div class="dialog-content">' +
      '  <div class="dialog-top">' +
      '    <span class="title"></span>' +
      '    <span class="dialog-close-button">&times;</span>' +
      '  </div>' +
      '  <div class="dialog-body">' +
      JSComponent.prototype.buildHtmlFromTemplate.call(this, templateHtml) +
      '  </div>' +
      '  <div class="dialog-buttons">' +
      '  </div>' +
      '</div>');
  }

  /**
   * Returns the input that corresponds to the given name within this dialog.
   */
  getInput(name) {
    return this.getHTMLElement().querySelector("[name='" + name + "']");
  }

  /**
   * Returns the close button of this dialog.
   */
  getCloseButton() {
    return this.getHTMLElement().querySelector(".dialog-close-button");
  }

  /**
   * Called when the user presses the OK button.
   * Override to implement custom behavior when the dialog is validated by the user.
   */
  validate() {
    if (this.applier != null) {
      this.applier(this);
    }
    this.close();
  }

  /**
   * Called when the user closes the dialog with no validation.
   */
  cancel() {
    this.close();
  }

  /**
   * Closes the dialog and discard the associated DOM.
   */
  close() {
    this.getHTMLElement().classList.add("closing");
    const dialog = this;
    // Let 500ms before releasing the dialog so that the closing animation can apply
    setTimeout(() => {
      dialog.getHTMLElement().classList.remove("visible");
      dialog.dispose();
      if (dialog.getHTMLElement() && document.body.contains(dialog.getHTMLElement())) {
        document.body.removeChild(dialog.getHTMLElement());
      }
    }, 500);
  }

  /**
   * Releases any resource or listener associated with this component, when it's disposed. 
   * Override to perform custom clean - Don't forget to call super.dispose().
   */
  dispose() {
    super.dispose();
    if (typeof this.disposer == "function") {
      this.disposer(this);
    }
  }

  /**
   * Sets dialog title
   * @param {string} title
   */
  setTitle(title) {
    const titleElement = this.findElement(".dialog-top .title");
    titleElement.textContent = JSComponent.substituteWithLocale(this.getUserPreferences(), title || "");
  }

  /**
   * @return {boolean} true if this dialog is currently shown, false otherwise
   */
  isDisplayed() {
    return this.getHTMLElement().classList.contains("visible");
  }

  /**
   * Default implementation of the DialogView.displayView function.
   */
  displayView(parentView) {
    const dialog = this;

    this.getHTMLElement().style.display = "block";

    // Force browser to refresh before adding visible class to allow transition on width and height
    setTimeout(() => {
      dialog.getHTMLElement().classList.add("visible");
      dialog.displayIndex = JSDialog.shownDialogsCounter++;
      const inputs = dialog.findElements('input');
      for (let i = 0; i < inputs.length; i++) {
        const focusedInput = inputs[i];
        if (!focusedInput.classList.contains("not-focusable-at-opening")) {
          focusedInput.focus();
          break;
        }
      }
    }, 100);
  }
}


JSDialog.shownDialogsCounter = 0;


/**
 * A class to create wizard dialogs.
 * @param {UserPreferences} preferences the current user preferences
 * @param {WizardController} controller wizard's controller
 * @param {string} title the dialog's title (may contain HTML)
 * @param {string|HTMLElement} template template element (view HTML will be this element's innerHTML) or HTML string (if null or undefined, then the component creates an empty div
 * for the root node)
 * @param {{applier: function(JSDialog), disposer: function(JSDialog)}} [behavior]
 * - applier: an optional dialog application function
 * - disposer: an optional dialog function to release associated resources, listeners, ...
 * @constructor
 * @author Louis Grignon
 */
export class JSWizardDialog extends JSDialog {
  constructor(preferences, controller, title, behavior) {
    super(preferences, title, '<div class="wizard">' +
      '  <div stepIcon><div></div></div>' +
      '  <div stepView></div>' +
      '</div>', behavior);

    this.getHTMLElement().classList.add("wizard-dialog");

    this.controller = controller;
    this.stepIconPanel = this.findElement("[stepIcon]");
    this.stepViewPanel = this.findElement("[stepView]");

    const dialog = this;
    this.cancelButton = this.findElement(".wizard-cancel-button");
    this.backButton = this.findElement(".wizard-back-button");
    this.nextButton = this.findElement(".wizard-next-button");

    this.registerEventListener(this.cancelButton, "click", (ev) => {
      dialog.cancel();
    });

    this.backButton.disabled = !controller.isBackStepEnabled();
    this.registerPropertyChangeListener(controller, "BACK_STEP_ENABLED", (ev) => {
      dialog.backButton.disabled = !controller.isBackStepEnabled();
    });

    this.nextButton.disabled = !controller.isNextStepEnabled();
    this.registerPropertyChangeListener(controller, "NEXT_STEP_ENABLED", (ev) => {
      dialog.nextButton.disabled = !controller.isNextStepEnabled();
    });

    this.updateNextButtonText();
    this.registerPropertyChangeListener(controller, "LAST_STEP", (ev) => {
      dialog.updateNextButtonText();
    });

    this.registerEventListener(this.backButton, "click", (ev) => {
      controller.goBackToPreviousStep();
    });
    this.registerEventListener(this.nextButton, "click", (ev) => {
      if (controller.isLastStep()) {
        controller.finish();
        if (dialog != null) {
          dialog.validate();
        }
      } else {
        controller.goToNextStep();
      }
    });

    this.updateStepView();
    this.registerPropertyChangeListener(controller, "STEP_VIEW", (ev) => {
      dialog.updateStepView();
    });

    this.updateStepIcon();
    this.registerPropertyChangeListener(controller, "STEP_ICON", (ev) => {
      dialog.updateStepIcon();
    });

    this.registerPropertyChangeListener(controller, "TITLE", (ev) => {
      dialog.setTitle(controller.getTitle());
    });
  }

  /**
   * Append dialog buttons to given panel
   * @param {HTMLElement} buttonsPanel Dialog buttons panel
   * @protected
   */
  appendButtons(buttonsPanel) {
    const cancelButton = "<button class='wizard-cancel-button'>@{InternalFrameTitlePane.closeButtonAccessibleName}</button>";
    const backButton = "<button class='wizard-back-button'>@{WizardPane.backOptionButton.text}</button>";
    const nextButton = "<button class='wizard-next-button default-capable'></button>";
    const buttons = "<div class='dialog-buttons'>"
      + (OperatingSystem.isMacOSX() ? nextButton + backButton : backButton + nextButton)
      + cancelButton + "</div>";
    buttonsPanel.innerHTML = JSComponent.substituteWithLocale(this.getUserPreferences(), buttons);
  }

  /**
   * Change text of the next button depending on if state is last step or not
   * @private
   */
  updateNextButtonText() {
    this.nextButton.innerText = this.getLocalizedLabelText("WizardPane",
      this.controller.isLastStep()
        ? "finishOptionButton.text"
        : "nextOptionButton.text");
  }

  /**
   * Updates UI for current step.
   * @private
   */
  updateStepView() {
    const stepView = this.controller.getStepView();
    this.stepViewPanel.innerHTML = "";
    this.stepViewPanel.appendChild(stepView.getHTMLElement());
  }

  /**
   * Updates image for current step.
   * @private
   */
  updateStepIcon() {
    const iconPanel = this.stepIconPanel;
    const imageContainer = this.stepIconPanel.querySelector('div');
    imageContainer.innerHTML = "";
    // Add new icon
    const stepIcon = this.controller.getStepIcon();
    if (stepIcon != null) {
      let backgroundColor1 = "rgb(163, 168, 226)";
      let backgroundColor2 = "rgb(80, 86, 158)";
      try {
        // Read gradient colors used to paint icon background
        const stepIconBackgroundColors = this.getLocalizedLabelText(
          "WizardPane", "stepIconBackgroundColors").trim().split(" ");
        backgroundColor1 = stepIconBackgroundColors[0];
        if (stepIconBackgroundColors.length == 1) {
          backgroundColor2 = backgroundColor1;
        } else if (stepIconBackgroundColors.length == 2) {
          backgroundColor2 = stepIconBackgroundColors[1];
        }
      } catch (ex) {
        // Do not change if exception
      }

      const gradientColor1 = backgroundColor1;
      const gradientColor2 = backgroundColor2;
      iconPanel.style.background = "linear-gradient(180deg, " + gradientColor1 + " 0%, " + gradientColor2 + " 100%)";
      iconPanel.style.border = "solid 1px #333333";
      const icon = new Image();
      icon.crossOrigin = "anonymous";
      imageContainer.appendChild(icon);
      icon.src = stepIcon.indexOf("://") === -1
        ? ZIPTools.getScriptFolder() + stepIcon
        : stepIcon;
    }
  }
}

/**
 * A dialog prompting user to choose whether an image should be resized or not.
 * @param {UserPreferences} preferences
 * @param {string} title title of the dialog
 * @param {string} message message to be displayed
 * @param {string} cancelButtonMessage
 * @param {string} keepUnchangedButtonMessage
 * @param {string} okButtonMessage
 * @param {function()} imageResizeRequested called when user selected "resize image" option
 * @param {function()} originalImageRequested called when user selected "keep image unchanged" option
 * @constructor
 * @package
 * @ignore
 */
export class JSImageResizingDialog extends JSDialog {
  constructor(
    preferences,
    title,
    message,
    cancelButtonMessage,
    keepUnchangedButtonMessage,
    okButtonMessage,
    imageResizeRequested,
    originalImageRequested
  ) {
    super(
      preferences,
      JSComponent.substituteWithLocale(preferences, title),
      "<div>" +
      JSComponent.substituteWithLocale(preferences, message).replace("<br>", " ") +
      "</div>",
      {
        applier: function (dialog) {
          if (dialog.resizeRequested) {
            imageResizeRequested();
          } else {
            originalImageRequested();
          }
        }
      }
    );

    this.cancelButtonMessage = JSComponent.substituteWithLocale(preferences, cancelButtonMessage);
    this.keepUnchangedButtonMessage = JSComponent.substituteWithLocale(preferences, keepUnchangedButtonMessage);
    this.okButtonMessage = JSComponent.substituteWithLocale(preferences, okButtonMessage);

    const dialog = this;
    const cancelButton = this.findElement(".dialog-cancel-button");
    this.registerEventListener(cancelButton, "click", (ev) => {
      dialog.cancel();
    });
    const okButtons = this.findElements(".dialog-ok-button");
    this.registerEventListener(okButtons, "click", (ev) => {
      dialog.resizeRequested = !ev.target.classList.contains("keep-image-unchanged-button");
      dialog.validate();
    });
  }

  /**
   * Appends dialog buttons to given panel.
   * @param {HTMLElement} buttonsPanel Dialog buttons panel
   * @protected
   */
  appendButtons(buttonsPanel) {
    buttonsPanel.innerHTML = JSComponent.substituteWithLocale(this.getUserPreferences(),
      "<button class='dialog-ok-button default-capable'>" + this.okButtonMessage + "</button>"
      + "<button class='keep-image-unchanged-button dialog-ok-button'>" + this.keepUnchangedButtonMessage + "</button>"
      + "<button class='dialog-cancel-button'>" + this.cancelButtonMessage + "</button>");
  }
}

/**
 * Class handling context menus.
 * @param {UserPreferences} preferences the current user preferences
 * @param {HTMLElement|HTMLElement[]} sourceElements context menu will show when right click on this element. 
 *        Cannot be null for the root node
 * @param {function(JSPopupMenuBuilder, HTMLElement)}  build 
 *    Function called with a builder, and optionally with source element (which was right clicked, to show this menu)
 * @constructor
 * @ignore
 * @author Louis Grignon
 * @author Renaud Pawlak
 */
export class JSPopupMenu extends JSComponent {
  constructor(preferences, sourceElements, build) {
    if (sourceElements == null || sourceElements.length === 0) {
      throw new Error("Cannot register a context menu on an empty list of elements");
    }
    super(preferences, "");

    this.sourceElements = sourceElements;
    if (!Array.isArray(sourceElements)) {
      this.sourceElements = [sourceElements];
    }
    this.build = build;
    this.getHTMLElement().classList.add("popup-menu");

    document.body.appendChild(this.getHTMLElement());

    const popupMenu = this;
    this.registerEventListener(sourceElements, "contextmenu", function (ev) {
      ev.preventDefault();
      if (JSPopupMenu.current != null) {
        JSPopupMenu.current.close();
      }
      popupMenu.showSourceElement(this, ev);
    });
  }

  /**
   * Closes currently displayed context menu if any.
   * @static
   * @private
   */
  static closeOpenedMenu() {
    if (JSPopupMenu.current != null) {
      JSPopupMenu.current.close();
      return true;
    }
    return false;
  }

  /**
   * @param {HTMLElement} sourceElement
   * @param {Event} ev
   * @private
   */
  showSourceElement(sourceElement, ev) {
    this.menuItemListeners = [];

    const builder = new JSPopupMenuBuilder();
    this.build(builder, sourceElement);

    const items = builder.items;
    // Remove last element if it is a separator
    if (items.length > 0 && items[items.length - 1] == JSPopupMenu.CONTEXT_MENU_SEPARATOR_ITEM) {
      items.pop();
    }
    const menuElement = this.createMenuElement(items);

    this.getHTMLElement().appendChild(menuElement);

    // Accept focus
    this.getHTMLElement().setAttribute("tabindex", 1000);
    this.getHTMLElement().style.outline = "none";
    this.getHTMLElement().style.outlineWidth = "0";

    // Temporarily use hidden visibility to get element's height
    this.getHTMLElement().style.visibility = "hidden";
    this.getHTMLElement().classList.add("visible");

    // Adjust top/left and display
    let anchorX = ev.clientX;
    if (menuElement.clientWidth > window.innerWidth) {
      anchorX = 0;
    } else if (anchorX + menuElement.clientWidth + 20 > window.innerWidth) {
      anchorX = Math.max(0, window.innerWidth - menuElement.clientWidth - 20);
    }
    let anchorY = ev.clientY;
    if (menuElement.clientHeight > window.innerHeight) {
      anchorY = 0;
    } else if (anchorY + menuElement.clientHeight + 10 > window.innerHeight) {
      anchorY = window.innerHeight - menuElement.clientHeight - 10;
    }

    this.getHTMLElement().style.visibility = "visible";
    this.getHTMLElement().style.left = anchorX + "px";
    this.getHTMLElement().style.top = anchorY + "px";
    // Request focus to receive esc key press
    this.getHTMLElement().focus();

    JSPopupMenu.current = this;
  }

  /**
   * @param {{}[]} items same type as JSPopupMenuBuilder.items
   * @param {number} [zIndex] default to initial value: 1000
   * @return {HTMLElement} menu root html element (`<ul>`)
   * @private
   */
  createMenuElement(items, zIndex) {
    if (zIndex === undefined) {
      zIndex = 1000;
    }

    const menuElement = document.createElement("ul");
    menuElement.classList.add("items");
    menuElement.style.zIndex = zIndex;
    menuElement.addEventListener("contextmenu", (ev) => {
      ev.preventDefault();
    });

    const backElement = document.createElement("li");
    backElement.classList.add("item");
    backElement.classList.add("back");
    backElement.textContent = "×";
    this.registerEventListener(backElement, "click", (ev) => {
      const isRootMenu = menuElement.parentElement.tagName.toLowerCase() != "li";
      if (isRootMenu) {
        JSPopupMenu.closeOpenedMenu();
      } else {
        menuElement.classList.remove("visible");
        ev.stopPropagation();
      }
    });
    menuElement.appendChild(backElement);

    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      const itemElement = document.createElement("li");
      if (item == JSPopupMenu.CONTEXT_MENU_SEPARATOR_ITEM) {
        itemElement.classList.add("separator");
      } else {
        this.initMenuItemElement(itemElement, item, zIndex);
      }

      menuElement.appendChild(itemElement)
    }

    return menuElement;
  }

  /**
   * Initializes a menu item element for the given item descriptor (model).
   * @param {HTMLElement} menuItemElement
   * @param {{}[]} item an item from JSPopupMenuBuilder.items
   * @param {number} zIndex current menu z-index
   * @private
   */
  initMenuItemElement(itemElement, item, zIndex) {
    const popupMenu = this;

    let itemIconElement = document.createElement("img");
    if (item.iconPath != null) {
      itemIconElement.src = item.iconPath;
      itemIconElement.classList.add("visible");
    }

    if (item.mode !== undefined) {
      itemElement.classList.add("checkable");
      if (item.selected === true) {
        itemElement.classList.add("selected");
      }
      if (item.iconPath == null) {
        itemIconElement = document.createElement("span");
        itemIconElement.innerHTML = item.selected === true ? "✓" : "&nbsp;";
        itemIconElement.classList.add("visible");
      }
    }

    const itemLabelElement = document.createElement("span");
    itemLabelElement.textContent = JSComponent.substituteWithLocale(this.getUserPreferences(), item.label);
    itemElement.classList.add("item");
    itemIconElement.classList.add("icon");
    itemElement.appendChild(itemIconElement);
    itemElement.appendChild(itemLabelElement);
    if (Array.isArray(item.subItems)) {
      itemElement.classList.add("sub-menu");

      const subMenuElement = this.createMenuElement(item.subItems, zIndex + 1);
      this.registerEventListener(itemElement, "click", (ev) => {
        subMenuElement.classList.add("visible");
      });
      this.registerEventListener(itemElement, "mouseover", (ev) => {
        const itemRect = itemElement.getBoundingClientRect();
        subMenuElement.style.position = "fixed";
        let anchorX = itemRect.left + itemElement.clientWidth;
        if (subMenuElement.clientWidth > window.innerWidth) {
          anchorX = 0;
        } else if (anchorX + subMenuElement.clientWidth > window.innerWidth) {
          anchorX = window.innerWidth - subMenuElement.clientWidth;
        }
        let anchorY = itemRect.top;
        if (subMenuElement.clientHeight > window.innerHeight) {
          anchorY = 0;
        } else if (anchorY + subMenuElement.clientHeight > window.innerHeight) {
          anchorY = window.innerHeight - subMenuElement.clientHeight;
        }
        subMenuElement.style.left = anchorX;
        subMenuElement.style.top = anchorY;
      });

      itemElement.appendChild(subMenuElement);
    }

    if (typeof item.itemSelectedListener == "function") {
      const listener = function () {
        popupMenu.close();
        setTimeout(() => {
          item.itemSelectedListener();
        }, 50);
      };
      itemElement.addEventListener("click", listener);
      itemElement.addEventListener("mouseup", listener);
      this.menuItemListeners.push(() => {
        itemElement.removeEventListener("click", listener);
        itemElement.removeEventListener("mouseup", listener);
      });
    }
  }

  /**
   * Closes the context menu.
   */
  close() {
    this.getHTMLElement().removeAttribute("tabindex");
    this.getHTMLElement().classList.remove("visible");
    JSPopupMenu.current = null;

    if (this.menuItemListeners) {
      for (let i = 0; i < this.menuItemListeners.length; i++) {
        this.menuItemListeners[i]();
      }
    }

    this.menuItemListeners = null;
    this.getHTMLElement().innerHTML = "";
  }

  /**
   * Builds items of a context menu which is about to be shown.
   * @ignore
   */
  static Builder() {
    /** @type {{ label?: string, iconPath?: string, itemSelectedListener?: function(), subItems?: {}[] }[] } } */
    this.items = [];
  }
}

class JSPopupMenuBuilder {
  /** @type {{ label?: string, iconPath?: string, itemSelectedListener?: function(), subItems?: {}[] }[] } } */
  items = [];

  // JSPopupMenuBuilder.prototype = Object.create(JSPopupMenuBuilder.prototype);
  // JSPopupMenuBuilder.prototype.constructor = JSPopupMenuBuilder;

  /**
   * Add a checkable item
   * @param {string} label
   * @param {function()} [itemSelectedListener]
   * @param {boolean} [checked]
   */
  addCheckBoxItem(label, itemSelectedListener, checked) {
    this.addNewMenuItem(label, undefined, itemSelectedListener, checked === true, "checkbox");
  }

  /**
   * Add a radio button item
   * @param {string} label
   * @param {function()} [itemSelectedListener]
   * @param {boolean} [checked]
   */
  addRadioButtonItem(label, itemSelectedListener, checked) {
    this.addNewMenuItem(label, undefined, itemSelectedListener, checked === true, "radiobutton");
  }

  /**
   * Adds an item to this menu using either a ResourceAction, or icon (optional), label & callback.
   * 1) builder.addMenuItem(pane.getAction(MyPane.ActionType.MY_ACTION))
   * 2) builder.addMenuItem('resources/icons/tango/media-skip-forward.png', "myitem", function() { console.log('my item clicked') })
   * 3) builder.addMenuItem("myitem", function() { console.log('my item clicked') })
   * @param {ResourceAction|string} actionOrIconPathOrLabel
   * @param {string|function()} [itemSelectedListenerOrLabel]
   * @param {function()} [itemSelectedListener]
   * @return {JSPopupMenuBuilder}
   */
  addMenuItem(actionOrIconPathOrLabel, itemSelectedListenerOrLabel, itemSelectedListener) {
    let label = null;
    let iconPath = null;
    var itemSelectedListener = null;
    // Defined only for a check action
    const checked = undefined;
    // Defined only for a toggle action
    let selected = undefined;

    if (actionOrIconPathOrLabel instanceof ResourceAction) {
      const action = actionOrIconPathOrLabel;
      // Do no show item if action is disabled
      if (!action.isEnabled() || action.getValue(ResourceAction.VISIBLE) === false) {
        return this;
      }

      iconPath = action.getURL(AbstractAction.SMALL_ICON);
      label = action.getValue(ResourceAction.POPUP) || action.getValue(AbstractAction.NAME);

      if (action.getValue(ResourceAction.TOGGLE_BUTTON_GROUP)) {
        selected = action.getValue(AbstractAction.SELECTED_KEY);
      }
      itemSelectedListener = function () {
        action.actionPerformed();
      };
    } else if (typeof itemSelectedListener == "function") {
      iconPath = actionOrIconPathOrLabel;
      label = itemSelectedListenerOrLabel;
      itemSelectedListener = itemSelectedListener;
    } else {
      label = actionOrIconPathOrLabel;
      itemSelectedListener = itemSelectedListenerOrLabel;
    }

    this.addNewMenuItem(label, iconPath, itemSelectedListener, selected, selected !== undefined ? "radiobutton" : undefined);
    return this;
  }

  /**
   * @param {string} label
   * @param {string | undefined} [iconPath]
   * @param {function() | undefined} [itemSelectedListener]
   * @param {boolean | undefined} [selected]
   * @param {"radiobutton" | "checkbox" | undefined} [mode]
   * @private
   */
  addNewMenuItem(label, iconPath, itemSelectedListener, selected, mode) {
    this.items.push({
      label: label,
      iconPath: iconPath,
      itemSelectedListener: itemSelectedListener,
      selected: selected,
      mode: mode
    });
  }

  /**
   * Adds a sub menu to this menu.
   * @param {ResourceAction|string} action
   * @param {function(JSPopupMenuBuilder)} buildSubMenu
   * @return {JSPopupMenuBuilder}
   */
  addSubMenu(action, buildSubMenu) {
    // Do no show item if action is disabled
    if (action.isEnabled()) {
      const label = action.getValue(ResourceAction.POPUP) || action.getValue(AbstractAction.NAME);
      const iconPath = action.getURL(AbstractAction.SMALL_ICON);
      const subMenuBuilder = new JSPopupMenuBuilder();
      buildSubMenu(subMenuBuilder);
      const subItems = subMenuBuilder.items;
      if (subItems.length > 0) {
        this.items.push({
          label: label,
          iconPath: iconPath,
          subItems: subItems
        });
      }
    }

    return this;
  }

  /**
   * Adds a separator after previous items.
   * Does nothing if there are no items yet or if the latest added item is already a separator.
   * @return {JSPopupMenuBuilder}
   */
  addSeparator() {
    if (this.items.length > 0 && this.items[this.items.length - 1] != JSPopupMenu.CONTEXT_MENU_SEPARATOR_ITEM) {
      this.items.push(JSPopupMenu.CONTEXT_MENU_SEPARATOR_ITEM);
    }
    return this;
  }
}

JSPopupMenu.CONTEXT_MENU_SEPARATOR_ITEM = {};

JSPopupMenu.Builder = JSPopupMenuBuilder



// Global initializations of the toolkit
if (!JSPopupMenu.globalCloserRegistered) {
  const listener = function (ev) {
    if (JSPopupMenu.current != null
      && !JSComponent.isElementContained(ev.target, JSPopupMenu.current.getHTMLElement())) {
      // Clicked outside menu
      if (JSPopupMenu.closeOpenedMenu()) {
        ev.stopPropagation();
        ev.preventDefault();
      }
    }
  };
  window.addEventListener("click", listener);
  window.addEventListener("touchstart", listener);

  document.addEventListener("keydown", (ev) => {
    if (ev.key == "Escape" || ev.keyCode == 27) {
      if (!JSComboBox.closeOpenedSelectionPanel()) {
        JSDialog.closeTopMostDialog();
        JSPopupMenu.closeOpenedMenu();
      }
    } else if (ev.keyCode == 13 && JSDialog.getTopMostDialog() != null) {
      const defaultCapableButton = JSDialog.getTopMostDialog().findElement(".default-capable");
      if (defaultCapableButton != null) {
        defaultCapableButton.click();
      }
    }
  });

  JSPopupMenu.globalCloserRegistered = true;
}


/**
 * A spinner component with -+ buttons able to decrease / increase edtied value.
 * @param {UserPreferences} preferences the current user preferences
 * @param {HTMLElement} spanElement span element on which the spinner is installed
 * @param {{format?: Format, nullable?: boolean, value?: number, minimum?: number, maximum?: number, stepSize?: number}} [options]
 * - format: number format to be used for this input - default to DecimalFormat for current content
 * - nullable: false if null/undefined is not allowed - default false
 * - value: initial value,
 * - minimum: minimum number value,
 * - maximum: maximum number value,
 * - stepSize: step between values when increment / decrement using UI - default 1
 * @constructor
 * @extends JSComponent
 * @author Louis Grignon
 * @author Emmanuel Puybaret
 */
export class JSSpinner extends JSComponent {
  constructor(preferences, spanElement, options) {
    super(preferences, spanElement, true);
    if (spanElement.tagName.toUpperCase() != "SPAN") {
      throw new Error("JSSpinner: please provide a span for the spinner to work - " + spanElement + " is not a span");
    }

    if (!options) {
      options = {};
    }
    this.checkMinimumMaximum(options.minimum, options.maximum);

    if (!isNaN(parseFloat(options.minimum))) {
      this.minimum = options.minimum;
    }
    if (!isNaN(parseFloat(options.maximum))) {
      this.maximum = options.maximum;
    }
    if (isNaN(parseFloat(options.stepSize))) {
      this.stepSize = 1;
    } else {
      this.stepSize = options.stepSize;
    }
    if (typeof options.nullable == "boolean") {
      this.nullable = options.nullable;
    } else {
      this.nullable = false;
    }
    if (options.format instanceof Format) {
      this.format = options.format;
    } else {
      this.format = new DecimalFormat();
    }

    const component = this;
    

    spanElement.classList.add("spinner");

    this.textInput = document.createElement("input");
    this.textInput.type = "text";
    spanElement.appendChild(this.textInput);

    this.registerEventListener(this.textInput, "focus", (ev) => {
      component.updateUI();
    });
    this.registerEventListener(this.textInput, "focusout", (ev) => {
      component.updateUI();
    });

    this.registerEventListener(this.textInput, "input", (ev) => {
      if (component.isFocused()) {
        const pos = new ParsePosition(0);
        const inputValue = component.parseValueFromInput(pos);
        if (pos.getIndex() != component.textInput.value.length
          || inputValue == null && !component.nullable
          || (component.minimum != null && inputValue < component.minimum)
          || (component.maximum != null && inputValue > component.maximum)) {
          component.textInput.style.color = "red";
        } else {
          component.textInput.style.color = null;
          component.value = inputValue;
        }
      }
    });

    this.registerEventListener(this.textInput, "blur", (ev) => {
      let inputValue = component.parseValueFromInput();
      if (inputValue == null && !component.nullable) {
        let restoredValue = component.value;
        if (restoredValue == null) {
          restoredValue = component.getDefaultValue();
        }
        inputValue = restoredValue;
      }
      component.textInput.style.color = null;
      component.setValue(inputValue);
    });

    this.initIncrementDecrementButtons(spanElement);

    Object.defineProperty(this, "width", {
      get: function () { return spanElement.style.width; },
      set: function (value) { spanElement.style.width = value; }
    });
    Object.defineProperty(this, "parentElement", {
      get: function () { return spanElement.parentElement; }
    });
    Object.defineProperty(this, "previousElementSibling", {
      get: function () { return spanElement.previousElementSibling; }
    });
    Object.defineProperty(this, "style", {
      get: function () { return spanElement.style; }
    });

    this.setValue(options.value);
  }

  /**
   * @return {Object} the value of this spinner
   */
  getValue() {
    return this.value;
  }

  /**
   * @param {Object} value the value of this spinner
   */
  setValue(value) {
    if (value instanceof Big) {
      value = parseFloat(value);
    }
    if (value != null && typeof value != "number") {
      throw new Error("JSSpinner: Expected values of type number");
    }
    if (value == null && !this.nullable) {
      value = this.getDefaultValue();
    }
    if (value != null && this.minimum != null && value < this.minimum) {
      value = this.minimum;
    }
    if (value != null && this.maximum != null && value > this.maximum) {
      value = this.maximum;
    }

    if (value != this.value) {
      this.value = value;
      this.updateUI();
    }
  }

  /**
   * @return {number} minimum of this spinner
   * @private
   */
  checkMinimumMaximum(minimum, maximum) {
    if (minimum != null && maximum != null && minimum > maximum) {
      throw new Error("JSSpinner: minimum is not below maximum - minimum = " + minimum + " maximum = " + maximum);
    }
  }

  /**
   * @return {boolean} <code>true</code> if this spinner may contain no value
   */
  isNullable() {
    return this.nullable;
  }

  /**
   * @param {boolean} nullable <code>true</code> if this spinner may contain no value
   */
  setNullable(nullable) {
    const containsNullValue = this.nullable && this.value === null;
    this.nullable = nullable;
    if (!nullable && containsNullValue) {
      this.value = this.getDefaultValue();
    }
  }

  /**
   * @return {Format} format used to format the value of this spinner
   */
  getFormat() {
    return this.format;
  }

  /**
   * @param {Format} format  format used to format the value of this spinner
   */
  setFormat(format) {
    this.format = format;
    this.updateUI();
  }

  /**
   * @return {number} minimum of this spinner
   */
  getMinimum() {
    return this.minimum;
  }

  /**
   * @param {number} minimum minimum value of this spinner
   */
  setMinimum(minimum) {
    this.checkMinimumMaximum(minimum, this.maximum);
    this.minimum = minimum;
  }

  /**
   * @return {number} minimum of this spinner
   */
  getMinimum() {
    return this.minimum;
  }

  /**
   * @param {number} minimum minimum value of this spinner
   */
  setMinimum(minimum) {
    this.checkMinimumMaximum(minimum, this.maximum);
    this.minimum = minimum;
  }

  /**
   * @return {number} maximum of this spinner
   */
  getMaximum() {
    return this.maximum;
  }

  /**
   * @param {number} maximum maximum value of this spinner
   */
  setMaximum(maximum) {
    this.checkMinimumMaximum(this.minimum, maximum);
    this.maximum = maximum;
  }

  /**
   * @return {number} step size of this spinner
   */
  getStepSize() {
    return this.stepSize;
  }

  /**
   * @param {number} stepSize step size of this spinner
   */
  setStepSize(stepSize) {
    this.stepSize = stepSize;
  }

  /**
   * @return {HTMLInputElement} underlying input element
   */
  getInputElement() {
    return this.textInput;
  }

  addEventListener() {
    return this.textInput.addEventListener.apply(this.textInput, arguments);
  }

  removeEventListener() {
    return this.textInput.removeEventListener.apply(this.textInput, arguments);
  }

  /**
   * Refreshes UI for current state / options. For instance, if format has changed, displayed text is updated.
   * @private
   */
  updateUI() {
    this.textInput.value = this.formatValueForUI(this.value);
  }

  /**
   * @param {ParsePosition} [parsePosition]
   * @return {number}
   * @private
   */
  parseValueFromInput(parsePosition) {
    if (!this.textInput.value || this.textInput.value.trim() == "") {
      if (this.nullable) {
        return null;
      } else {
        return this.value;
      }
    }
    return this.format.parse(this.textInput.value,
      parsePosition != undefined ? parsePosition : new ParsePosition(0));
  }

  /**
   * @return {number}
   * @private
   */
  getDefaultValue() {
    let defaultValue = 0;
    if (this.minimum != null && this.minimum > defaultValue) {
      defaultValue = this.minimum;
    }
    if (this.maximum != null && this.maximum < defaultValue) {
      defaultValue = this.maximum;
    }
    return defaultValue;
  }

  /**
   * @param {number} value
   * @return {string}
   * @private
   */
  formatValueForUI(value) {
    if (value == null) {
      return "";
    }

    if (!this.isFocused()) {
      return this.format.format(value);
    }
    if (this.noGroupingFormat == null || this.lastFormat !== this.format) {
      // Format changed, compute focused format
      this.lastFormat = this.format;
      this.noGroupingFormat = this.lastFormat.clone();
      this.noGroupingFormat.setGroupingUsed(false);
    }
    return this.noGroupingFormat.format(value);
  }

  /**
   * @return {boolean} true if this spinner has focus
   * @private
   */
  isFocused() {
    return this.textInput === document.activeElement;
  }

  /**
   * Creates and initialize increment & decrement buttons + related keystrokes.
   * @private
   */
  initIncrementDecrementButtons(spanElement) {
    const component = this;
    this.incrementButton = document.createElement("button");
    this.incrementButton.setAttribute("increment", "");
    this.incrementButton.textContent = "+";
    this.incrementButton.tabIndex = -1;
    spanElement.appendChild(this.incrementButton);

    this.decrementButton = document.createElement("button");
    this.decrementButton.setAttribute("decrement", "");
    this.decrementButton.textContent = "-";
    this.decrementButton.tabIndex = -1;
    spanElement.appendChild(this.decrementButton);

    const incrementValue = function (ev) {
      let previousValue = component.value;
      if (previousValue == null || isNaN(previousValue)) {
        previousValue = component.getDefaultValue();
      }
      component.setValue(previousValue + component.stepSize);
      component.fireInputEvent();
    };
    const decrementValue = function (ev) {
      let previousValue = component.value;
      if (previousValue == null || isNaN(previousValue)) {
        previousValue = component.getDefaultValue();
      }
      component.setValue(previousValue - component.stepSize);
      component.fireInputEvent();
    };

    // Repeat incrementValue / decrementValue every 80 ms with an initial delay of 400 ms
    // while mouse button kept pressed, and ensure at least one change is triggered for a short click
    const repeatAction = function (ev, button, action) {
      if (component.isFocused()) {
        ev.preventDefault(); // Prevent input from losing focus 
      }
      const stopRepeatedTask = function (ev) {
        clearTimeout(taskId);
        button.removeEventListener("mouseleave", stopRepeatedTask);
        button.removeEventListener("mouseup", stopRepeatedTask);
      };
      const clickAction = function (ev) {
        clearTimeout(taskId);
        button.removeEventListener("click", clickAction);
        action();
      };
      button.addEventListener("click", clickAction);
      const repeatedTask = function () {
        action();
        taskId = setTimeout(repeatedTask, 80);
      };
      var taskId = setTimeout(() => {
        button.removeEventListener("click", clickAction);
        button.addEventListener("mouseleave", stopRepeatedTask);
        button.addEventListener("mouseup", stopRepeatedTask);
        repeatedTask();
      }, 400);
    };
    const repeatIncrementValue = function (ev) {
      repeatAction(ev, component.incrementButton, incrementValue);
    };
    this.registerEventListener(component.incrementButton, "mousedown", repeatIncrementValue);

    const repeatDecrementValue = function (ev) {
      repeatAction(ev, component.decrementButton, decrementValue);
    };
    this.registerEventListener(component.decrementButton, "mousedown", repeatDecrementValue);

    this.registerEventListener(component.textInput, "keydown", (ev) => {
      const keyStroke = KeyStroke.getKeyStrokeForEvent(ev, "keydown");
      if (keyStroke.lastIndexOf(" UP") > 0) {
        ev.stopImmediatePropagation();
        incrementValue();
      } else if (keyStroke.lastIndexOf(" DOWN") > 0) {
        ev.stopImmediatePropagation();
        decrementValue();
      }
    });
    this.registerEventListener(this.textInput, "focus", (ev) => {
      component.updateUI();
    });
  }

  /**
   * Fires an "input" event on behalf of underlying text input.
   * @private
   */
  fireInputEvent() {
    const ev = document.createEvent("Event");
    ev.initEvent("input", true, true);
    this.textInput.dispatchEvent(ev);
  }

  /**
   * Enables or disables this component.
   * @param {boolean} enabled
   */
  setEnabled(enabled) {
    this.textInput.disabled = !enabled;
    this.incrementButton.disabled = !enabled;
    this.decrementButton.disabled = !enabled;
  }
}

/**
 * A combo box component which allows any type of content (e.g. images).
 * @param {UserPreferences} preferences the current user preferences
 * @param {HTMLElement} selectElement HTML element on which install this component
 * @param {{nullable?: boolean, value?: any, availableValues: (any)[], renderCell?: function(value: any, element: HTMLElement), selectionChanged: function(newValue: any)}} [options]
 * - nullable: false if null/undefined is not allowed - default false
 * - value: initial value - default undefined if nullable or first available value,
 * - availableValues: available values in this combo,
 * - renderCell: a function which builds displayed element for a given value - defaults to setting textContent to value.toString()
 * - selectionChanged: called with new value when selected by user
 * @constructor
 * @extends JSComponent
 * @author Louis Grignon
 */
export class JSComboBox extends JSComponent {
  constructor(preferences, selectElement, options) {
    super(preferences, selectElement, true);

    if (!options) {
      options = {};
    }
    if (typeof options.nullable != "boolean") {
      options.nullable = false;
    }
    if (!Array.isArray(options.availableValues) || options.availableValues.length <= 0) {
      throw new Error("JSComboBox: No available values provided");
    }
    if (typeof options.renderCell != "function") {
      options.renderCell = function (value, element) {
        element.textContent = value == null ? "" : value.toString();
      };
    }
    if (options.value == null && !options.nullable) {
      options.value = options.availableValues[0];
    }

    this.options = options;

    selectElement.classList.add("combo-box");

    this.button = document.createElement("button");
    selectElement.appendChild(this.button);

    this.preview = document.createElement("div");
    this.preview.classList.add("preview");
    this.button.appendChild(this.preview);

    this.initSelectionPanel();
    const component = this;
    this.registerEventListener(this.button, "click", (ev) => {
      ev.stopImmediatePropagation();
      component.openSelectionPanel(ev.pageX, ev.pageY);
    });

    this.setSelectedItem(options.value);
  }

  /**
   * @private
   */
  initSelectionPanel() {
    const selectionPanel = document.createElement("div");
    selectionPanel.classList.add("selection-panel");

    for (let i = 0; i < this.options.availableValues.length; i++) {
      const currentItemElement = document.createElement("div");
      currentItemElement.value = this.options.availableValues[i];
      this.options.renderCell(currentItemElement.value, currentItemElement);
      selectionPanel.appendChild(currentItemElement);
    }

    this.getHTMLElement().appendChild(selectionPanel);
    this.selectionPanel = selectionPanel;

    const component = this;
    this.registerEventListener(selectionPanel.children, "click", function (ev) {
      component.selectedItem = this.value;
      component.updateUI();
      if (typeof component.options.selectionChanged == "function") {
        component.options.selectionChanged(component.selectedItem);
      }
    });
    const comboBox = this;
    this.registerEventListener(this.selectionPanel, "focusout", (ev) => {
      comboBox.closeSelectionPanel();
    });
  }

  /**
   * @return {number} the value selected in this combo box
   */
  getSelectedItem() {
    return this.selectedItem;
  }

  /**
   * @param {number} selectedItem  the value to select in this combo box
   */
  setSelectedItem(selectedItem) {
    let isValueAvailable = false;
    for (let i = 0; i < this.options.availableValues.length; i++) {
      if (this.areValuesEqual(selectedItem, this.options.availableValues[i])) {
        isValueAvailable = true;
        break;
      }
    }
    if (!isValueAvailable) {
      selectedItem = null;
    }

    if (selectedItem == null && !this.options.nullable) {
      selectedItem = this.options.availableValues[0];
    }

    if (!this.areValuesEqual(selectedItem, this.selectedItem)) {
      this.selectedItem = selectedItem;
      this.updateUI();
    }
  }

  /**
   * Enables or disables this combo box.
   * @param {boolean} enabled 
   */
  setEnabled(enabled) {
    this.button.disabled = !enabled;
  }

  /**
   * Opens the combo box's selection panel.
   * @param {number} pageX
   * @param {number} pageY
   * @private
   */
  openSelectionPanel(pageX, pageY) {
    if (JSComboBox.current != null) {
      JSComboBox.current.closeSelectionPanel();
    }

    const comboBox = this;
    this.closeSelectionPanelListener = function () {
      comboBox.closeSelectionPanel();
    }

    this.selectionPanel.style.display = "block";
    this.selectionPanel.style.opacity = 1;
    this.selectionPanel.style.left = (pageX + this.selectionPanel.clientWidth > window.width ? window.width - this.selectionPanel.clientWidth : pageX) + "px";
    this.selectionPanel.style.top = (pageY + this.selectionPanel.clientHeight > window.innerHeight ? window.innerHeight - this.selectionPanel.clientHeight : pageY) + "px";
    window.addEventListener("click", this.closeSelectionPanelListener);
    JSComboBox.current = this;
  }

  /**
   * Closes the combo box's selection panel.
   * @private
   */
  closeSelectionPanel() {
    window.removeEventListener("click", this.closeSelectionPanelListener);
    this.selectionPanel.style.opacity = 0;
    this.selectionPanel.style.display = "none";
    this.closeSelectionPanelListener = null;
    JSComboBox.current = null;
  }

  /**
   * Closes currently displayed selection panel if any.
   * @static
   * @ignore
   */
  static closeOpenedSelectionPanel() {
    if (JSComboBox.current != null) {
      JSComboBox.current.closeSelectionPanel();
      return true;
    }
    return false;
  }

  /**
   * Refreshes UI, i.e. preview of selected value.
   */
  updateUI() {
    this.preview.innerHTML = "";
    this.options.renderCell(this.getSelectedItem(), this.preview);
  }

  /**
   * Checks if value1 and value2 are equal. Returns true if so.
   * NOTE: this internally uses JSON.stringify to compare values
   * @return {boolean}
   * @private
   */
  areValuesEqual(value1, value2) {
    return JSON.stringify(value1) == JSON.stringify(value2);
  }
}

/*
 * @typedef {{
 *   visibleColumnNames?: string[],
 *   expandedRowsIndices?: number[],
 *   expandedRowsValues?: any[],
 *   sort?: { columnName: string, direction: "asc" | "desc" }
 * }} TreeTableState
 * @property TreeTableState.expandedRowsIndices index in filtered and sorted rows, expandedRowsValues can also be used but not both (expandedRowsValues will be preferred)
 * @property TreeTableState.expandedRowsValues expanded rows listed by their values. It takes precedence over expandedRowsIndices but achieves the same goal
 */
/*
 * @typedef {{
 *   columns: {
 *       name: string,
 *       orderIndex: number,
 *       label: string,
 *       defaultWidth?: string
 *   }[],
 *   renderCell: function(value: any, columnName: string, cell: HTMLElement): void,
 *   getValueComparator: function(sortConfig?: { columnName: string, direction: "asc" | "desc" }): function(value1: any, value2: any),
 *   selectionChanged: function(values: any[]): void,
 *   rowDoubleClicked: function(value: any): void,
 *   expandedRowsChanged: function(expandedRowsValues: any[], expandedRowsIndices: number[]): void,
 *   sortChanged: function(sort: { columnName: string, direction: "asc" | "desc" }): void,
 *   initialState?: TreeTableState
 * }} TreeTableModel
 * @property TreeTableModel.renderCell render cell to given html element for given value, column name
 * @property TreeTableModel.selectionChanged called when a row selection changes, passing updated selected values
 * @property TreeTableModel.rowDoubleClicked called when a row is double clicked, passing row's value
 */

/**
 * A flexible tree table which allows grouping (tree aspect), sorting, some inline edition, single/multi selection, contextual menu, copy/paste.
 * @param {HTMLElement} container html element on which this component is installed
 * @param {UserPreferences} preferences the current user preferences
 * @param {TreeTableModel} model table's configuration
 * @param {{value: any, children: {value, children}[] }[]} [data] data source for this tree table - defaults to empty data
 * @constructor
 * @extends JSComponent
 * @author Louis Grignon
 */
export class JSTreeTable extends JSComponent {
  constructor(container, preferences, model, data) {
    super(preferences, container, true);

    /**
     * @type {TreeTableState}
     */
    this.state = {};
    this.selectedRowsValues = [];

    this.tableElement = document.createElement("div");
    this.tableElement.classList.add("tree-table");
    container.appendChild(this.tableElement);
    this.setModel(model);
    this.setData(data ? data : []);
  }

  /**
   * Sets data and updates rows in UI.
   * @param {{value: any, children: {value, children}[] }[]} data
   */
  setData(data) {
    this.data = data;

    const expandedRowsValues = this.getExpandedRowsValues();
    if (expandedRowsValues != null) {
      this.updateState({
        expandedRowsValues: expandedRowsValues
      });
    }

    if (this.isDisplayed()) {
      this.generateTableRows();
      this.fireExpandedRowsChanged();
    }
  }

  /**
   * Updates in UI the data of the row matching the given value.
   * @param {any} value
   * @param {string} [columnName] name of the column which may have changed 
   */
  updateRowData(value, columnName) {
    if (this.isDisplayed()) {
      if (!this.state.sort
        || this.state.sort.columnName == null
        || (columnName !== undefined && this.state.sort.columnName != columnName)) {
        const columnNames = this.getColumnNames();
        const columnIndex = columnName !== undefined
          ? columnNames.indexOf(columnName)
          : 0;
        if (columnIndex >= 0) {
          const rows = this.bodyElement.children;
          for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            if (row._model.value === value) {
              if (columnName !== undefined) {
                this.model.renderCell(value, columnName, row.children[columnIndex]);
              } else {
                for (let j = 0; j < columnNames.length; j++) {
                  this.model.renderCell(value, columnNames[j], row.children[j]);
                }
              }
              break;
            }
          }
        }
      } else {
        this.generateTableRows();
      }
    }
  }

  /**
   * Gets current table data
   * @return {{value: any, children: {value, children}[] }[]}
   */
  getData() {
    return this.data;
  }

  /**
   * @param {TreeTableModel} model
   */
  setModel(model) {
    this.model = model;

    this.updateState(model.initialState);
    this.columnsWidths = this.getColumnsWidthByName();

    if (this.isDisplayed()) {
      this.generateTableHeaders();
      this.generateTableRows();
    }
  }

  /**
   * @private
   */
  isDisplayed() {
    return window.getComputedStyle(this.getHTMLElement()).display != "none";
  }

  /**
   * @param {any[]} values
   */
  setSelectedRowsByValue(values) {
    this.selectedRowsValues = values.slice(0);
    if (this.isDisplayed()) {
      this.expandGroupOfSelectedRows(values);
      const rows = this.bodyElement.children;
      // Unselect all
      for (var j = 0; j < rows.length; j++) {
        var row = rows[j];
        row._model.selected = false;
        row.classList.remove("selected");
      }
      // Select values
      for (let i = 0; i < values.length; i++) {
        for (var j = 0; j < rows.length; j++) {
          var row = rows[j];
          if (row._model.value === values[i]) {
            this.selectRowAt(j);
            break;
          }
        }
      }
      this.scrollToSelectedRowsIfNotVisible();
    }
  }

  /**
   * Selects the row at the given <code>index</code> and its children.
   * @param {number} index
   * @private
   */
  selectRowAt(index) {
    const rows = this.bodyElement.children;
    const row = rows[index];
    row._model.selected = true;
    row.classList.add("selected");
    if (row._model.group
      && row._model.collapsed === false) {
      // Change children selection of expanded group
      for (let i = index + 1; i < rows.length; i++) {
        const childrenRow = rows[i];
        if (childrenRow._model.parentGroup
          && childrenRow._model.parentGroup.value === row._model.value) {
          this.selectRowAt(i);
        }
      }
    }
  }

  /**
   * Expands the parents of the given values when they are collapsed.
   * @private
   */
  expandGroupOfSelectedRows(values) {
    if (this.isDisplayed()) {
      const rows = this.bodyElement.children;
      for (let i = 0; i < values.length; i++) {
        for (let j = 0; j < rows.length; j++) {
          const row = rows[j];
          if (row._model.value === values[i]) {
            if (row._model.hidden) {
              this.expandOrCollapseRow(row._model.parentGroup, true);
              // Find parent group
              for (let k = j - 1; k >= 0; k--) {
                if (row._model.parentGroup.value === rows[k]._model.value) {
                  rows[k]._model.collapsed = false;
                  rows[k].classList.remove("collapsed");
                  // Make sibling rows visible
                  for (k++; k < rows.length; k++) {
                    const childrenRow = rows[k];
                    if (childrenRow._model.parentGroup
                      && childrenRow._model.parentGroup.value === row._model.parentGroup.value) {
                      childrenRow._model.hidden = false;
                      childrenRow.style.display = "flex";
                    }
                  }
                  if (row._model.parentGroup.parentGroup) {
                    this.expandGroupOfSelectedRows([row._model.parentGroup.value]);
                  }
                  break;
                }
              }
            }
            break;
          }
        }
      }
    }
  }

  /**
   * @private
   */
  scrollToSelectedRowsIfNotVisible() {
    const selectedRows = this.bodyElement.querySelectorAll(".selected");
    if (selectedRows.length > 0) {
      // If one selected row is visible, do not change scroll
      for (let i = 0; i < selectedRows.length; i++) {
        const selectedRow = selectedRows[i];
        const rowTop = selectedRow.offsetTop - this.bodyElement.offsetTop;
        const rowBottom = rowTop + selectedRow.clientHeight;
        if (rowTop >= this.bodyElement.scrollTop && rowBottom <= (this.bodyElement.scrollTop + this.bodyElement.clientHeight)) {
          return;
        }
      }

      this.bodyElement.scrollTop = selectedRows[0].offsetTop - this.bodyElement.offsetTop;
    }
  }

  /**
   * @return {any[]} expanded rows by their values
   * @private
   */
  getExpandedRowsValues() {
    if (this.state && this.state.expandedRowsValues) {
      return this.state.expandedRowsValues;
    }
    return undefined;
  }

  /**
   * @private
   */
  fireExpandedRowsChanged() {
    if (this.state.expandedRowsValues != null) {
      this.updateExpandedRowsIndices();
      this.model.expandedRowsChanged(this.state.expandedRowsValues, this.state.expandedRowsIndices);
    }
  }

  /**
   * Refreshes expandedRowsIndices from expandedRowsValues
   * @private
   */
  updateExpandedRowsIndices() {
    if (this.state.expandedRowsValues != null
      && this.data != null
      && this.data.sortedList != null) {
      this.state.expandedRowsIndices = [];
      for (let i = 0; i < this.data.sortedList.length; i++) {
        const value = this.data.sortedList[i].value;
        if (this.state.expandedRowsValues.indexOf(value) > -1) {
          this.state.expandedRowsIndices.push(i);
        }
      }
    }
  }

  /**
   * @private
   */
  fireSortChanged() {
    if (this.state.sort != null) {
      this.model.sortChanged(this.state.sort);
    }
  }

  /**
   * @param {Partial<TreeTableState>} [stateProperties]
   * @private
   */
  updateState(stateProperties) {
    if (stateProperties) {
      CoreTools.merge(this.state, stateProperties);
    }
  }

  /**
   * @return {function(value1: any, value2: any)}
   * @private
   */
  getValueComparator() {
    return this.model.getValueComparator(this.state.sort);
  }

  /**
   * @private
   */
  generateTableHeaders() {
    const treeTable = this;

    let head = this.tableElement.querySelector("[header]");
    if (!head) {
      head = document.createElement("div");
      head.setAttribute("header", "true");
      this.tableElement.appendChild(head);
      this.tableElement.appendChild(document.createElement("br"));
    }
    head.innerHTML = "";

    const columns = this.getColumns();
    for (let i = 0; i < columns.length; i++) {
      const column = columns[i];
      const headCell = document.createElement("div");
      head.appendChild(headCell);
      headCell.setAttribute("cell", "true");
      headCell.textContent = column.label;
      headCell.dataset["name"] = column.name;
      if (this.state.sort && this.state.sort.columnName == column.name) {
        headCell.classList.add("sort");
        if (this.state.sort.direction == "desc") {
          headCell.classList.add("descending");
        }
      }

      headCell.style.width = treeTable.getColumnWidth(column.name);
    }
    this.registerEventListener(head.children, "click", function (ev) {
      const columnName = this.dataset["name"];
      const descending = this.classList.contains("sort") && !this.classList.contains("descending");
      treeTable.sortTable(columnName, descending);
    });
  }

  /**
   * @private
   */
  generateTableRows() {
    const treeTable = this;
    const tableRowsGenerator = function () {
      let scrollTop = 0;
      if (treeTable.bodyElement) {
        scrollTop = treeTable.bodyElement.scrollTop;
        treeTable.bodyElement.parentElement.removeChild(treeTable.bodyElement);
      }
      treeTable.bodyElement = document.createElement("div");
      treeTable.bodyElement.setAttribute("body", "true");

      // Generate simplified table model: a sorted list of items
      const sortedList = treeTable.data.sortedList = [];
      const comparator = treeTable.getValueComparator();

      /**
       * @param {{value: any, children: any[]}[]} currentNodes
       * @param {number} currentIndentation
       * @param {any} [parentGroup]
       * @return {Object[]} generated children items
       */
      const sortDataTree = function (currentNodes, currentIndentation, parentGroup) {
        // Children nodes are hidden by default, and will be flagged as visible with setCollapsed, see below
        const hideChildren = currentIndentation > 0;
        const sortedCurrentNodes = comparator != null
          ? currentNodes.sort((leftNode, rightNode) => {
            return comparator(leftNode.value, rightNode.value);
          })
          : currentNodes;
        const currentNodesItems = [];
        for (let i = 0; i < sortedCurrentNodes.length; i++) {
          const currentNode = sortedCurrentNodes[i];
          const currentNodeSelected = treeTable.selectedRowsValues.indexOf(currentNode.value) > -1;
          const selected = (parentGroup && parentGroup.selected) || currentNodeSelected;
          const sortedListItem = {
            value: currentNode.value,
            indentation: currentIndentation,
            group: false,
            parentGroup: parentGroup,
            selected: selected,
            hidden: hideChildren,
            collapsed: undefined,
            childrenItems: undefined,
            setCollapsed: function () { },
            isInCollapsedGroup: function () {
              let parent = this;
              while ((parent = parent.parentGroup)) {
                if (parent.collapsed === true) {
                  return true;
                }
              }
              return false;
            }
          };
          currentNodesItems.push(sortedListItem);
          sortedList.push(sortedListItem);

          // Create node's children items
          if (Array.isArray(currentNode.children) && currentNode.children.length > 0) {
            sortedListItem.group = true;
            sortedListItem.collapsed = true;
            sortedListItem.childrenItems = sortDataTree(currentNode.children, currentIndentation + 1, sortedListItem);
            sortedListItem.setCollapsed = (function (item) {
              return function (collapsed) {
                item.collapsed = collapsed;
                for (let i = 0; i < item.childrenItems.length; i++) {
                  item.childrenItems[i].hidden = collapsed;
                }
              };
            })(sortedListItem);
          }
        }

        return currentNodesItems;
      };
      sortDataTree(treeTable.data.slice(0), 0);

      // Synchronize expandedRowsIndices/expandedRowsValues & flag groups as expanded, and children as visible
      treeTable.updateExpandedRowsIndices();
      if (treeTable.state.expandedRowsIndices && treeTable.state.expandedRowsIndices.length > 0) {
        const expandedRowsValues = [];
        for (var i = 0; i < treeTable.state.expandedRowsIndices.length; i++) {
          const item = sortedList[treeTable.state.expandedRowsIndices[i]];
          if (item) {
            expandedRowsValues.push(item.value);
            if (!item.isInCollapsedGroup()) {
              item.setCollapsed(false);
            }
          }
        }
        if (expandedRowsValues.length > 0) {
          treeTable.state.expandedRowsValues = expandedRowsValues;
        }
      }

      // Generate DOM for items
      const columnNames = treeTable.getColumnNames();
      for (var i = 0; i < sortedList.length; i++) {
        const row = treeTable.generateRowElement(columnNames, i, sortedList[i]);
        treeTable.bodyElement.appendChild(row);
      }

      treeTable.tableElement.appendChild(treeTable.bodyElement);

      treeTable.bodyElement.scrollTop = scrollTop;
      delete treeTable.generatingTableRows;
    };

    if (this.data) {
      if (treeTable.bodyElement) {
        if (!this.generatingTableRows) {
          // Invoke later table update
          this.generatingTableRows = true;
          setTimeout(tableRowsGenerator, 0);
        }
      } else {
        // Ensure body element exists
        tableRowsGenerator();
      }
    }
  }

  /**
   * @param {string[]} columnNames
   * @param {number} rowIndex
   * @param {{
          value: any,
          indentation: number,
          group: boolean,
          selected: boolean,
          hidden: boolean,
          collapsed?: boolean,
          childrenItems?: boolean,
          setCollapsed: function(),
      }} rowModel
   * @private
   */
  generateRowElement(columnNames, rowIndex, rowModel) {
    const treeTable = this;
    const row = document.createElement("div");
    row.setAttribute("row", "true");

    let mainCell = null;
    for (let j = 0; j < columnNames.length; j++) {
      const columnName = columnNames[j];
      const cell = document.createElement("div");
      cell.setAttribute("cell", "true");
      this.model.renderCell(rowModel.value, columnName, cell);
      cell.style.width = this.getColumnWidth(columnName);

      if (mainCell == null || cell.classList.contains("main")) {
        mainCell = cell;
      }

      row.appendChild(cell);
    }

    if (mainCell != null) {
      mainCell.classList.add("main");
      mainCell.style.paddingLeft = (15 + rowModel.indentation * 10) + "px";
      if (rowModel.group) {
        this.registerEventListener(mainCell, "click", (ev) => {
          if (ev.clientX < 16) {
            ev.stopImmediatePropagation();
            const expanded = mainCell.parentElement.classList.contains("collapsed");
            treeTable.expandOrCollapseRow(rowModel, expanded);
            mainCell.parentElement._model.collapsed = !expanded;
            if (expanded) {
              mainCell.parentElement.classList.remove("collapsed");
            } else {
              mainCell.parentElement.classList.add("collapsed");
            }
            const rows = treeTable.bodyElement.children;
            for (let i = 0; i < rows.length; i++) {
              const row = rows[i];
              const rowCollapsed = rows[i]._model.isInCollapsedGroup();
              if (expanded && rows[i]._model.hidden !== rowCollapsed) {
                rows[i].classList.add("selected");
              }
              rows[i]._model.hidden = rowCollapsed;
              rows[i].style.display = rowCollapsed ? "none" : "flex";
            }
          }
          return false;
        });

        row.classList.add("group");
        if (rowModel.collapsed) {
          row.classList.add("collapsed");
        }
      }
    }
    if (rowModel.hidden) {
      row.style.display = "none";
    }
    if (rowModel.selected) {
      row.classList.add("selected");
    }

    this.registerEventListener(row, "click", function (ev) {
      const row = this;
      const rowValue = row._model.value;

      if (OperatingSystem.isMacOSX() ? ev.metaKey : ev.ctrlKey) {
        const index = treeTable.selectedRowsValues.indexOf(rowValue);
        if (index < 0) {
          row.classList.add("selected");
          treeTable.selectedRowsValues.push(rowValue);
        } else {
          row.classList.remove("selected");
          treeTable.selectedRowsValues.splice(index, 1);
        }
      } else {
        row.classList.add("selected");
        treeTable.selectedRowsValues = [rowValue];
      }
      if (typeof treeTable.model.selectionChanged == "function") {
        treeTable.model.selectionChanged(treeTable.selectedRowsValues);
      }
    });
    this.registerEventListener(row, "dblclick", function (ev) {
      if (typeof treeTable.model.rowDoubleClicked == "function") {
        const row = this;
        const rowValue = row._model.value;
        treeTable.model.rowDoubleClicked(rowValue);
      }
    });

    row._model = rowModel;
    return row;
  }

  /**
   * @param {Object} rowModel
   * @param {boolean} expand true if expanded, false if collapsed
   * @private
   */
  expandOrCollapseRow(rowModel, expand) {
    const treeTable = this;

    // TODO Test on touch device
    if (treeTable.state.expandedRowsValues == null) {
      treeTable.state.expandedRowsValues = [];
    }
    const index = treeTable.state.expandedRowsValues.indexOf(rowModel.value);
    if (expand) {
      if (index < 0) {
        treeTable.state.expandedRowsValues.push(rowModel.value);
        this.fireExpandedRowsChanged();
      }
    } else {
      if (index >= 0) {
        treeTable.state.expandedRowsValues.splice(index, 1);
        this.fireExpandedRowsChanged();
      }
    }
  }

  /**
   * @param {string} columnName
   * @param {boolean} descending
   * @private
   */
  sortTable(columnName, descending) {
    if (!this.state.sort) {
      this.state.sort = {};
    }
    this.state.sort.columnName = columnName;
    this.state.sort.direction = descending ? "desc" : "asc";

    this.fireSortChanged(this.state.sort);
  }

  /**
   * @param {string} columnName
   * @return {string} css width value, e.g. "2em"
   * @private
   */
  getColumnWidth(columnName) {
    return this.columnsWidths[columnName];
  }

  /**
   * @private
   */
  getColumns() {
    return this.model.columns.slice(0);
  }

  /**
   * Returns the names of the columns displayed in this table.
   * @return {string[]} 
   * @private
   */
  getColumnNames() {
    const columnNames = new Array(this.model.columns.length);
    for (let i = 0; i < columnNames.length; i++) {
      columnNames[i] = this.model.columns[i].name;
    }
    return columnNames;
  }

  /**
   * @return {{[name: string]: string}}
   * @see getColumnWidth(name)
   * @private
   */
  getColumnsWidthByName() {
    const columns = this.model.columns;
    const widths = {};
    for (let i = 0; i < columns.length; i++) {
      const column = columns[i];
      const width = column.defaultWidth ? column.defaultWidth : "4.5rem"; // table cell widthColumn
      widths[column.name] = width;
    }
    return widths;
  }

  /** 
   * Removes components added to this panel and their listeners.
   */
  dispose() {
    this.unregisterEventListeners();
    this.container.removeChild(this.tableElement);
  }
}
