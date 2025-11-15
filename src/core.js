/*
 * core.js
 *
 * Copyright (c) 2024 Space Mushrooms <info@sweethome3d.com>
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
 * You should have received a copy of the GNU General Public License version
 * 2 along with this work; if not, write to the Free Software Foundation,
 * Inc., 51 Franklin St, Fifth Floor, Boston, MA 02110-1301 USA.
 */

// Various classes of OpenJDK 8 translated to Javascript

/**
 * Creates an IllegalArgumentException instance.
 * Adapted from java.lang.IllegalArgumentException
 * @constructor
 */
export class IllegalArgumentException {
  constructor(message) {
    this.message = message;
  }
}


/**
 * Creates an ParseException instance.
 * Adapted from java.text.ParseException
 * @constructor
 */
class ParseException {
  constructor(message, errorOffset) {
    this.message = message;
    this.errorOffset = errorOffset;
  }
}

/**
 * Creates an NullPointerException instance.
 * Adapted from java.lang.NullPointerException
 * @constructor
 */
class NullPointerException {
  constructor(message) {
    this.message = message;
  }
}


/**
 * Creates an IllegalStateException instance.
 * Adapted from java.lang.IllegalStateException
 * @constructor
 */
export class IllegalStateException {
  constructor(message) {
    this.message = message;
  }
}


/**
 * Creates an UnsupportedOperationException instance.
 * Adapted from java.lang.UnsupportedOperationException
 * @constructor
 */
export class UnsupportedOperationException {
  constructor(message) {
    this.message = message;
  }
}


/**
 * Creates an InternalError instance.
 * Adapted from java.lang.InternalError
 * @constructor
 * @ignore
 */
export class InternalError {
  constructor(message) {
    this.message = message;
  }
}


/**
 * Creates an NoSuchElementException instance.
 * Adapted from java.util.NoSuchElementException
 * @constructor
 */
export class NoSuchElementException {
  constructor(message) {
    this.message = message;
  }
}


/**
 * System class.
 * @class
 * @ignore
 */
export let System = {}

System.arraycopy = (srcPts, srcOff, dstPts, dstOff, size) => {
  if (srcPts !== dstPts
    || dstOff >= srcOff + size) {
    while (--size >= 0) {
      dstPts[dstOff++] = srcPts[srcOff++];
    }
  } else {
    // In case copied items overlap  
    let tmp = srcPts.slice(srcOff, srcOff + size);
    for (let i = 0; i < size; i++) {
      dstPts[dstOff++] = tmp[i];
    }
  }
}


/**
 * Creates an EventObject instance.
 * Adapted from java.util.EventObject
 * @constructor
 */
export class EventObject {
  constructor(source) {
    this.source = source;
  }

  /**
   * Returns the source of this event.
   * @return {Object}
   */
  getSource() {
    return this.source;
  }
}

/**
 * Creates a PropertyChangeEvent instance.
 * Adapted from java.beans.PropertyChangeEvent
 * @constructor
 */
class PropertyChangeEvent extends EventObject {
  constructor(source, propertyName, oldValue, newValue) {
    super(source);
    this.propertyName = propertyName;
    this.newValue = newValue;
    this.oldValue = oldValue;
  }

  /**
   * Returns the name of the modified property.
   * @return {string}
   */
  getPropertyName() {
    return this.propertyName;
  }

  /**
   * Returns the new value of the property.
   */
  getNewValue() {
    return this.newValue;
  }

  /**
   * Returns the old value of the property.
   */
  getOldValue() {
    return this.oldValue;
  }
}

/**
 * Creates a PropertyChangeSupport instance.
 * Adapted from java.beans.PropertyChangeSupport
 * @constructor
 */
export class PropertyChangeSupport {
  constructor(source) {
    this.source = source;
    this.listeners = [];
  }

  /**
   * Adds the <code>listener</code> in parameter to the list of listeners that may be notified.
   * @param {string} [propertyName] the name of an optional property to listen
   * @param listener  a callback that will be called with a {@link PropertyChangeEvent} instance
   */
  addPropertyChangeListener(propertyName, listener) {
    if (listener === undefined) {
      // One parameter
      listener = propertyName;
      propertyName = null;
    }
    if (listener) {
      if (propertyName) {
        this.listeners.push({ "listener": listener, "propertyName": propertyName });
      } else {
        this.listeners.push({ "listener": listener });
      }
    }
  }

  /**
   * Removes the <code>listener</code> in parameter to the list of listeners that may be notified.
   * @param listener the listener to remove. If it doesn't exist, it's simply ignored.
   */
  removePropertyChangeListener(propertyName, listener) {
    if (listener === undefined) {
      // One parameter
      listener = propertyName;
      propertyName = undefined;
    }
    if (listener) {
      for (let i = this.listeners.length - 1; i >= 0; i--) {
        if (this.listeners[i].propertyName == propertyName
          && this.listeners[i].listener === listener) {
          this.listeners.splice(i, 1);
        }
      }
    }
  }

  /**
   * Returns an array of all the listeners that were added to the
   * PropertyChangeSupport object with addPropertyChangeListener().
   * @param {string} [propertyName] the name of an optional listened property
   * @return [Array]
   */
  getPropertyChangeListeners(propertyName) {
    if (propertyName === undefined) {
      return this.listeners.slice(0);
    } else {
      let listeners = [];
      for (let i = this.listeners.length - 1; i >= 0; i--) {
        if (this.listeners[i].propertyName == propertyName) {
          listeners.push(this.listeners[i]);
        }
      }
      return listeners;
    }
  }

  /**
   * Fires a property change event.
   * @param propertyName {string} the name of the modified property
   * @param oldValue old value
   * @param newValue new value
   */
  firePropertyChange(propertyName, oldValue, newValue) {
    if (oldValue != newValue) {
      let ev = new PropertyChangeEvent(this.source, propertyName, oldValue, newValue);
      for (let i = 0; i < this.listeners.length; i++) {
        if (!("propertyName" in this.listeners[i])
          || this.listeners[i].propertyName == propertyName) {
          if (typeof (this.listeners[i].listener) === "function") {
            this.listeners[i].listener(ev);
          } else {
            this.listeners[i].listener.propertyChange(ev);
          }
        }
      }
    }
  }
}

/**
 * Creates an instance of a string buffer in which characters can be added.
 * Adapted from java.io.StringWriter
 * @constructor
 */
export class StringWriter {
  constructor() {
    this.buffer = ""
  }

  /**
   * Appends the given string to the buffer.
   * @param {string} string
   */
  write(string) {
    return this.buffer += string;
  }

  /**
   * Returns the string stored in buffer.
   * @return {string} string
   */
  toString(string) {
    return this.buffer;
  }
}

/**
 * Format is a base class for formatting locale-sensitive
 * information such as dates, messages, and numbers.
 * Adapted from java.text.Format.
 * @constructor
 * @ignore
 */
export class Format {
  format(object) {
    return "" + object;
  }

  /**
   * Returns the object parsed from the given string and updates optional parse position.
   * @param {string} string
   * @param {ParsePosition} [parsePosition] 
   * @return the parsed object or if the string can't be parsed, <code>null</code> when position is given
   *              or throws a ParseException if position isn't given
   */
  parseObject(string, position) {
    let exactParsing = position === undefined;
    if (position === undefined) {
      position = new ParsePosition(0);
    }
    let value = this.parse(string, position);
    if (exactParsing && position.getIndex() !== string.length) {
      throw new ParseException(string, position.getIndex());
    }
    return value;
  }

  /**
   * Returns the date or number parsed from the given string and updates optional parse position.
   * @param {string} string a date or number with English notation
   * @param {ParsePosition} [parsePosition] 
   * @return the parsed date or number or if the string can't be parsed, <code>null</code> when position is given
   *              or throws a ParseException if position isn't given
   */
  parse(string, position) {
    let s = position === undefined
      ? string
      : string.substring(position.getIndex());
    var value = Date.parse(s);
    if (isNaN(value)) {
      var value = parseInt(s);
      if (isNaN(value)) {
        var value = parseFloat(s);
        if (isNaN(value)) {
          if (position === undefined) {
            throw new ParseException(s, 0);
          } else {
            return null;
          }
        }
      }
    }
    if (position !== undefined) {
      position.setIndex(string.length);
    }
    return value;
  }

  clone() {
    let clone = Object.create(this);
    for (let attribute in this) {
      if (this.hasOwnProperty(attribute)) {
        clone[attribute] = this[attribute];
      }
    }
    return clone;
  }
}

/**
 * Parse position used to track current parsing position.
 * Adapted from java.text.ParsePosition.
 * @constructor
 * @ignore
 */
export class ParsePosition {
  constructor(index) {
    this.index = index;
    this.errorIndex = -1;
  }

  getIndex() {
    return this.index;
  }

  setIndex(index) {
    this.index = index;
  }

  getErrorIndex() {
    return this.errorIndex;
  }

  setErrorIndex(errorIndex) {
    this.errorIndex = errorIndex;
  }
}

/**
 * A format for numbers.
 * Inspired by java.text.NumberFormat
 * @param {string} [pattern] partial support of pattern defined at https://docs.oracle.com/javase/7/docs/api/java/text/DecimalFormat.html
 * @constructor
 * @extends Format
 * @private
 * @ignore
 * @author Louis Grignon
 * @author Emmanuel Puybaret
 */
export class NumberFormat extends Format {
  constructor() {
    super();

    this.groupingUsed = false;
    this.minimumFractionDigits = 0;
    this.maximumFractionDigits = 2;

  }

  setGroupingUsed(groupingUsed) {
    this.groupingUsed = groupingUsed;
  }

  isGroupingUsed() {
    return this.groupingUsed;
  }

  setPositivePrefix(positivePrefix) {
    this.positivePrefix = positivePrefix;
  }

  getPositivePrefix() {
    return this.positivePrefix;
  }

  setNegativePrefix(negativePrefix) {
    this.negativePrefix = negativePrefix;
  }

  getNegativePrefix() {
    return this.negativePrefix;
  }

  setMinimumFractionDigits(minimumFractionDigits) {
    this.minimumFractionDigits = minimumFractionDigits;
  }

  getMinimumFractionDigits() {
    return this.minimumFractionDigits;
  }

  setMaximumFractionDigits(maximumFractionDigits) {
    this.maximumFractionDigits = maximumFractionDigits;
  }

  getMaximumFractionDigits() {
    return this.maximumFractionDigits;
  }

  /**
   * @return {NumberFormat} 
   */
  static getNumberInstance() {
    return new DecimalFormat("#.##");
  }

  /**
   * @return {NumberFormat} 
   */
  static getIntegerInstance() {
    return new IntegerFormat();
  }

  /**
   * @return {NumberFormat} 
   */
  static getCurrencyInstance() {
    return new CurrencyFormat();
  }
}

/**
 * A format for decimal numbers.
 * Inspired by java.text.DecimalFormat
 * @param {string} [pattern] partial support of pattern defined at https://docs.oracle.com/javase/7/docs/api/java/text/DecimalFormat.html
 * @constructor
 * @extends NumberFormat
 * @ignore
 * @author Louis Grignon
 * @author Emmanuel Puybaret
 */
export class DecimalFormat extends NumberFormat {
  constructor(pattern) {
    super();
    this.checkLocaleChange();

    let minimumFractionDigits = 0;
    let maximumFractionDigits = 2;
    if (pattern !== undefined && pattern.trim() != "") {
      let patternParts = pattern.split(";");

      let fractionDigitsMatch = patternParts[0].match(/[.]([0]+)([#]*)/);
      if (fractionDigitsMatch == null) {
        minimumFractionDigits = 0;
        fractionDigitsMatch = patternParts[0].match(/[.]([#]*)/);
        if (fractionDigitsMatch == null) {
          maximumFractionDigits = 0;
        } else if (fractionDigitsMatch.length > 1) {
          maximumFractionDigits = fractionDigitsMatch[1].length;
        }
      } else if (fractionDigitsMatch.length > 1) {
        minimumFractionDigits = fractionDigitsMatch[1].length;
        if (fractionDigitsMatch.length > 2 && fractionDigitsMatch[2].length > 0) {
          maximumFractionDigits = minimumFractionDigits + fractionDigitsMatch[2].length;
        }
      }

      if (patternParts.length > 1) {
        var part = patternParts[0].trim();
        this.positivePrefix = part.substring(0, Math.min(part.indexOf('#'), part.indexOf('0')));
        part = patternParts[1].trim();
        this.negativePrefix = part.substring(0, Math.min(part.indexOf('#'), part.indexOf('0')));
      } else {
        var part = patternParts[0].trim();
        this.positivePrefix = this.negativePrefix = part.substring(0, Math.min(part.indexOf('#'), part.indexOf('0')));
      }
    }

    if (maximumFractionDigits < minimumFractionDigits) {
      maximumFractionDigits = minimumFractionDigits;
    }

    this.setMinimumFractionDigits(minimumFractionDigits);
    this.setMaximumFractionDigits(maximumFractionDigits);
  }

  /**
   * @param {number} number
   * @return {string}
   */
  format(number) {
    if (number == null) {
      return '';
    }
    this.checkLocaleChange();

    let formattedNumber = toLocaleStringUniversal(number, this.groupingSeparator, this.isGroupingUsed(), this.decimalSeparator, {
      minimumFractionDigits: this.getMinimumFractionDigits(),
      maximumFractionDigits: this.getMaximumFractionDigits(),
      positivePrefix: this.positivePrefix,
      negativePrefix: this.negativePrefix,
    });
    return formattedNumber;
  }

  /**
   * @return {number}
   */
  parse(text, parsePosition) {
    this.checkLocaleChange();
    let number = parseLocalizedNumber(text, parsePosition, {
      decimalSeparator: this.decimalSeparator,
      positivePrefix: this.positivePrefix,
      negativePrefix: this.negativePrefix
    });
    if (number === null) {
      return null;
    } else {
      return number;
    }
  }

  /**
   * @private
   */
  checkLocaleChange() {
    // Instantiate format if locale changed
    if (Locale.getDefault() != this.formatLocale) {
      this.formatLocale = Locale.getDefault();
      this.decimalSeparator = this.formatLocale.match(/(bg|cs|de|el|es|fi|fr|hu|in|it|nl|pl|pt|ru|sl|sr|sv|uk|vi)(_\w\w)?/)
        ? ","
        : this.formatLocale.match(/(ar)(_\w\w)?/)
          ? "٫"
          : ".";
      this.groupingSeparator = this.formatLocale.match(/(bg|cs|fi|fr|hu|pl|ru|sv|uk)(_\w\w)?/)
        ? "\u00a0"
        : this.formatLocale.match(/(de|el|es|in|it|nl|pt|sl|sr|vi)(_\w\w)?/)
          ? "."
          : this.formatLocale.match(/(ar)(_\w\w)?/)
            ? "٬"
            : ",";
    }
  }
}

/**
 * Returns <code>toLocaleString</code> fixed for environments where <code>options</code> 
 * are not supported (mainly Safari 8/9).
 * @param {number} number
 * @param {string} groupingSeparator
 * @param {boolean} groupingUsed
 * @param {string} decimalSeparator
 * @param {Object} options
 * @ignore
 */
function toLocaleStringUniversal(number, groupingSeparator, groupingUsed, decimalSeparator, options) {
  if (options.minimumFractionDigits === 0) {
    delete options.minimumFractionDigits;
  }

  let formattedNumber = number.toLocaleString("en", options);
  let decimalSeparatorIndex = formattedNumber.indexOf('.');
  if (decimalSeparatorIndex === -1) {
    decimalSeparatorIndex = formattedNumber.length;
  }

  if (options.maximumFractionDigits === 0) {
    if (decimalSeparatorIndex < formattedNumber.length) {
      // Remove last decimals
      formattedNumber = Math.round(number).toString();
      decimalSeparatorIndex = formattedNumber.length;
    }
  } else if (options.maximumFractionDigits < formattedNumber.length - decimalSeparatorIndex - 1) {
    // Limit decimals to the required maximum using an integer with the right number of digits
    formattedNumber = Math.round(number * Math.pow(10, options.maximumFractionDigits)).toString();
    if (Math.abs(number) < 1) {
      formattedNumber = number > 0
        ? '0.' + formattedNumber
        : '-0.' + formattedNumber.substring(1);
    } else {
      formattedNumber = formattedNumber.substring(0, decimalSeparatorIndex) + '.' + formattedNumber.substring(decimalSeparatorIndex);
    }
  }

  // Add a decimal separator if needed followed by the required number of zeros
  if (options.minimumFractionDigits > 0) {
    if (decimalSeparatorIndex === formattedNumber.length) {
      formattedNumber += '.';
    }
    while (options.minimumFractionDigits > formattedNumber.length - decimalSeparatorIndex - 1) {
      formattedNumber += '0';
    }
  }

  if (decimalSeparatorIndex > 3) {
    if (formattedNumber.indexOf(',') === -1) {
      if (groupingUsed) {
        // Add missing grouping separator
        for (let groupingSeparatorIndex = decimalSeparatorIndex - 3; groupingSeparatorIndex > (number > 0 ? 0 : 1); groupingSeparatorIndex -= 3) {
          formattedNumber = formattedNumber.substring(0, groupingSeparatorIndex) + ',' + formattedNumber.substring(groupingSeparatorIndex);
          decimalSeparatorIndex++;
        }
      }
    } else if (!groupingUsed) {
      // Remove grouping separator
      formattedNumber = formattedNumber.replace(/\,/g, "");
    }
  }

  formattedNumber = formattedNumber.replace(".", "#");
  if (groupingUsed) {
    formattedNumber = formattedNumber.replace(/\,/g, groupingSeparator);
  }
  formattedNumber = formattedNumber.replace("#", decimalSeparator);
  if (options.negativePrefix && options.negativePrefix.length > 0) {
    formattedNumber = formattedNumber.replace("-", options.negativePrefix);
  }
  if (number > 0 && options.positivePrefix && options.positivePrefix.length > 0) {
    formattedNumber = options.positivePrefix + formattedNumber;
  }
  return formattedNumber;
}

/**
 * Returns the number parsed from the given string and updates parse position.
 * @param {string} string
 * @param {ParsePosition} parsePosition
 * @param { { decimalSeparator?: string, positivePrefix?: string, negativePrefix?: string } } options
 *  - decimalSeparator: if omitted the string only integer is parsed
 *  - positivePrefix: optionally specify a prefix before positive numbers which should be ignored for parsing (default: '')
 *  - negativePrefix: optionally specify a prefix before negative numbers which should be ignored for parsing (default: '')
 * @return {number} the parsed number or <code>null</code> if the string can't be parsed
 * @ignore
 */
function parseLocalizedNumber(string, parsePosition, options) {
  let integer = options.decimalSeparator === undefined;
  let decimalSeparator = options.decimalSeparator;
  let positivePrefix = options.positivePrefix ? options.positivePrefix : "";
  let negativePrefix = options.negativePrefix ? options.negativePrefix : "";

  string = string.substring(parsePosition.getIndex(), string.length);

  if (positivePrefix.length > 0 && string.indexOf(positivePrefix) === 0) {
    string = string.substring(positivePrefix.length);
  } else if (negativePrefix.length > 0 && string.indexOf(negativePrefix) === 0) {
    string = string.replace(negativePrefix, "-");
  }

  let numberRegExp = integer
    ? /\d+/g
    : new RegExp("^\\-?"
      + "((\\d+\\" + decimalSeparator + "?\\d*)"
      + "|(\\" + decimalSeparator + "\\d+))", "g"); // Same as /^\-?((\d+\.?\d*)|(\.\d+))/g
  if (numberRegExp.test(string)
    && numberRegExp.lastIndex > 0) {
    string = string.substring(0, numberRegExp.lastIndex);
    let number = integer
      ? parseInt(string)
      : parseFloat(string.replace(decimalSeparator, "."));
    parsePosition.setIndex(parsePosition.getIndex() + numberRegExp.lastIndex);
    return number;
  } else {
    return null;
  }
}

/**
 * A format for integer numbers.
 * @constructor
 * @extends NumberFormat
 * @author Louis Grignon
 * @author Emmanuel Puybaret
 * @ignore
 */
export class IntegerFormat extends NumberFormat {
  constructor() {
    super();
  }

  /**
   * @param {number} number
   * @return {string}
   */
  format(number) {
    if (number == null) {
      return '';
    }
    return toLocaleStringUniversal(number, "", false, "", { maximumFractionDigits: 0 });
  }

  /**
   * @return {number}
   */
  parse(text, parsePosition) {
    return parseLocalizedNumber(text, parsePosition, {}); // No decimal separator to parse integer
  }
}

/**
 * A format for prices.
 * @constructor
 * @extends DecimalFormat
 * @author Emmanuel Puybaret
 * @ignore
 */
class CurrencyFormat extends DecimalFormat {
  constructor() {
    super();
    this.currency = "USD";
    this.setGroupingUsed(true);
  }

  /**
   * @param {number} number
   * @return {string}
   */
  format(number) {
    try {
      let priceFormat = new Intl.NumberFormat(Locale.getDefault().replace('_', '-'), {
        style: "currency",
        currency: this.currency
      });
      return priceFormat.format(number);
    } catch (ex) {
      let fractionDigits = this.currency.match(/(JPY|VND)/) ? 0 : 2;
      this.setMinimumFractionDigits(fractionDigits);
      this.setMaximumFractionDigits(fractionDigits);
      let price = DecimalFormat.prototype.format.call(this, number);

      let formatLocale = Locale.getDefault();
      if (formatLocale === null || formatLocale.indexOf("en") == 0) {
        price = this.currency + price;
      } else {
        price += " " + this.currency;
      }
      return price;
    }
  }

  /**
   * @param {string} currency
   */
  setCurrency(currency) {
    this.currency = currency;
  }

  /**
   * @return {string}
   */
  getCurrency() {
    return this.currency;
  }
}


/**
 * Locale class.
 * @class
 * @ignore
 */
export var Locale = {}

/**
 * Returns the default locale.
 * @return {string} an ISO 639 language code, possibly followed by a underscore and an ISO 3166 country code
 */
Locale.getDefault = () => {
  if (window && window.defaultLocaleLanguageAndCountry) {
    return window.defaultLocaleLanguageAndCountry;
  } else if (navigator && navigator.language && navigator.language.indexOf('-') >= 0) {
    let locale = navigator.language.split('-');
    return locale[0] + "_" + locale[1].toUpperCase();
  } else if (navigator && navigator.language && navigator.language.length == 2) {
    return navigator.language;
  } else {
    return null;
  }
}

/**
 * Sets the default locale.
 * @param {string} language an ISO 639 language code, possibly followed by a underscore and an ISO 3166 country code
 */
Locale.setDefault = language => {
  if (window) {
    window.defaultLocaleLanguageAndCountry = language;
  }
}


/**
 * UUID class.
 * @class
 * @ignore
 */
export let UUID = {}

/**
 * Returns a randomly generated Universally Unique IDentifier (v4).
 */
UUID.randomUUID = () => {
  if (self.crypto && typeof (self.crypto.randomUUID) === "function") {
    return crypto.randomUUID();
  } else {
    // From https://stackoverflow.com/questions/105034/how-to-create-guid-uuid
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      let r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
}


/**
 * @ignore
 */
Math.toDegrees = x => {
  return x * 180 / Math.PI;
}

/**
 * @ignore
 */
Math.toRadians = x => {
  return x * Math.PI / 180;
}


/**
 * KeyStroke class.
 * @class
 * @ignore
 */
export let KeyStroke = {}

/**
 * Returns a string describing the key event in parameter. 
 * @param {KeyboardEvent} ev
 * @param {string} [keyEventType] "keyup", "keydown" or "keypress"
 * @return {string} a string describing the key stroke event
 */
KeyStroke.getKeyStrokeForEvent = (ev, keyEventType) => {
  if (KeyStroke.KEY_CODE_TEXTS === undefined) {
    KeyStroke.KEY_CODE_TEXTS = new Array(223);
    KeyStroke.KEY_CODE_TEXTS[8] = "BACK_SPACE";
    KeyStroke.KEY_CODE_TEXTS[9] = "TAB";
    KeyStroke.KEY_CODE_TEXTS[13] = "ENTER";
    KeyStroke.KEY_CODE_TEXTS[16] = "SHIFT";
    KeyStroke.KEY_CODE_TEXTS[17] = "CONTROL";
    KeyStroke.KEY_CODE_TEXTS[18] = "ALT";
    KeyStroke.KEY_CODE_TEXTS[19] = "PAUSE";
    KeyStroke.KEY_CODE_TEXTS[20] = "CAPS_LOCK";
    KeyStroke.KEY_CODE_TEXTS[27] = "ESCAPE";
    KeyStroke.KEY_CODE_TEXTS[33] = "PAGE_UP";
    KeyStroke.KEY_CODE_TEXTS[34] = "PAGE_DOWN";
    KeyStroke.KEY_CODE_TEXTS[35] = "END";
    KeyStroke.KEY_CODE_TEXTS[36] = "HOME";
    KeyStroke.KEY_CODE_TEXTS[37] = "LEFT";
    KeyStroke.KEY_CODE_TEXTS[38] = "UP";
    KeyStroke.KEY_CODE_TEXTS[39] = "RIGHT";
    KeyStroke.KEY_CODE_TEXTS[40] = "DOWN";
    KeyStroke.KEY_CODE_TEXTS[45] = "INSERT";
    KeyStroke.KEY_CODE_TEXTS[46] = "DELETE";
    KeyStroke.KEY_CODE_TEXTS[48] = "0";
    KeyStroke.KEY_CODE_TEXTS[49] = "1";
    KeyStroke.KEY_CODE_TEXTS[50] = "2";
    KeyStroke.KEY_CODE_TEXTS[51] = "3";
    KeyStroke.KEY_CODE_TEXTS[52] = "4";
    KeyStroke.KEY_CODE_TEXTS[53] = "5";
    KeyStroke.KEY_CODE_TEXTS[54] = "6";
    KeyStroke.KEY_CODE_TEXTS[55] = "7";
    KeyStroke.KEY_CODE_TEXTS[56] = "8";
    KeyStroke.KEY_CODE_TEXTS[57] = "9";
    KeyStroke.KEY_CODE_TEXTS[65] = "A";
    KeyStroke.KEY_CODE_TEXTS[66] = "B";
    KeyStroke.KEY_CODE_TEXTS[67] = "C";
    KeyStroke.KEY_CODE_TEXTS[68] = "D";
    KeyStroke.KEY_CODE_TEXTS[69] = "E";
    KeyStroke.KEY_CODE_TEXTS[70] = "F";
    KeyStroke.KEY_CODE_TEXTS[71] = "G";
    KeyStroke.KEY_CODE_TEXTS[72] = "H";
    KeyStroke.KEY_CODE_TEXTS[73] = "I";
    KeyStroke.KEY_CODE_TEXTS[74] = "J";
    KeyStroke.KEY_CODE_TEXTS[75] = "K";
    KeyStroke.KEY_CODE_TEXTS[76] = "L";
    KeyStroke.KEY_CODE_TEXTS[77] = "M";
    KeyStroke.KEY_CODE_TEXTS[78] = "N";
    KeyStroke.KEY_CODE_TEXTS[79] = "O";
    KeyStroke.KEY_CODE_TEXTS[80] = "P";
    KeyStroke.KEY_CODE_TEXTS[81] = "Q";
    KeyStroke.KEY_CODE_TEXTS[82] = "R";
    KeyStroke.KEY_CODE_TEXTS[83] = "S";
    KeyStroke.KEY_CODE_TEXTS[84] = "T";
    KeyStroke.KEY_CODE_TEXTS[85] = "U";
    KeyStroke.KEY_CODE_TEXTS[86] = "V";
    KeyStroke.KEY_CODE_TEXTS[87] = "W";
    KeyStroke.KEY_CODE_TEXTS[88] = "X";
    KeyStroke.KEY_CODE_TEXTS[89] = "Y";
    KeyStroke.KEY_CODE_TEXTS[90] = "Z";
    KeyStroke.KEY_CODE_TEXTS[91] = "META";
    KeyStroke.KEY_CODE_TEXTS[92] = "META";
    KeyStroke.KEY_CODE_TEXTS[96] = "NUMPAD0";
    KeyStroke.KEY_CODE_TEXTS[97] = "NUMPAD1";
    KeyStroke.KEY_CODE_TEXTS[98] = "NUMPAD2";
    KeyStroke.KEY_CODE_TEXTS[99] = "NUMPAD3";
    KeyStroke.KEY_CODE_TEXTS[100] = "NUMPAD4";
    KeyStroke.KEY_CODE_TEXTS[101] = "NUMPAD5";
    KeyStroke.KEY_CODE_TEXTS[102] = "NUMPAD6";
    KeyStroke.KEY_CODE_TEXTS[103] = "NUMPAD7";
    KeyStroke.KEY_CODE_TEXTS[104] = "NUMPAD8";
    KeyStroke.KEY_CODE_TEXTS[105] = "NUMPAD9";
    KeyStroke.KEY_CODE_TEXTS[106] = "MULTIPLY";
    KeyStroke.KEY_CODE_TEXTS[107] = "ADD";
    KeyStroke.KEY_CODE_TEXTS[109] = "VK_SUBTRACT";
    KeyStroke.KEY_CODE_TEXTS[110] = "VK_DECIMAL";
    KeyStroke.KEY_CODE_TEXTS[111] = "VK_DIVIDE";
    KeyStroke.KEY_CODE_TEXTS[112] = "F1";
    KeyStroke.KEY_CODE_TEXTS[113] = "F2";
    KeyStroke.KEY_CODE_TEXTS[114] = "F3";
    KeyStroke.KEY_CODE_TEXTS[115] = "F4";
    KeyStroke.KEY_CODE_TEXTS[116] = "F5";
    KeyStroke.KEY_CODE_TEXTS[117] = "F6";
    KeyStroke.KEY_CODE_TEXTS[118] = "F7";
    KeyStroke.KEY_CODE_TEXTS[119] = "F8";
    KeyStroke.KEY_CODE_TEXTS[120] = "F9";
    KeyStroke.KEY_CODE_TEXTS[121] = "F10";
    KeyStroke.KEY_CODE_TEXTS[122] = "F11";
    KeyStroke.KEY_CODE_TEXTS[123] = "F12";
    KeyStroke.KEY_CODE_TEXTS[144] = "VK_NUM_LOCK";
    KeyStroke.KEY_CODE_TEXTS[145] = "VK_SCROLL_LOCK";
    KeyStroke.KEY_CODE_TEXTS[186] = "VK_SEMICOLON";
    KeyStroke.KEY_CODE_TEXTS[187] = "VK_EQUALS";
    KeyStroke.KEY_CODE_TEXTS[188] = "VK_COMMA";
    KeyStroke.KEY_CODE_TEXTS[190] = "VK_PERIOD";
    KeyStroke.KEY_CODE_TEXTS[191] = "VK_SLASH";
    KeyStroke.KEY_CODE_TEXTS[219] = "VK_OPEN_BRACKET";
    KeyStroke.KEY_CODE_TEXTS[220] = "VK_BACK_SLASH";
    KeyStroke.KEY_CODE_TEXTS[221] = "VK_CLOSE_BRACKET";
    KeyStroke.KEY_CODE_TEXTS[222] = "VK_QUOTE";
  }

  let keyStroke = "";
  let keyName = KeyStroke.KEY_CODE_TEXTS[ev.keyCode];
  if (keyName) {
    if (ev.ctrlKey) {
      keyStroke += "control ";
    }
    if (ev.altKey) {
      keyStroke += "alt ";
    }
    if (ev.metaKey) {
      keyStroke += "meta ";
    }
    if (ev.shiftKey) {
      keyStroke += "shift ";
    }
    let nameWithoutVK = keyName.indexOf('VK_') === 0
      ? keyName.substring(3)
      : keyName;
    if (keyEventType !== undefined) {
      keyStroke += (keyEventType == "keyup" ? "released " : "pressed ");
    }
    keyStroke += nameWithoutVK;
  }
  return keyStroke;
}
